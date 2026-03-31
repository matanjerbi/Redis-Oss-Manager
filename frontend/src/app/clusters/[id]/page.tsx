"use client";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";
import { ClusterStatusBadge } from "@/components/ui/StatusBadge";
import { TopologyTab } from "@/components/cluster-detail/TopologyTab";
import { AclTab } from "@/components/cluster-detail/AclTab";
import { ConfigTab } from "@/components/cluster-detail/ConfigTab";
import { SlowLogTab } from "@/components/cluster-detail/SlowLogTab";
import { MetricsTab } from "@/components/cluster-detail/MetricsTab";
import { cn } from "@/lib/utils";
import type { ClusterTopology } from "@/lib/types";
import { API_BASE } from "@/lib/api";



const TABS = [
  { id: "topology", label: "Topology" },
  { id: "acl", label: "ACL Users" },
  { id: "config", label: "Configuration" },
  { id: "slowlog", label: "Slow Log" },
  { id: "metrics", label: "Metrics" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ClusterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<TabId>("topology");
  const [topology, setTopology] = useState<ClusterTopology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPolled, setLastPolled] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/clusters/${id}/health`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: ClusterTopology = await res.json();
      setTopology(data);
      setLastPolled(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch cluster health");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/clusters"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {topology?.cluster_name ?? `Cluster ${id}`}
              </h1>
              {topology && <ClusterStatusBadge status={topology.status} />}
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {lastPolled
                ? `Last updated ${lastPolled.toLocaleTimeString()}`
                : "Loading…"}
            </p>
          </div>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-[#D2232A]")} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !topology && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {topology && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                  activeTab === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "topology" && <TopologyTab topology={topology} clusterId={id} />}
          {activeTab === "acl" && <AclTab clusterId={id} />}
          {activeTab === "config" && <ConfigTab clusterId={id} />}
          {activeTab === "slowlog" && <SlowLogTab clusterId={id} />}
          {activeTab === "metrics" && <MetricsTab clusterId={id} />}
        </>
      )}
    </div>
  );
}
