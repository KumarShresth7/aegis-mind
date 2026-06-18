export interface Metrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  piiBlocked: number;
  avgLatencyMs: number;
  tokensSaved: number;
  estimatedCostSaved: number;
  cacheHitRate: number;
  activeTenants: number;
}

export interface TelemetryEvent {
  type: "cache_hit" | "pii_blocked" | string;
  message: string;
  detail?: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface TimelinePoint {
  time: string;
  totalRequests: number;
  cacheHits: number;
}

export interface ServiceHealth {
  proxy: { status: string; redis: boolean };
  worker: {
    status: string;
    redis: boolean;
    groqConfigured: boolean;
    embeddingsConfigured?: boolean;
    embeddingModel?: string;
  };
}

export interface CacheStats {
  entryCount: number;
  embeddingDim: number;
  threshold: number;
  model: string;
}

export interface CacheEntry {
  key: string;
  prompt: string;
  responsePreview: string;
  responseLength: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  meta?: ChatMeta;
}

export interface ChatMeta {
  cache: "HIT" | "MISS" | null;
  latencyMs: number | null;
  similarity: number | null;
  piiDetected: boolean;
  piiEntities: string[];
}
