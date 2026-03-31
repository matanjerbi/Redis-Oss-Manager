"""
HealthPoller — background asyncio task that periodically polls all
registered clusters and caches their topology snapshots.

The cache (an in-memory dict) is the single source of truth for the
/health endpoint — the endpoint reads from the cache and returns
immediately, while the poller refreshes asynchronously.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.domain.models import ClusterTopology
from app.infrastructure.redis.connection_pool import ClusterManagerPool

logger = logging.getLogger(__name__)


class HealthPoller:
    """
    Runs a polling loop every `interval_seconds` for every cluster in
    the connection pool, storing the latest ClusterTopology in a cache.
    """

    def __init__(
        self,
        pool: ClusterManagerPool,
        interval_seconds: float = 30.0,
    ) -> None:
        self._pool = pool
        self._interval = interval_seconds
        self._cache: dict[int, ClusterTopology] = {}
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Schedule the polling loop as a background asyncio task."""
        if self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop(), name="health-poller")
        logger.info("HealthPoller started (interval=%ss)", self._interval)

    async def stop(self) -> None:
        """Cancel the polling loop and wait for it to finish."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("HealthPoller stopped")

    # ------------------------------------------------------------------
    # Cache access
    # ------------------------------------------------------------------

    def get_cached(self, cluster_id: int) -> Optional[ClusterTopology]:
        return self._cache.get(cluster_id)

    def all_cached(self) -> dict[int, ClusterTopology]:
        return dict(self._cache)

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    async def _poll_loop(self) -> None:
        while self._running:
            await self._poll_all()
            await asyncio.sleep(self._interval)

    async def _poll_all(self) -> None:
        cluster_ids = self._pool.registered_ids()
        if not cluster_ids:
            return

        tasks = {cid: self._poll_one(cid) for cid in cluster_ids}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        for cluster_id, result in zip(tasks.keys(), results):
            if isinstance(result, Exception):
                logger.error(
                    "Health poll failed for cluster %d: %s", cluster_id, result
                )
            elif isinstance(result, ClusterTopology):
                self._cache[cluster_id] = result

        logger.debug(
            "Health poll complete at %s for %d cluster(s)",
            datetime.now(timezone.utc).isoformat(),
            len(cluster_ids),
        )

    async def _poll_one(self, cluster_id: int) -> ClusterTopology:
        manager = await self._pool.get(cluster_id)
        # We need the cluster name — get it from cache or use the id as fallback
        cached = self._cache.get(cluster_id)
        name = cached.cluster_name if cached else f"cluster-{cluster_id}"
        return await manager.get_topology(cluster_name=name)
