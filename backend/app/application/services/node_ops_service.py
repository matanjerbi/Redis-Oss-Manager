"""NodeOpsService — Forget Node and Reset & Rejoin operations."""
from __future__ import annotations

from dataclasses import dataclass

from app.domain.exceptions import ClusterNotFoundError
from app.infrastructure.redis.connection_pool import ClusterManagerPool


@dataclass
class NodeOpsResult:
    success: bool
    message: str
    node_results: dict[str, str]


class NodeOpsService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def forget_node(self, cluster_id: int, node_id: str) -> NodeOpsResult:
        try:
            manager = await self._pool.get(cluster_id)
        except ClusterNotFoundError:
            raise
        results = await manager.forget_node(node_id)
        success = any(v == "OK" for v in results.values())
        return NodeOpsResult(
            success=success,
            message="CLUSTER FORGET broadcast complete",
            node_results=results,
        )

    async def rejoin_node(
        self, cluster_id: int, host: str, port: int, master_id: str | None = None
    ) -> NodeOpsResult:
        try:
            manager = await self._pool.get(cluster_id)
        except ClusterNotFoundError:
            raise
        result = await manager.rejoin_node(host, port, master_id=master_id)
        return NodeOpsResult(
            success=result == "OK",
            message=result,
            node_results={f"{host}:{port}": result},
        )
