"""
SlowlogService — fetch SLOWLOG GET across all cluster nodes.
"""
from __future__ import annotations

from app.infrastructure.redis.connection_pool import ClusterManagerPool


class SlowlogService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def get_slowlog(
        self,
        cluster_id: int,
        count: int = 128,
    ) -> dict[str, list[dict]]:
        """Return SLOWLOG GET per node as {address: [entry, ...]}."""
        manager = await self._pool.get(cluster_id)
        return await manager.slowlog_get(count=count)
