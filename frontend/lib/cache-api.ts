import { PROXY_URL, WORKER_URL } from "@/lib/config";
import type { CacheEntry, CacheStats } from "@/lib/types";

const defaultStats: CacheStats = {
  entryCount: 0,
  embeddingDim: 768,
  threshold: 0.15,
  model: "gemini-embedding-001",
};

async function tryFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Proxy first, worker fallback — both read the same Redis keys. */
export async function fetchCacheData(): Promise<{
  stats: CacheStats;
  entries: CacheEntry[];
}> {
  let stats =
    (await tryFetch<CacheStats>(`${PROXY_URL}/v1/cache/stats`)) ??
    (await tryFetch<CacheStats>(`${WORKER_URL}/v1/cache/stats`));

  let entries =
    (await tryFetch<CacheEntry[]>(`${PROXY_URL}/v1/cache/entries`)) ??
    (await tryFetch<CacheEntry[]>(`${WORKER_URL}/v1/cache/entries`));

  return {
    stats: stats ?? defaultStats,
    entries: entries ?? [],
  };
}

export async function clearCacheData(): Promise<number> {
  for (const base of [PROXY_URL, WORKER_URL]) {
    try {
      const res = await fetch(`${base}/v1/cache`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        return data.removed ?? 0;
      }
    } catch {
      // try next
    }
  }
  return 0;
}
