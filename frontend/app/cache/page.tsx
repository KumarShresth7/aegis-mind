"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Trash2, RefreshCw, Zap, Layers } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import type { CacheEntry, CacheStats } from "@/lib/types";

export default function CachePage() {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cache");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
        setStats(data.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function clearCache() {
    if (!confirm("Clear all cached responses? This cannot be undone.")) return;
    setClearing(true);
    try {
      await fetch("/api/cache", { method: "DELETE" });
      await refresh();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Semantic Cache"
        description="Gemini embeddings stored in Redis vector index — matched by meaning, not exact text"
        actions={
          <>
            <button
              onClick={refresh}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] transition hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {entries.length > 0 && (
              <button
                onClick={clearCache}
                disabled={clearing}
                className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400 ring-1 ring-rose-500/20 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? "Clearing…" : "Purge Cache"}
              </button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2.5">
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.entryCount ?? 0}</p>
                <p className="text-xs text-zinc-500">Cached entries</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2.5">
                <Layers className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats?.embeddingDim ?? 768}d</p>
                <p className="text-xs text-zinc-500">{stats?.model ?? "gemini-embedding-001"}</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2.5">
                <Zap className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">≤ {stats?.threshold ?? 0.15}</p>
                <p className="text-xs text-zinc-500">Cosine distance threshold</p>
              </div>
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] py-20">
            <Database className="h-12 w-12 text-zinc-700" />
            <p className="text-sm text-zinc-500">No cached responses yet</p>
            <p className="text-xs text-zinc-600">Send a prompt in the Playground to seed the cache</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="glass-card glass-card-hover animate-fade-up rounded-2xl p-5"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-white">{entry.prompt}</p>
                  <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400">
                    {entry.responseLength.toLocaleString()} chars
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-500">{entry.responsePreview}</p>
                <p className="mt-2 font-mono text-[10px] text-zinc-700">{entry.key}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
