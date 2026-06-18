"use client";

interface HitRateRingProps {
  rate: number;
  size?: number;
}

export default function HitRateRing({ rate, size = 120 }: HitRateRingProps) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 50 ? "#34d399" : rate >= 20 ? "#fbbf24" : "#71717a";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-white">{rate.toFixed(0)}%</p>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Hit rate</p>
      </div>
    </div>
  );
}
