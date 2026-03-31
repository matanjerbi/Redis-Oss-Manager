import type { MetricPoint } from "./types";

// Deterministic chart history — used for ops/memory charts until Prometheus integration
export function generateMetricHistory(baseValue: number, points = 20): MetricPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 4;
    const jitter = Math.sin(angle * 7.3) * 0.15 + Math.sin(angle * 3.1) * 0.1;
    const minutes = points - i;
    const hh = String(Math.floor((60 - minutes) / 60) % 24).padStart(2, "0");
    const mm = String((60 - minutes) % 60).padStart(2, "0");
    return {
      time: `${hh}:${mm}`,
      value: Math.max(0, Math.round(baseValue * (1 + jitter))),
    };
  });
}
