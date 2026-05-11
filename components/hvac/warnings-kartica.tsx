"use client";

// ─── Warnings & Recommendations Kartica ──────────────────────────────────────
//
// Standalone UI widget koji prikazuje output iz generateDynamicWarnings().
//
// Sekcije:
//   1. Header — broj aktivnih warninga + severity summary
//   2. Warning lista — sortirana critical → warning → caution → info
//      Svaki warning: ikona, kategorija badge, naslov, poruka, akcija, triggeredBy
//   3. Reaction Trend — phTrend, flowTrend, consumptionRate, intenzitet
//   4. Active Recommendation — iz LiveReactionState
//
// VAŽNO: Warnings su product-specific — uvijek prikazati engineId/name.

import React from "react";
import type { DynamicWarning, ReactionTrend, WarningLevel } from "@/lib/live-interpretation";
import { CHEMISTRY_CONSUMPTION_RATE_LABEL } from "@/lib/live-interpretation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function levelBg(level: WarningLevel): string {
  switch (level) {
    case "critical": return "bg-red-50 border-red-200";
    case "warning":  return "bg-amber-50 border-amber-200";
    case "caution":  return "bg-yellow-50 border-yellow-200";
    case "info":     return "bg-sky-50 border-sky-200";
  }
}

function levelText(level: WarningLevel): string {
  switch (level) {
    case "critical": return "text-red-700";
    case "warning":  return "text-amber-700";
    case "caution":  return "text-yellow-700";
    case "info":     return "text-sky-700";
  }
}

function levelSubText(level: WarningLevel): string {
  switch (level) {
    case "critical": return "text-red-500";
    case "warning":  return "text-amber-500";
    case "caution":  return "text-yellow-500";
    case "info":     return "text-sky-500";
  }
}

function levelBadge(level: WarningLevel): string {
  switch (level) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "warning":  return "bg-amber-100 text-amber-700 border-amber-200";
    case "caution":  return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "info":     return "bg-sky-100 text-sky-700 border-sky-200";
  }
}

function levelLabel(level: WarningLevel): string {
  switch (level) {
    case "critical": return "CRITICAL";
    case "warning":  return "WARNING";
    case "caution":  return "CAUTION";
    case "info":     return "INFO";
  }
}

function categoryLabel(cat: DynamicWarning["category"]): string {
  switch (cat) {
    case "chemistry":     return "Kemija";
    case "saturation":    return "Saturation";
    case "thermal":       return "Thermal";
    case "compatibility": return "Kompatibilnost";
    case "flow":          return "Protok";
    case "contamination": return "Kontaminacija";
    case "finish_cycle":  return "Završetak";
  }
}

function WarningIcon({ level }: { level: WarningLevel }) {
  if (level === "critical") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      </svg>
    );
  }
  if (level === "warning") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      </svg>
    );
  }
  if (level === "caution") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  );
}

// ─── Reaction Trend Row ───────────────────────────────────────────────────────

interface TrendRowProps {
  label: string;
  value: string;
  valueColor?: string;
  delta?: string;
}

function TrendRow({ label, value, valueColor = "text-foreground/80", delta }: TrendRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {delta && (
          <span className="text-[9px] font-mono text-muted-foreground/50">{delta}</span>
        )}
        <span className={`text-[11px] font-semibold ${valueColor}`}>{value}</span>
      </div>
    </div>
  );
}

function phTrendColor(trend: ReactionTrend["phTrend"]): string {
  switch (trend) {
    case "raste":    return "text-amber-400";
    case "pada":     return "text-green-400";
    case "stagnira": return "text-sky-400";
    default:         return "text-muted-foreground/60";
  }
}

function flowTrendColor(trend: ReactionTrend["flowTrend"]): string {
  switch (trend) {
    case "nagli_rast": return "text-green-300";
    case "raste":      return "text-green-400";
    case "stagnira":   return "text-amber-400";
    case "pada":       return "text-amber-500";
    case "nagli_pad":  return "text-red-400";
    default:           return "text-muted-foreground/60";
  }
}

