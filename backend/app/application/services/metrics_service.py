"""
MetricsService — query Prometheus for cluster-level time-series metrics.

Because the redis_exporter runs in single-target mode (no per-node `addr` label),
all metrics reflect the cluster aggregate exposed by the exporter instance.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.infrastructure.prometheus.client import PrometheusClient


@dataclass
class MetricSeries:
    name: str
    points: list[tuple[float, float]]  # (unix_ts, value)


@dataclass
class ClusterMetricsSnapshot:
    job: str
    range_seconds: int
    # Instant values
    connected_clients: float | None = None
    memory_used_bytes: float | None = None
    memory_max_bytes: float | None = None
    keyspace_hits_total: float | None = None
    keyspace_misses_total: float | None = None
    # Time series
    series: list[MetricSeries] = field(default_factory=list)


def _first_value(results: list[dict[str, Any]]) -> float | None:
    """Extract the scalar from the first instant-query result."""
    if not results:
        return None
    try:
        return float(results[0]["value"][1])
    except (KeyError, IndexError, ValueError):
        return None


def _to_series(results: list[dict[str, Any]], name: str) -> MetricSeries:
    """Flatten range-query results into a single MetricSeries (sum across series)."""
    if not results:
        return MetricSeries(name=name, points=[])
    # Aggregate all series by timestamp
    buckets: dict[float, float] = {}
    for series in results:
        for ts_str, val_str in series.get("values", []):
            ts = float(ts_str)
            try:
                v = float(val_str)
            except ValueError:
                continue
            buckets[ts] = buckets.get(ts, 0.0) + v
    points = sorted(buckets.items())
    return MetricSeries(name=name, points=points)


class MetricsService:
    def __init__(self, client: PrometheusClient | None = None) -> None:
        self._client = client or PrometheusClient()
        self._job = settings.prometheus_default_job

    async def get_metrics(self, range_seconds: int = 3600) -> ClusterMetricsSnapshot:
        """
        Return a snapshot of current + time-series metrics for the cluster.
        `range_seconds` controls how far back the time-series queries reach.
        """
        job = self._job
        selector = f'{{job="{job}"}}'
        now = time.time()
        start = now - range_seconds
        step = max(15, range_seconds // 120)  # ~120 data points

        # Instant queries (current values)
        clients_res, mem_used_res, mem_max_res, hits_res, misses_res = await _gather(
            self._client.instant(f"redis_connected_clients{selector}"),
            self._client.instant(f"redis_memory_used_bytes{selector}"),
            self._client.instant(f"redis_memory_max_bytes{selector}"),
            self._client.instant(f"redis_keyspace_hits_total{selector}"),
            self._client.instant(f"redis_keyspace_misses_total{selector}"),
        )

        # Range queries (time series)
        ops_res, mem_ts_res, clients_ts_res, hit_rate_res = await _gather(
            self._client.range_query(
                f"rate(redis_commands_processed_total{selector}[1m])",
                start=start, end=now, step=step,
            ),
            self._client.range_query(
                f"redis_memory_used_bytes{selector}",
                start=start, end=now, step=step,
            ),
            self._client.range_query(
                f"redis_connected_clients{selector}",
                start=start, end=now, step=step,
            ),
            self._client.range_query(
                f"rate(redis_keyspace_hits_total{selector}[1m]) / "
                f"(rate(redis_keyspace_hits_total{selector}[1m]) + "
                f"rate(redis_keyspace_misses_total{selector}[1m]) + 0.001)",
                start=start, end=now, step=step,
            ),
        )

        return ClusterMetricsSnapshot(
            job=job,
            range_seconds=range_seconds,
            connected_clients=_first_value(clients_res),
            memory_used_bytes=_first_value(mem_used_res),
            memory_max_bytes=_first_value(mem_max_res),
            keyspace_hits_total=_first_value(hits_res),
            keyspace_misses_total=_first_value(misses_res),
            series=[
                _to_series(ops_res, "ops_per_sec"),
                _to_series(mem_ts_res, "memory_used_bytes"),
                _to_series(clients_ts_res, "connected_clients"),
                _to_series(hit_rate_res, "hit_rate"),
            ],
        )


async def _gather(*coros):  # type: ignore[no-untyped-def]
    """Run coroutines concurrently; return [] for any that raise."""
    import asyncio

    results = await asyncio.gather(*coros, return_exceptions=True)
    return [r if not isinstance(r, BaseException) else [] for r in results]
