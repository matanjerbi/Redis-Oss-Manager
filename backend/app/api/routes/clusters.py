"""
/api/clusters  — CRUD + live health endpoint.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.schemas.cluster import (
    AclOperationOut,
    AclUpsertBody,
    ClusterConfigOut,
    ClusterNodeOut,
    ClusterTopologyOut,
    ConfigSetBody,
    ConfigSetOut,
    CreateClusterBody,
    NamespaceScanBody,
    NamespaceScanOut,
    NodeMemoryOut,
    NodeMetricsOut,
    SlotRangeOut,
    UpdateSeedsBody,
)
from app.application.services.acl_service import AclService, AclUpsertRequest
from app.application.services.cluster_service import ClusterService, CreateClusterRequest
from app.application.services.config_service import ConfigService
from app.application.services.slowlog_service import SlowlogService
from app.application.services.failover_service import FailoverService
from app.application.services.metrics_service import MetricsService
from app.domain.exceptions import (
    ClusterConnectionError,
    ClusterNotFoundError,
    RedisManagerError,
)
from app.domain.models import ClusterNode, ClusterTopology
from app.api.dependencies import get_acl_service, get_cluster_service, get_config_service, get_slowlog_service, get_failover_service, get_metrics_service

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


# ------------------------------------------------------------------
# Helpers — domain → schema
# ------------------------------------------------------------------

def _node_to_out(node: ClusterNode) -> ClusterNodeOut:
    metrics_out = None
    if node.metrics:
        m = node.metrics
        metrics_out = NodeMetricsOut(
            keys_count=m.keys_count,
            connected_clients=m.connected_clients,
            commands_per_sec=m.commands_per_sec,
            used_cpu_sys=m.used_cpu_sys,
            used_cpu_user=m.used_cpu_user,
            memory=NodeMemoryOut(
                used_bytes=m.memory.used_bytes,
                peak_bytes=m.memory.peak_bytes,
                rss_bytes=m.memory.rss_bytes,
                max_bytes=m.memory.max_bytes,
                used_mb=m.memory.used_mb,
                utilization_pct=m.memory.utilization_pct,
            ),
            uptime_seconds=m.uptime_seconds,
            replication_offset=m.replication_offset,
            aof_enabled=m.aof_enabled,
            rdb_last_save=m.rdb_last_save,
        )
    return ClusterNodeOut(
        node_id=node.node_id,
        host=node.host,
        port=node.port,
        address=node.address,
        role=node.role.value,
        status=node.status.value,
        flags=node.flags,
        slots=[SlotRangeOut(start=s.start, end=s.end, count=s.count()) for s in node.slots],
        slot_count=node.slot_count,
        master_id=node.master_id,
        replication_offset=node.replication_offset,
        is_healthy=node.is_healthy,
        metrics=metrics_out,
    )


def _topology_to_out(t: ClusterTopology) -> ClusterTopologyOut:
    return ClusterTopologyOut(
        cluster_id=t.cluster_id,
        cluster_name=t.cluster_name,
        status=t.status.value,
        polled_at=t.polled_at,
        cluster_enabled=t.cluster_enabled,
        total_slots_assigned=t.total_slots_assigned,
        coverage_pct=t.coverage_pct,
        total_keys=t.total_keys,
        nodes=[_node_to_out(n) for n in t.nodes],
        master_count=len(t.masters),
        replica_count=len(t.replicas),
        healthy_node_count=len(t.healthy_nodes),
    )


# ------------------------------------------------------------------
# Cluster CRUD
# ------------------------------------------------------------------

@router.post("/", response_model=ClusterConfigOut, status_code=status.HTTP_201_CREATED)
async def create_cluster(
    body: CreateClusterBody,
    svc: ClusterService = Depends(get_cluster_service),
):
    try:
        config = await svc.register_cluster(
            CreateClusterRequest(
                name=body.name,
                seed_nodes=body.seed_nodes,
                tenant_id=body.tenant_id,
                description=body.description,
                password=body.password,
                tls_enabled=body.tls_enabled,
                socket_timeout=body.socket_timeout,
                socket_connect_timeout=body.socket_connect_timeout,
            )
        )
    except ClusterConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ClusterConfigOut(**config.__dict__)


@router.get("/", response_model=list[ClusterConfigOut])
async def list_clusters(
    tenant_id: Optional[str] = Query(default=None),
    svc: ClusterService = Depends(get_cluster_service),
):
    configs = await svc.list_clusters(tenant_id=tenant_id)
    return [ClusterConfigOut(**c.__dict__) for c in configs]


@router.get("/{cluster_id}", response_model=ClusterConfigOut)
async def get_cluster(
    cluster_id: int,
    svc: ClusterService = Depends(get_cluster_service),
):
    try:
        config = await svc.get_cluster(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ClusterConfigOut(**config.__dict__)


@router.patch("/{cluster_id}/seeds", response_model=ClusterConfigOut)
async def update_seeds(
    cluster_id: int,
    body: UpdateSeedsBody,
    svc: ClusterService = Depends(get_cluster_service),
):
    """
    Replace the seed node list for an existing cluster and force a reconnect.
    Use this to recover when the originally registered seed node is no longer
    reachable (e.g. after a failover that promoted a different node to master).
    """
    try:
        config = await svc.update_seeds(cluster_id, body.seed_nodes)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ClusterConfigOut(**config.__dict__)


@router.delete("/{cluster_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cluster(
    cluster_id: int,
    svc: ClusterService = Depends(get_cluster_service),
):
    try:
        await svc.remove_cluster(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------------------------------------------------------
# Health / topology
# ------------------------------------------------------------------

@router.get("/{cluster_id}/health", response_model=ClusterTopologyOut)
async def get_cluster_health(
    cluster_id: int,
    svc: ClusterService = Depends(get_cluster_service),
):
    """
    Return a live topology snapshot: roles, slots, per-node metrics.
    Aggregates CLUSTER NODES + INFO all across every node.
    """
    try:
        topology = await svc.get_health(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ClusterConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RedisManagerError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _topology_to_out(topology)


# ------------------------------------------------------------------
# ACL management
# ------------------------------------------------------------------

@router.post("/{cluster_id}/acl/users", response_model=AclOperationOut)
async def upsert_acl_user(
    cluster_id: int,
    body: AclUpsertBody,
    svc: AclService = Depends(get_acl_service),
):
    try:
        result = await svc.upsert_user(
            cluster_id,
            AclUpsertRequest(
                username=body.username,
                enabled=body.enabled,
                plaintext_password=body.plaintext_password,
                commands=body.commands,
                key_patterns=body.key_patterns,
                channel_patterns=body.channel_patterns,
                nopass=body.nopass,
            ),
        )
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AclOperationOut(
        username=result.username,
        cluster_id=result.cluster_id,
        success=result.success,
        node_results=result.node_results,
        failed_nodes=result.failed_nodes,
    )


@router.delete("/{cluster_id}/acl/users/{username}", response_model=AclOperationOut)
async def delete_acl_user(
    cluster_id: int,
    username: str,
    svc: AclService = Depends(get_acl_service),
):
    try:
        result = await svc.delete_user(cluster_id, username)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AclOperationOut(
        username=result.username,
        cluster_id=result.cluster_id,
        success=result.success,
        node_results=result.node_results,
        failed_nodes=result.failed_nodes,
    )


@router.get("/{cluster_id}/acl/users", response_model=list[str])
async def list_acl_users(
    cluster_id: int,
    svc: AclService = Depends(get_acl_service),
):
    try:
        return await svc.list_users(cluster_id)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------------------------------------------------------
# Dynamic config
# ------------------------------------------------------------------

@router.post("/{cluster_id}/config", response_model=ConfigSetOut)
async def set_config(
    cluster_id: int,
    body: ConfigSetBody,
    svc: ConfigService = Depends(get_config_service),
):
    try:
        result = await svc.set_config(cluster_id, body.parameter, body.value)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConfigSetOut(
        parameter=result.parameter,
        value=result.value,
        cluster_id=result.cluster_id,
        success=result.success,
        node_results=result.node_results,
        failed_nodes=result.failed_nodes,
    )


@router.get("/{cluster_id}/config", response_model=dict)
async def get_config(
    cluster_id: int,
    pattern: str = Query(default="*"),
    svc: ConfigService = Depends(get_config_service),
):
    try:
        return await svc.get_config(cluster_id, pattern)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------------------------------------------------------
# Slow log
# ------------------------------------------------------------------

@router.get("/{cluster_id}/slowlog", response_model=dict)
async def get_slowlog(
    cluster_id: int,
    count: int = Query(default=128, ge=1, le=1000),
    svc: SlowlogService = Depends(get_slowlog_service),
):
    """
    Return SLOWLOG GET <count> from every node as {address: [entry, ...]}.
    Each entry: {id, start_time, duration, command, client_addr, client_name}
    """
    try:
        return await svc.get_slowlog(cluster_id, count=count)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------------------------------------------------------
# Failover
# ------------------------------------------------------------------

@router.post("/{cluster_id}/nodes/{node_address}/failover")
async def trigger_failover(
    cluster_id: int,
    node_address: str,
    force: bool = Query(default=False),
    svc: FailoverService = Depends(get_failover_service),
):
    """
    Send CLUSTER FAILOVER [FORCE] to a replica node.

    node_address must be in "host:port" format (URL-encoded colon is fine).
    The replica will negotiate with its master and take over as the new primary.
    Use force=true only when the current master is unreachable.
    """
    try:
        host, port_str = node_address.rsplit(":", 1)
        port = int(port_str)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid node address: {node_address}")

    try:
        result = await svc.failover(cluster_id, host=host, port=port, force=force)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not result.success:
        raise HTTPException(status_code=502, detail=result.message)

    return {"success": True, "node_address": result.node_address, "message": result.message}


# ------------------------------------------------------------------
# Prometheus metrics
# ------------------------------------------------------------------

@router.get("/{cluster_id}/metrics")
async def get_metrics(
    cluster_id: int,
    range: int = Query(default=3600, ge=300, le=86400, description="Range in seconds"),
    svc: MetricsService = Depends(get_metrics_service),
):
    """
    Return Prometheus time-series metrics for the cluster.
    `range` controls how many seconds of history to fetch (default: 1h).
    Response includes both instant snapshot values and series data.
    """
    snapshot = await svc.get_metrics(range_seconds=range)
    return {
        "job": snapshot.job,
        "range_seconds": snapshot.range_seconds,
        "current": {
            "connected_clients": snapshot.connected_clients,
            "memory_used_bytes": snapshot.memory_used_bytes,
            "memory_max_bytes": snapshot.memory_max_bytes,
            "keyspace_hits_total": snapshot.keyspace_hits_total,
            "keyspace_misses_total": snapshot.keyspace_misses_total,
        },
        "series": [
            {
                "name": s.name,
                "points": [{"ts": ts, "value": v} for ts, v in s.points],
            }
            for s in snapshot.series
        ],
    }


# ------------------------------------------------------------------
# Namespace / key scanning
# ------------------------------------------------------------------

@router.post("/{cluster_id}/namespaces/scan", response_model=NamespaceScanOut)
async def scan_namespace(
    cluster_id: int,
    body: NamespaceScanBody,
    svc: ClusterService = Depends(get_cluster_service),
):
    """
    Scan keys across all master nodes matching the given prefix.
    Returns at most max_keys results.
    """
    try:
        keys = await svc.scan_namespace(cluster_id, prefix=body.prefix, max_keys=body.max_keys)
    except ClusterNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RedisManagerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return NamespaceScanOut(
        prefix=body.prefix,
        cluster_id=cluster_id,
        keys=keys,
        total_found=len(keys),
    )
