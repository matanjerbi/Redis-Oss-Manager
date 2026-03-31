"""Async HTTP client for the Prometheus HTTP API."""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings


class PrometheusClient:
    """Thin async wrapper around Prometheus /api/v1/query and /api/v1/query_range."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.prometheus_url).rstrip("/")

    async def instant(self, query: str) -> list[dict[str, Any]]:
        """
        Run an instant query.  Returns the `result` list from the
        `data` envelope, i.e. a list of {metric: {...}, value: [ts, val]}.
        Returns [] on any error so callers never have to guard against None.
        """
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self._base_url}/api/v1/query",
                params={"query": query},
            )
            resp.raise_for_status()
            body = resp.json()
        if body.get("status") != "success":
            return []
        return body["data"].get("result", [])

    async def range_query(
        self,
        query: str,
        start: float | None = None,
        end: float | None = None,
        step: int = 60,
    ) -> list[dict[str, Any]]:
        """
        Run a range query.  Returns the `result` list from the `data` envelope,
        i.e. a list of {metric: {...}, values: [[ts, val], ...]}.
        `start` and `end` are Unix timestamps; defaults to (now-1h, now).
        """
        now = time.time()
        params: dict[str, Any] = {
            "query": query,
            "start": start or now - 3600,
            "end": end or now,
            "step": step,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self._base_url}/api/v1/query_range",
                params=params,
            )
            resp.raise_for_status()
            body = resp.json()
        if body.get("status") != "success":
            return []
        return body["data"].get("result", [])
