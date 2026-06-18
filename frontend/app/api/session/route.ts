import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WORKER_URL } from "@/lib/config";

const SESSION_COOKIE = "aegismind_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return id;
}

export async function GET() {
  const sessionId = await getOrCreateSessionId();
  try {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${sessionId}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ messages: [], model: "llama-3.3-70b-versatile" });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ messages: [], model: "llama-3.3-70b-versatile" });
  }
}

export async function PUT(req: NextRequest) {
  const sessionId = await getOrCreateSessionId();
  const body = await req.json();

  try {
    const res = await fetch(`${WORKER_URL}/v1/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: body.messages ?? [],
        model: body.model ?? "llama-3.3-70b-versatile",
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function DELETE() {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: true });
  }

  try {
    await fetch(`${WORKER_URL}/v1/sessions/${sessionId}`, { method: "DELETE" });
  } catch {
    // still clear cookie below
  }

  jar.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  const id = crypto.randomUUID();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
