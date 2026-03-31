"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Search, User, Key, Pencil,
  CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";
import { AclModal, type AclFormData } from "@/components/acl/AclModal";
import { cn } from "@/lib/utils";

const API = "http://localhost:8000";

interface AclEntry {
  username: string;
  enabled: boolean;
  commands: string[];
  key_patterns: string[];
  nopass: boolean;
  num_passwords: number;
}

function parseAclLine(line: string): AclEntry {
  // Format: "user <name> on/off #hash ~pattern +cmd ..."
  const parts = line.split(" ");
  const username = parts[1] ?? "";
  const enabled = parts[2] === "on";
  const nopass = parts.includes("nopass");
  const commands = parts.filter((p) => p.startsWith("+") || p.startsWith("-"));
  const key_patterns = parts.filter((p) => p.startsWith("~")).map((p) => p.slice(1));
  const num_passwords = parts.filter((p) => p.startsWith("#")).length;
  return { username, enabled, commands, key_patterns, nopass, num_passwords };
}

function CommandTag({ cmd }: { cmd: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
      cmd.startsWith("+")
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
        : "bg-red-50 text-red-700 ring-1 ring-red-200"
    )}>
      {cmd}
    </span>
  );
}

interface Props {
  clusterId: string;
}

export function AclTab({ clusterId }: Props) {
  const [users, setUsers] = useState<AclEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AclEntry | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/clusters/${clusterId}/acl/users`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const lines: string[] = await res.json();
      setUsers(lines.map(parseAclLine));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ACL users");
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSave = async (data: AclFormData) => {
    const res = await fetch(`${API}/api/clusters/${clusterId}/acl/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.username,
        enabled: data.enabled,
        plaintext_password: data.password || null,
        commands: data.commands,
        key_patterns: data.keyPatterns,
        channel_patterns: [],
        nopass: data.nopass,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `Server error ${res.status}`);
    }
    setShowModal(false);
    setEditingUser(null);
    await fetchUsers();
  };

  const handleDelete = async (username: string) => {
    if (username === "default") return;
    setDeleting(username);
    try {
      await fetch(`${API}/api/clusters/${clusterId}/acl/users/${username}`, {
        method: "DELETE",
      });
      await fetchUsers();
    } finally {
      setDeleting(null);
    }
  };

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter users…"
              className="h-8 w-48 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#D2232A] focus:bg-white"
            />
          </div>
          <button
            onClick={fetchUsers}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-[#D2232A]")} />
          </button>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b51e24]"
        >
          <Plus className="h-4 w-4" />
          Create ACL User
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ACL users…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {["Username", "Status", "Commands", "Key Patterns", "Auth", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((user) => (
                <tr key={user.username} className="group hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                        <User className="h-3 w-3 text-gray-500" />
                      </div>
                      <span className="font-mono font-medium text-gray-900">{user.username}</span>
                      {user.username === "default" && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">built-in</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      "flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      user.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    )}>
                      {user.enabled
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <XCircle className="h-3 w-3" />}
                      {user.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {user.commands.length > 0
                        ? user.commands.map((c) => <CommandTag key={c} cmd={c} />)
                        : <span className="text-xs text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {user.key_patterns.length > 0
                        ? user.key_patterns.map((p) => (
                          <span key={p} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 ring-1 ring-blue-200">
                            ~{p}
                          </span>
                        ))
                        : <span className="text-xs text-gray-400">none</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Key className="h-3 w-3 text-gray-300" />
                      {user.nopass
                        ? <span className="text-amber-600 font-medium">nopass</span>
                        : <span>{user.num_passwords} password{user.num_passwords !== 1 ? "s" : ""}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {user.username !== "default" && (
                        <button
                          onClick={() => handleDelete(user.username)}
                          disabled={deleting === user.username}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        >
                          {deleting === user.username
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                    No ACL users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <AclModal onClose={() => setShowModal(false)} onSave={handleSave} />
      )}

      {editingUser && (
        <AclModal
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
          editUser={{
            username: editingUser.username,
            enabled: editingUser.enabled,
            commands: editingUser.commands,
            keyPatterns: editingUser.key_patterns,
            nopass: editingUser.nopass,
          }}
        />
      )}
    </div>
  );
}
