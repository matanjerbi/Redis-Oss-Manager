"""
FastAPI dependency providers — separated from main.py to break circular imports.
"""
from __future__ import annotations

from typing import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.acl_service import AclService
from app.application.services.cluster_service import ClusterService
from app.application.services.config_service import ConfigService
from app.application.services.slowlog_service import SlowlogService
from app.application.services.failover_service import FailoverService
from app.application.services.metrics_service import MetricsService
from app.application.services.node_ops_service import NodeOpsService
from app.infrastructure.database.repository import ClusterRepository
from app.infrastructure.redis.connection_pool import cluster_pool


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    from app.main import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        async with session.begin():
            yield session


async def get_cluster_service(
    session: AsyncSession = Depends(get_db_session),
) -> ClusterService:
    return ClusterService(
        repository=ClusterRepository(session),
        pool=cluster_pool,
    )


async def get_acl_service() -> AclService:
    return AclService(pool=cluster_pool)


async def get_config_service() -> ConfigService:
    return ConfigService(pool=cluster_pool)


async def get_slowlog_service() -> SlowlogService:
    return SlowlogService(pool=cluster_pool)


async def get_failover_service() -> FailoverService:
    return FailoverService(pool=cluster_pool)


async def get_metrics_service() -> MetricsService:
    return MetricsService()


async def get_node_ops_service() -> NodeOpsService:
    return NodeOpsService(pool=cluster_pool)
