"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Database,
  BookOpen,
  Shield,
  Radio,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/playground", label: "Playground", icon: MessageSquare },
  { href: "/cache", label: "Cache", icon: Database },
  { href: "/docs", label: "Integration", icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) return;
        const data = await res.json();
        setOnline(data.proxy?.status === "healthy" && data.worker?.status === "healthy");
      } catch {
        setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="app-sidebar flex flex-col border-r border-white/[0.06]">
      {/* Brand */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-5">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/25 to-emerald-500/10 ring-1 ring-blue-500/30">
          <Shield className="h-5 w-5 text-blue-400" />
          {online && (
            <span className="live-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#09090b]" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-white">AegisMind</p>
          <p className="truncate text-[11px] text-zinc-500">LLM Gateway</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Menu
        </p>
        <ul className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25"
                      : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      active ? "text-blue-400" : "text-zinc-500"
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer — extra bottom padding clears Next.js dev badge */}
      <div className="shrink-0 space-y-3 border-t border-white/[0.06] p-4 pb-10">
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
          <Radio className={`h-3.5 w-3.5 shrink-0 ${online ? "text-emerald-400" : "text-zinc-600"}`} />
          <span className="text-xs text-zinc-400">
            {online ? "Gateway online" : "Gateway offline"}
          </span>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-3 ring-1 ring-white/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Endpoint
          </p>
          <code className="mt-1.5 block break-all text-[11px] leading-relaxed text-blue-400/90">
            localhost:8080/v1
          </code>
        </div>
      </div>
    </aside>
  );
}
