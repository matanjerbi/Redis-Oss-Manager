"""
ClusterService — orchestrates cluster operations for the API layer.

Sits between HTTP handlers and the infrastructure layer.  It owns:
  - CRUD for cluster configurations (via repository)
  - Live topology/health queries (via ClusterManager)
  - Registration/deregistration in the connection pool
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.domain.exceptions import ClusterNotFoundError
from app.domain.models import ClusterConfig, ClusterTopology
from app.infrastructure.database.repository import ClusterRepository
from app.infrastructure.redis.connection_pool import ClusterManagerPool

logger = logging.getLogger(__name__)


@dataclass
class CreateClusterRequest:
    name: str
    seed_nodes: list[str]
    tenant_id: str
    description: str = ""
    password: Optional[str] = None
    tls_enabled: bool = False
    socket_timeout: float = 5.0
    socket_connect_timeout: float = 5.0


class ClusterService:
    def __init__(
        self,
        repository: ClusterRepository,
        pool: ClusterManagerPool,
    ) -> None:
        self._repo = repository
        self._pool = pool

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def register_cluster(self, req: CreateClusterRequest) -> ClusterConfig:
        """
        Persist metadata, open the connection pool entry, and immediately
        discover all cluster nodes so the DB seed list is complete from day one.
        """
        now = datetime.now(timezone.utc)
        config = ClusterConfig(
            id=0,  # filled by DB
            name=req.name,
            seed_nodes=req.seed_nodes,
            tenant_id=req.tenant_id,
            description=req.description,
            password=req.password,
            tls_enabled=req.tls_enabled,
            socket_timeout=req.socket_timeout,
            socket_connect_timeout=req.socket_connect_timeout,
            created_at=now,
            updated_at=now,
        )
        saved = await self._repo.create(config)
        await self._pool.register(saved)

        # Discover all cluster members immediately and persist them so that
        # a future restart can reach the cluster even if the registered seed
        # goes down.
        try:
            manager = await self._pool.get(saved.id)
            topology = await manager.get_topology(cluster_name=saved.name)
            all_nodes = sorted({f"{n.host}:{n.port}" for n in topology.nodes})
            if all_nodes and set(all_nodes) != set(saved.seed_nodes):
                saved = await self._repo.update(saved.id, seed_nodes=all_nodes)
                logger.info(
                    "Cluster '%s' — persisted %d discovered nodes as seeds",
                    saved.name, len(all_nodes),
                )
        except Exception as exc:
            logger.warning(
                "Could not discover all nodes for cluster '%s' at registration: %s",
                saved.name, exc,
            )

        logger.info("Registered new cluster '%s' (id=%d)", saved.name, saved.id)
        return saved

    async def get_cluster(self, cluster_id: int) -> ClusterConfig:
        return await self._repo.get_by_id(cluster_id)

    async def list_clusters(self, tenant_id: str | None = None) -> list[ClusterConfig]:
        return await self._repo.list_all(tenant_id=tenant_id)

    async def remove_cluster(self, cluster_id: int) -> None:
        await self._repo.delete(cluster_id)
        await self._pool.deregister(cluster_id)
        logger.info("Removed cluster %d", cluster_id)

    async def update_seeds(self, cluster_id: int, seed_nodes: list[str]) -> ClusterConfig:
        """
        Replace the seed list, force a reconnect via the new seeds, and
        persist the result.  Returns the updated ClusterConfig.
        """
        config = await self._repo.update(cluster_id, seed_nodes=seed_nodes)

        # Force a clean reconnect with the new seeds
        await self._pool.deregister(cluster_id)
        await self._pool.register(config)

        logger.info(
            "Updated seeds for cluster %d: %s", cluster_id, seed_nodes
        )
        return config

    # ------------------------------------------------------------------
    # Health / topology
    # ------------------------------------------------------------------

    async def get_health(self, cluster_id: int) -> ClusterTopology:
        """
        Return a live ClusterTopology snapshot.

        After a successful fetch the full set of discovered node addresses is
        persisted back to the database as seed_nodes so that a server restart
        can still reach the cluster even if the originally registered seed is
        down.

        Raises ClusterNotFoundError if the cluster isn't registered.
        Raises ClusterConnectionError if all seed nodes are unreachable.
        """
        config = await self._repo.get_by_id(cluster_id)

        # Ensure connection pool entry exists (idempotent)
        if cluster_id not in self._pool:
            await self._pool.register(config)

        manager = await self._pool.get(cluster_id)
        topology = await manager.get_topology(cluster_name=config.name)

        # Persist all discovered node addresses so future restarts can find
        # the cluster even when the original seed node is no longer available.
        discovered = sorted({f"{n.host}:{n.port}" for n in topology.nodes})
        if discovered and set(discovered) != set(config.seed_nodes):
            try:
                await self._repo.update(cluster_id, seed_nodes=discovered)
            except Exception as exc:
                logger.warning(
                    "Could not persist discovered seeds for cluster %d: %s",
                    cluster_id, exc,
                )

        return topology

    async def scan_namespace(
        self, cluster_id: int, prefix: str, max_keys: int = 1000
    ) -> list[str]:
        config = await self._repo.get_by_id(cluster_id)
        if cluster_id not in self._pool:
            await self._pool.register(config)
        manager = await self._pool.get(cluster_id)
        return await manager.scan_namespace(prefix=prefix, max_keys=max_keys)

    async def warmup(self) -> None:
        """
        Called at application startup: load all clusters from DB and
        pre-open their connection pools so the first health poll is fast.
        """
        clusters = await self._repo.list_all()
        for config in clusters:
            try:
                await self._pool.register(config)
            except Exception as exc:
                logger.warning(
                    "Could not connect to cluster '%s' at startup: %s",
                    config.name,
                    exc,
                )
