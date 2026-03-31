"use client";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

interface MemoryBarProps {
  usedMb: number;
  maxMb: number;
  pct: number | null;
  showLabel?: boolean;
}

export function MemoryBar({ usedMb, maxMb, pct, showLabel = true }: MemoryBarProps) {
  const percent = pct ?? 0;
  const hasMax = maxMb > 0;

  const barColor =
    percent >= 90
      ? "bg-red-500"
      : percent >= 75
      ? "bg-amber-400"
      : "bg-emerald-500";

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Memory</span>
          <span className="font-medium text-gray-700">
            {formatBytes(usedMb)}
            {hasMax && <span className="text-gray-400"> / {formatBytes(maxMb)}</span>}
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        {hasMax ? (
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        ) : (
          <div className="h-full w-full rounded-full bg-gray-200" />
        )}
      </div>
      {hasMax && showLabel && (
        <p className="text-right text-[10px] text-gray-400">
          {percent.toFixed(1)}% used
        </p>
      )}
    </div>
  );
}
