# AegisMind

Enterprise LLM gateway with semantic caching, PII redaction, and live telemetry.

## Architecture

```
Client → Next.js UI (:3000)
              ↓
         Go Proxy (:8080)  ← semantic cache (Redis Stack + Gemini embeddings)
              ↓
      FastAPI Worker (:8000)  ← Presidio PII scrubbing + embedding API
              ↓
           Groq API
```

## Quick Start

### 1. Start Redis

```bash
docker compose up -d
```

### 2. Start the FastAPI worker

```bash
cd fastapi-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_lg
```

Copy the example env file and fill in your keys:

```bash
cp fastapi-worker/.env.example fastapi-worker/.env
```

Get a free Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey).

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Start the Go proxy

```bash
cd go-proxy
go run ./cmd/server
```

### 4. Start the dashboard

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the control room, or `/playground` to test the gateway.

## Semantic Cache

Uses **Google Gemini `gemini-embedding-001`** (768-dim, free tier) with `SEMANTIC_SIMILARITY`:

- **Threshold**: cosine distance ≤ `0.15` (configurable via `CACHE_DISTANCE_THRESHOLD`)
- After upgrading, flush stale entries once: `RECREATE_CACHE_INDEX=true go run ./cmd/server`

### Test semantic cache hits

1. Send: `Explain semantic caching in one paragraph.` → Cache **MISS** (first time)
2. Send the same prompt again → Cache **HIT**
3. Send: `What is semantic caching? Describe it briefly.` → Cache **HIT** (paraphrase match)

## Features

- **Semantic cache** — Gemini embeddings + Redis vector search intercept similar prompts
- **PII guard** — Presidio redacts emails, SSNs, phone numbers, and more before upstream calls
- **Live telemetry** — Dashboard shows cost savings, cache hit rate, latency, and security events
- **Playground** — Interactive chat UI with cache/PII/similarity badges

## API Endpoints

| Service | Endpoint | Description |
|---------|----------|-------------|
| Go Proxy | `POST /v1/chat/completions` | OpenAI-compatible gateway |
| Go Proxy | `GET /v1/metrics` | Aggregated telemetry |
| Go Proxy | `GET /v1/events` | Recent security/cache events |
| Go Proxy | `GET /v1/timeline` | 30-minute traffic chart data |
| Worker | `POST /v1/embeddings` | Generate Gemini embedding vector |
| Worker | `GET /health` | Worker health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google AI Studio key (required for cache) |
| `GROQ_API_KEY` | — | Groq key (required for LLM) |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Gemini embedding model |
| `EMBEDDING_DIM` | `768` | Output vector dimensions |
| `CACHE_DISTANCE_THRESHOLD` | `0.15` | Max cosine distance for cache hit |
| `RECREATE_CACHE_INDEX` | `false` | Set `true` once to rebuild Redis index after dimension change |
