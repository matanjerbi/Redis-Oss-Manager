"use client";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, Loader2, Clock, Terminal,
  ChevronDown, ChevronUp, Gauge,
} from "lucide-react";
import { cn, formatDuration, formatTimestamp } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

interface SlowlogEntry {
  id: number;
  start_time: number;       // unix timestamp (seconds)
  duration: number;         // microseconds
  command: string[];
  client_addr: string;
  client_name: string;
}

interface Props {
  clusterId: string;
}

export function SlowLogTab({ clusterId }: Props) {
  const [logByNode, setLogByNode] = useState<Record<string, SlowlogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(50);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/clusters/${clusterId}/slowlog?count=${count}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: Record<string, SlowlogEntry[]> = await res.json();
      setLogByNode(data);
      // Auto-expand first node with entries
      const firstWithEntries = Object.entries(data).find(([, entries]) => entries.length > 0);
      if (firstWithEntries) setExpandedNode(firstWithEntries[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load slow log");
    } finally {
      setLoading(false);
    }
  }, [clusterId, count]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalEntries = Object.values(logByNode).reduce((s, e) => s + e.length, 0);
  const nodeAddresses = Object.keys(logByNode);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600">
            <Gauge className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">Show last</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="ml-1 bg-transparent text-sm font-medium text-gray-800 outline-none"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500">entries / node</span>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-[#D2232A]")} />
            Refresh
          </button>
        </div>
        {!loading && (
          <p className="text-xs text-gray-400">
            {totalEntries === 0
              ? "No slow queries recorded"
              : `${totalEntries} entries across ${nodeAddresses.length} node${nodeAddresses.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && nodeAddresses.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading slow log…
        </div>
      ) : totalEntries === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-16">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
            <Clock className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-gray-600">No slow queries</p>
          <p className="text-xs text-gray-400">
            All commands executed faster than{" "}
            <span className="font-mono">slowlog-log-slower-than</span> threshold
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {nodeAddresses.map((address) => {
            const entries = logByNode[address] ?? [];
            const isExpanded = expandedNode === address;

            return (
              <div
                key={address}
                className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
              >
                {/* Node header */}
                <button
                  onClick={() => setExpandedNode(isExpanded ? null : address)}
                  className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                      <Terminal className="h-3 w-3 text-gray-500" />
                    </div>
                    <span className="font-mono text-sm font-medium text-gray-800">{address}</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      entries.length === 0
                        ? "bg-gray-100 text-gray-400"
                        : "bg-amber-50 text-amber-700"
                    )}>
                      {entries.length} {entries.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>

                {/* Entries table */}
                {isExpanded && entries.length > 0 && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          {["#", "Time", "Duration", "Command", "Client"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {entries.map((entry) => {
                          const dur = formatDuration(entry.duration);
                          const cmd = Array.isArray(entry.command)
                            ? entry.command.join(" ")
                            : String(entry.command);

                          return (
                            <tr key={entry.id} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                                {entry.id}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                                {formatTimestamp(entry.start_time)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-semibold",
                                  dur.level === "ok" && "bg-emerald-50 text-emerald-700",
                                  dur.level === "warn" && "bg-amber-50 text-amber-700",
                                  dur.level === "danger" && "bg-red-50 text-red-700",
                                )}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {dur.text}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 max-w-xs">
                                <span className="block truncate font-mono text-xs text-gray-800" title={cmd}>
                                  {cmd}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                                {entry.client_addr || "—"}
                                {entry.client_name && (
                                  <span className="ml-1 text-gray-300">({entry.client_name})</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {isExpanded && entries.length === 0 && (
                  <div className="border-t border-gray-100 px-5 py-6 text-center text-xs text-gray-400">
                    No slow queries on this node
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
