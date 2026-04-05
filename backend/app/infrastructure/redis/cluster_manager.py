"""
ClusterManager — low-level Redis Cluster adapter.

Responsibilities:
  - Maintain a RedisCluster connection per registered cluster.
  - Parse raw INFO and CLUSTER NODES output into domain models.
  - Fan-out write operations (ACL SETUSER, CONFIG SET) to every node.
  - Handle cluster redirects, failovers, and transient connection errors.

This class lives in the infrastructure layer; it knows about redis-py but
nothing about HTTP or the database.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import redis.asyncio as aioredis
from redis.asyncio.cluster import RedisCluster
from redis.asyncio.cluster import ClusterNode as RedisClusterNode
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    RedisClusterException,
    ResponseError,
    TimeoutError as RedisTimeoutError,
)

from app.domain.exceptions import (
    AclOperationError,
    ClusterConnectionError,
    ConfigOperationError,
    NodeUnreachableError,
)
from app.domain.models import (
    AclRule,
    ClusterNode,
    ClusterStatus,
    ClusterTopology,
    NodeMemory,
    NodeMetrics,
    NodeRole,
    NodeStatus,
    SlotRange,
)

logger = logging.getLogger(__name__)

# redis-py flag strings that map to our domain statuses
_FLAG_STATUS_MAP: dict[str, NodeStatus] = {
    "connected": NodeStatus.CONNECTED,
    "disconnected": NodeStatus.DISCONNECTED,
    "handshake": NodeStatus.HANDSHAKE,
    "fail": NodeStatus.FAIL,
    "fail?": NodeStatus.PFAIL,
    "noaddr": NodeStatus.NOADDR,
}


class ClusterManager:
    """
    Manages a single Redis Cluster connection and exposes high-level
    operations used by the application services.

    Thread/task safety: one ClusterManager per cluster; the underlying
    RedisCluster connection pool is coroutine-safe.
    """

    def __init__(
        self,
        cluster_id: int,
        seed_nodes: list[str],
        password: str | None = None,
        tls_enabled: bool = False,
        socket_timeout: float = 5.0,
        socket_connect_timeout: float = 5.0,
    ) -> None:
        self.cluster_id = cluster_id
        self.seed_nodes = seed_nodes
        self.password = password
        self.tls_enabled = tls_enabled
        self.socket_timeout = socket_timeout
        self.socket_connect_timeout = socket_connect_timeout

        self._client: RedisCluster | None = None
        # Maps internal node address (host:port) → reachable (host, port) via seed.
        # Populated when nodes report internal IPs that differ from the seed addresses,
        # e.g. when connecting through Kubernetes port-forwards.
        self._addr_remap: dict[str, tuple[str, int]] = {}

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """
        Open the cluster connection.  Tries each seed node independently so
        that a single downed seed does not prevent the connection from being
        established against the surviving members of the cluster.
        """
        if self._client is not None:
            return

        last_exc: Exception | None = None
        for seed in self.seed_nodes:
            seed_host, seed_port = seed.rsplit(":", 1)
            startup_nodes = [RedisClusterNode(seed_host, int(seed_port))]
            try:
                client = RedisCluster(
                    startup_nodes=startup_nodes,
                    password=self.password,
                    ssl=self.tls_enabled,
                    socket_timeout=self.socket_timeout,
                    socket_connect_timeout=self.socket_connect_timeout,
                    decode_responses=True,
                    require_full_coverage=False,
                    reinitialize_steps=5,
                    read_from_replicas=False,
                )
                await client.initialize()
                self._client = client
                logger.info("Connected to cluster %s via %s", self.cluster_id, seed)
                return
            except (RedisConnectionError, RedisClusterException, RedisTimeoutError) as exc:
                logger.warning(
                    "Could not connect to cluster %s via seed %s: %s",
                    self.cluster_id, seed, exc,
                )
                last_exc = exc

        # Full RedisCluster init failed (e.g. K8s port-forward: some nodes are
        # unreachable internal IPs).  Fall back to verifying that at least one
        # seed is reachable via a plain single-node connection.  In this mode
        # _client stays None; get_topology still works (uses direct connections),
        # but cluster-wide write operations (ACL, CONFIG) are unavailable.
        for seed in self.seed_nodes:
            seed_host, seed_port_str = seed.rsplit(":", 1)
            try:
                direct = self._make_direct_conn(seed_host, int(seed_port_str))
                async with direct:
                    await direct.ping()
                logger.warning(
                    "Cluster %s: RedisCluster init failed but seed %s is reachable — "
                    "operating in topology-only mode (write operations unavailable)",
                    self.cluster_id, seed,
                )
                return
            except Exception:
                pass

        raise ClusterConnectionError(self.cluster_id, last_exc) from last_exc

    async def disconnect(self) -> None:
        """Close all connections in the pool."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("Disconnected from cluster %s", self.cluster_id)

    @asynccontextmanager
    async def _get_client(self) -> AsyncIterator[RedisCluster]:
        """Yield a ready client, reconnecting once if the connection was lost."""
        if self._client is None:
            await self.connect()
        try:
            yield self._client  # type: ignore[misc]
        except (RedisConnectionError, RedisTimeoutError) as exc:
            logger.warning(
                "Connection lost to cluster %s — reconnecting: %s",
                self.cluster_id,
                exc,
            )
            await self.disconnect()
            await self.connect()
            yield self._client  # type: ignore[misc]

    def _make_direct_conn(self, host: str, port: int) -> aioredis.Redis:
        """Return a single-node async Redis connection using this cluster's credentials."""
        return aioredis.Redis(
            host=host,
            port=port,
            password=self.password,
            ssl=self.tls_enabled,
            socket_timeout=self.socket_timeout,
            socket_connect_timeout=self.socket_connect_timeout,
            decode_responses=True,
        )

    # ------------------------------------------------------------------
    # Topology & health
    # ------------------------------------------------------------------

    async def _build_address_map(self) -> None:
        """
        For each registered seed, connect and identify the node it actually
        represents via the 'myself' flag in CLUSTER NODES.  Build a mapping
        from the node's self-reported (possibly internal/pod) address to the
        reachable seed address.

        This is important for Kubernetes port-forward deployments where Redis
        nodes advertise internal pod IPs that are not reachable from outside
        the cluster.
        """
        new_map: dict[str, tuple[str, int]] = {}
        for seed in self.seed_nodes:
            seed_host, seed_port_str = seed.rsplit(":", 1)
            seed_port = int(seed_port_str)
            try:
                direct = self._make_direct_conn(seed_host, seed_port)
                async with direct:
                    raw = await direct.execute_command("CLUSTER NODES")
                if not isinstance(raw, str):
                    continue
                for line in raw.strip().splitlines():
                    parts = line.split()
                    if len(parts) < 3:
                        continue
                    flags = parts[2]
                    if "myself" in flags:
                        # parts[1] is "ip:port@busport,hostname" — take ip:port
                        internal_addr = parts[1].split("@")[0]
                        ihost, iport_str = internal_addr.rsplit(":", 1)
                        if ihost != seed_host or int(iport_str) != seed_port:
                            new_map[internal_addr] = (seed_host, seed_port)
                        break
            except Exception:
                pass
        if new_map:
            self._addr_remap = new_map
            logger.debug(
                "Cluster %s address map: %s",
                self.cluster_id,
                {k: f"{v[0]}:{v[1]}" for k, v in new_map.items()},
            )

    async def get_topology(self, cluster_name: str) -> ClusterTopology:
        """
        Return a fully-populated ClusterTopology by combining:
          - CLUSTER NODES  (roles, slots, replication offsets)
          - INFO all       (per-node metrics)
        """
        # Use a direct single-node connection so CLUSTER NODES returns the
        # raw text string (redis-py RedisCluster returns a dict instead).
        # Try seeds first, then fall back to nodes already known to the
        # RedisCluster client — this lets us survive when the originally
        # registered seed node is the one that went down.
        raw_nodes: str | None = None
        last_exc: Exception | None = None

        candidate_addresses: list[str] = list(self.seed_nodes)

        # Append any nodes the cluster client already knows about
        if self._client is not None:
            try:
                for n in self._client.get_nodes():  # type: ignore[attr-defined]
                    addr = f"{n.host}:{n.port}"
                    if addr not in candidate_addresses:
                        candidate_addresses.append(addr)
            except Exception:
                pass

        for candidate in candidate_addresses:
            try:
                chost, cport_str = candidate.rsplit(":", 1)
                direct = self._make_direct_conn(chost, int(cport_str))
                async with direct:
                    raw_nodes = await direct.execute_command("CLUSTER NODES")
                break
            except (RedisConnectionError, RedisTimeoutError) as exc:
                logger.warning("Node %s unreachable for CLUSTER NODES: %s", candidate, exc)
                last_exc = exc

        if raw_nodes is None:
            raise ClusterConnectionError(self.cluster_id, last_exc) from last_exc

        parsed_nodes = self._parse_cluster_nodes(raw_nodes)

        # Build a seed→internal-IP address map so that port-forwarded seeds
        # (e.g. Kubernetes) are used in place of unreachable pod IPs.
        # Must run before seed expansion so we know which addresses to exclude.
        await self._build_address_map()

        # Expand the in-process seed list with every node we now know about.
        # When _addr_remap is populated the cluster is behind a NAT / port-forward
        # (e.g. Kubernetes): all discovered node addresses are internal and not
        # directly reachable, so we keep only the explicitly registered seeds.
        if not self._addr_remap:
            discovered_addresses = [f"{n.host}:{n.port}" for n in parsed_nodes]
            if discovered_addresses:
                seen: set[str] = set()
                merged: list[str] = []
                for addr in self.seed_nodes + discovered_addresses:
                    if addr not in seen:
                        seen.add(addr)
                        merged.append(addr)
                self.seed_nodes = merged

        # Fan-out INFO calls — remap internal addresses to reachable ones when known
        def _reachable(host: str, port: int) -> tuple[str, int]:
            return self._addr_remap.get(f"{host}:{port}", (host, port))

        addresses = [node.address for node in parsed_nodes]
        coros = [self._fetch_node_info(*_reachable(node.host, node.port)) for node in parsed_nodes]
        results = await asyncio.gather(*coros, return_exceptions=True)
        info_results: dict[str, dict[str, Any]] = {}
        for address, result in zip(addresses, results):
            if isinstance(result, Exception):
                logger.warning("Could not fetch INFO from %s: %s", address, result)
                info_results[address] = {}
            else:
                info_results[address] = result

        # Attach metrics to each node
        for node in parsed_nodes:
            raw_info = info_results.get(node.address, {})
            if raw_info:
                node.metrics = self._parse_node_metrics(raw_info)

        cluster_status = self._derive_cluster_status(parsed_nodes)
        total_assigned = sum(n.slot_count for n in parsed_nodes if n.role == NodeRole.MASTER)

        return ClusterTopology(
            cluster_id=str(self.cluster_id),
            cluster_name=cluster_name,
            nodes=parsed_nodes,
            status=cluster_status,
            polled_at=datetime.now(timezone.utc),
            cluster_enabled=True,
            total_slots_assigned=total_assigned,
        )

    async def _fetch_node_info(self, host: str, port: int) -> dict[str, Any]:
        """Open a direct single-node connection and run INFO all."""
        import redis.asyncio as aioredis

        address = f"{host}:{port}"
        try:
            async with self._make_direct_conn(host, port) as conn:
                return await conn.info("all")  # type: ignore[return-value]
        except (RedisConnectionError, RedisTimeoutError, ResponseError) as exc:
            raise NodeUnreachableError(address, exc) from exc

    # ------------------------------------------------------------------
    # ACL management
    # ------------------------------------------------------------------

    async def acl_setuser(self, rule: AclRule) -> dict[str, str]:
        """
        Broadcast ACL SETUSER to every node in the cluster.

        Returns a dict of {address: "OK" | error_message} so the caller
        can report partial failures.
        """
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(
                client.get_nodes()  # type: ignore[attr-defined]
            )

        args = rule.to_setuser_args()
        results: dict[str, str] = {}

        async def _set_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    await direct.execute_command("ACL SETUSER", rule.username, *args)
                results[address] = "OK"
            except (RedisConnectionError, ResponseError) as exc:
                logger.error(
                    "ACL SETUSER failed on %s for user '%s': %s",
                    address,
                    rule.username,
                    exc,
                )
                results[address] = str(exc)
                raise AclOperationError(rule.username, address, exc) from exc

        await asyncio.gather(
            *[_set_on_node(n) for n in nodes],
            return_exceptions=True,
        )
        return results

    async def acl_deluser(self, username: str) -> dict[str, str]:
        """Broadcast ACL DELUSER to every node."""
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())  # type: ignore[attr-defined]

        results: dict[str, str] = {}

        async def _del_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    await direct.execute_command("ACL DELUSER", username)
                results[address] = "OK"
            except (RedisConnectionError, ResponseError) as exc:
                logger.error("ACL DELUSER failed on %s: %s", address, exc)
                results[address] = str(exc)

        await asyncio.gather(*[_del_on_node(n) for n in nodes], return_exceptions=True)
        return results

    async def acl_list(self) -> list[str]:
        """Return ACL LIST from the first reachable node."""
        async with self._get_client() as client:
            try:
                return await client.acl_list()  # type: ignore[return-value]
            except ResponseError as exc:
                raise ClusterConnectionError(self.cluster_id, exc) from exc

    # ------------------------------------------------------------------
    # Dynamic configuration
    # ------------------------------------------------------------------

    async def config_set(self, parameter: str, value: str) -> dict[str, str]:
        """
        Fan-out CONFIG SET <parameter> <value> to every node.

        Returns {address: "OK" | error_message}.
        """
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())  # type: ignore[attr-defined]

        results: dict[str, str] = {}

        async def _set_cfg_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    await direct.config_set(parameter, value)
                results[address] = "OK"
            except (RedisConnectionError, ResponseError) as exc:
                logger.error(
                    "CONFIG SET %s=%s failed on %s: %s",
                    parameter,
                    value,
                    address,
                    exc,
                )
                results[address] = str(exc)
                raise ConfigOperationError(parameter, address, exc) from exc

        await asyncio.gather(
            *[_set_cfg_on_node(n) for n in nodes],
            return_exceptions=True,
        )
        return results

    async def config_get(self, pattern: str = "*") -> dict[str, dict[str, str]]:
        """
        Run CONFIG GET <pattern> on every node.

        Returns {address: {param: value, ...}}.
        """
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())  # type: ignore[attr-defined]

        results: dict[str, dict[str, str]] = {}

        async def _get_cfg_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    results[address] = await direct.config_get(pattern)
            except (RedisConnectionError, ResponseError) as exc:
                logger.warning("CONFIG GET failed on %s: %s", address, exc)
                results[address] = {}

        await asyncio.gather(*[_get_cfg_on_node(n) for n in nodes], return_exceptions=True)
        return results

    # ------------------------------------------------------------------
    # Failover
    # ------------------------------------------------------------------

    async def failover_node(self, host: str, port: int, force: bool = False) -> str:
        """
        Send CLUSTER FAILOVER [FORCE] to a specific replica node.

        The command must be issued directly to the replica — it instructs
        that node to take over as master.  Returns "OK" on success.
        """
        address = f"{host}:{port}"
        try:
            async with self._make_direct_conn(host, port) as direct:
                args = ["FORCE"] if force else []
                result = await direct.execute_command("CLUSTER", "FAILOVER", *args)
                logger.info(
                    "CLUSTER FAILOVER%s on %s: %s",
                    " FORCE" if force else "",
                    address,
                    result,
                )
                return str(result)
        except (RedisConnectionError, ResponseError) as exc:
            logger.error("CLUSTER FAILOVER failed on %s: %s", address, exc)
            raise ClusterConnectionError(self.cluster_id, exc) from exc

    # ------------------------------------------------------------------
    # Node operations — Forget & Rejoin
    # ------------------------------------------------------------------

    async def forget_node(self, node_id: str) -> dict[str, str]:
        """
        Run CLUSTER FORGET <node_id> on every healthy (connected) node
        except the node being forgotten itself.
        Returns {address: "OK" | error_message}.
        """
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())

        results: dict[str, str] = {}

        async def _forget_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    await direct.execute_command("CLUSTER", "FORGET", node_id)
                results[address] = "OK"
            except (RedisConnectionError, ResponseError) as exc:
                logger.warning("CLUSTER FORGET failed on %s: %s", address, exc)
                results[address] = str(exc)

        await asyncio.gather(*[_forget_on_node(n) for n in nodes], return_exceptions=True)
        return results

    async def rejoin_node(self, host: str, port: int, master_id: str | None = None) -> str:
        """
        Reset a stale node and rejoin it to the cluster.
        Steps:
          1. CLUSTER RESET HARD on the target node
          2. CLUSTER MEET <host> <port> from the first healthy node
          3. If master_id given: wait briefly then CLUSTER REPLICATE <master_id>
        Returns a status string.
        """
        address = f"{host}:{port}"
        try:
            # Step 1: hard reset
            async with self._make_direct_conn(host, port) as direct:
                await direct.execute_command("CLUSTER", "RESET", "HARD")
                logger.info("CLUSTER RESET HARD on %s", address)

            # Step 2: meet from a healthy node
            async with self._get_client() as client:
                nodes: list[RedisClusterNode] = list(client.get_nodes())
            healthy = [n for n in nodes if f"{n.host}:{n.port}" != address]
            if not healthy:
                raise ClusterConnectionError(self.cluster_id, Exception("No healthy nodes to meet from"))

            meet_node = healthy[0]
            async with self._make_direct_conn(meet_node.host, meet_node.port) as direct:
                await direct.execute_command("CLUSTER", "MEET", host, str(port))
                logger.info("CLUSTER MEET %s from %s:%s", address, meet_node.host, meet_node.port)

            # Step 3: replicate if master_id provided
            if master_id:
                await asyncio.sleep(1.0)  # let the node join first
                async with self._make_direct_conn(host, port) as direct:
                    await direct.execute_command("CLUSTER", "REPLICATE", master_id)
                    logger.info("CLUSTER REPLICATE %s on %s", master_id, address)

            return "OK"
        except (RedisConnectionError, ResponseError) as exc:
            logger.error("Rejoin failed for %s: %s", address, exc)
            raise ClusterConnectionError(self.cluster_id, exc) from exc

    # ------------------------------------------------------------------
    # Add node — Replica or Master with resharding
    # ------------------------------------------------------------------

    async def add_node_as_replica(
        self, host: str, port: int, master_id: str
    ) -> str:
        """
        Join a new node to the cluster as a replica.
        Steps:
          1. CLUSTER MEET from any healthy node
          2. Wait for the new node to appear in CLUSTER NODES
          3. CLUSTER REPLICATE <master_id> on the new node
        """
        address = f"{host}:{port}"

        # Step 1: meet
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())
        meet_node = nodes[0]
        async with self._make_direct_conn(meet_node.host, meet_node.port) as conn:
            await conn.execute_command("CLUSTER", "MEET", host, str(port))
        logger.info("CLUSTER MEET %s from %s:%s", address, meet_node.host, meet_node.port)

        # Step 2: wait for node to appear (up to 10s)
        for _ in range(10):
            await asyncio.sleep(1.0)
            async with self._make_direct_conn(host, port) as conn:
                try:
                    info = await conn.execute_command("CLUSTER", "INFO")
                    if "cluster_state:ok" in info or "cluster_state:fail" in info:
                        break
                except Exception:
                    pass

        # Step 3: replicate
        await asyncio.sleep(1.0)
        async with self._make_direct_conn(host, port) as conn:
            await conn.execute_command("CLUSTER", "REPLICATE", master_id)
        logger.info("CLUSTER REPLICATE %s on %s", master_id, address)
        return "OK"

    async def add_node_as_master(
        self, host: str, port: int
    ) -> dict[str, object]:
        """
        Join a new node to the cluster as a master and rebalance slots.
        Steps:
          1. CLUSTER MEET
          2. Wait for the node to join and get its node_id
          3. Calculate slots to migrate (16384 / new_master_count each)
          4. Migrate slots from existing masters to the new node
        Returns {"node_id": str, "slots_migrated": int}
        """
        address = f"{host}:{port}"

        # Step 1: meet
        async with self._get_client() as client:
            existing_nodes: list[RedisClusterNode] = list(client.get_nodes())
        meet_node = existing_nodes[0]
        async with self._make_direct_conn(meet_node.host, meet_node.port) as conn:
            await conn.execute_command("CLUSTER", "MEET", host, str(port))
        logger.info("CLUSTER MEET %s from %s:%s", address, meet_node.host, meet_node.port)

        # Step 2: wait for node to appear and get its node_id
        new_node_id: str | None = None
        for _ in range(15):
            await asyncio.sleep(1.0)
            try:
                async with self._make_direct_conn(meet_node.host, meet_node.port) as conn:
                    raw = await conn.execute_command("CLUSTER", "NODES")
                for line in (raw if isinstance(raw, str) else "").strip().splitlines():
                    parts = line.split()
                    if len(parts) >= 2:
                        addr_part = parts[1].split("@")[0]
                        if addr_part == address:
                            new_node_id = parts[0]
                            break
                if new_node_id:
                    break
            except Exception:
                pass

        if not new_node_id:
            raise ClusterConnectionError(
                self.cluster_id,
                Exception(f"New node {address} did not appear in CLUSTER NODES within 15s"),
            )
        logger.info("New node %s has id %s", address, new_node_id)

        # Wait for gossip to propagate new_node_id to all existing masters
        # before issuing CLUSTER SETSLOT MIGRATING (which requires the target id to be known)
        master_hosts = [
            (n.host, n.port) for n in existing_nodes
            if getattr(n, "server_type", None) == "primary"
            or "master" in getattr(n, "flags", "")
        ] or [(existing_nodes[0].host, existing_nodes[0].port)]
        for _ in range(20):
            await asyncio.sleep(1.0)
            known_everywhere = True
            for mh, mp in master_hosts:
                try:
                    async with self._make_direct_conn(mh, mp) as conn:
                        raw_check = await conn.execute_command("CLUSTER", "NODES")
                    if new_node_id not in (raw_check if isinstance(raw_check, str) else ""):
                        known_everywhere = False
                        break
                except Exception:
                    known_everywhere = False
                    break
            if known_everywhere:
                logger.info("New node %s is known by all masters, proceeding with migration", new_node_id)
                break
        else:
            logger.warning("Timed out waiting for gossip propagation of %s; proceeding anyway", new_node_id)

        # Step 3: calculate slots per master after adding new node
        # Get current master->slots mapping from CLUSTER NODES
        master_slots: dict[str, list[int]] = {}  # node_id -> list of slot numbers
        async with self._make_direct_conn(meet_node.host, meet_node.port) as conn:
            raw = await conn.execute_command("CLUSTER", "NODES")
        for line in (raw if isinstance(raw, str) else "").strip().splitlines():
            parts = line.split()
            if len(parts) < 8:
                continue
            nid = parts[0]
            flags = parts[2].split(",")
            if "master" not in flags or nid == new_node_id:
                continue
            slots: list[int] = []
            for token in parts[8:]:
                if token.startswith("["):
                    continue
                if "-" in token:
                    s, e = token.split("-")
                    slots.extend(range(int(s), int(e) + 1))
                else:
                    try:
                        slots.append(int(token))
                    except ValueError:
                        pass
            master_slots[nid] = slots

        num_masters = len(master_slots) + 1  # including the new one
        target_per_master = 16384 // num_masters
        total_migrated = 0

        # Step 4: migrate slots from each existing master
        for source_id, slots in master_slots.items():
            # Find the source node address from existing_nodes
            source_node = next(
                (n for n in existing_nodes
                 if self._get_node_id_for(n, existing_nodes) == source_id),
                None,
            )
            if source_node is None:
                # fallback: re-query
                async with self._make_direct_conn(meet_node.host, meet_node.port) as conn:
                    raw2 = await conn.execute_command("CLUSTER", "NODES")
                for line in (raw2 if isinstance(raw2, str) else "").strip().splitlines():
                    parts2 = line.split()
                    if len(parts2) >= 2 and parts2[0] == source_id:
                        addr = parts2[1].split("@")[0]
                        sh, sp = addr.rsplit(":", 1)
                        source_node = type("N", (), {"host": sh, "port": int(sp)})()
                        break

            if source_node is None:
                continue

            give_count = len(slots) - target_per_master
            if give_count <= 0:
                continue
            slots_to_give = slots[:give_count]

            for slot in slots_to_give:
                await self._migrate_slot(
                    source_host=source_node.host,
                    source_port=source_node.port,
                    source_id=source_id,
                    target_host=host,
                    target_port=port,
                    target_id=new_node_id,
                    slot=slot,
                    all_nodes=existing_nodes,
                )
                total_migrated += 1

        logger.info("Resharding complete: %d slots migrated to %s", total_migrated, address)
        return {"node_id": new_node_id, "slots_migrated": total_migrated}

    async def _migrate_slot(
        self,
        source_host: str,
        source_port: int,
        source_id: str,
        target_host: str,
        target_port: int,
        target_id: str,
        slot: int,
        all_nodes: list,
    ) -> None:
        """Migrate a single slot from source to target."""
        for attempt in range(10):
            try:
                async with self._make_direct_conn(source_host, source_port) as src:
                    await src.execute_command("CLUSTER", "SETSLOT", slot, "MIGRATING", target_id)
                break
            except ResponseError as exc:
                if "I don't know about node" in str(exc) and attempt < 9:
                    await asyncio.sleep(1.0)
                    continue
                raise

        for attempt in range(10):
            try:
                async with self._make_direct_conn(target_host, target_port) as tgt:
                    await tgt.execute_command("CLUSTER", "SETSLOT", slot, "IMPORTING", source_id)
                break
            except ResponseError as exc:
                if "I don't know about node" in str(exc) and attempt < 9:
                    await asyncio.sleep(1.0)
                    continue
                raise

        # Migrate all keys in this slot
        async with self._make_direct_conn(source_host, source_port) as src:
            while True:
                keys = await src.execute_command("CLUSTER", "GETKEYSINSLOT", slot, 100)
                if not keys:
                    break
                await src.execute_command(
                    "MIGRATE", target_host, target_port, "", 0, 5000,
                    "REPLACE", "KEYS", *keys,
                )

        # Finalize on all nodes
        all_addresses = [(source_host, source_port), (target_host, target_port)]
        for n in all_nodes:
            addr = (n.host, n.port)
            if addr not in all_addresses:
                all_addresses.append(addr)
        for h, p in all_addresses:
            try:
                async with self._make_direct_conn(h, p) as conn:
                    await conn.execute_command("CLUSTER", "SETSLOT", slot, "NODE", target_id)
            except Exception as exc:
                logger.warning("SETSLOT NODE failed on %s:%s: %s", h, p, exc)

    @staticmethod
    def _get_node_id_for(node, all_nodes) -> str:
        """Best-effort: return the node_id for a RedisClusterNode. Falls back to empty string."""
        # RedisClusterNode in redis-py may expose .name or .node_id
        return getattr(node, "name", "") or getattr(node, "node_id", "")

    # ------------------------------------------------------------------
    # Slow log
    # ------------------------------------------------------------------

    async def slowlog_get(self, count: int = 128) -> dict[str, list[dict]]:
        """
        Run SLOWLOG GET <count> on every node.

        Returns {address: [entry, ...]} where each entry is a dict with:
          id, timestamp, duration_us, args, client_addr, client_name
        """
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = list(client.get_nodes())  # type: ignore[attr-defined]

        results: dict[str, list[dict]] = {}

        async def _slowlog_on_node(node: RedisClusterNode) -> None:
            address = f"{node.host}:{node.port}"
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    raw: list = await direct.slowlog_get(num=count)
                    entries = []
                    for entry in raw:
                        # redis-py returns SlowLogInfo namedtuple or dict
                        if hasattr(entry, "_asdict"):
                            entry = entry._asdict()
                        entries.append({
                            "id": entry.get("id", 0),
                            "start_time": entry.get("start_time", 0),
                            "duration": entry.get("duration", 0),
                            "command": entry.get("command", []),
                            "client_addr": entry.get("client_addr", ""),
                            "client_name": entry.get("client_name", ""),
                        })
                    results[address] = entries
            except (RedisConnectionError, ResponseError) as exc:
                logger.warning("SLOWLOG GET failed on %s: %s", address, exc)
                results[address] = []

        await asyncio.gather(*[_slowlog_on_node(n) for n in nodes], return_exceptions=True)
        return results

    # ------------------------------------------------------------------
    # Namespace / key scanning
    # ------------------------------------------------------------------

    async def scan_namespace(
        self,
        prefix: str,
        count: int = 100,
        max_keys: int = 1000,
    ) -> list[str]:
        """
        Cluster-aware SCAN across all master nodes, filtered by prefix.

        Redis Cluster SCAN is per-node, so we must iterate each master.
        `max_keys` caps the total result to prevent runaway scans.
        """
        pattern = f"{prefix}*"
        async with self._get_client() as client:
            nodes: list[RedisClusterNode] = [
                n for n in client.get_nodes()  # type: ignore[attr-defined]
                if n.server_type == "primary"
            ]

        all_keys: list[str] = []

        async def _scan_node(node: RedisClusterNode) -> None:
            if len(all_keys) >= max_keys:
                return
            try:
                async with self._make_direct_conn(node.host, node.port) as direct:
                    cursor = 0
                    while True:
                        cursor, keys = await direct.scan(
                            cursor=cursor, match=pattern, count=count
                        )
                        all_keys.extend(keys)
                        if cursor == 0 or len(all_keys) >= max_keys:
                            break
            except (RedisConnectionError, RedisTimeoutError) as exc:
                logger.warning(
                    "SCAN failed on %s:%s: %s", node.host, node.port, exc
                )

        await asyncio.gather(*[_scan_node(n) for n in nodes], return_exceptions=True)
        return all_keys[:max_keys]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse_seed_nodes(self) -> list[RedisClusterNode]:
        result = []
        for seed in self.seed_nodes:
            try:
                host, port_str = seed.rsplit(":", 1)
                result.append(RedisClusterNode(host, int(port_str)))
            except ValueError as exc:
                from app.domain.exceptions import InvalidSeedNodeError
                raise InvalidSeedNodeError(seed) from exc
        return result

    def _parse_cluster_nodes(self, raw: "str | dict") -> list[ClusterNode]:
        """
        Parse CLUSTER NODES output into ClusterNode domain objects.

        redis-py 5.x returns a dict keyed by "host:port" instead of the raw
        text string.  We handle both formats for forward compatibility.
        """
        if isinstance(raw, dict):
            return self._parse_cluster_nodes_dict(raw)
        # Legacy / raw string path (kept for tests and future use)
        return self._parse_cluster_nodes_str(raw)

    def _parse_cluster_nodes_dict(self, raw: dict) -> list[ClusterNode]:
        """Parse the dict format returned by redis-py 5.x."""
        nodes: list[ClusterNode] = []
        for address, info in raw.items():
            try:
                host, port_str = address.rsplit(":", 1)
                port = int(port_str)
            except ValueError:
                logger.warning("Unexpected CLUSTER NODES key: %s", address)
                continue

            node_id: str = info.get("node_id", "")
            flags_str: str = info.get("flags", "")
            flags_raw = [f.strip() for f in flags_str.split(",") if f.strip()]

            role = NodeRole.MASTER if "master" in flags_raw else (
                NodeRole.SLAVE if "slave" in flags_raw else NodeRole.UNKNOWN
            )

            status = NodeStatus.CONNECTED if info.get("connected") else NodeStatus.DISCONNECTED
            for flag in flags_raw:
                if flag in _FLAG_STATUS_MAP:
                    status = _FLAG_STATUS_MAP[flag]
                    break

            master_id_raw = info.get("master_id", "-")
            master_id = None if master_id_raw in ("-", "", None) else master_id_raw

            # slots: list of [start, end] pairs (both as strings)
            slots: list[SlotRange] = []
            for slot_entry in info.get("slots", []):
                try:
                    if isinstance(slot_entry, (list, tuple)):
                        start, end = int(slot_entry[0]), int(slot_entry[1])
                    else:
                        start = end = int(slot_entry)
                    slots.append(SlotRange(start, end))
                except (ValueError, IndexError):
                    pass

            nodes.append(
                ClusterNode(
                    node_id=node_id,
                    host=host,
                    port=port,
                    role=role,
                    status=status,
                    slots=slots,
                    replication_offset=0,
                    master_id=master_id,
                    flags=flags_raw,
                )
            )
        return nodes

    def _parse_cluster_nodes_str(self, raw: str) -> list[ClusterNode]:
        """Parse the legacy raw-text format (used in unit tests)."""
        nodes: list[ClusterNode] = []
        for line in raw.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 8:
                logger.warning("Unexpected CLUSTER NODES line: %s", line)
                continue

            node_id = parts[0]
            addr_part = parts[1].split("@")[0]
            host, port_str = addr_part.rsplit(":", 1)
            port = int(port_str)

            flags_raw = parts[2].split(",")
            role = NodeRole.MASTER if "master" in flags_raw else (
                NodeRole.SLAVE if "slave" in flags_raw else NodeRole.UNKNOWN
            )

            status = NodeStatus.CONNECTED
            for flag in flags_raw:
                if flag in _FLAG_STATUS_MAP:
                    status = _FLAG_STATUS_MAP[flag]
                    break

            master_id_raw = parts[3]
            master_id = None if master_id_raw == "-" else master_id_raw
            replication_offset = int(parts[7]) if parts[7].lstrip("-").isdigit() else 0

            slots: list[SlotRange] = []
            for slot_token in parts[8:]:
                if slot_token.startswith("["):
                    continue
                if "-" in slot_token:
                    start, end = slot_token.split("-")
                    slots.append(SlotRange(int(start), int(end)))
                else:
                    try:
                        slots.append(SlotRange(int(slot_token), int(slot_token)))
                    except ValueError:
                        pass

            nodes.append(
                ClusterNode(
                    node_id=node_id,
                    host=host,
                    port=port,
                    role=role,
                    status=status,
                    slots=slots,
                    replication_offset=replication_offset,
                    master_id=master_id,
                    flags=flags_raw,
                )
            )
        return nodes

    def _parse_node_metrics(self, info: dict[str, Any]) -> NodeMetrics:
        """Map the flat INFO dict into a typed NodeMetrics object."""
        mem = NodeMemory(
            used_bytes=int(info.get("used_memory", 0)),
            peak_bytes=int(info.get("used_memory_peak", 0)),
            rss_bytes=int(info.get("used_memory_rss", 0)),
            max_bytes=int(info.get("maxmemory", 0)),
        )

        # Total keys across all dbs
        keys_count = 0
        for key, val in info.items():
            if key.startswith("db") and isinstance(val, dict):
                keys_count += int(val.get("keys", 0))

        rdb_last_save_ts = int(info.get("rdb_last_bgsave_time_sec", 0))
        if rdb_last_save_ts == -1 or rdb_last_save_ts == 0:
            rdb_last_save = datetime.now(timezone.utc)
        else:
            rdb_last_save = datetime.fromtimestamp(rdb_last_save_ts, tz=timezone.utc)

        return NodeMetrics(
            keys_count=keys_count,
            connected_clients=int(info.get("connected_clients", 0)),
            commands_per_sec=float(info.get("instantaneous_ops_per_sec", 0)),
            used_cpu_sys=float(info.get("used_cpu_sys", 0.0)),
            used_cpu_user=float(info.get("used_cpu_user", 0.0)),
            memory=mem,
            uptime_seconds=int(info.get("uptime_in_seconds", 0)),
            replication_offset=int(info.get("master_repl_offset", 0)),
            aof_enabled=bool(int(info.get("aof_enabled", 0))),
            rdb_last_save=rdb_last_save,
        )

    @staticmethod
    def _derive_cluster_status(nodes: list[ClusterNode]) -> ClusterStatus:
        if not nodes:
            return ClusterStatus.UNKNOWN

        fail_flags = {NodeStatus.FAIL, NodeStatus.PFAIL}
        failed = [n for n in nodes if n.status in fail_flags]
        disconnected = [n for n in nodes if n.status == NodeStatus.DISCONNECTED]

        if failed:
            return ClusterStatus.FAIL
        if disconnected:
            return ClusterStatus.DEGRADED
        return ClusterStatus.OK

    @staticmethod
    def hash_password(plaintext: str) -> str:
        """SHA-256 hash a password for ACL SETUSER #<hash> syntax."""
        return hashlib.sha256(plaintext.encode()).hexdigest()
