import { NextResponse } from "next/server";
import { PROXY_URL, WORKER_URL } from "@/lib/config";
import { fetchCacheData } from "@/lib/cache-api";
import type { Metrics, TelemetryEvent, TimelinePoint, ServiceHealth } from "@/lib/types";

async function fetchJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

export async function GET() {
  const [metrics, events, timeline, proxyHealth, workerHealth, cacheData] = await Promise.all([
    fetchJSON<Metrics>(`${PROXY_URL}/v1/metrics`, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      piiBlocked: 0,
      avgLatencyMs: 0,
      tokensSaved: 0,
      estimatedCostSaved: 0,
      cacheHitRate: 0,
      activeTenants: 1,
    }),
    fetchJSON<TelemetryEvent[]>(`${PROXY_URL}/v1/events`, []),
    fetchJSON<TimelinePoint[]>(`${PROXY_URL}/v1/timeline`, []),
    fetchJSON<{ status: string; redis: boolean }>(`${PROXY_URL}/health`, {
      status: "offline",
      redis: false,
    }),
    fetchJSON<{
      status: string;
      redis: boolean;
      groq_configured: boolean;
      embeddings_configured: boolean;
      embedding_model: string;
    }>(`${WORKER_URL}/health`, {
      status: "offline",
      redis: false,
      groq_configured: false,
      embeddings_configured: false,
      embedding_model: "",
    }),
    fetchCacheData(),
  ]);

  const health: ServiceHealth = {
    proxy: { status: proxyHealth.status, redis: proxyHealth.redis },
    worker: {
      status: workerHealth.status,
      redis: workerHealth.redis,
      groqConfigured: workerHealth.groq_configured,
      embeddingsConfigured: workerHealth.embeddings_configured,
      embeddingModel: workerHealth.embedding_model,
    },
  };

  return NextResponse.json({
    metrics,
    events,
    timeline,
    health,
    cacheStats: cacheData.stats,
    cacheEntries: cacheData.entries,
  });
}
