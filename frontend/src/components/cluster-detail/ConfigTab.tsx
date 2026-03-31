"use client";
import { useState, useEffect, useCallback } from "react";
import {
  SlidersHorizontal, Send, RefreshCw,
  ChevronDown, AlertTriangle, Loader2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

// Parameters shown prominently with type hints
const KNOWN_PARAMS: Record<string, { type: "select" | "number" | "text"; options?: string[] }> = {
  "maxmemory-policy": {
    type: "select",
    options: ["noeviction", "allkeys-lru", "volatile-lru", "allkeys-random", "volatile-random", "allkeys-lfu", "volatile-lfu"],
  },
  "hz": { type: "number" },
  "slowlog-log-slower-than": { type: "number" },
  "slowlog-max-len": { type: "number" },
  "maxmemory": { type: "number" },
  "repl-backlog-size": { type: "number" },
  "min-replicas-to-write": { type: "number" },
  "latency-monitor-threshold": { type: "number" },
};

interface NodeConfig {
  [param: string]: string;
}

interface Props {
  clusterId: string;
}

export function ConfigTab({ clusterId }: Props) {
  // {address: {param: value}}
  const [configByNode, setConfigByNode] = useState<Record<string, NodeConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // {param: value} — edit buffer
  const [edits, setEdits] = useState<Record<string, string>>({});
  // {param: "ok" | "error" | "saving"}
  const [saveState, setSaveState] = useState<Record<string, string>>({});

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/clusters/${clusterId}/config?pattern=*`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: Record<string, NodeConfig> = await res.json();
      setConfigByNode(data);

      // Seed edits from first node
      const firstNode = Object.values(data)[0] ?? {};
      const initial: Record<string, string> = {};
      Object.keys(KNOWN_PARAMS).forEach((p) => {
        if (firstNode[p] !== undefined) initial[p] = firstNode[p];
      });
      setEdits(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleApply = async (param: string) => {
    setSaveState((s) => ({ ...s, [param]: "saving" }));
    try {
      const res = await fetch(`${API}/api/clusters/${clusterId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameter: param, value: edits[param] }),
      });
      const result = await res.json();
      setSaveState((s) => ({ ...s, [param]: result.success ? "ok" : "error" }));
      setTimeout(() => setSaveState((s) => ({ ...s, [param]: "" })), 2500);
      await fetchConfig();
    } catch {
      setSaveState((s) => ({ ...s, [param]: "error" }));
      setTimeout(() => setSaveState((s) => ({ ...s, [param]: "" })), 2500);
    }
  };

  // Build a unified param → value map (first node's values)
  const firstNode = Object.values(configByNode)[0] ?? {};
  const nodeAddresses = Object.keys(configByNode);

  // Check consistency across nodes for a param
  const isConsistent = (param: string) => {
    const values = Object.values(configByNode).map((n) => n[param]);
    return values.every((v) => v === values[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Changes apply to{" "}
            <span className="font-semibold text-gray-800">all {nodeAddresses.length} nodes</span>{" "}
            simultaneously via CONFIG SET
          </p>
        </div>
        <button
          onClick={fetchConfig}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-[#D2232A]")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && Object.keys(configByNode).length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading configuration…
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <p className="text-sm font-semibold text-gray-800">Runtime Parameters</p>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(KNOWN_PARAMS).map(([param, meta]) => {
              const currentVal = firstNode[param] ?? "";
              const editVal = edits[param] ?? currentVal;
              const consistent = isConsistent(param);
              const state = saveState[param];

              return (
                <div key={param} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-medium text-gray-900">{param}</p>
                      {!consistent && (
                        <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-200">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          inconsistent across nodes
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                      current: {currentVal || "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {meta.type === "select" ? (
                      <div className="relative">
                        <select
                          value={editVal}
                          onChange={(e) => setEdits((v) => ({ ...v, [param]: e.target.value }))}
                          className="h-8 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-7 font-mono text-sm text-gray-800 outline-none focus:border-[#D2232A]"
                        >
                          {meta.options?.map((o) => <option key={o}>{o}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={editVal}
                        onChange={(e) => setEdits((v) => ({ ...v, [param]: e.target.value }))}
                        className="h-8 w-36 rounded-lg border border-gray-200 px-3 font-mono text-sm text-gray-800 outline-none focus:border-[#D2232A]"
                      />
                    )}

                    <button
                      onClick={() => handleApply(param)}
                      disabled={state === "saving" || editVal === currentVal}
                      className={cn(
                        "flex h-8 min-w-[80px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:scale-95 disabled:opacity-50",
                        state === "ok"
                          ? "bg-emerald-500 text-white"
                          : state === "error"
                          ? "bg-red-500 text-white"
                          : "bg-[#D2232A] text-white hover:bg-[#b51e24]"
                      )}
                    >
                      {state === "saving" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : state === "ok" ? (
                        <><CheckCircle2 className="h-3 w-3" /> Applied</>
                      ) : state === "error" ? (
                        "Failed"
                      ) : (
                        <><Send className="h-3 w-3" /> Apply</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* All config values table */}
          {Object.keys(firstNode).length > 0 && (
            <details className="border-t border-gray-100">
              <summary className="cursor-pointer px-5 py-3 text-xs font-medium text-gray-500 hover:text-gray-700 select-none">
                View all {Object.keys(firstNode).length} parameters
              </summary>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {Object.entries(firstNode)
                  .filter(([p]) => !KNOWN_PARAMS[p])
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([param, value]) => (
                    <div key={param} className="flex items-center justify-between px-5 py-2">
                      <span className="font-mono text-xs text-gray-600">{param}</span>
                      <span className="font-mono text-xs text-gray-400 truncate max-w-xs text-right">
                        {value || "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
