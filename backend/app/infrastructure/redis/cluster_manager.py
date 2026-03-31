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

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Open the cluster connection. Call once at startup."""
        if self._client is not None:
            return

        startup_nodes = self._parse_seed_nodes()
        try:
            self._client = RedisCluster(
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
            await self._client.initialize()
            logger.info("Connected to cluster %s", self.cluster_id)
        except (RedisConnectionError, RedisClusterException) as exc:
            raise ClusterConnectionError(self.cluster_id, exc) from exc

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

    async def get_topology(self, cluster_name: str) -> ClusterTopology:
        """
        Return a fully-populated ClusterTopology by combining:
          - CLUSTER NODES  (roles, slots, replication offsets)
          - INFO all       (per-node metrics)
        """
        # Use a direct single-node connection so CLUSTER NODES returns the
        # raw text string (redis-py RedisCluster returns a dict instead).
        seed_host, seed_port = self.seed_nodes[0].rsplit(":", 1)
        try:
            direct = self._make_direct_conn(seed_host, int(seed_port))
            async with direct:
                raw_nodes: str = await direct.execute_command("CLUSTER NODES")
        except (RedisConnectionError, RedisTimeoutError) as exc:
            raise ClusterConnectionError(self.cluster_id, exc) from exc

        parsed_nodes = self._parse_cluster_nodes(raw_nodes)

        # Fan-out INFO calls concurrently to every node
        info_tasks = {
            node.address: self._fetch_node_info(node.host, node.port)
            for node in parsed_nodes
        }
        info_results: dict[str, dict[str, Any]] = {}
        for address, coro in info_tasks.items():
            try:
                info_results[address] = await coro
            except NodeUnreachableError as exc:
                logger.warning("Could not fetch INFO from %s: %s", address, exc)
                info_results[address] = {}

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
