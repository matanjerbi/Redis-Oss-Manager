"use client";
import { ScrollText, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const MOCK_LOGS = [
  { id: 1, level: "info", ts: "2026-03-31 14:02:11", msg: "Health poll completed — production-cluster OK (6/6 nodes healthy)" },
  { id: 2, level: "warning", ts: "2026-03-31 14:01:45", msg: "Node 10.0.0.5:7001 (staging-cluster) status: disconnected" },
  { id: 3, level: "info", ts: "2026-03-31 14:01:41", msg: "ACL SETUSER tenant_a_readonly broadcast to 6 nodes — all OK" },
  { id: 4, level: "info", ts: "2026-03-31 14:00:11", msg: "Health poll completed — analytics-cluster OK (12/12 nodes healthy)" },
  { id: 5, level: "info", ts: "2026-03-31 13:59:30", msg: "CONFIG SET maxmemory-policy=allkeys-lru applied to production-cluster (3/3 masters)" },
  { id: 6, level: "warning", ts: "2026-03-31 13:58:15", msg: "staging-cluster degraded — 1 replica offline" },
  { id: 7, level: "error", ts: "2026-03-31 13:55:02", msg: "Node 10.0.0.5:7001 unreachable: Connection refused" },
  { id: 8, level: "info", ts: "2026-03-31 13:30:11", msg: "Cluster analytics-cluster registered — 12 nodes discovered" },
];

const ICON = {
  info: <Info className="h-3.5 w-3.5 text-blue-500" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  error: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
};

export default function LogsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Logs</h1>
        <p className="mt-0.5 text-sm text-gray-500">Audit trail of all management operations</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-50 font-mono text-xs">
          {MOCK_LOGS.map((log) => (
            <div
              key={log.id}
              className={cn(
                "flex items-start gap-3 px-5 py-3",
                log.level === "error" && "bg-red-50/40",
                log.level === "warning" && "bg-amber-50/30"
              )}
            >
              <span className="mt-0.5 flex-shrink-0">
                {ICON[log.level as keyof typeof ICON]}
              </span>
              <span className="flex-shrink-0 text-gray-400">{log.ts}</span>
              <span
                className={cn(
                  "font-semibold uppercase",
                  log.level === "error" ? "text-red-600" : log.level === "warning" ? "text-amber-600" : "text-blue-600"
                )}
              >
                [{log.level}]
              </span>
              <span className="text-gray-700">{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
