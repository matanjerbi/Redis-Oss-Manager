"use client";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: "red" | "green" | "amber" | "blue";
  large?: boolean;
}

const ACCENT = {
  red: {
    icon: "bg-red-50 text-[#D2232A]",
    border: "border-[#D2232A]/20",
    bar: "bg-[#D2232A]",
  },
  green: {
    icon: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    border: "border-amber-200",
    bar: "bg-amber-400",
  },
  blue: {
    icon: "bg-blue-50 text-blue-600",
    border: "border-blue-200",
    bar: "bg-blue-500",
  },
};

export function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend = "neutral",
  trendLabel,
  accent = "red",
  large = false,
}: MetricCardProps) {
  const a = ACCENT[accent];

  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const trendColor =
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
      ? "text-red-500"
      : "text-gray-400";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md",
        a.border
      )}
    >
      {/* Top accent bar */}
      <div className={cn("h-0.5 w-full", a.bar)} />

      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {title}
            </p>
            <p
              className={cn(
                "mt-1 font-bold tabular-nums text-gray-900",
                large ? "text-4xl" : "text-3xl"
              )}
            >
              {value}
            </p>
            {subValue && (
              <p className="mt-0.5 text-sm text-gray-400">{subValue}</p>
            )}
          </div>
          <div className={cn("rounded-lg p-2.5", a.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {trendLabel && (
          <div className={cn("mt-3 flex items-center gap-1 text-xs", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            <span>{trendLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
