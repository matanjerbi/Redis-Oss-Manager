"use client";
import { useState } from "react";
import {
  Plus,
  ShieldCheck,
  Trash2,
  MoreHorizontal,
  User,
  Key,
  Terminal,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import { AclModal, type AclFormData } from "@/components/acl/AclModal";
import { mockAclUsers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { AclUser } from "@/lib/types";

function CommandTag({ cmd }: { cmd: string }) {
  const isAllow = cmd.startsWith("+");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
        isAllow
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-red-50 text-red-700 ring-1 ring-red-200"
      )}
    >
      {cmd}
    </span>
  );
}

function KeyPatternTag({ pattern }: { pattern: string }) {
  return (
    <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 ring-1 ring-blue-200">
      ~{pattern}
    </span>
  );
}

export default function AclPage() {
  const [users, setUsers] = useState<AclUser[]>(mockAclUsers);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = (data: AclFormData) => {
    const newUser: AclUser = {
      username: data.username,
      enabled: data.enabled,
      commands: data.commands,
      key_patterns: data.keyPatterns,
      channel_patterns: [],
      nopass: data.nopass,
      num_passwords: data.nopass ? 0 : 1,
    };
    setUsers((u) => [...u, newUser]);
    setShowModal(false);
  };

  const handleDelete = (username: string) => {
    if (username === "default") return; // guard
    setUsers((u) => u.filter((user) => user.username !== username));
  };

  const handleToggleEnabled = (username: string) => {
    setUsers((u) =>
      u.map((user) =>
        user.username === username ? { ...user, enabled: !user.enabled } : user
      )
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ACL Manager</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Manage Redis ACL users — changes broadcast to all cluster nodes simultaneously
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[#D2232A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b51e24] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create ACL User
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: users.length, icon: User, color: "text-gray-700" },
          {
            label: "Active Users",
            value: users.filter((u) => u.enabled).length,
            icon: CheckCircle2,
            color: "text-emerald-600",
          },
          {
            label: "Disabled Users",
            value: users.filter((u) => !u.enabled).length,
            icon: XCircle,
            color: "text-red-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <Icon className={cn("h-5 w-5", color)} />
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Table toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-800">
            Users{" "}
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {users.length}
            </span>
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter users…"
              className="h-8 w-48 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#D2232A] focus:bg-white focus:ring-1 focus:ring-[#D2232A]/20"
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Username
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Command Rules
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Key Patterns
              </th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Auth
              </th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((user) => (
              <tr
                key={user.username}
                className="group transition-colors hover:bg-gray-50/50"
              >
                {/* Username */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <User className="h-3 w-3 text-gray-500" />
                    </div>
                    <span className="font-mono font-medium text-gray-900">
                      {user.username}
                    </span>
                    {user.username === "default" && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        built-in
                      </span>
                    )}
                  </div>
                </td>

                {/* Status toggle */}
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => handleToggleEnabled(user.username)}
                    disabled={user.username === "default"}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition",
                      user.enabled
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                      user.username === "default" && "cursor-default opacity-60"
                    )}
                  >
                    {user.enabled ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {user.enabled ? "Enabled" : "Disabled"}
                  </button>
                </td>

                {/* Commands */}
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {user.commands.map((c) => (
                      <CommandTag key={c} cmd={c} />
                    ))}
                  </div>
                </td>

                {/* Key patterns */}
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {user.key_patterns.map((p) => (
                      <KeyPatternTag key={p} pattern={p} />
                    ))}
                  </div>
                </td>

                {/* Auth */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Key className="h-3 w-3 text-gray-300" />
                    {user.nopass ? (
                      <span className="text-amber-600 font-medium">nopass</span>
                    ) : (
                      <span>{user.num_passwords} password{user.num_passwords !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-3 py-3.5">
                  <button
                    onClick={() => handleDelete(user.username)}
                    disabled={user.username === "default"}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500",
                      user.username === "default" && "cursor-not-allowed"
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            No users match your search
          </div>
        )}
      </div>

      {showModal && <AclModal onClose={() => setShowModal(false)} onSave={handleSave} />}
    </div>
  );
}
