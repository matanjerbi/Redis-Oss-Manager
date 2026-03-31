"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, HardDrive, PlusCircle, Server } from "lucide-react";
import { NodeCard } from "@/components/dashboard/NodeCard";
import { AddNodeModal } from "@/components/cluster-detail/AddNodeModal";
import { formatKeys, formatBytes, formatNumber } from "@/lib/utils";
import type { ClusterTopology } from "@/lib/types";
import { API_BASE } from "@/lib/api";



interface Props {
  topology: ClusterTopology;
  clusterId: string;
}

export function TopologyTab({ topology, clusterId }: Props) {
  const [showAddNode, setShowAddNode] = useState(false);

  const handleFailover = async (nodeAddress: string, force: boolean) => {
    const encoded = encodeURIComponent(nodeAddress);
    const res = await fetch(
      `${API_BASE}/api/clusters/${clusterId}/nodes/${encoded}/failover?force=${force}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Server error ${res.status}`);
    }
  };

  const handleForget = async (nodeId: string) => {
    const res = await fetch(
      `${API_BASE}/api/clusters/${clusterId}/nodes/${encodeURIComponent(nodeId)}/forget`,
      { method: "POST" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Server error ${res.status}`);
    }
  };

  const handleRejoin = async (nodeAddress: string, masterId?: string) => {
    const encoded = encodeURIComponent(nodeAddress);
    const url = `${API_BASE}/api/clusters/${clusterId}/nodes/${encoded}/rejoin${masterId ? `?master_id=${masterId}` : ""}`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Server error ${res.status}`);
    }
  };

  const masters = topology.nodes.filter((n) => n.role === "master");
  const replicas = topology.nodes.filter((n) => n.role === "slave");
  const masterMap = new Map(masters.map((n) => [n.node_id, n.address]));
  const totalMemMb = topology.nodes.reduce((s, n) => s + (n.metrics?.memory.used_mb ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {showAddNode && (
        <AddNodeModal
          clusterId={clusterId}
          masters={masters}
          onClose={() => setShowAddNode(false)}
          onSuccess={() => { setShowAddNode(false); window.location.reload(); }}
        />
      )}
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Healthy Nodes",
            value: `${topology.healthy_node_count}/${topology.nodes.length}`,
            sub: `${topology.master_count}M · ${topology.replica_count}R`,
            icon: Server,
            color: "text-[#D2232A]",
            bg: "bg-red-50",
          },
          {
            label: "Total Keys",
            value: formatKeys(topology.total_keys),
            sub: formatNumber(topology.total_keys),
            icon: Database,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            label: "Slot Coverage",
            value: `${topology.coverage_pct}%`,
            sub: `${topology.total_slots_assigned.toLocaleString()} / 16,384`,
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "Memory Used",
            value: formatBytes(totalMemMb),
            sub: "across all nodes",
            icon: HardDrive,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
                <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Masters */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Masters</h3>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-[#D2232A]">
            {masters.length}
          </span>
          <div className="ml-auto">
            <button
              onClick={() => setShowAddNode(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-[#D2232A] hover:text-[#D2232A] transition"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add Node
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {masters.map((node) => (
            <NodeCard
              key={node.node_id}
              node={node}
              onForget={handleForget}
              onRejoin={handleRejoin}
            />
          ))}
        </div>
      </div>

      {/* Replicas */}
      {replicas.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">Replicas</h3>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              {replicas.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {replicas.map((node) => (
              <NodeCard
                key={node.node_id}
                node={node}
                masterAddress={node.master_id ? masterMap.get(node.master_id) : undefined}
                onFailover={handleFailover}
                onForget={handleForget}
                onRejoin={handleRejoin}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          No replicas configured — this cluster has no high availability
        </div>
      )}
    </div>
  );
}
