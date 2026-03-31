"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  ScrollText,
  ChevronRight,
  DatabaseZap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Clusters", href: "/clusters", icon: Server },
  { label: "Logs", href: "/logs", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 bg-[#D2232A] px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-white/20">
          <DatabaseZap className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-red-100">
            Redis OSS
          </p>
          <p className="text-[13px] font-bold text-white">Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Navigation
        </p>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-red-50 text-[#D2232A]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors",
                  active ? "text-[#D2232A]" : "text-gray-400 group-hover:text-gray-600"
                )}
              />
              <span className="flex-1">{label}</span>
              {active && (
                <ChevronRight className="h-3 w-3 text-[#D2232A] opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
          <div className="flex h-2 w-2 items-center justify-center">
            <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          </div>
          <p className="text-[11px] text-gray-500">
            Backend <span className="font-medium text-emerald-600">online</span>
          </p>
        </div>
        <p className="mt-2 px-1 text-[10px] text-gray-400">v1.0.0 · Redis OSS Manager</p>
      </div>
    </aside>
  );
}
