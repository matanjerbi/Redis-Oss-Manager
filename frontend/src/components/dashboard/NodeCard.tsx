"use client";
import { useState } from "react";
import {
  Cpu,
  Database,
  Users,
  Activity,
  Clock,
  ArrowUpDown,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatKeys, formatUptime, formatNumber } from "@/lib/utils";
import { StatusDot, RoleBadge } from "@/components/ui/StatusBadge";
import { MemoryBar } from "@/components/ui/MemoryBar";
import type { ClusterNode } from "@/lib/types";

interface NodeCardProps {
  node: ClusterNode;
  masterAddress?: string;
  onFailover?: (nodeAddress: string, force: boolean) => Promise<void>;
}

export function NodeCard({ node, masterAddress, onFailover }: NodeCardProps) {
  const m = node.metrics;
  const isReplica = node.role === "slave";
  const [failState, setFailState] = useState<"idle" | "confirm" | "loading" | "ok" | "error">("idle");
  const [failError, setFailError] = useState<string | null>(null);

  const handleFailover = async (force: boolean) => {
    if (!onFailover) return;
    setFailState("loading");
    setFailError(null);
    try {
      await onFailover(node.address, force);
      setFailState("ok");
      setTimeout(() => setFailState("idle"), 3000);
    } catch (err) {
      setFailError(err instanceof Error ? err.message : "Failover failed");
      setFailState("error");
      setTimeout(() => setFailState("idle"), 4000);
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        node.is_healthy
          ? "border-gray-200"
          : node.status === "disconnected"
          ? "border-red-200 bg-red-50/30"
          : "border-amber-200"
      )}
    >
      {/* Left accent stripe */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 rounded-l-xl",
          node.is_healthy
            ? isReplica
              ? "bg-blue-400"
              : "bg-[#D2232A]"
            : node.status === "disconnected"
            ? "bg-red-400"
            : "bg-amber-400"
        )}
      />

      <div className="pl-3 pr-4 pb-4 pt-3.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <StatusDot status={node.status} />
              <span className="truncate font-mono text-sm font-semibold text-gray-900">
                {node.host}
                <span className="text-[#D2232A]">:{node.port}</span>
              </span>
            </div>
            {isReplica && masterAddress && (
              <p className="mt-0.5 truncate text-[11px] text-gray-400">
                Replica of{" "}
                <span className="font-mono text-gray-500">{masterAddress}</span>
              </p>
            )}
          </div>
          <RoleBadge role={node.role} />
        </div>

        {/* Offline state */}
        {!node.is_healthy && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
            <StatusDot status={node.status} />
            <span className="text-xs font-medium text-red-600 capitalize">
              {node.status}
            </span>
          </div>
        )}

        {/* Metrics grid */}
        {m && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {/* Keys */}
              {node.role === "master" && (
                <div className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                  <div>
                    <p className="text-[10px] text-gray-400">Keys</p>
                    <p className="text-xs font-semibold text-gray-800">
                      {formatKeys(m.keys_count)}
                    </p>
                  </div>
                </div>
              )}

              {/* Clients */}
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                <div>
                  <p className="text-[10px] text-gray-400">Clients</p>
                  <p className="text-xs font-semibold text-gray-800">
                    {m.connected_clients}
                  </p>
                </div>
              </div>

              {/* Ops/sec */}
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                <div>
                  <p className="text-[10px] text-gray-400">Ops/sec</p>
                  <p className="text-xs font-semibold text-gray-800">
                    {formatNumber(m.commands_per_sec)}
                  </p>
                </div>
              </div>

              {/* Uptime */}
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                <div>
                  <p className="text-[10px] text-gray-400">Uptime</p>
                  <p className="text-xs font-semibold text-gray-800">
                    {formatUptime(m.uptime_seconds)}
                  </p>
                </div>
              </div>
            </div>

            {/* Memory bar */}
            <div className="mt-3 border-t border-gray-50 pt-3">
              <MemoryBar
                usedMb={m.memory.used_mb}
                maxMb={m.memory.max_bytes / (1024 * 1024)}
                pct={m.memory.utilization_pct}
              />
            </div>

            {/* Slots — masters only */}
            {node.role === "master" && node.slots.length > 0 && (
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <ArrowUpDown className="h-3 w-3" />
                  <span>Slots</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500">
                  {node.slots[0].start}–{node.slots[node.slots.length - 1].end}
                  <span className="ml-1 text-gray-400">
                    ({formatNumber(node.slot_count)})
                  </span>
                </span>
              </div>
            )}

            {/* Replication offset */}
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <Cpu className="h-3 w-3" />
                <span>Repl. offset</span>
              </div>
              <span className="text-[10px] font-mono text-gray-500">
                {formatNumber(node.replication_offset)}
              </span>
            </div>
          </>
        )}

        {/* Failover — replicas only */}
        {isReplica && onFailover && (
          <div className="mt-3 border-t border-gray-50 pt-3">
            {failState === "idle" && (
              <button
                onClick={() => setFailState("confirm")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-[11px] font-medium text-gray-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                <ShieldAlert className="h-3 w-3" />
                Promote to Master
              </button>
            )}

            {failState === "confirm" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-2 text-[11px] font-medium text-amber-800">
                  Promote <span className="font-mono">{node.address}</span> to master?
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleFailover(false)}
                    className="flex-1 rounded-md bg-amber-500 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                  >
                    Failover
                  </button>
                  <button
                    onClick={() => handleFailover(true)}
                    title="Force — use when master is unreachable"
                    className="flex-1 rounded-md border border-amber-300 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    Force
                  </button>
                  <button
                    onClick={() => setFailState("idle")}
                    className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {failState === "loading" && (
              <div className="flex items-center justify-center gap-2 py-1.5 text-[11px] text-amber-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Negotiating failover…
              </div>
            )}

            {failState === "ok" && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Failover complete
              </div>
            )}

            {failState === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                <div className="flex items-center gap-1 font-medium">
                  <XCircle className="h-3 w-3" />
                  Failed
                </div>
                {failError && <p className="mt-0.5 text-red-500">{failError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
