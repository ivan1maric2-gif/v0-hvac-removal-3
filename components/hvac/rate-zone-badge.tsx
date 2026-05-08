"use client";

import { calcRateZone } from "@/lib/preporuka";
import type { RateZone, RateZoneStatus } from "@/lib/preporuka";

// ─── Colour map ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<
  RateZoneStatus,
  { badge: string; dot: string }
> = {
  "Jaka reakcija": {
    badge: "bg-green-50 border-green-200 text-green-800",
    dot: "bg-green-500",
  },
  "Normalna reakcija": {
    badge: "bg-blue-50 border-blue-200 text-blue-700",
    dot: "bg-blue-500",
  },
  "Slaba reakcija": {
    badge: "bg-amber-50 border-amber-200 text-amber-700",
    dot: "bg-amber-400",
  },
};

// ─── Trend arrow ──────────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: RateZone["trend"] }) {
  if (trend === "up") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    );
  }
  if (trend === "down") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    );
  }
  // stable
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

// ─── Compact inline badge (used in measurement timeline rows) ─────────────────

interface RateZoneBadgeProps {
  /** Raw ΔpH/min value from Mjerenje.phRatePerMinute */
  rate: number | undefined | null;
  /** If true, also shows the meaning text below the badge. Default false. */
  showMeaning?: boolean;
}

export function RateZoneBadge({ rate, showMeaning = false }: RateZoneBadgeProps) {
  const zone = calcRateZone(rate);
  if (!zone) return null;

  const styles = STATUS_STYLES[zone.status];
  const sign = zone.rate > 0 ? "+" : "";

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className={`inline-flex items-center gap-1.5 border rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${styles.badge}`}
        title={zone.meaning}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
        {zone.status}
        <TrendArrow trend={zone.trend} />
        <span className="font-mono opacity-80">
          {sign}{zone.rate.toFixed(3)}/min
        </span>
      </span>
      {showMeaning && (
        <span className="text-[10px] text-muted-foreground leading-tight pl-0.5">
          {zone.meaning}
        </span>
      )}
    </span>
  );
}
