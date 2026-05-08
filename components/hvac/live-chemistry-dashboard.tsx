"use client";

// ─── Live Chemistry Dashboard ─────────────────────────────────────────────────
//
// Product-specific dashboard koji se potpuno mijenja ovisno o aktivnom engineu.
//
//   DS-3:    pH dominant — blue/green/yellow tema, Foam Reaction Status
//   FX:      pink/yellow model, Critical pH Zone, CO2 bubbling primarno
//   DS-40:   red/orange tema, Magnetite Status, Sludge Status
//   Rector:  yellow/red tema, Inhibitor Protection Status, Yellow→Red chemistry
//
// Konzumira:
//   getDashboardConfig()    → DynamicDashboardConfig
//   generateDynamicWarnings() → DynamicWarning[]
//   generateReactionTrend()  → ReactionTrend
//
// VAŽNO: sve vrijednosti dolaze iz ProductEngine-a — nema hardcoded konstanti.

import React from "react";
import type { DynamicDashboardConfig, DashboardStatusCard, DashboardIndicator } from "@/lib/dynamic-dashboard-config";
import type { DynamicWarning, ReactionTrend, WarningLevel } from "@/lib/live-interpretation";

// ─── Small icon components ────────────────────────────────────────────────────

function IndicatorIcon({ icon, className }: { icon: DashboardIndicator["icon"]; className?: string }) {
  const cls = `shrink-0 ${className ?? ""}`;
  if (icon === "ph") return (
    <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
    </svg>
  );
  if (icon === "temp") return (
    <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
    </svg>
  );
  if (icon === "flow") return (
    <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 9.5V5a2.5 2.5 0 0 1 5 0v4.5M14.5 5v4.5M4.5 9.5C4.5 13.09 7 16 12 19s7.5-5.91 7.5-9.5M4.5 9.5h15"/>
    </svg>
  );
  if (icon === "magnet") return (
    <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 15A6 6 0 0 0 18 15V5H6v10z"/><path d="M2 5h4M18 5h4M6 5V3M18 5V3"/>
    </svg>
  );
  return (
    <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  );
}

function WarningIcon({ level }: { level: WarningLevel }) {
  if (level === "critical" || level === "warning") return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  );
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function warningRowStyle(level: WarningLevel): string {
  switch (level) {
    case "critical": return "bg-rose-950/50 border-rose-500/40 text-rose-300";
    case "warning":  return "bg-amber-950/40 border-amber-500/35 text-amber-300";
    case "caution":  return "bg-yellow-950/30 border-yellow-600/30 text-yellow-300";
    case "info":     return "bg-sky-950/30 border-sky-700/25 text-sky-300";
  }
}

function cardLevelDot(level: DashboardStatusCard["level"]): string {
  switch (level) {
    case "ok":       return "bg-green-500";
    case "warn":     return "bg-amber-500";
    case "critical": return "bg-rose-500";
    case "info":     return "bg-sky-500";
    case "neutral":  return "bg-muted-foreground/40";
  }
}

function cardLevelText(level: DashboardStatusCard["level"]): string {
  switch (level) {
    case "ok":       return "text-green-400";
    case "warn":     return "text-amber-400";
    case "critical": return "text-rose-400";
    case "info":     return "text-sky-400";
    case "neutral":  return "text-muted-foreground";
  }
}

// ─── Section label ────────────────────────────────────────────────────────────

