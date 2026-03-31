"use client";
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatKeys, formatBytes } from "@/lib/utils";
import { ClusterStatusBadge } from "@/components/ui/StatusBadge";
import { NodeCard } from "./NodeCard";
import type { ClusterTopology } from "@/lib/types";

interface ClusterSectionProps {
  cluster: ClusterTopology;
}

export function ClusterSection({ cluster }: ClusterSectionProps) {
  const [expanded, setExpanded] = useState(true);

  // Build master → replicas map for display context
  const masterMap = new Map<string, string>();
  cluster.nodes.forEach((n) => {
    if (n.role === "master") masterMap.set(n.node_id, n.address);
  });

  const masters = cluster.nodes.filter((n) => n.role === "master");
  const replicas = cluster.nodes.filter((n) => n.role === "slave");

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Cluster header */}
      <div
        className="flex cursor-pointer items-center justify-between rounded-t-xl border-b border-gray-100 px-5 py-4 hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <button className="flex h-5 w-5 items-center justify-center text-gray-400">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{cluster.cluster_name}</h3>
              <ClusterStatusBadge status={cluster.status} />
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {cluster.master_count} masters · {cluster.replica_count} replicas ·{" "}
              {cluster.healthy_node_count}/{cluster.nodes.length} healthy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Total Keys</p>
            <p className="text-sm font-bold text-gray-800">{formatKeys(cluster.total_keys)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Coverage</p>
            <p
              className={cn(
                "text-sm font-bold",
                cluster.coverage_pct === 100 ? "text-emerald-600" : "text-amber-600"
              )}
            >
              {cluster.coverage_pct}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Slots</p>
            <p className="text-sm font-bold text-gray-800">
              {cluster.total_slots_assigned.toLocaleString()} / 16,384
            </p>
          </div>

          <Link
            href={`/clusters/${cluster.cluster_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-[#D2232A] hover:text-[#D2232A]"
          >
            View
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Node grid */}
      {expanded && (
        <div className="p-5">
          {/* Masters */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Masters ({masters.length})
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
              {masters.map((node) => (
                <NodeCard key={node.node_id} node={node} />
              ))}
            </div>
          </div>

          {/* Replicas */}
          {replicas.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Replicas ({replicas.length})
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                {replicas.map((node) => (
                  <NodeCard
                    key={node.node_id}
                    node={node}
                    masterAddress={
                      node.master_id ? masterMap.get(node.master_id) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
