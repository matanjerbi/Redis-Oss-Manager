"use client";
import { useState } from "react";
import { X, Plus, ShieldCheck, Eye, EyeOff, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const COMMAND_PRESETS = [
  { label: "+@all", desc: "All commands" },
  { label: "+@read", desc: "Read commands" },
  { label: "+@write", desc: "Write commands" },
  { label: "+@string", desc: "String commands" },
  { label: "+@hash", desc: "Hash commands" },
  { label: "-@dangerous", desc: "Block dangerous" },
  { label: "-@admin", desc: "Block admin" },
];

export interface AclFormData {
  username: string;
  password: string;
  enabled: boolean;
  commands: string[];
  keyPatterns: string[];
  nopass: boolean;
}

interface AclModalProps {
  onClose: () => void;
  onSave: (data: AclFormData) => void;
  /** When provided, modal opens in edit mode (permissions only) */
  editUser?: {
    username: string;
    enabled: boolean;
    commands: string[];
    keyPatterns: string[];
    nopass: boolean;
  };
}

export function AclModal({ onClose, onSave, editUser }: AclModalProps) {
  const isEdit = !!editUser;

  const [form, setForm] = useState<AclFormData>(
    isEdit
      ? {
          username: editUser.username,
          password: "",
          enabled: editUser.enabled,
          commands: editUser.commands,
          keyPatterns: editUser.keyPatterns,
          nopass: editUser.nopass,
        }
      : {
          username: "",
          password: "",
          enabled: true,
          commands: ["+@read", "-@dangerous"],
          keyPatterns: ["*"],
          nopass: false,
        }
  );
  const [showPassword, setShowPassword] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleCommand = (cmd: string) => {
    setForm((f) => ({
      ...f,
      commands: f.commands.includes(cmd)
        ? f.commands.filter((c) => c !== cmd)
        : [...f.commands, cmd],
    }));
  };

  const addKeyPattern = () => {
    const pattern = newKey.trim();
    if (!pattern) return;
    setForm((f) => ({ ...f, keyPatterns: [...new Set([...f.keyPatterns, pattern])] }));
    setNewKey("");
  };

  const removeKeyPattern = (p: string) => {
    setForm((f) => ({ ...f, keyPatterns: f.keyPatterns.filter((k) => k !== p) }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isEdit && !form.username.trim()) e.username = "Username is required";
    if (!isEdit && !form.nopass && !form.password) e.password = "Password is required (or enable nopass)";
    if (form.commands.length === 0) e.commands = "At least one command rule is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
              {isEdit
                ? <Pencil className="h-4 w-4 text-[#D2232A]" />
                : <ShieldCheck className="h-4 w-4 text-[#D2232A]" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {isEdit ? `Edit Permissions — ${editUser.username}` : "Create ACL User"}
              </h2>
              <p className="text-xs text-gray-400">
                {isEdit
                  ? "Changes password and username are not allowed here"
                  : "Broadcast ACL SETUSER to all cluster nodes"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Username — create mode only */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                placeholder="e.g. tenant_a_readonly"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400",
                  "focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10",
                  errors.username ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
                )}
              />
              {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
            </div>
          )}

          {/* Password — create mode only */}
          {!isEdit && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">Password</label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={form.nopass}
                    onChange={(e) => setForm((f) => ({ ...f, nopass: e.target.checked }))}
                    className="h-3 w-3 accent-[#D2232A]"
                  />
                  No password (nopass)
                </label>
              </div>
              {!form.nopass && (
                <>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 pr-9 text-sm text-gray-900 outline-none transition placeholder:text-gray-400",
                        "focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10",
                        errors.password ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">Will be SHA-256 hashed before storage</p>
                </>
              )}
            </div>
          )}

          {/* Command presets */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">Command Rules</label>
            <div className="flex flex-wrap gap-1.5">
              {COMMAND_PRESETS.map(({ label, desc }) => {
                const active = form.commands.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    title={desc}
                    onClick={() => toggleCommand(label)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-mono font-medium transition",
                      active
                        ? label.startsWith("+")
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                          : "bg-red-50 text-red-700 ring-1 ring-red-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {errors.commands && <p className="mt-1 text-xs text-red-500">{errors.commands}</p>}
            {form.commands.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-gray-400">
                → ACL SETUSER {form.username || (isEdit ? editUser.username : "<username>")}{" "}
                {form.commands.join(" ")}
              </p>
            )}
          </div>

          {/* Key patterns */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">Key Patterns</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {form.keyPatterns.map((p) => (
                <span
                  key={p}
                  className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700 ring-1 ring-blue-200"
                >
                  ~{p}
                  <button
                    type="button"
                    onClick={() => removeKeyPattern(p)}
                    className="ml-0.5 text-blue-400 hover:text-blue-700"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. tenant_a:* or session:*"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyPattern()}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 outline-none focus:border-[#D2232A] focus:ring-2 focus:ring-[#D2232A]/10"
              />
              <button
                type="button"
                onClick={addKeyPattern}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                form.enabled ? "bg-[#D2232A]" : "bg-gray-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.enabled ? "left-4" : "left-0.5"
                )}
              />
            </button>
            <div>
              <p className="text-xs font-medium text-gray-700">
                User {form.enabled ? "enabled" : "disabled"}
              </p>
              <p className="text-[11px] text-gray-400">
                {form.enabled ? "User can authenticate" : "User is blocked from authenticating"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b51e24] active:scale-[0.98]"
          >
            {isEdit ? <Pencil className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {isEdit ? "Save Permissions" : "Broadcast ACL SETUSER"}
          </button>
        </div>
      </div>
    </div>
  );
}
