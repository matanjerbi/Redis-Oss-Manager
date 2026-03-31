"use client";
import { cn } from "@/lib/utils";
import type { NodeRole, NodeStatus, ClusterStatus } from "@/lib/types";

interface StatusDotProps {
  status: NodeStatus | ClusterStatus;
  size?: "sm" | "md";
}

export function StatusDot({ status, size = "md" }: StatusDotProps) {
  const color =
    status === "connected" || status === "ok"
      ? "bg-emerald-500"
      : status === "degraded"
      ? "bg-amber-400"
      : status === "fail" || status === "pfail" || status === "disconnected"
      ? "bg-red-500"
      : "bg-gray-400";

  const pulse =
    status === "connected" || status === "ok" ? "animate-pulse" : "";

  return (
    <span className="relative inline-flex items-center justify-center">
      <span
        className={cn(
          "rounded-full",
          size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5",
          color,
          pulse
        )}
      />
    </span>
  );
}

interface RoleBadgeProps {
  role: NodeRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        role === "master"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : role === "slave"
          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
          : "bg-gray-100 text-gray-600"
      )}
    >
      {role === "slave" ? "Replica" : role}
    </span>
  );
}

interface ClusterStatusBadgeProps {
  status: ClusterStatus;
}

export function ClusterStatusBadge({ status }: ClusterStatusBadgeProps) {
  const cfg = {
    ok: { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    degraded: { label: "Degraded", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    fail: { label: "Failed", cls: "bg-red-50 text-red-700 ring-red-200" },
    unknown: { label: "Unknown", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        cfg.cls
      )}
    >
      <StatusDot status={status} size="sm" />
      {cfg.label}
    </span>
  );
}
