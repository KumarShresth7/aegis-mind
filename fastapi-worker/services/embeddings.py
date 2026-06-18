import os
from functools import lru_cache

import requests

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))
GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBEDDING_MODEL}:embedContent"
)


class EmbeddingService:
    """Google Gemini embeddings — free tier via Google AI Studio."""

    def is_configured(self) -> bool:
        return bool(GEMINI_API_KEY and GEMINI_API_KEY != "your-key-here")

    def embed(self, text: str, task_type: str = "SEMANTIC_SIMILARITY") -> list[float]:
        if not text or not text.strip():
            raise ValueError("Text is required for embedding")

        if not self.is_configured():
            raise RuntimeError(
                "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/apikey"
            )

        payload = {
            "model": f"models/{EMBEDDING_MODEL}",
            "content": {"parts": [{"text": text.strip()}]},
            "taskType": task_type,
            "outputDimensionality": EMBEDDING_DIM,
        }

        response = requests.post(
            GEMINI_EMBED_URL,
            params={"key": GEMINI_API_KEY},
            json=payload,
            timeout=30,
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Gemini embedding API error ({response.status_code}): {response.text}"
            )

        values = response.json().get("embedding", {}).get("values")
        if not values:
            raise RuntimeError("Gemini embedding API returned empty vector")

        return values

    @lru_cache(maxsize=512)
    def embed_cached(self, text: str, task_type: str) -> tuple[float, ...]:
        """LRU cache keyed by text + task_type to reduce API calls."""
        return tuple(self.embed(text, task_type))


embedding_service = EmbeddingService()