function SL({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

// ─── 1. Indicators strip ──────────────────────────────────────────────────────

function IndicatorsStrip({ indicators, theme }: {
  indicators: DashboardIndicator[];
  theme: DynamicDashboardConfig["colorTheme"];
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {indicators.map((ind) => (
        <div
          key={ind.id}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
            ind.isPrimary
              ? `${theme.primaryBg} ${theme.primaryBorder}`
              : "bg-black/10 border-white/5"
          }`}
        >
          <IndicatorIcon icon={ind.icon} className={ind.color} />
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {ind.label}
          </span>
          <span className={`text-[12px] font-black tabular-nums leading-none ${ind.color}`}>
            {ind.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 2. Status cards grid (product-specific) ──────────────────────────────────

function StatusCardsGrid({ cards, theme }: {
  cards: DashboardStatusCard[];
  theme: DynamicDashboardConfig["colorTheme"];
}) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`rounded-lg border px-3 py-2.5 flex flex-col gap-1 ${
            card.isPrimary
              ? `${theme.primaryBg} ${theme.primaryBorder}`
              : "bg-muted/10 border-border"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cardLevelDot(card.level)}`} />
            <SL>{card.title}</SL>
          </div>
          <span className={`text-sm font-bold leading-snug ${cardLevelText(card.level)}`}>
            {card.value}
          </span>
          {card.description && (
            <p className="text-[10px] text-muted-foreground/55 leading-relaxed">
              {card.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 3. Chemistry + Reaction ──────────────────────────────────────────────────

function ChemistryReactionSection({ config }: { config: DynamicDashboardConfig }) {
  const { chemistryCard: cc, reactionCard: rc, colorTheme: t } = config;

  // Reaction bar color based on strength
  const barColor =
    rc.strengthPercent >= 80 ? "bg-green-500" :
    rc.strengthPercent >= 50 ? `bg-${t.primary}-500` :
    rc.strengthPercent >= 25 ? "bg-amber-500" :
    "bg-rose-900/60";

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {/* Chemistry status */}
      <div className="flex flex-col gap-1">
        <SL>{cc.title}</SL>
        <span className={`text-sm font-bold leading-tight ${cc.statusColor}`}>
          {cc.status}
        </span>
        <p className="text-[11px] text-foreground/60 leading-relaxed">
          {cc.description}
        </p>
      </div>

      {/* Reaction strength */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <SL>{rc.title}</SL>
          <span className={`text-[10px] font-bold ${rc.color}`}>
            {rc.statusLabel}
          </span>
        </div>
        <div className="h-1.5 bg-black/25 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${rc.strengthPercent}%` }}
          />
        </div>
        <p className="text-[10px] text-foreground/50 leading-relaxed">
          {rc.description}
        </p>
      </div>
    </div>
  );
}

// ─── 4. Saturation + Thermal ──────────────────────────────────────────────────

function SaturationThermalSection({ config }: { config: DynamicDashboardConfig }) {
  const { saturationCard: sc, thermalCard: tc } = config;
  return (
    <div className="grid grid-cols-2 gap-0 divide-x divide-white/5">
      <div className="px-4 py-3 flex flex-col gap-1">
        <SL>{sc.title}</SL>
        <span className={`text-[12px] font-bold ${sc.color}`}>{sc.value}</span>
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">{sc.description}</p>
      </div>
      <div className="px-4 py-3 flex flex-col gap-1">
        <SL>{tc.title}</SL>
        <span className={`text-[12px] font-bold tabular-nums ${tc.color}`}>{tc.value}</span>
        <span className="text-[10px] text-muted-foreground/50">{tc.level}</span>
        {tc.warning && (
          <p className="text-[10px] text-amber-400/70 leading-relaxed mt-0.5">{tc.warning}</p>
        )}
      </div>
    </div>
  );
}

// ─── 5. Contamination (DS-40 only) ───────────────────────────────────────────

function ContaminationSection({ card }: { card: NonNullable<DynamicDashboardConfig["contaminationCard"]> }) {
  return (
    <div className="px-4 py-3 flex flex-col gap-1">
      <SL>{card.title}</SL>
      <span className={`text-[12px] font-bold ${card.color}`}>{card.status}</span>
      <p className="text-[10px] text-muted-foreground/50 leading-relaxed">{card.description}</p>
    </div>
  );
}

// ─── 6. Live Trend ────────────────────────────────────────────────────────────

function LiveTrendSection({ trend, consumption }: {
  trend?: ReactionTrend;
  consumption: DynamicDashboardConfig["consumptionStatus"];
}) {
  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      <SL>Live Trend</SL>
      <div className="grid grid-cols-2 gap-2">

        {/* Chemistry consumption */}
        <div className="bg-black/15 rounded-lg border border-white/5 px-2.5 py-2 flex flex-col gap-0.5">
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/55">
            Potrosnja kemije
          </span>
          <span className={`text-[11px] font-bold ${consumption.color}`}>
            {consumption.label}
          </span>
          <p className="text-[9px] text-muted-foreground/45 leading-relaxed">
            {consumption.description}
          </p>
        </div>

        {/* Reaction intensity */}
        {trend && trend.reactionIntensity !== "nepoznata" && (
          <div className="bg-black/15 rounded-lg border border-white/5 px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/55">
              Intenzitet
            </span>
            <span className={`text-[11px] font-bold ${
              trend.reactionIntensity === "visoka" ? "text-green-400" :
              trend.reactionIntensity === "srednja" ? "text-sky-400" :
              trend.reactionIntensity === "niska"   ? "text-amber-400" :
              "text-rose-400/70"
            }`}>
              {trend.reactionIntensity === "visoka"  ? "Visoka" :
               trend.reactionIntensity === "srednja" ? "Srednja" :
               trend.reactionIntensity === "niska"   ? "Niska" : "Nema"}
            </span>
          </div>
        )}

        {/* pH trend */}
        {trend && trend.phTrend !== "nepoznato" && (
          <div className="bg-black/15 rounded-lg border border-white/5 px-2.5 py-2 flex items-center gap-1.5">
            <span className={`text-base font-black leading-none ${
              trend.phTrend === "raste" ? "text-rose-400" :
              trend.phTrend === "pada"  ? "text-green-400" :
              "text-sky-400"
            }`}>
              {trend.phTrend === "raste" ? "↑" : trend.phTrend === "pada" ? "↓" : "→"}
            </span>
            <div className="flex flex-col gap-0">
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/55">
                pH trend
              </span>
              <span className="text-[11px] font-bold text-foreground/80">
                {trend.phTrend === "raste" ? "Raste" :
                 trend.phTrend === "pada"  ? "Pada" : "Stagnira"}
                {trend.phDelta !== undefined && (
                  <span className="ml-1 text-[9px] font-mono text-muted-foreground/50">
                    ({trend.phDelta > 0 ? "+" : ""}{trend.phDelta.toFixed(1)})
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Flow trend */}
        {trend && trend.flowTrend !== "nepoznato" && (
          <div className="bg-black/15 rounded-lg border border-white/5 px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/55">
              Protok trend
            </span>
            <span className={`text-[11px] font-bold ${
              trend.flowTrend === "raste" || trend.flowTrend === "nagli_rast" ? "text-green-400" :
              trend.flowTrend === "pada"  || trend.flowTrend === "nagli_pad"  ? "text-rose-400" :
              "text-amber-400"
            }`}>
              {trend.flowTrend === "raste"       ? "Raste" :
               trend.flowTrend === "nagli_rast"  ? "Nagli rast" :
               trend.flowTrend === "pada"        ? "Pada" :
               trend.flowTrend === "nagli_pad"   ? "Nagli pad" : "Stagnira"}
            </span>
          </div>
        )}

        {/* Saturation trend */}
        {trend && trend.saturationTrend !== "nepoznato" && (
          <div className="bg-black/15 rounded-lg border border-white/5 px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/55">
              Saturation trend
            </span>
            <span className={`text-[11px] font-bold ${
              trend.saturationTrend === "kritično" ? "text-rose-400" :
              trend.saturationTrend === "raste"    ? "text-amber-400" :
              "text-green-400"
            }`}>
              {trend.saturationTrend === "kritično" ? "Kriticno" :
               trend.saturationTrend === "raste"    ? "Raste" : "Stabilno"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 7. Warnings panel ────────────────────────────────────────────────────────

function WarningsPanel({ warnings }: { warnings: DynamicWarning[] }) {
  if (warnings.length === 0) return null;
  const critCount = warnings.filter((w) => w.level === "critical").length;
  const warnCount = warnings.filter((w) => w.level === "warning").length;

  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SL>Warnings & Recommendations</SL>
        <div className="flex items-center gap-1">
          {critCount > 0 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
              {critCount} CRITICAL
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {warnCount}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {warnings.slice(0, 5).map((w, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${warningRowStyle(w.level)}`}
          >
            <WarningIcon level={w.level} />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="font-bold text-[11px] leading-tight">{w.title}</span>
              <span className="text-[10px] opacity-80 leading-relaxed whitespace-pre-line">{w.message}</span>
              {w.action && (
                <span className="text-[10px] opacity-55 leading-relaxed mt-0.5 italic">{w.action}</span>
              )}
              {w.triggeredBy && (
                <span className="text-[9px] opacity-40 mt-0.5 font-mono">Trigger: {w.triggeredBy}</span>
              )}
            </div>
          </div>
        ))}
        {warnings.length > 5 && (
          <p className="text-[10px] text-muted-foreground/40 text-center py-1">
            +{warnings.length - 5} upozorenja skriveno
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 8. Finish-cycle readiness ────────────────────────────────────────────────

function FinishCycleSection({ config }: { config: DynamicDashboardConfig }) {
  const { finishCycleReadiness: r, finishCycleReadinessLabel, finishCycleReadinessColor } = config;
  return (
    <div className={`px-4 py-3 flex items-center justify-between gap-3 ${
      r === "ready" ? "bg-blue-950/35" :
      r === "close" ? "bg-amber-950/20" :
      ""
    }`}>
      <div className="flex flex-col gap-0.5">
        <SL>Finish-Cycle Status</SL>
        <span className={`text-[12px] font-bold ${finishCycleReadinessColor}`}>
          {finishCycleReadinessLabel}
        </span>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
        r === "ready" ? "bg-blue-500" :
        r === "close" ? "bg-amber-500" :
        "bg-muted-foreground/25"
      }`} />
    </div>
  );
}

// ─── 9. Debug panel ───────────────────────────────────────────────────────────

function DebugPanel({ debug }: { debug: DynamicDashboardConfig["debug"] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-t border-dashed border-amber-600/25">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-amber-950/15 hover:bg-amber-950/25 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-amber-600">DEV</span>
          <span className="text-[9px] text-amber-500/60">Debug Mode</span>
        </div>
        <svg
          className={`w-3 h-3 text-amber-500/35 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 bg-amber-950/10">
          {([
            ["Active Engine",    debug.activeEngine],
            ["Color Model",      debug.activeColorModel],
            ["Saturation Model", debug.activeSaturationModel],
            ["Warning Model",    debug.activeWarningModel],
            ...(debug.phValue !== undefined     ? [["pH", debug.phValue.toFixed(2)]]              : []),
            ...(debug.colorIndicator            ? [["Color", debug.colorIndicator]]               : []),
            ...(debug.temperatureC !== undefined ? [["Temp", `${debug.temperatureC} °C`]]         : []),
            ...(debug.flowLMin !== undefined     ? [["Flow", `${debug.flowLMin.toFixed(1)} L/min`]] : []),
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-amber-600/60">{label}</span>
              <span className="text-[9px] font-mono text-amber-300/65 break-all leading-snug">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface LiveChemistryDashboardProps {
  config: DynamicDashboardConfig;
  warnings: DynamicWarning[];
  trend?: ReactionTrend;
}

export function LiveChemistryDashboard({ config, warnings, trend }: LiveChemistryDashboardProps) {
  const t = config.colorTheme;

  return (
    <div className={`rounded-xl border overflow-hidden bg-gradient-to-br ${t.headerBg} ${t.primaryBorder}`}>

      {/* ── Header ── */}
      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5`}>
        <div className="flex flex-col gap-0">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {config.dashboardTitle}
          </span>
          <span className={`text-[11px] font-semibold ${t.primaryText}`}>
            {config.engineName} — {config.productName}
          </span>
        </div>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${t.badgeBg} ${t.badgeText} ${t.badgeBorder}`}>
          {config.finishCycleReadinessLabel}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-white/5">

        {/* 1. Indicators strip */}
        <IndicatorsStrip indicators={config.indicators} theme={t} />

        {/* 2. Product-specific status kartice */}
        {config.statusCards.length > 0 && (
          <StatusCardsGrid cards={config.statusCards} theme={t} />
        )}

        {/* 3. Chemistry + Reaction strength */}
        <ChemistryReactionSection config={config} />

        {/* 4. Saturation + Thermal */}
        <SaturationThermalSection config={config} />

        {/* 5. Contamination — DS-40 only */}
        {config.contaminationCard && (
          <ContaminationSection card={config.contaminationCard} />
        )}

        {/* 6. Live trend */}
        <LiveTrendSection trend={trend} consumption={config.consumptionStatus} />

        {/* 7. Warnings */}
        {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

        {/* 8. Finish-cycle readiness */}
        <FinishCycleSection config={config} />

        {/* 9. Debug panel */}
        <DebugPanel debug={config.debug} />

      </div>
    </div>
  );
}
