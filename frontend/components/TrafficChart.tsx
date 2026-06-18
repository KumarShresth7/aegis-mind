"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimelinePoint } from "@/lib/types";

interface TrafficChartProps {
  data: TimelinePoint[];
}

export default function TrafficChart({ data }: TrafficChartProps) {
  const hasData = data.some((d) => d.totalRequests > 0);

  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02]">
        <p className="text-sm text-zinc-600">Send requests through the gateway to see traffic</p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="hitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="time" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#12121a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              fontSize: "12px",
            }}
          />
          <Area type="monotone" dataKey="totalRequests" stroke="#60a5fa" strokeWidth={2} fill="url(#reqGrad)" name="Requests" />
          <Area type="monotone" dataKey="cacheHits" stroke="#34d399" strokeWidth={2} fill="url(#hitGrad)" name="Cache Hits" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
