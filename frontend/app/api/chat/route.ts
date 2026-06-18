import { NextRequest } from "next/server";
import { PROXY_URL } from "@/lib/config";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const messages = (body.messages ?? []).map(
    (m: { role: string; content: string }) => ({ role: m.role, content: m.content })
  );

  const upstream = await fetch(`${PROXY_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model ?? "llama-3.3-70b-versatile",
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache");

  const passthrough = [
    "x-aegismind-cache",
    "x-aegismind-latency-ms",
    "x-aegismind-pii-detected",
    "x-aegismind-pii-entities",
    "x-aegismind-similarity",
  ];
  for (const key of passthrough) {
    const val = upstream.headers.get(key);
    if (val) headers.set(key, val);
  }

  return new Response(upstream.body, { status: 200, headers });
}
