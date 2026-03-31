"""
ClusterManagerPool — registry that maps cluster_id → ClusterManager.

Ensures one connection pool per cluster, shared across the lifetime of
the FastAPI application. Thread/task safe via asyncio.Lock.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.domain.exceptions import ClusterNotFoundError
from app.domain.models import ClusterConfig
from app.infrastructure.redis.cluster_manager import ClusterManager

logger = logging.getLogger(__name__)


class ClusterManagerPool:
    def __init__(self) -> None:
        self._managers: dict[int, ClusterManager] = {}
        self._lock = asyncio.Lock()

    async def register(self, config: ClusterConfig) -> ClusterManager:
        """
        Create (or return existing) ClusterManager for the given config.
        The manager is stored even when the initial connection fails so that
        subsequent health-check calls can retry against the full seed list
        (which gets expanded as nodes are discovered).
        """
        from app.domain.exceptions import ClusterConnectionError

        async with self._lock:
            if config.id in self._managers:
                return self._managers[config.id]

            manager = ClusterManager(
                cluster_id=config.id,
                seed_nodes=config.seed_nodes,
                password=config.password,
                tls_enabled=config.tls_enabled,
                socket_timeout=config.socket_timeout,
                socket_connect_timeout=config.socket_connect_timeout,
            )
            try:
                await manager.connect()
                logger.info("Registered cluster %d (%s)", config.id, config.name)
            except ClusterConnectionError as exc:
                logger.warning(
                    "Cluster %d (%s) unreachable at registration — will retry on demand: %s",
                    config.id, config.name, exc,
                )
            # Always store the manager so get_topology() can try later
            self._managers[config.id] = manager
            return manager

    async def get(self, cluster_id: int) -> ClusterManager:
        """Retrieve an existing manager or raise ClusterNotFoundError."""
        manager = self._managers.get(cluster_id)
        if manager is None:
            raise ClusterNotFoundError(cluster_id)
        return manager

    async def deregister(self, cluster_id: int) -> None:
        """Disconnect and remove a cluster from the pool."""
        async with self._lock:
            manager = self._managers.pop(cluster_id, None)
            if manager:
                await manager.disconnect()
                logger.info("Deregistered cluster %d", cluster_id)

    async def close_all(self) -> None:
        """Gracefully close every open connection (called on app shutdown)."""
        async with self._lock:
            ids = list(self._managers.keys())
        for cid in ids:
            await self.deregister(cid)

    def __contains__(self, cluster_id: int) -> bool:
        return cluster_id in self._managers

    def registered_ids(self) -> list[int]:
        return list(self._managers.keys())


# Singleton instance — imported by the FastAPI app and DI container.
cluster_pool = ClusterManagerPool()
