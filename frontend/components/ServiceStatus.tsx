"use client";

import type { ServiceHealth, CacheStats } from "@/lib/types";

interface ServiceStatusProps {
  health: ServiceHealth | null;
  cacheStats?: CacheStats | null;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs ring-1 ring-white/[0.06]">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400 live-dot" : "bg-amber-400"}`} />
      <span className="text-zinc-400">{label}</span>
    </span>
  );
}

export default function ServiceStatus({ health, cacheStats }: ServiceStatusProps) {
  const proxyOk = health?.proxy.status === "healthy" || health?.proxy.status === "degraded";
  const workerOk = health?.worker.status === "healthy";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill ok={proxyOk} label={`Proxy ${proxyOk ? "online" : "offline"}`} />
      <StatusPill ok={workerOk} label={`Worker ${workerOk ? "online" : "offline"}`} />
      <StatusPill ok={health?.proxy.redis ?? false} label="Redis" />
      {cacheStats && (
        <StatusPill ok={cacheStats.entryCount > 0} label={`${cacheStats.entryCount} cached prompts`} />
      )}
      {health && !health.worker.groqConfigured && (
        <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 ring-1 ring-amber-500/20">
          Groq key missing
        </span>
      )}
      {health && !health.worker.embeddingsConfigured && (
        <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 ring-1 ring-amber-500/20">
          Gemini key missing
        </span>
      )}
    </div>
  );
}
