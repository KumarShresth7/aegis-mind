import os
import requests
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from services.pii import pii_service
from services.telemetry import telemetry
from services.cache_store import cache_store
from services.session_store import session_store
from services.embeddings import embedding_service, EMBEDDING_DIM, EMBEDDING_MODEL


def _load_env_file() -> None:
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

app = FastAPI(title="AegisMind Intelligence Worker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your-key-here")
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


class EmbeddingRequest(BaseModel):
    text: str
    task_type: str = Field(
        default="SEMANTIC_SIMILARITY",
        description="Gemini task type: SEMANTIC_SIMILARITY (recommended for cache), RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT",
    )


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dimensions: int
    model: str
    task_type: str


class SessionSaveRequest(BaseModel):
    messages: list[dict] = Field(default_factory=list)
    model: str = "llama-3.3-70b-versatile"


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "aegismind-worker",
        "redis": telemetry.enabled,
        "groq_configured": GROQ_API_KEY != "your-key-here",
        "embeddings_configured": embedding_service.is_configured(),
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimensions": EMBEDDING_DIM,
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def create_embedding(body: EmbeddingRequest):
    try:
        vector = embedding_service.embed(body.text, body.task_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return EmbeddingResponse(
        embedding=vector,
        dimensions=len(vector),
        model=EMBEDDING_MODEL,
        task_type=body.task_type,
    )


@app.get("/v1/cache/stats")
async def cache_stats():
    return cache_store.stats()


@app.get("/v1/cache/entries")
async def cache_entries():
    return cache_store.list_entries(50)


@app.delete("/v1/cache")
async def cache_clear():
    removed = cache_store.clear_all()
    return {"removed": removed}


@app.get("/v1/sessions/{session_id}")
async def get_session(session_id: str):
    try:
        return session_store.get(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/v1/sessions/{session_id}")
async def save_session(session_id: str, body: SessionSaveRequest):
    try:
        # Only persist UI-safe fields
        clean_messages = [
            {
                "role": m.get("role"),
                "content": m.get("content", ""),
                **({"meta": m["meta"]} if m.get("meta") else {}),
            }
            for m in body.messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]
        session_store.save(session_id, clean_messages, body.model)
        return {"ok": True, "count": len(clean_messages)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/v1/sessions/{session_id}")
async def delete_session(session_id: str):
    try:
        session_store.delete(session_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/chat/completions")
async def process_llm_request(request: Request):
    body = await request.json()
    pii_detected = False
    pii_entities: list[str] = []

    messages = [
        {"role": m.get("role"), "content": m.get("content", "")}
        for m in body.get("messages", [])
        if m.get("role") and m.get("content") is not None
    ]
    body["messages"] = messages

    if messages:
        original_text = messages[-1]["content"]

        redaction_result = pii_service.sanitize_text(original_text)
        sanitized_text = redaction_result["sanitized_text"]

        if redaction_result["has_pii"]:
            pii_detected = True
            pii_entities = list(redaction_result["mapping"].keys())
            print(f"\n[PII DETECTED & BLOCKED]")
            print(f"Original: {original_text}")
            print(f"Scrubbed: {sanitized_text}\n")

            for entity in pii_entities:
                preview = sanitized_text[:80] if len(sanitized_text) > 80 else sanitized_text
                telemetry.record_pii_block(entity, f"[REDACTED] {preview}")

        messages[-1]["content"] = sanitized_text

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    upstream_response = requests.post(
        GROQ_CHAT_URL,
        headers=headers,
        json=body,
        stream=body.get("stream", False),
    )

    if upstream_response.status_code != 200:
        print(f"[Upstream Error] {upstream_response.text}")
        try:
            err = upstream_response.json()
            detail = err.get("error", {}).get("message") or err.get("detail") or "Upstream error"
        except Exception:
            detail = upstream_response.text or "Upstream error"
        raise HTTPException(status_code=upstream_response.status_code, detail=detail)

    response_headers = {
        "X-AegisMind-PII-Detected": "true" if pii_detected else "false",
        "X-AegisMind-PII-Entities": ",".join(pii_entities) if pii_entities else "",
    }

    def stream_chunks():
        for chunk in upstream_response.iter_content(chunk_size=1024):
            if chunk:
                yield chunk

    return StreamingResponse(
        stream_chunks(),
        media_type="text/event-stream",
        headers=response_headers,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
