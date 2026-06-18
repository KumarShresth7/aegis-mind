import { NextResponse } from "next/server";
import { PROXY_URL, WORKER_URL } from "@/lib/config";

export async function GET() {
  const [proxy, worker] = await Promise.allSettled([
    fetch(`${PROXY_URL}/health`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`${WORKER_URL}/health`, { cache: "no-store" }).then((r) => r.json()),
  ]);

  return NextResponse.json({
    proxy: proxy.status === "fulfilled" ? proxy.value : { status: "offline", redis: false },
    worker:
      worker.status === "fulfilled"
        ? {
            status: worker.value.status,
            redis: worker.value.redis,
            groqConfigured: worker.value.groq_configured,
            embeddingsConfigured: worker.value.embeddings_configured,
            embeddingModel: worker.value.embedding_model,
          }
        : { status: "offline", redis: false, groqConfigured: false, embeddingsConfigured: false },
  });
}
