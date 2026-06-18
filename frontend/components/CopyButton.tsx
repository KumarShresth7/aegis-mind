"use client";

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="rounded-md bg-white/[0.04] px-2.5 py-1 text-[10px] text-zinc-500 ring-1 ring-white/[0.08] transition hover:text-white"
    >
      Copy
    </button>
  );
}
