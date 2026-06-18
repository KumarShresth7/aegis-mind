import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  glow?: string;
  subtext?: string;
  trend?: string;
}

export default function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  glow = "from-blue-500/5",
  subtext,
  trend,
}: MetricCardProps) {
  return (
    <div className={`glass-card glass-card-hover group relative overflow-hidden rounded-2xl p-5`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${glow} to-transparent opacity-0 transition-opacity group-hover:opacity-100`} />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</h3>
          <div className={`rounded-lg bg-white/[0.04] p-2 ring-1 ring-white/[0.06]`}>
            <Icon className={accent} size={16} />
          </div>
        </div>
        <p className={`text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
        <div className="mt-2 flex items-center justify-between">
          {subtext && <p className="text-xs text-zinc-600">{subtext}</p>}
          {trend && <span className="text-xs text-emerald-400/80">{trend}</span>}
        </div>
      </div>
    </div>
  );
}
