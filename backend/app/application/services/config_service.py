"""
ConfigService — fan-out Redis CONFIG GET/SET across all shards.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.infrastructure.redis.connection_pool import ClusterManagerPool

logger = logging.getLogger(__name__)


@dataclass
class ConfigSetResult:
    parameter: str
    value: str
    cluster_id: int
    node_results: dict[str, str]    # {address: "OK" | error}

    @property
    def success(self) -> bool:
        return all(v == "OK" for v in self.node_results.values())

    @property
    def failed_nodes(self) -> list[str]:
        return [addr for addr, res in self.node_results.items() if res != "OK"]


class ConfigService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def set_config(
        self,
        cluster_id: int,
        parameter: str,
        value: str,
    ) -> ConfigSetResult:
        """Apply CONFIG SET <parameter> <value> on every node."""
        manager = await self._pool.get(cluster_id)
        node_results = await manager.config_set(parameter, value)
        result = ConfigSetResult(
            parameter=parameter,
            value=value,
            cluster_id=cluster_id,
            node_results=node_results,
        )
        if not result.success:
            logger.warning(
                "CONFIG SET %s=%s had failures on cluster %d: %s",
                parameter,
                value,
                cluster_id,
                result.failed_nodes,
            )
        return result

    async def get_config(
        self,
        cluster_id: int,
        pattern: str = "*",
    ) -> dict[str, dict[str, str]]:
        """Return CONFIG GET <pattern> per node as {address: {param: value}}."""
        manager = await self._pool.get(cluster_id)
        return await manager.config_get(pattern)
