"use client";
import { useState } from "react";
import { SlidersHorizontal, Send, ChevronDown } from "lucide-react";

const CONFIG_PARAMS = [
  { param: "maxmemory-policy", value: "allkeys-lru", type: "select", options: ["allkeys-lru", "volatile-lru", "allkeys-random", "volatile-random", "noeviction", "allkeys-lfu", "volatile-lfu"] },
  { param: "hz", value: "10", type: "number" },
  { param: "slowlog-log-slower-than", value: "10000", type: "number" },
  { param: "slowlog-max-len", value: "128", type: "number" },
  { param: "latency-monitor-threshold", value: "0", type: "number" },
  { param: "maxmemory", value: "536870912", type: "number" },
  { param: "repl-backlog-size", value: "1048576", type: "number" },
  { param: "min-replicas-to-write", value: "0", type: "number" },
];

export default function ConfigurationsPage() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(CONFIG_PARAMS.map((c) => [c.param, c.value]))
  );
  const [saved, setSaved] = useState<string | null>(null);

  const handleApply = (param: string) => {
    setSaved(param);
    setTimeout(() => setSaved(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configurations</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          CONFIG SET broadcasts to all shards simultaneously
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-800">Runtime Parameters</p>
        </div>
        <div className="divide-y divide-gray-50">
          {CONFIG_PARAMS.map((cfg) => (
            <div key={cfg.param} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-mono text-sm font-medium text-gray-900">{cfg.param}</p>
              </div>
              <div className="flex items-center gap-2">
                {cfg.type === "select" ? (
                  <div className="relative">
                    <select
                      value={values[cfg.param]}
                      onChange={(e) => setValues((v) => ({ ...v, [cfg.param]: e.target.value }))}
                      className="h-8 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-7 font-mono text-sm text-gray-800 outline-none focus:border-[#D2232A] focus:ring-1 focus:ring-[#D2232A]/20"
                    >
                      {cfg.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={values[cfg.param]}
                    onChange={(e) => setValues((v) => ({ ...v, [cfg.param]: e.target.value }))}
                    className="h-8 w-36 rounded-lg border border-gray-200 px-3 font-mono text-sm text-gray-800 outline-none focus:border-[#D2232A] focus:ring-1 focus:ring-[#D2232A]/20"
                  />
                )}
                <button
                  onClick={() => handleApply(cfg.param)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#D2232A] px-3 text-xs font-semibold text-white transition hover:bg-[#b51e24] active:scale-95"
                >
                  {saved === cfg.param ? (
                    "Applied ✓"
                  ) : (
                    <>
                      <Send className="h-3 w-3" />
                      Apply
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
