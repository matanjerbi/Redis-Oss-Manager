"""Pydantic v2 request/response schemas for the Clusters API."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------
# Request schemas
# ------------------------------------------------------------------

class CreateClusterBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    seed_nodes: list[str] = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1, max_length=64)
    description: str = ""
    password: Optional[str] = None
    tls_enabled: bool = False
    socket_timeout: float = Field(default=5.0, gt=0, le=60)
    socket_connect_timeout: float = Field(default=5.0, gt=0, le=60)

    @field_validator("seed_nodes")
    @classmethod
    def validate_seed_nodes(cls, nodes: list[str]) -> list[str]:
        for node in nodes:
            parts = node.rsplit(":", 1)
            if len(parts) != 2 or not parts[1].isdigit():
                raise ValueError(
                    f"Invalid seed node '{node}'. Expected format: host:port"
                )
        return nodes


class AclUpsertBody(BaseModel):
    username: str = Field(..., min_length=1)
    enabled: bool = True
    plaintext_password: Optional[str] = None
    commands: list[str] = Field(
        default=["+@read", "-@dangerous"],
        description="ACL command rules, e.g. '+@read', '-@write'",
    )
    key_patterns: list[str] = Field(
        default=["*"],
        description="Key glob patterns, e.g. 'tenant_a:*'",
    )
    channel_patterns: list[str] = Field(default=["*"])
    nopass: bool = False


class ConfigSetBody(BaseModel):
    parameter: str = Field(..., min_length=1)
    value: str


class NamespaceScanBody(BaseModel):
    prefix: str = Field(..., min_length=1, description="Key prefix, e.g. 'tenant_a:'")
    max_keys: int = Field(default=200, gt=0, le=10_000)


class UpdateSeedsBody(BaseModel):
    seed_nodes: list[str] = Field(..., min_length=1)

    @field_validator("seed_nodes")
    @classmethod
    def validate_seed_nodes(cls, nodes: list[str]) -> list[str]:
        for node in nodes:
            parts = node.rsplit(":", 1)
            if len(parts) != 2 or not parts[1].isdigit():
                raise ValueError(f"Invalid seed node '{node}'. Expected format: host:port")
        return nodes


# ------------------------------------------------------------------
# Response schemas
# ------------------------------------------------------------------

class NodeMemoryOut(BaseModel):
    used_bytes: int
    peak_bytes: int
    rss_bytes: int
    max_bytes: int
    used_mb: float
    utilization_pct: Optional[float]


class NodeMetricsOut(BaseModel):
    keys_count: int
    connected_clients: int
    commands_per_sec: float
    used_cpu_sys: float
    used_cpu_user: float
    memory: NodeMemoryOut
    uptime_seconds: int
    replication_offset: int
    aof_enabled: bool
    rdb_last_save: datetime


class SlotRangeOut(BaseModel):
    start: int
    end: int
    count: int


class ClusterNodeOut(BaseModel):
    node_id: str
    host: str
    port: int
    address: str
    role: str
    status: str
    flags: list[str]
    slots: list[SlotRangeOut]
    slot_count: int
    master_id: Optional[str]
    replication_offset: int
    is_healthy: bool
    metrics: Optional[NodeMetricsOut]


class ClusterTopologyOut(BaseModel):
    cluster_id: str
    cluster_name: str
    status: str
    polled_at: datetime
    cluster_enabled: bool
    total_slots_assigned: int
    coverage_pct: float
    total_keys: int
    nodes: list[ClusterNodeOut]
    master_count: int
    replica_count: int
    healthy_node_count: int


class ClusterConfigOut(BaseModel):
    id: int
    name: str
    description: str
    tenant_id: str
    seed_nodes: list[str]
    tls_enabled: bool
    socket_timeout: float
    socket_connect_timeout: float
    created_at: datetime
    updated_at: datetime


class AclOperationOut(BaseModel):
    username: str
    cluster_id: int
    success: bool
    node_results: dict[str, str]
    failed_nodes: list[str]


class ConfigSetOut(BaseModel):
    parameter: str
    value: str
    cluster_id: int
    success: bool
    node_results: dict[str, str]
    failed_nodes: list[str]


class NamespaceScanOut(BaseModel):
    prefix: str
    cluster_id: int
    keys: list[str]
    total_found: int
