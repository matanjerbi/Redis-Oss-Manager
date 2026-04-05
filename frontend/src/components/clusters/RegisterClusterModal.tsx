"use client";
import { useState } from "react";
import { X, Plus, Minus, Server, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegisterClusterForm {
  name: string;
  description: string;
  tenant_id: string;
  seed_nodes: string[];
  password: string;
  tls_enabled: boolean;
  socket_timeout: number;
  socket_connect_timeout: number;
}

interface Props {
  onClose: () => void;
  onSave: (data: RegisterClusterForm) => Promise<void>;
}

export function RegisterClusterModal({ onClose, onSave }: Props) {
  const [form, setForm] = useState<RegisterClusterForm>({
    name: "",
    description: "",
    tenant_id: "",
    seed_nodes: [""],
    password: "",
    tls_enabled: false,
    socket_timeout: 5,
    socket_connect_timeout: 5,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.tenant_id.trim()) e.tenant_id = "Required";
    const validSeeds = form.seed_nodes.filter((s) => s.trim());
    if (validSeeds.length === 0) e.seed_nodes = "At least one seed node required";
    else {
      for (const s of validSeeds) {
        const parts = s.trim().split(":");
        if (parts.length !== 2 || !parts[1] || isNaN(Number(parts[1]))) {
          e.seed_nodes = `Invalid format: "${s}" — expected host:port`;
          break;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setApiError(null);
    try {
      await onSave({
        ...form,
        seed_nodes: form.seed_nodes.filter((s) => s.trim()),
      });
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Failed to connect to cluster");
    } finally {
      setLoading(false);
    }
  };

  const updateSeed = (i: number, val: string) => {
    // If the value contains commas or spaces between addresses, split into multiple fields
    const parts = val.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      setForm((f) => {
        const nodes = [...f.seed_nodes];
        nodes.splice(i, 1, ...parts);
        return { ...f, seed_nodes: nodes };
      });
      return;
    }
    setForm((f) => {
      const nodes = [...f.seed_nodes];
      nodes[i] = val;
      return { ...f, seed_nodes: nodes };
    });
  };

  const addSeed = () => setForm((f) => ({ ...f, seed_nodes: [...f.seed_nodes, ""] }));

  const removeSeed = (i: number) =>
    setForm((f) => ({ ...f, seed_nodes: f.seed_nodes.filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
              <Server className="h-4 w-4 text-[#D2232A]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Register Cluster</h2>
              <p className="text-xs text-gray-400">Connect a Redis OSS Cluster to the manager</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* API Error */}
          {apiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Connection failed:</strong> {apiError}
            </div>
          )}

          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                Cluster Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. production-cluster"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-[#D2232A]/10",
                  errors.name ? "border-red-300 bg-red-50 focus:border-red-400" : "border-gray-200 focus:border-[#D2232A]"
                )}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                Tenant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. tenant-prod"
                value={form.tenant_id}
                onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-[#D2232A]/10",
                  errors.tenant_id ? "border-red-300 bg-red-50 focus:border-red-400" : "border-gray-200 focus:border-[#D2232A]"
                )}
              />
              {errors.tenant_id && <p className="mt-1 text-xs text-red-500">{errors.tenant_id}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">Description</label>
            <input
              type="text"
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10"
            />
          </div>

          {/* Seed Nodes */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">
                Seed Nodes <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addSeed}
                className="flex items-center gap-1 text-xs text-[#D2232A] hover:underline"
              >
                <Plus className="h-3 w-3" /> Add node
              </button>
            </div>
            <div className="space-y-2">
              {form.seed_nodes.map((seed, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="127.0.0.1:7001"
                    value={seed}
                    onChange={(e) => updateSeed(i, e.target.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 font-mono text-sm outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-[#D2232A]/10",
                      errors.seed_nodes ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-[#D2232A]"
                    )}
                  />
                  {form.seed_nodes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSeed(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {errors.seed_nodes && <p className="mt-1 text-xs text-red-500">{errors.seed_nodes}</p>}
            <p className="mt-1.5 text-[11px] text-gray-400">
              One seed node is enough — the manager will discover all other nodes automatically
            </p>
          </div>

          {/* Password + TLS */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                Password <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="password"
                placeholder="Leave empty if none"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">Options</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={form.tls_enabled}
                  onChange={(e) => setForm((f) => ({ ...f, tls_enabled: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[#D2232A]"
                />
                <span className="text-sm text-gray-700">TLS / SSL</span>
              </label>
            </div>
          </div>

          {/* Timeouts */}
          <div className="grid grid-cols-2 gap-4">
            {(["socket_timeout", "socket_connect_timeout"] as const).map((key) => (
              <div key={key}>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  {key === "socket_timeout" ? "Socket Timeout (s)" : "Connect Timeout (s)"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b51e24] active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Server className="h-3.5 w-3.5" />
                Register Cluster
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
