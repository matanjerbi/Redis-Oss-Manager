"""
ClusterRepository — async SQLAlchemy repository for cluster metadata.

Follows the Repository pattern: the application layer never touches
SQLAlchemy directly; it works with domain models only.
"""
from __future__ import annotations

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.exceptions import ClusterNotFoundError
from app.domain.models import ClusterConfig
from app.infrastructure.database.models import ClusterORM


class ClusterRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, cluster_id: int) -> ClusterConfig:
        row = await self._session.get(ClusterORM, cluster_id)
        if row is None:
            raise ClusterNotFoundError(cluster_id)
        return row.to_domain()

    async def list_all(self, tenant_id: str | None = None) -> list[ClusterConfig]:
        stmt = select(ClusterORM)
        if tenant_id:
            stmt = stmt.where(ClusterORM.tenant_id == tenant_id)
        result = await self._session.execute(stmt)
        return [row.to_domain() for row in result.scalars()]

    async def create(self, config: ClusterConfig) -> ClusterConfig:
        row = ClusterORM(
            name=config.name,
            description=config.description,
            tenant_id=config.tenant_id,
            seed_nodes=config.seed_nodes,
            password=config.password,
            tls_enabled=config.tls_enabled,
            socket_timeout=config.socket_timeout,
            socket_connect_timeout=config.socket_connect_timeout,
        )
        self._session.add(row)
        await self._session.flush()   # populate auto-generated id
        await self._session.refresh(row)
        return row.to_domain()

    async def update(self, cluster_id: int, **kwargs) -> ClusterConfig:
        row = await self._session.get(ClusterORM, cluster_id)
        if row is None:
            raise ClusterNotFoundError(cluster_id)
        for key, value in kwargs.items():
            if hasattr(row, key):
                setattr(row, key, value)
        await self._session.flush()
        await self._session.refresh(row)
        return row.to_domain()

    async def delete(self, cluster_id: int) -> None:
        row = await self._session.get(ClusterORM, cluster_id)
        if row is None:
            raise ClusterNotFoundError(cluster_id)
        await self._session.delete(row)
