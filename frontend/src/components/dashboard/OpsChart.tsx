"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MetricPoint } from "@/lib/types";

interface OpsChartProps {
  data: MetricPoint[];
  title: string;
  color?: string;
  unit?: string;
}

export function OpsChart({ data, title, color = "#D2232A", unit = "ops/s" }: OpsChartProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {unit}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: "#9CA3AF" }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#9CA3AF" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              fontSize: "11px",
              border: "1px solid #E5E7EB",
              borderRadius: "6px",
              padding: "6px 10px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(v) => [typeof v === "number" ? v.toFixed(0) : v, unit]}
            labelStyle={{ color: "#6B7280", fontWeight: 500 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${color.replace("#", "")})`}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
