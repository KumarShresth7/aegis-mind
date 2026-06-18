"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Shield,
  Zap,
  Trash2,
  Sparkles,
  Bot,
  User,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import type { ChatMessage, ChatMeta } from "@/lib/types";

const EXAMPLE_PROMPTS = [
  { label: "Explain caching", text: "Explain semantic caching in one paragraph." },
  { label: "Paraphrase test", text: "What is semantic caching? Describe it briefly." },
  { label: "PII demo", text: "My email is john.doe@company.com — summarize GDPR." },
];

const MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
];

function toApiMessages(messages: ChatMessage[]) {
  return messages.map(({ role, content }) => ({ role, content }));
}

function MetaBadges({ meta }: { meta: ChatMeta }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {meta.cache && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
            meta.cache === "HIT"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          <Zap className="h-2.5 w-2.5" />
          {meta.cache}
        </span>
      )}
      {meta.latencyMs != null && (
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
          {meta.latencyMs}ms
        </span>
      )}
      {meta.similarity != null && meta.cache === "HIT" && (
        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
          Δ {meta.similarity.toFixed(4)}
        </span>
      )}
      {meta.piiDetected && (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-400">
          <Shield className="h-2.5 w-2.5" />
          PII: {meta.piiEntities.join(", ")}
        </span>
      )}
    </div>
  );
}

export default function Playground() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const persistSession = useCallback(async (msgs: ChatMessage[], selectedModel: string) => {
    const complete = msgs.filter((m) => m.content.trim());
    if (complete.length === 0) return;
    await fetch("/api/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: complete, model: selectedModel }),
    });
  }, []);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
        if (data.model && MODELS.some((m) => m.id === data.model)) {
          setModel(data.model);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  async function clearChat() {
    await fetch("/api/session", { method: "DELETE" });
    setMessages([]);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...nextMessages, assistantMsg]);
    scrollToBottom();

    let meta: ChatMeta = {
      cache: null,
      latencyMs: null,
      similarity: null,
      piiDetected: false,
      piiEntities: [],
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: toApiMessages(nextMessages) }),
      });

      meta = {
        cache: (res.headers.get("x-aegismind-cache") as "HIT" | "MISS") ?? null,
        latencyMs: res.headers.get("x-aegismind-latency-ms")
          ? Number(res.headers.get("x-aegismind-latency-ms"))
          : null,
        similarity: res.headers.get("x-aegismind-similarity")
          ? Number(res.headers.get("x-aegismind-similarity"))
          : null,
        piiDetected: res.headers.get("x-aegismind-pii-detected") === "true",
        piiEntities: (res.headers.get("x-aegismind-pii-entities") ?? "").split(",").filter(Boolean),
      };

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${errText || res.statusText}`,
            meta,
          };
          void persistSession(updated, model);
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + delta };
                return updated;
              });
            }
          } catch {
            // skip
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], meta };
        void persistSession(updated, model);
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          meta,
        };
        void persistSession(updated, model);
        return updated;
      });
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Playground"
        description="Route prompts through the gateway — chats are saved to your session for 7 days"
        actions={
          <>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] focus:outline-none"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-zinc-900">
                  {m.label}
                </option>
              ))}
            </select>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-400 ring-1 ring-white/[0.08] transition hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden p-8">
        <div className="scrollbar-thin flex-1 overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          {!hydrated ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-600">Loading conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-8 py-12 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-2xl" />
                <div className="relative rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/10 p-5 ring-1 ring-blue-500/20">
                  <Sparkles className="h-10 w-10 text-blue-400" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Test your gateway</p>
                <p className="mt-2 max-w-sm text-sm text-zinc-500">
                  Send a prompt, then try a paraphrase to see semantic cache hits in action.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map(({ label, text }) => (
                  <button
                    key={label}
                    onClick={() => sendMessage(text)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs text-zinc-400 transition hover:border-blue-500/30 hover:bg-blue-500/5 hover:text-white"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      msg.role === "user"
                        ? "bg-blue-600/20 text-blue-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[75%] ${msg.role === "user" ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-white/[0.05] text-zinc-200 ring-1 ring-white/[0.06]"
                      }`}
                    >
                      {msg.content || (streaming && i === messages.length - 1 ? (
                        <span className="inline-flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                        </span>
                      ) : "")}
                    </div>
                    {msg.meta && <MetaBadges meta={msg.meta} />}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a prompt through the gateway…"
            disabled={streaming}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
