"use client";
import { useState } from "react";
import { X, Loader2, Server, GitBranch, AlertTriangle, CheckCircle2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import type { ClusterNode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AddNodeModalProps {
  clusterId: string;
  masters: ClusterNode[];
  onClose: () => void;
  onSuccess: () => void;
}

export function AddNodeModal({ clusterId, masters, onClose, onSuccess }: AddNodeModalProps) {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("");
  const [role, setRole] = useState<"replica" | "master">("replica");
  const [masterId, setMasterId] = useState(masters[0]?.node_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const estimatedSlots = Math.floor(16384 / (masters.length + 1));

  const handleSubmit = async () => {
    if (!host || !port) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { host, port: Number(port), role };
      if (role === "replica") body.master_id = masterId;
      const res = await fetch(`${API_BASE}/api/clusters/${clusterId}/nodes/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Server error ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add node");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#D2232A]" />
            <h2 className="text-sm font-semibold text-gray-900">Add Node to Cluster</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          {/* Role toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Role</label>
            <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(["replica", "master"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition",
                    role === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <GitBranch className="h-3 w-3" />
                  {r === "replica" ? "Replica" : "New Master"}
                </button>
              ))}
            </div>
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Host</label>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#D2232A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="7006"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#D2232A] focus:outline-none"
              />
            </div>
          </div>

          {/* Replica: master selector */}
          {role === "replica" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Replicate from master</label>
              <select
                value={masterId}
                onChange={(e) => setMasterId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#D2232A] focus:outline-none"
              >
                {masters.map((m) => (
                  <option key={m.node_id} value={m.node_id}>
                    {m.address} ({m.slot_count} slots)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New master: slot info */}
          {role === "master" && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              <p className="font-medium">Automatic resharding</p>
              <p className="mt-0.5 text-blue-600">
                Slots will be redistributed evenly: ~{estimatedSlots} slots per master
                ({masters.length + 1} masters total). This may take a moment.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Node added successfully!
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !host || !port || (role === "replica" && !masterId)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#D2232A] py-2 text-sm font-semibold text-white hover:bg-[#b81e22] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
              {loading ? (role === "master" ? "Resharding…" : "Joining…") : "Add Node"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
