"""
FastAPI application factory and dependency injection wiring.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.application.background.health_poller import HealthPoller
from app.application.services.cluster_service import ClusterService
from app.config import settings
from app.infrastructure.database.models import Base
from app.infrastructure.database.repository import ClusterRepository
from app.infrastructure.redis.connection_pool import cluster_pool

# ------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Database engine (module-level so it's created once)
# ------------------------------------------------------------------
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# ------------------------------------------------------------------
# Background services (module-level singletons)
# ------------------------------------------------------------------
health_poller = HealthPoller(
    pool=cluster_pool,
    interval_seconds=settings.health_poll_interval,
)


# ------------------------------------------------------------------
# App lifespan
# ------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema ensured")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            repo = ClusterRepository(session)
            svc = ClusterService(repository=repo, pool=cluster_pool)
            await svc.warmup()

    health_poller.start()
    logger.info("Application started")

    yield

    # Shutdown
    await health_poller.stop()
    await cluster_pool.close_all()
    await engine.dispose()
    logger.info("Application shut down cleanly")


# ------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(
        title="Redis OSS Cluster Manager",
        description="Control plane for managing multi-tenant Redis OSS clusters",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api.routes import clusters as cluster_routes
    app.include_router(cluster_routes.router)

    return app


app = create_app()