function consumptionColor(rate: ReactionTrend["chemistryConsumptionRate"]): string {
  switch (rate) {
    case "slow":   return "text-green-400";
    case "normal": return "text-sky-400";
    case "rapid":  return "text-rose-400";
    default:       return "text-muted-foreground/60";
  }
}

function intensityColor(intensity: ReactionTrend["reactionIntensity"]): string {
  switch (intensity) {
    case "visoka":  return "text-green-400";
    case "srednja": return "text-sky-400";
    case "niska":   return "text-amber-400";
    case "nema":    return "text-rose-400/70";
    default:        return "text-muted-foreground/60";
  }
}

function flowTrendLabel(trend: ReactionTrend["flowTrend"]): string {
  switch (trend) {
    case "nagli_rast": return "Nagli rast";
    case "raste":      return "Raste";
    case "stagnira":   return "Stagnira";
    case "pada":       return "Pada";
    case "nagli_pad":  return "Nagli pad";
    default:           return "Nepoznato";
  }
}

function phTrendLabel(trend: ReactionTrend["phTrend"]): string {
  switch (trend) {
    case "raste":    return "Raste";
    case "pada":     return "Pada";
    case "stagnira": return "Stagnira";
    default:         return "Nepoznato";
  }
}

function saturationTrendLabel(trend: ReactionTrend["saturationTrend"]): string {
  switch (trend) {
    case "stabilno":  return "Stabilno";
    case "raste":     return "Raste";
    case "kritično":  return "Kritično";
    default:          return "Nepoznato";
  }
}

function saturationTrendColor(trend: ReactionTrend["saturationTrend"]): string {
  switch (trend) {
    case "stabilno":  return "text-green-400";
    case "raste":     return "text-amber-400";
    case "kritično":  return "text-rose-400";
    default:          return "text-muted-foreground/60";
  }
}

// ─── Header severity summary ──────────────────────────────────────────────────

interface SeverityDotProps { count: number; level: WarningLevel }

function SeverityDot({ count, level }: SeverityDotProps) {
  if (count === 0) return null;
  const dotColor =
    level === "critical" ? "bg-red-500" :
    level === "warning"  ? "bg-amber-500" :
    level === "caution"  ? "bg-yellow-400" :
    "bg-sky-500";
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-[10px] font-bold text-foreground/70 tabular-nums">{count}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WarningsKarticaProps {
  warnings: DynamicWarning[];
  trend?: ReactionTrend;
  engineName?: string;
  /** Preporuka iz LiveReactionState */
  recommendation?: string;
  recommendationDetail?: string;
}

export function WarningsKartica({
  warnings,
  trend,
  engineName,
  recommendation,
  recommendationDetail,
}: WarningsKarticaProps) {
  const criticalCount = warnings.filter((w) => w.level === "critical").length;
  const warningCount  = warnings.filter((w) => w.level === "warning").length;
  const cautionCount  = warnings.filter((w) => w.level === "caution").length;
  const infoCount     = warnings.filter((w) => w.level === "info").length;

  const topLevel: WarningLevel | null =
    criticalCount > 0 ? "critical" :
    warningCount  > 0 ? "warning"  :
    cautionCount  > 0 ? "caution"  :
    infoCount     > 0 ? "info"     :
    null;

  const headerBorder =
    topLevel === "critical" ? "border-red-200"    :
    topLevel === "warning"  ? "border-amber-200"  :
    topLevel === "caution"  ? "border-yellow-200" :
    topLevel === "info"     ? "border-sky-200"    :
    "border-border";

  return (
    <div className={`rounded-xl border overflow-hidden bg-card ${headerBorder}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Warnings &amp; Recommendations
          </span>
          {engineName && (
            <>
              <span className="text-[9px] text-muted-foreground/30">·</span>
              <span className="text-[9px] text-muted-foreground/50">{engineName}</span>
            </>
          )}
        </div>
        {/* Severity summary dots */}
        <div className="flex items-center gap-2">
          <SeverityDot count={criticalCount} level="critical" />
          <SeverityDot count={warningCount}  level="warning" />
          <SeverityDot count={cautionCount}  level="caution" />
          <SeverityDot count={infoCount}     level="info" />
          {warnings.length === 0 && (
            <span className="text-[10px] text-muted-foreground/40">Nema upozorenja</span>
          )}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-white/5">

        {/* ── Warning lista ── */}
        {warnings.length > 0 && (
          <div className="px-3 py-3 flex flex-col gap-2">
            {warnings.map((w, i) => (
              <div key={i} className={`rounded-xl border px-3 py-3 flex flex-col gap-1.5 ${levelBg(w.level)}`}>
                {/* Warning header: ikona + level badge + kategorija + naslov */}
                <div className="flex items-start gap-2">
                  <span className={levelText(w.level)}>
                    <WarningIcon level={w.level} />
                  </span>
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${levelBadge(w.level)}`}>
                        {levelLabel(w.level)}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50">
                        {categoryLabel(w.category)}
                      </span>
                    </div>
                    <span className={`text-xs font-bold leading-tight ${levelText(w.level)}`}>
                      {w.title}
                    </span>
                  </div>
                </div>
                {/* Poruka */}
                <p className={`text-[11px] leading-relaxed whitespace-pre-line ${levelText(w.level)}`}>
                  {w.message}
                </p>
                {/* Akcija */}
                {w.action && (
                  <div className="flex items-start gap-1.5 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      className={`shrink-0 mt-0.5 ${levelText(w.level)}`}>
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    <span className={`text-[10px] font-semibold leading-relaxed ${levelText(w.level)}`}>
                      {w.action}
                    </span>
                  </div>
                )}
                {/* triggeredBy */}
                {w.triggeredBy && (
                  <p className={`text-[9px] leading-relaxed mt-0.5 ${levelSubText(w.level)}`}>
                    Trigger: {w.triggeredBy}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Reaction Trend ── */}
        {trend && (
          <div className="px-4 py-3 flex flex-col gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Trend reakcije
            </span>
            <div className="flex flex-col gap-1.5">
              <TrendRow
                label="pH trend"
                value={phTrendLabel(trend.phTrend)}
                valueColor={phTrendColor(trend.phTrend)}
                delta={trend.phDelta !== undefined ? `Δ${trend.phDelta > 0 ? "+" : ""}${trend.phDelta.toFixed(2)}` : undefined}
              />
              <TrendRow
                label="Protok"
                value={flowTrendLabel(trend.flowTrend)}
                valueColor={flowTrendColor(trend.flowTrend)}
                delta={trend.flowDelta !== undefined ? `Δ${trend.flowDelta > 0 ? "+" : ""}${trend.flowDelta.toFixed(1)} L/min` : undefined}
              />
              <TrendRow
                label="Saturation"
                value={saturationTrendLabel(trend.saturationTrend)}
                valueColor={saturationTrendColor(trend.saturationTrend)}
              />
              <TrendRow
                label="Potrošnja kemije"
                value={CHEMISTRY_CONSUMPTION_RATE_LABEL[trend.chemistryConsumptionRate]}
                valueColor={consumptionColor(trend.chemistryConsumptionRate)}
              />
              <TrendRow
                label="Intenzitet"
                value={trend.reactionIntensity === "nepoznata" ? "Nepoznato" :
                       trend.reactionIntensity.charAt(0).toUpperCase() + trend.reactionIntensity.slice(1)}
                valueColor={intensityColor(trend.reactionIntensity)}
              />
            </div>
          </div>
        )}

        {/* ── Active Recommendation ── */}
        {recommendationDetail && (
          <div className="px-4 py-3 flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Preporuka
            </span>
            {recommendation && (
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                topLevel === "critical" ? "text-red-700" :
                topLevel === "warning"  ? "text-amber-700" :
                "text-slate-500"
              }`}>
                {recommendation}
              </span>
            )}
            <p className="text-xs text-foreground/80 leading-relaxed">
              {recommendationDetail}
            </p>
          </div>
        )}

        {/* Empty state */}
        {warnings.length === 0 && !trend && !recommendationDetail && (
          <div className="px-4 py-5 flex flex-col items-center gap-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/30">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
            <span className="text-[11px] text-muted-foreground/40">Nema aktivnih upozorenja</span>
          </div>
        )}

      </div>
    </div>
  );
}
