"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Activity, Cpu, Users, Target } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { API_BASE } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/utils";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

interface MetricPoint {
  time: string;
  value: number;
}

interface MetricSeries {
  name: string;
  points: { ts: number; value: number }[];
}

interface MetricsResponse {
  job: string;
  range_seconds: number;
  current: {
    connected_clients: number | null;
    memory_used_bytes: number | null;
    memory_max_bytes: number | null;
    keyspace_hits_total: number | null;
    keyspace_misses_total: number | null;
  };
  series: MetricSeries[];
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const RANGES = [
  { label: "15 min", value: 900 },
  { label: "1 h", value: 3600 },
  { label: "6 h", value: 21600 },
  { label: "24 h", value: 86400 },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

function toChartPoints(series: MetricSeries | undefined): MetricPoint[] {
  if (!series) return [];
  return series.points.map(({ ts, value }) => ({
    time: new Date(ts * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: Math.max(0, value),
  }));
}

function getSeries(data: MetricsResponse, name: string): MetricSeries | undefined {
  return data.series.find((s) => s.name === name);
}

function hitRate(data: MetricsResponse): string {
  const hits = data.current.keyspace_hits_total ?? 0;
  const misses = data.current.keyspace_misses_total ?? 0;
  const total = hits + misses;
  if (total === 0) return "—";
  return `${((hits / total) * 100).toFixed(1)}%`;
}

function memoryPct(data: MetricsResponse): string {
  const used = data.current.memory_used_bytes;
  const max = data.current.memory_max_bytes;
  if (!used || !max || max === 0) return "—";
  return `${((used / max) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------
// Mini chart card
// ---------------------------------------------------------------

interface ChartCardProps {
  title: string;
  unit: string;
  color: string;
  data: MetricPoint[];
  formatter?: (v: number) => string;
  icon: React.ElementType;
  currentValue: string;
  subValue?: string;
}

function ChartCard({
  title,
  unit,
  color,
  data,
  formatter,
  icon: Icon,
  currentValue,
  subValue,
}: ChartCardProps) {
  const gradId = `grad-${color.replace("#", "")}`;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-sm font-semibold text-gray-800">{title}</p>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          {unit}
        </span>
      </div>
      <p className="mb-4 text-2xl font-bold text-gray-900">
        {currentValue}
        {subValue && <span className="ml-2 text-sm font-normal text-gray-400">{subValue}</span>}
      </p>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatter ?? ((v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))))}
            />
            <Tooltip
              contentStyle={{
                fontSize: "11px",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                padding: "6px 10px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              formatter={(v) => [
                formatter ? formatter(v as number) : formatNumber(v as number),
                unit,
              ]}
              labelStyle={{ color: "#6B7280", fontWeight: 500 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: color }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[110px] items-center justify-center text-xs text-gray-400">
          No data
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------

interface MetricsTabProps {
  clusterId: string;
}

export function MetricsTab({ clusterId }: MetricsTabProps) {
  const [range, setRange] = useState<RangeValue>(3600);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/clusters/${clusterId}/metrics?range=${range}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    } finally {
      setLoading(false);
    }
  }, [clusterId, range]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                range === r.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={fetchMetrics}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin text-[#D2232A]" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}

      {/* Charts */}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ChartCard
            title="Operations / sec"
            unit="ops/s"
            color="#D2232A"
            icon={Activity}
            data={toChartPoints(getSeries(data, "ops_per_sec"))}
            currentValue={
              (() => {
                const pts = getSeries(data, "ops_per_sec")?.points ?? [];
                const last = pts[pts.length - 1]?.value;
                return last != null ? formatNumber(last) : "—";
              })()
            }
            formatter={(v) => v.toFixed(1)}
          />
          <ChartCard
            title="Memory Used"
            unit="MB"
            color="#3B82F6"
            icon={Cpu}
            data={toChartPoints(getSeries(data, "memory_used_bytes")).map((p) => ({
              ...p,
              value: p.value / 1_048_576,
            }))}
            currentValue={
              data.current.memory_used_bytes != null
                ? formatBytes(data.current.memory_used_bytes / 1_048_576)
                : "—"
            }
            subValue={memoryPct(data) !== "—" ? `${memoryPct(data)} of max` : undefined}
            formatter={(v) => `${v.toFixed(0)} MB`}
          />
          <ChartCard
            title="Connected Clients"
            unit="clients"
            color="#10B981"
            icon={Users}
            data={toChartPoints(getSeries(data, "connected_clients"))}
            currentValue={
              data.current.connected_clients != null
                ? formatNumber(data.current.connected_clients)
                : "—"
            }
            formatter={(v) => String(Math.round(v))}
          />
          <ChartCard
            title="Cache Hit Rate"
            unit="%"
            color="#F59E0B"
            icon={Target}
            data={toChartPoints(getSeries(data, "hit_rate")).map((p) => ({
              ...p,
              value: p.value * 100,
            }))}
            currentValue={hitRate(data)}
            formatter={(v) => `${v.toFixed(1)}%`}
          />
        </div>
      )}
    </div>
  );
}
