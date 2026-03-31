"""AddNodeService — join a new Redis node to an existing cluster."""
from __future__ import annotations

from dataclasses import dataclass

from app.domain.exceptions import ClusterNotFoundError
from app.infrastructure.redis.connection_pool import ClusterManagerPool


@dataclass
class AddNodeResult:
    success: bool
    message: str
    node_id: str | None = None
    slots_migrated: int = 0


class AddNodeService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def add_replica(
        self, cluster_id: int, host: str, port: int, master_id: str
    ) -> AddNodeResult:
        manager = await self._pool.get(cluster_id)
        result = await manager.add_node_as_replica(host, port, master_id)
        return AddNodeResult(success=result == "OK", message=result)

    async def add_master(
        self, cluster_id: int, host: str, port: int
    ) -> AddNodeResult:
        manager = await self._pool.get(cluster_id)
        result = await manager.add_node_as_master(host, port)
        return AddNodeResult(
            success=True,
            message=f"Node added as master with {result['slots_migrated']} slots",
            node_id=str(result["node_id"]),
            slots_migrated=int(result["slots_migrated"]),
        )
