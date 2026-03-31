"use client";
import { useMemo } from "react";
import {
  Server,
  CheckCircle2,
  Database,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ClusterSection } from "@/components/dashboard/ClusterSection";
import { OpsChart } from "@/components/dashboard/OpsChart";
import { mockClusters, getOverviewStats, generateMetricHistory } from "@/lib/mock-data";
import { formatKeys, formatBytes, formatNumber } from "@/lib/utils";

export default function OverviewPage() {
  const stats = getOverviewStats(mockClusters);
  const degradedClusters = mockClusters.filter((c) => c.status !== "ok");
  // useMemo keeps data stable across re-renders without triggering hydration mismatch
  const opsData = useMemo(() => generateMetricHistory(1800, 24), []);
  const memData = useMemo(() => generateMetricHistory(850, 24), []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Real-time view across all registered Redis clusters
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>
            Last polled{" "}
            <span className="font-medium text-gray-700">just now</span>
          </span>
        </div>
      </div>

      {/* Alert banner for degraded clusters */}
      {degradedClusters.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-sm">
            <span className="font-semibold text-amber-800">
              {degradedClusters.length} cluster{degradedClusters.length > 1 ? "s" : ""} need
              attention:{" "}
            </span>
            <span className="text-amber-700">
              {degradedClusters.map((c) => c.cluster_name).join(", ")}
            </span>
          </div>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          title="Total Clusters"
          value={stats.totalClusters.toString()}
          subValue={`${stats.healthyClusters} healthy`}
          icon={Server}
          accent="red"
          trend="neutral"
          trendLabel="Registered clusters"
        />
        <MetricCard
          title="Healthy Nodes"
          value={`${stats.healthyNodes}`}
          subValue={`of ${stats.totalNodes} total`}
          icon={CheckCircle2}
          accent="green"
          trend={stats.healthyNodes === stats.totalNodes ? "up" : "down"}
          trendLabel={
            stats.healthyNodes === stats.totalNodes
              ? "All nodes healthy"
              : `${stats.totalNodes - stats.healthyNodes} node(s) degraded`
          }
        />
        <MetricCard
          title="Total Memory"
          value={formatBytes(stats.totalMemoryMb)}
          subValue="across all nodes"
          icon={HardDrive}
          accent="red"
          trend="up"
          trendLabel="+2.4% from last hour"
        />
        <MetricCard
          title="Total Keys"
          value={formatKeys(stats.totalKeys)}
          subValue={formatNumber(stats.totalKeys) + " keys"}
          icon={Database}
          accent="blue"
          trend="up"
          trendLabel="+1.2% from last poll"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OpsChart
          data={opsData}
          title="Total Operations / sec"
          color="#D2232A"
          unit="ops/s"
        />
        <OpsChart
          data={memData}
          title="Memory Used (MB)"
          color="#3B82F6"
          unit="MB"
        />
      </div>

      {/* Cluster Map */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Cluster Map
          </h2>
          <div className="flex items-center gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[#D2232A]" />
              Master
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
              Replica
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
              Offline
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {mockClusters.map((cluster) => (
            <ClusterSection key={cluster.cluster_id} cluster={cluster} />
          ))}
        </div>
      </div>
    </div>
  );
}
