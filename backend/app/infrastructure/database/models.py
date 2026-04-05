"""SQLAlchemy ORM models — PostgreSQL-backed cluster metadata."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class ClusterORM(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    seed_nodes = Column(ARRAY(String), nullable=False)
    password = Column(String(256), nullable=True)
    tls_enabled = Column(Boolean, default=False, nullable=False)
    socket_timeout = Column(Float, default=5.0, nullable=False)
    socket_connect_timeout = Column(Float, default=5.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def to_domain(self) -> "ClusterConfig":
        from app.domain.models import ClusterConfig
        return ClusterConfig(
            id=self.id,
            name=self.name,
            description=self.description or "",
            tenant_id=self.tenant_id,
            seed_nodes=list(self.seed_nodes),
            password=self.password,
            tls_enabled=self.tls_enabled,
            socket_timeout=self.socket_timeout,
            socket_connect_timeout=self.socket_connect_timeout,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )
