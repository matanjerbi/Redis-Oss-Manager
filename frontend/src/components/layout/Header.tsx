"use client";
import { usePathname } from "next/navigation";
import { Search, Bell, ChevronRight, RefreshCw, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const BREADCRUMB_MAP: Record<string, string> = {
  overview: "Overview",
  clusters: "Clusters",
  acl: "ACL Manager",
  configurations: "Configurations",
  logs: "Logs",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm">
      <span className="font-medium text-[#D2232A]">Redis OSS Manager</span>
      {segments.map((seg, i) => {
        const label = BREADCRUMB_MAP[seg] ?? seg;
        const isLast = i === segments.length - 1;
        return (
          <span key={seg} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            <span
              className={cn(
                isLast
                  ? "font-semibold text-gray-900"
                  : "text-gray-500 hover:text-gray-700 cursor-pointer"
              )}
            >
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}

export function Header() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-5">
      <Breadcrumbs />

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search clusters, keys…"
            className="h-8 w-56 rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:border-[#D2232A] focus:bg-white focus:ring-1 focus:ring-[#D2232A]/20"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
          title="Refresh data"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-[#D2232A]")}
          />
        </button>

        {/* Notifications */}
        <button className="relative flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:bg-gray-50">
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#D2232A]" />
        </button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-gray-200" />

        {/* User */}
        <button className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 transition hover:bg-gray-50">
          <UserCircle2 className="h-5 w-5 text-gray-400" />
          <span className="font-medium">Admin</span>
        </button>
      </div>
    </header>
  );
}
