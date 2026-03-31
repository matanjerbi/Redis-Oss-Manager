"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Server, ChevronRight, RefreshCw, AlertTriangle } from "lucide-react";
import { ClusterStatusBadge } from "@/components/ui/StatusBadge";
import { RegisterClusterModal, type RegisterClusterForm } from "@/components/clusters/RegisterClusterModal";
import { formatKeys, formatBytes } from "@/lib/utils";
import type { ClusterConfig, ClusterTopology } from "@/lib/types";

const API = "http://localhost:8000";

interface ClusterRow {
  config: ClusterConfig;
  topology: ClusterTopology | null;
}

export default function ClustersPage() {
  const [rows, setRows] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/clusters/`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const configs: ClusterConfig[] = await res.json();

      // Fetch health for each cluster in parallel
      const topoResults = await Promise.allSettled(
        configs.map((c) =>
          fetch(`${API}/api/clusters/${c.id}/health`).then((r) =>
            r.ok ? r.json() : null
          )
        )
      );

      setRows(
        configs.map((config, i) => ({
          config,
          topology:
            topoResults[i].status === "fulfilled"
              ? (topoResults[i] as PromiseFulfilledResult<ClusterTopology | null>).value
              : null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clusters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const handleRegister = async (form: RegisterClusterForm) => {
    const res = await fetch(`${API}/api/clusters/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        tenant_id: form.tenant_id,
        seed_nodes: form.seed_nodes,
        password: form.password || null,
        tls_enabled: form.tls_enabled,
        socket_timeout: form.socket_timeout,
        socket_connect_timeout: form.socket_connect_timeout,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Server error ${res.status}`);
    }

    setShowModal(false);
    await fetchClusters();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clusters</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? "Loading…" : `${rows.length} registered cluster${rows.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchClusters}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-[#D2232A]" : ""}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b51e24] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Register Cluster
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={fetchClusters} className="ml-auto font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <Server className="h-6 w-6 text-[#D2232A]" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No clusters registered</h3>
          <p className="mt-1 text-xs text-gray-500">
            Click "Register Cluster" to connect your first Redis OSS Cluster
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b51e24]"
          >
            <Plus className="h-4 w-4" />
            Register Cluster
          </button>
        </div>
      )}

      {/* Cluster list */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map(({ config, topology }) => {
            const totalMemMb = topology?.nodes.reduce(
              (s, n) => s + (n.metrics?.memory.used_mb ?? 0),
              0
            ) ?? 0;
            const status = topology?.status ?? "unknown";

            return (
              <Link
                key={config.id}
                href={`/clusters/${config.id}`}
                className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:border-[#D2232A]/30 hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                    <Server className="h-5 w-5 text-[#D2232A]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{config.name}</h3>
                      <ClusterStatusBadge status={status} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {config.description || "—"} · Tenant:{" "}
                      <span className="font-medium">{config.tenant_id}</span>
                      {config.tls_enabled && (
                        <span className="ml-2 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">
                          TLS
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8 text-right">
                  {topology ? (
                    <>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Nodes</p>
                        <p className="text-sm font-bold text-gray-800">
                          {topology.healthy_node_count}/{topology.nodes.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Keys</p>
                        <p className="text-sm font-bold text-gray-800">
                          {formatKeys(topology.total_keys)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Memory</p>
                        <p className="text-sm font-bold text-gray-800">
                          {formatBytes(totalMemMb)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Coverage</p>
                        <p className="text-sm font-bold text-gray-800">{topology.coverage_pct}%</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-400 italic">
                      {loading ? "Fetching health…" : "Health unavailable"}
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-[#D2232A]" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <RegisterClusterModal
          onClose={() => setShowModal(false)}
          onSave={handleRegister}
        />
      )}
    </div>
  );
}
