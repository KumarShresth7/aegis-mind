import os

import redis

THRESHOLD = float(os.getenv("CACHE_DISTANCE_THRESHOLD", "0.15"))
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")


class CacheStore:
    def __init__(self):
        addr = os.getenv("REDIS_ADDR", "localhost:6379")
        try:
            self.client = redis.Redis.from_url(f"redis://{addr}", decode_responses=True)
            self.client.ping()
            self.enabled = True
        except redis.RedisError:
            self.client = None
            self.enabled = False

    def stats(self) -> dict:
        count = 0
        if self.enabled:
            count = len(self.client.keys("prompt:*"))
        return {
            "entryCount": count,
            "embeddingDim": EMBEDDING_DIM,
            "threshold": THRESHOLD,
            "model": EMBEDDING_MODEL,
        }

    def list_entries(self, limit: int = 50) -> list[dict]:
        if not self.enabled or limit <= 0:
            return []

        keys = sorted(self.client.keys("prompt:*"))[:limit]
        entries = []
        for key in keys:
            prompt = self.client.hget(key, "original_text")
            response = self.client.hget(key, "response_text")
            if not prompt:
                continue
            preview = response or ""
            if len(preview) > 120:
                preview = preview[:120] + "…"
            entries.append(
                {
                    "key": key,
                    "prompt": prompt,
                    "responsePreview": preview,
                    "responseLength": len(response or ""),
                }
            )
        return entries

    def clear_all(self) -> int:
        if not self.enabled:
            return 0
        keys = self.client.keys("prompt:*")
        if not keys:
            return 0
        self.client.delete(*keys)
        return len(keys)


cache_store = CacheStore()
