import PageHeader from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";

const SNIPPETS = [
  {
    title: "cURL",
    lang: "bash",
    code: `curl -N http://localhost:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`,
  },
  {
    title: "Python (OpenAI SDK)",
    lang: "python",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="not-needed",
)

stream = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`,
  },
  {
    title: "Node.js",
    lang: "javascript",
    code: `const res = await fetch("http://localhost:8080/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  }),
});

const reader = res.body.getReader();
// ... stream SSE chunks`,
  },
];

const HEADERS = [
  { name: "X-AegisMind-Cache", desc: "HIT or MISS — was the response served from semantic cache?" },
  { name: "X-AegisMind-Latency-Ms", desc: "Total gateway latency in milliseconds" },
  { name: "X-AegisMind-Similarity", desc: "Cosine distance to nearest cached prompt (lower = closer)" },
  { name: "X-AegisMind-PII-Detected", desc: "true if PII was redacted before upstream call" },
  { name: "X-AegisMind-PII-Entities", desc: "Comma-separated list of detected entity types" },
];

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Integration"
        description="Drop-in OpenAI-compatible endpoint — point your SDK at the AegisMind proxy"
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mb-10 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Gateway URL</p>
          <div className="mt-2 flex items-center gap-3">
            <code className="text-lg font-semibold text-white">http://localhost:8080/v1</code>
            <CopyButton text="http://localhost:8080/v1" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            Compatible with any OpenAI SDK. PII scrubbing and semantic caching happen transparently.
          </p>
        </div>

        <div className="mb-10">
          <h2 className="mb-4 text-sm font-semibold text-white">Quick Start</h2>
          <div className="space-y-4">
            {SNIPPETS.map(({ title, code }) => (
              <div key={title} className="glass-card overflow-hidden rounded-2xl">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <span className="text-xs font-medium text-zinc-400">{title}</span>
                  <CopyButton text={code} />
                </div>
                <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-400">
                  <code>{code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-10">
          <h2 className="mb-4 text-sm font-semibold text-white">Response Headers</h2>
          <div className="glass-card divide-y divide-white/[0.06] rounded-2xl overflow-hidden">
            {HEADERS.map(({ name, desc }) => (
              <div key={name} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                <code className="shrink-0 text-xs text-blue-400">{name}</code>
                <p className="text-sm text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-semibold text-white">Architecture</h2>
          <div className="glass-card rounded-2xl p-6 font-mono text-xs leading-loose text-zinc-500">
            <p>Client → Go Proxy (:8080)</p>
            <p className="pl-4">├─ Gemini embedding lookup (Redis vector search)</p>
            <p className="pl-4">├─ Cache HIT → instant response</p>
            <p className="pl-4">└─ Cache MISS → FastAPI Worker (:8000)</p>
            <p className="pl-8">├─ Presidio PII redaction</p>
            <p className="pl-8">└─ Groq LLM → stream back + store in cache</p>
          </div>
        </div>
      </div>
    </div>
  );
}
