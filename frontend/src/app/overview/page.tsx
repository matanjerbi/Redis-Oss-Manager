"use client";
import { useState, useEffect } from "react";
import { Server, CheckCircle2, Database, HardDrive, AlertTriangle, RefreshCw } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ClusterSection } from "@/components/dashboard/ClusterSection";
import { OpsChart } from "@/components/dashboard/OpsChart";
import { formatKeys, formatBytes, formatNumber } from "@/lib/utils";
import { API_BASE } from "@/lib/api";
import type { ClusterTopology } from "@/lib/types";
import type { MetricPoint } from "@/lib/types";

interface MetricSeries { name: string; points: { ts: number; value: number }[] }
interface MetricsResponse { series: MetricSeries[] }

function toChartPoints(series: MetricSeries | undefined): MetricPoint[] {
  if (!series) return [];
  return series.points.map(({ ts, value }) => ({
    time: new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: Math.max(0, value),
  }));
}

export default function OverviewPage() {
  const [clusters, setClusters] = useState<ClusterTopology[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPolled, setLastPolled] = useState<Date | null>(null);
  const [opsData, setOpsData] = useState<MetricPoint[]>([]);
  const [memData, setMemData] = useState<MetricPoint[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    setClusters([]);
    try {
      const listRes = await fetch(`${API_BASE}/api/clusters/`);
      if (!listRes.ok) return;
      const configs: { id: number }[] = await listRes.json();

      // Fetch metrics for the first cluster in parallel with health checks
      if (configs[0]) {
        fetch(`${API_BASE}/api/clusters/${configs[0].id}/metrics?range=3600`)
          .then((r) => (r.ok ? (r.json() as Promise<MetricsResponse>) : null))
          .then((firstMetrics) => {
            if (!firstMetrics) return;
            const opsSeries = firstMetrics.series.find((s) => s.name === "ops_per_sec");
            const memSeries = firstMetrics.series.find((s) => s.name === "memory_used_bytes");
            setOpsData(toChartPoints(opsSeries));
            setMemData(
              toChartPoints(memSeries).map((p) => ({ ...p, value: p.value / 1_048_576 }))
            );
          })
          .catch(() => null);
      }

      // Fetch each cluster's health independently — show each as it arrives
      // so a slow/unreachable cluster never blocks the display of healthy ones.
      await Promise.allSettled(
        configs.map((c) =>
          fetch(`${API_BASE}/api/clusters/${c.id}/health`)
            .then((r) => (r.ok ? (r.json() as Promise<ClusterTopology>) : null))
            .then((topology) => {
              if (!topology) return;
              setClusters((prev) => {
                const idx = prev.findIndex((p) => p.cluster_id === topology.cluster_id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = topology;
                  return updated;
                }
                return [...prev, topology];
              });
            })
            .catch(() => null)
        )
      );

      setLastPolled(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, []);

  const totalNodes = clusters.reduce((s, c) => s + c.nodes.length, 0);
  const healthyNodes = clusters.reduce((s, c) => s + c.healthy_node_count, 0);
  const totalKeys = clusters.reduce((s, c) => s + c.total_keys, 0);
  const totalMemMb = clusters.reduce(
    (s, c) => s + c.nodes.reduce((ns, n) => ns + (n.metrics?.memory.used_mb ?? 0), 0),
    0
  );
  const degraded = clusters.filter((c) => c.status !== "ok");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Real-time view across all registered Redis clusters
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {lastPolled ? `Updated ${lastPolled.toLocaleTimeString()}` : "Loading…"}
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#D2232A]" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {degraded.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-sm">
            <span className="font-semibold text-amber-800">
              {degraded.length} cluster{degraded.length > 1 ? "s" : ""} need attention:{" "}
            </span>
            <span className="text-amber-700">{degraded.map((c) => c.cluster_name).join(", ")}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Total Clusters"
          value={clusters.length.toString()}
          subValue={`${clusters.filter((c) => c.status === "ok").length} healthy`}
          icon={Server}
          accent="red"
          trend="neutral"
          trendLabel="Registered clusters"
        />
        <MetricCard
          title="Healthy Nodes"
          value={healthyNodes.toString()}
          subValue={`of ${totalNodes} total`}
          icon={CheckCircle2}
          accent="green"
          trend={healthyNodes === totalNodes ? "up" : "down"}
          trendLabel={healthyNodes === totalNodes ? "All nodes healthy" : `${totalNodes - healthyNodes} degraded`}
        />
        <MetricCard
          title="Total Memory"
          value={formatBytes(totalMemMb)}
          subValue="across all nodes"
          icon={HardDrive}
          accent="red"
          trend="neutral"
          trendLabel="Live from INFO"
        />
        <MetricCard
          title="Total Keys"
          value={formatKeys(totalKeys)}
          subValue={formatNumber(totalKeys) + " keys"}
          icon={Database}
          accent="blue"
          trend="neutral"
          trendLabel="Live from INFO"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OpsChart data={opsData} title="Total Operations / sec" color="#D2232A" unit="ops/s" />
        <OpsChart data={memData} title="Memory Used (MB)" color="#3B82F6" unit="MB" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Cluster Map</h2>
          <div className="flex items-center gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#D2232A]" /> Master
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Replica
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Offline
            </span>
          </div>
        </div>
        {clusters.length === 0 && !loading ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            No clusters registered yet
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {clusters.map((cluster) => (
              <ClusterSection key={cluster.cluster_id} cluster={cluster} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
