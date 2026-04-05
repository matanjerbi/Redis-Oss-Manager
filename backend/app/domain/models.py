"""
Domain models — pure Python dataclasses, zero framework dependencies.
These represent the core entities the system reasons about.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class NodeRole(str, Enum):
    MASTER = "master"
    SLAVE = "slave"      # kept for backward compatibility
    REPLICA = "replica"  # preferred alias
    UNKNOWN = "unknown"


class NodeStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    HANDSHAKE = "handshake"
    FAIL = "fail"
    PFAIL = "pfail"
    NOADDR = "noaddr"
    UNKNOWN = "unknown"


class ClusterStatus(str, Enum):
    OK = "ok"
    FAIL = "fail"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


@dataclass
class SlotRange:
    start: int
    end: int

    def __contains__(self, slot: int) -> bool:
        return self.start <= slot <= self.end

    def count(self) -> int:
        return self.end - self.start + 1

    def __repr__(self) -> str:
        return f"{self.start}-{self.end}"


@dataclass
class NodeMemory:
    used_bytes: int
    peak_bytes: int
    rss_bytes: int
    max_bytes: int  # 0 = no limit

    @property
    def used_mb(self) -> float:
        return round(self.used_bytes / (1024 * 1024), 2)

    @property
    def utilization_pct(self) -> Optional[float]:
        if self.max_bytes == 0:
            return None
        return round((self.used_bytes / self.max_bytes) * 100, 2)


@dataclass
class NodeMetrics:
    keys_count: int
    connected_clients: int
    commands_per_sec: float
    used_cpu_sys: float
    used_cpu_user: float
    memory: NodeMemory
    uptime_seconds: int
    replication_offset: int
    aof_enabled: bool
    rdb_last_save: datetime


@dataclass
class ClusterNode:
    node_id: str
    host: str
    port: int
    role: NodeRole
    status: NodeStatus
    slots: list[SlotRange]
    replication_offset: int
    master_id: Optional[str]  # None for masters; master's node_id for replicas
    metrics: Optional[NodeMetrics] = None
    flags: list[str] = field(default_factory=list)

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"

    @property
    def slot_count(self) -> int:
        return sum(s.count() for s in self.slots)

    @property
    def is_healthy(self) -> bool:
        return self.status == NodeStatus.CONNECTED and NodeStatus.FAIL.value not in self.flags


@dataclass
class ClusterTopology:
    cluster_id: str
    cluster_name: str
    nodes: list[ClusterNode]
    status: ClusterStatus
    polled_at: datetime
    cluster_enabled: bool
    total_slots_assigned: int

    @property
    def masters(self) -> list[ClusterNode]:
        return [n for n in self.nodes if n.role == NodeRole.MASTER]

    @property
    def replicas(self) -> list[ClusterNode]:
        return [n for n in self.nodes if n.role == NodeRole.SLAVE]

    @property
    def healthy_nodes(self) -> list[ClusterNode]:
        return [n for n in self.nodes if n.is_healthy]

    @property
    def total_keys(self) -> int:
        return sum(
            n.metrics.keys_count for n in self.masters if n.metrics is not None
        )

    @property
    def coverage_pct(self) -> float:
        return round((self.total_slots_assigned / 16384) * 100, 2)


@dataclass
class ClusterConfig:
    """Metadata stored in PostgreSQL about a registered cluster."""
    id: int
    name: str
    seed_nodes: list[str]   # ["host:port", ...]
    description: str
    tenant_id: str
    created_at: datetime
    updated_at: datetime
    password: Optional[str] = None
    tls_enabled: bool = False
    socket_timeout: float = 5.0
    socket_connect_timeout: float = 5.0


@dataclass
class AclRule:
    username: str
    enabled: bool
    passwords: list[str]        # hashed passwords
    commands: list[str]         # e.g. ["+@read", "-@dangerous"]
    keys: list[str]             # key patterns e.g. ["tenant_a:*"]
    channels: list[str]         # pub/sub channel patterns
    nopass: bool = False

    def to_setuser_args(self) -> list[str]:
        """Serialize to arguments for ACL SETUSER <username> [args...]."""
        args: list[str] = []
        args.append("on" if self.enabled else "off")
        if self.nopass:
            args.append("nopass")
        for pwd in self.passwords:
            args.append(f"#{pwd}")  # pre-hashed
        for cmd in self.commands:
            args.append(cmd)
        for key in self.keys:
            args.append(f"~{key}")
        for channel in self.channels:
            args.append(f"&{channel}")
        return args
