import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AegisMind — LLM Gateway Control Plane",
  description: "Enterprise LLM gateway with semantic caching, PII redaction, and cost telemetry.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="font-sans text-zinc-100">
        <Sidebar />
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
