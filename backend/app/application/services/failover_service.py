"""
FailoverService — trigger CLUSTER FAILOVER on a replica node.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.infrastructure.redis.connection_pool import ClusterManagerPool

logger = logging.getLogger(__name__)


@dataclass
class FailoverResult:
    cluster_id: int
    node_address: str
    success: bool
    message: str


class FailoverService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def failover(
        self,
        cluster_id: int,
        host: str,
        port: int,
        force: bool = False,
    ) -> FailoverResult:
        """Send CLUSTER FAILOVER [FORCE] to the given replica node."""
        manager = await self._pool.get(cluster_id)
        address = f"{host}:{port}"
        try:
            result = await manager.failover_node(host=host, port=port, force=force)
            return FailoverResult(
                cluster_id=cluster_id,
                node_address=address,
                success=True,
                message=result,
            )
        except Exception as exc:
            logger.error("Failover failed for %s on cluster %d: %s", address, cluster_id, exc)
            return FailoverResult(
                cluster_id=cluster_id,
                node_address=address,
                success=False,
                message=str(exc),
            )
