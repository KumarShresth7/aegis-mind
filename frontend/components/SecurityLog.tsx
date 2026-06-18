"use client";

import { ShieldAlert, Zap, Clock } from "lucide-react";
import type { TelemetryEvent } from "@/lib/types";

interface SecurityLogProps {
  events: TelemetryEvent[];
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function eventIcon(type: string) {
  if (type === "pii_blocked") return ShieldAlert;
  if (type === "cache_hit") return Zap;
  return Clock;
}

export default function SecurityLog({ events }: SecurityLogProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8">
        <ShieldAlert className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-600">No events yet</p>
        <p className="text-xs text-zinc-700">Activity appears as you use the gateway</p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
      {events.map((event, i) => {
        const isPii = event.type === "pii_blocked";
        const isCache = event.type === "cache_hit";
        const Icon = eventIcon(event.type);

        return (
          <div
            key={`${event.timestamp}-${i}`}
            className="animate-fade-up flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                isPii
                  ? "bg-rose-500/10 text-rose-400"
                  : isCache
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-800 text-zinc-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-sm font-medium ${
                    isPii ? "text-rose-400" : isCache ? "text-emerald-400" : "text-zinc-300"
                  }`}
                >
                  {event.message}
                </p>
                <span className="shrink-0 text-[10px] text-zinc-600">{formatTime(event.timestamp)}</span>
              </div>
              {event.detail && <p className="mt-0.5 truncate text-xs text-zinc-600">{event.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
