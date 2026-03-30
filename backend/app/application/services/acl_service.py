"""
AclService — centralized ACL management across cluster nodes.

Provides fan-out ACL SETUSER / DELUSER and a convenient upsert helper
that builds an AclRule from structured inputs.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from app.domain.models import AclRule
from app.infrastructure.redis.cluster_manager import ClusterManager
from app.infrastructure.redis.connection_pool import ClusterManagerPool

logger = logging.getLogger(__name__)


@dataclass
class AclUpsertRequest:
    username: str
    enabled: bool = True
    plaintext_password: Optional[str] = None
    commands: list[str] = field(default_factory=lambda: ["+@read", "-@dangerous"])
    key_patterns: list[str] = field(default_factory=lambda: ["*"])
    channel_patterns: list[str] = field(default_factory=lambda: ["*"])
    nopass: bool = False


@dataclass
class AclOperationResult:
    username: str
    cluster_id: int
    node_results: dict[str, str]          # {address: "OK" | error}

    @property
    def success(self) -> bool:
        return all(v == "OK" for v in self.node_results.values())

    @property
    def failed_nodes(self) -> list[str]:
        return [addr for addr, res in self.node_results.items() if res != "OK"]


class AclService:
    def __init__(self, pool: ClusterManagerPool) -> None:
        self._pool = pool

    async def upsert_user(
        self,
        cluster_id: int,
        req: AclUpsertRequest,
    ) -> AclOperationResult:
        """Create or update an ACL user across all nodes of a cluster."""
        manager = await self._pool.get(cluster_id)

        passwords: list[str] = []
        if req.plaintext_password:
            passwords.append(ClusterManager.hash_password(req.plaintext_password))

        rule = AclRule(
            username=req.username,
            enabled=req.enabled,
            passwords=passwords,
            commands=req.commands,
            keys=req.key_patterns,
            channels=req.channel_patterns,
            nopass=req.nopass,
        )

        node_results = await manager.acl_setuser(rule)
        result = AclOperationResult(
            username=req.username,
            cluster_id=cluster_id,
            node_results=node_results,
        )

        if not result.success:
            logger.warning(
                "ACL upsert for '%s' on cluster %d had failures: %s",
                req.username,
                cluster_id,
                result.failed_nodes,
            )
        return result

    async def delete_user(
        self,
        cluster_id: int,
        username: str,
    ) -> AclOperationResult:
        manager = await self._pool.get(cluster_id)
        node_results = await manager.acl_deluser(username)
        return AclOperationResult(
            username=username,
            cluster_id=cluster_id,
            node_results=node_results,
        )

    async def list_users(self, cluster_id: int) -> list[str]:
        """Return raw ACL LIST entries from a cluster node."""
        manager = await self._pool.get(cluster_id)
        return await manager.acl_list()
