"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShieldAlert,
  Zap,
  Activity,
  RefreshCw,
  ArrowRight,
  Database,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import TrafficChart from "@/components/TrafficChart";
import SecurityLog from "@/components/SecurityLog";
import ServiceStatus from "@/components/ServiceStatus";
import HitRateRing from "@/components/HitRateRing";
import type { Metrics, TelemetryEvent, TimelinePoint, ServiceHealth, CacheStats } from "@/lib/types";

const emptyMetrics: Metrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  piiBlocked: 0,
  avgLatencyMs: 0,
  tokensSaved: 0,
  estimatedCostSaved: 0,
  cacheHitRate: 0,
  activeTenants: 1,
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) return;
      const data = await res.json();
      setMetrics(data.metrics);
      setEvents(data.events);
      setTimeline(data.timeline);
      setHealth(data.health);
      setCacheStats(data.cacheStats);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Control Room"
        description="Real-time gateway telemetry · semantic cache · threat detection"
        actions={
          <>
            {lastUpdated && (
              <span className="text-xs text-zinc-600">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
            <button
              onClick={refresh}
              className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] transition hover:bg-white/[0.08] hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-8">
        {/* Hero banner */}
        <div className="animate-fade-up mb-8 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-r from-blue-500/10 via-transparent to-emerald-500/10 p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-blue-400/80">
                AegisMind Gateway
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                <span className="gradient-text">{metrics.totalRequests}</span> requests processed
              </h2>
              <p className="mt-2 max-w-lg text-sm text-zinc-500">
                Every prompt passes through PII scrubbing and semantic cache before reaching the LLM.
                You&apos;ve saved an estimated{" "}
                <span className="font-medium text-emerald-400">
                  ${metrics.estimatedCostSaved.toFixed(2)}
                </span>{" "}
                so far.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <HitRateRing rate={metrics.cacheHitRate} />
              <div className="hidden flex-col gap-2 sm:flex">
                <Link
                  href="/playground"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  Open Playground <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/cache"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-4 py-2 text-sm text-zinc-400 ring-1 ring-white/[0.08] transition hover:text-white"
                >
                  <Database className="h-4 w-4" /> View Cache
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <ServiceStatus health={health} cacheStats={cacheStats} />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Cost Saved"
            value={`$${metrics.estimatedCostSaved.toFixed(2)}`}
            icon={DollarSign}
            accent="text-emerald-400"
            glow="from-emerald-500/10"
            subtext={`${metrics.tokensSaved.toLocaleString()} tokens cached`}
          />
          <MetricCard
            label="PII Blocked"
            value={metrics.piiBlocked.toLocaleString()}
            icon={ShieldAlert}
            accent="text-rose-400"
            glow="from-rose-500/10"
            subtext="Redacted before upstream"
          />
          <MetricCard
            label="Avg Latency"
            value={`${Math.round(metrics.avgLatencyMs)}ms`}
            icon={Zap}
            accent="text-amber-400"
            glow="from-amber-500/10"
            subtext={`${metrics.cacheHits} hits · ${metrics.cacheMisses} misses`}
          />
          <MetricCard
            label="Total Requests"
            value={metrics.totalRequests.toLocaleString()}
            icon={Activity}
            accent="text-blue-400"
            glow="from-blue-500/10"
            subtext={`${metrics.cacheHitRate.toFixed(1)}% cache hit rate`}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="glass-card rounded-2xl p-6 lg:col-span-2">
            <h2 className="mb-1 text-sm font-semibold text-white">Traffic & Cache Intercepts</h2>
            <p className="mb-5 text-xs text-zinc-600">Last 30 minutes</p>
            <TrafficChart data={timeline} />
          </div>

          <div className="glass-card flex flex-col rounded-2xl p-6">
            <h2 className="mb-1 text-sm font-semibold text-white">Live Activity</h2>
            <p className="mb-4 text-xs text-zinc-600">Security & cache events</p>
            <SecurityLog events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
