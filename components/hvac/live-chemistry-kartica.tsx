"use client";

// ─── Live Chemistry Interpretation Kartica ────────────────────────────────────
//
// UI widget koji prikazuje LiveReactionState dobiven iz generateLiveInterpretation().
// Treba se renderirati ispod svake CiklusKartica u live-pregled.tsx
// kad je dostupno mjerenje.
//
// Sekcije:
//   1. Header — engine naziv + recommendation badge
//   2. Chemistry Status — stanje kemije + opis
//   3. Reaction Strength — snaga reakcije
//   4. Saturation State — stanje zasićenja
//   5. Thermal Status — temperature upozorenje (ako postoji)
//   6. Contamination State — sludge/magnetit (DS-40)
//   7. Warnings — lista upozorenja po razini
//   8. Recommendation — preporučena akcija
//   9. Finish Cycle — checklist za završetak

import type {
  LiveReactionState,
  ChemistryStatus,
  ReactionStrength,
  SaturationState,
  WarningLevel,
} from "@/lib/live-interpretation";
import { InterpretedColorKartica } from "@/components/hvac/interpreted-color-kartica";
import { TempOutTrendKartica } from "@/components/hvac/tempout-trend-kartica";
import { tempOutTrendAnalysis } from "@/lib/live-interpretation";

// ─── Helpers za boje ──────────────────────────────────────────────────────────

function chemistryStatusColor(status: ChemistryStatus): string {
  switch (status) {
    case "maksimalno_aktivno": return "text-yellow-400";
    case "aktivno":            return "text-green-400";
    case "slabi":              return "text-amber-400";
    case "iscrpljeno":         return "text-rose-400";
    case "neutralizirano":     return "text-blue-400";
    default:                   return "text-muted-foreground";
  }
}

function chemistryStatusBg(status: ChemistryStatus): string {
  switch (status) {
    case "maksimalno_aktivno": return "border-yellow-700/40 bg-yellow-950/20";
    case "aktivno":            return "border-green-700/40 bg-green-950/20";
    case "slabi":              return "border-amber-700/40 bg-amber-950/20";
    case "iscrpljeno":         return "border-rose-700/40 bg-rose-950/20";
    case "neutralizirano":     return "border-blue-700/40 bg-blue-950/20";
    default:                   return "border-border bg-muted/10";
  }
}

function reactionStrengthColor(strength: ReactionStrength): string {
  switch (strength) {
    case "jaka":     return "text-green-400";
    case "normalna": return "text-sky-400";
    case "slaba":    return "text-amber-400";
    case "nema":     return "text-rose-400/70";
    default:         return "text-muted-foreground";
  }
}

function reactionStrengthBar(strength: ReactionStrength): { width: string; color: string } {
  switch (strength) {
    case "jaka":     return { width: "w-full",  color: "bg-green-500" };
    case "normalna": return { width: "w-3/4",   color: "bg-sky-500"  };
    case "slaba":    return { width: "w-2/5",   color: "bg-amber-500" };
    case "nema":     return { width: "w-0",     color: "bg-rose-500" };
    default:         return { width: "w-1/4",   color: "bg-muted-foreground" };
  }
}

function saturationStateColor(state: SaturationState): string {
  switch (state) {
    case "svjeza":        return "text-green-400";
    case "aktivna":       return "text-sky-400";
    case "kritična":      return "text-amber-400";
    case "iscrpljena":    return "text-rose-400";
    case "neutralizirana":return "text-blue-400";
    default:              return "text-muted-foreground";
  }
}

function warningBg(level: WarningLevel): string {
  switch (level) {
    case "critical": return "bg-rose-950/50 border-rose-500/50 text-rose-300";
    case "warning":  return "bg-amber-950/40 border-amber-500/40 text-amber-300";
    case "caution":  return "bg-yellow-950/30 border-yellow-600/30 text-yellow-300";
    case "info":     return "bg-sky-950/30 border-sky-700/30 text-sky-300";
  }
}

function warningIcon(level: WarningLevel): React.ReactNode {
  if (level === "critical" || level === "warning") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  );
}

function recommendationBg(rec: string): string {
  if (rec === "smanjiti_temperaturu") return "bg-red-950/50 border-red-700/50 text-red-300";
  if (rec === "zavrsiti_ciklus")      return "bg-blue-950/50 border-blue-700/50 text-blue-300";
  if (rec === "dodati_kemiju")        return "bg-amber-950/50 border-amber-700/50 text-amber-300";
  if (rec === "nastaviti_ciscenje")   return "bg-green-950/40 border-green-700/40 text-green-300";
  if (rec === "neutralizirati")       return "bg-sky-950/40 border-sky-700/40 text-sky-300";
  return "bg-muted/30 border-border text-foreground/80";
}

// ─── Main component ───────────────────────────────────────────────────────────

import React from "react";

import type { EngineColorZone } from "@/lib/product-engine-types";

interface LiveChemistryKarticaProps {
  state: LiveReactionState;
  /** Sve dostupne boje iz selectedProductEngine.colorZones — chip selector */
  availableColors?: EngineColorZone[];
  /** Callback za promjenu korisničke boje — opcionalno */
  onColorChange?: (colorName: string) => void;
  /**
   * TEMP OUT iz referentnog mjerenja (initial_cycle_measurement).
   * SPEC: deltaTempOut = currentTempOut - referenceTempOut (NE prethodno mjerenje!)
   */
  referenceTempOutC?: number;
}

export function LiveChemistryKartica({ state, availableColors = [], onColorChange, referenceTempOutC }: LiveChemistryKarticaProps) {
  // TEMP OUT Trend — SPEC: delta = current - referentno (initial_cycle_measurement)
  const tempOutC = state.debug.tempOutC;
  const tempOutAnalysis = tempOutC !== undefined
    ? tempOutTrendAnalysis(tempOutC, referenceTempOutC)
    : null;
  const bar = reactionStrengthBar(state.reactionStrength);

  return (
    <div className={`rounded-xl border overflow-hidden ${chemistryStatusBg(state.chemistryStatus)}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Live Chemistry Interpretation
          </span>
          <span className="text-[9px] text-muted-foreground/40">·</span>
          <span className="text-[9px] text-muted-foreground/60">{state.engineName}</span>
        </div>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${recommendationBg(state.recommendation)}`}>
          {state.recommendationLabel}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-white/5">

        {/* ── 1. Chemistry Status ── */}
        <div className="px-4 py-3 flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Stanje kemije
          </span>
          <span className={`text-sm font-bold leading-tight ${chemistryStatusColor(state.chemistryStatus)}`}>
            {state.chemistryStatusLabel}
          </span>
          <p className="text-[11px] text-foreground/70 leading-relaxed mt-0.5">
            {state.chemistryDescription}
          </p>
        </div>

        {/* ── 1b. Interpreted Color — SPEC: "App mora interpretirati stanje" ── */}
        {/* NE samo prikazivati input boju — derived iz pH + foam + bubbling */}
        <div className="px-4 py-3">
          <InterpretedColorKartica
            interpretedColor={state.interpretedColor}
            selectedColor={state.debug.colorIndicator}
            availableColors={availableColors}
            onColorChange={onColorChange}
            engineName={state.engineName}
            compact={false}
          />
        </div>

        {/* ── 2. Reaction Strength ── */}
        <div className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Snaga reakcije
            </span>
            <span className={`text-[11px] font-semibold ${reactionStrengthColor(state.reactionStrength)}`}>
              {state.reactionStrengthLabel}
            </span>
          </div>
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar.width} ${bar.color}`} />
          </div>
          <p className="text-[11px] text-foreground/60 leading-relaxed">
            {state.reactionDescription}
          </p>
        </div>

        {/* ── 3. Saturation State ── */}
        <div className="px-4 py-3 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Saturation
            </span>
            <span className={`text-[11px] font-semibold ${saturationStateColor(state.saturationState)}`}>
              {state.saturationStateLabel}
            </span>
            <p className="text-[10px] text-foreground/50 leading-relaxed mt-0.5">
              {state.saturationDescription}
            </p>
          </div>
          {/* pH value badge if available */}
          {state.debug.phValue !== undefined && (
            <div className="bg-black/20 border border-white/10 rounded-lg px-2.5 py-2 text-right shrink-0">
              <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">pH</p>
              <p className="text-base font-black tabular-nums text-foreground leading-none mt-0.5">
                {state.debug.phValue.toFixed(1)}
              </p>
            </div>
          )}
        </div>

        {/* ── 4. Thermal status (samo ako postoji) ── */}
        {state.thermalLevel && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Thermal status
              </span>
              <span className={`text-[11px] font-semibold ${
                state.thermalLevel.level === "warning"  ? "text-red-400"   :
                state.thermalLevel.level === "caution"  ? "text-amber-400" :
                state.thermalLevel.level === "optimal"  ? "text-green-400" :
                state.thermalLevel.level === "slow"     ? "text-blue-400"  :
                "text-sky-400"
              }`}>
                {state.thermalLevel.rangeLabel}
              </span>
              {state.thermalWarning && (
                <p className={`text-[10px] leading-relaxed mt-0.5 ${
                  state.thermalLevel.level === "warning" ? "text-red-400/80" :
                  state.thermalLevel.level === "caution" ? "text-amber-400/80" :
                  "text-blue-400/70"
                }`}>
                  {state.thermalWarning}
                </p>
              )}
            </div>
            {/* Thermal level dot */}
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              state.thermalLevel.level === "warning"  ? "bg-red-500"   :
              state.thermalLevel.level === "caution"  ? "bg-amber-500" :
              state.thermalLevel.level === "optimal"  ? "bg-green-500" :
              state.thermalLevel.level === "slow"     ? "bg-blue-400"  :
              "bg-sky-400"
            }`} />
          </div>
        )}

        {/* ── 4b. TEMP OUT Trend — SPEC: TEMP OUT je GLAVNI thermal indikator ── */}
        {tempOutAnalysis && (
          <div className="px-4 py-3">
            <TempOutTrendKartica analysis={tempOutAnalysis} showDeltaTNote={true} />
          </div>
        )}

        {/* ── 5. Contamination (DS-40) ── */}
        {state.contaminationState && state.contaminationState !== "nepoznata" && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Magnetit / Sludge
            </span>
            <span className={`text-[11px] font-semibold ${
              state.contaminationState === "visoka"  ? "text-rose-400" :
              state.contaminationState === "srednja" ? "text-amber-400" :
              "text-green-400"
            }`}>
              {state.contaminationState === "visoka"  ? "Detektiran — nastaviti" :
               state.contaminationState === "srednja" ? "Srednja razina" :
               "Filter cist"}
            </span>
          </div>
        )}

        {/* ── 6. Warnings ── */}
        {state.warnings.length > 0 && (
          <div className="px-4 py-3 flex flex-col gap-1.5">
            {state.warnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${warningBg(w.level)}`}
              >
                {warningIcon(w.level)}
                <span className="leading-relaxed">{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── 7. Recommendation ── */}
        <div className={`px-4 py-3 flex flex-col gap-1 ${recommendationBg(state.recommendation)} bg-opacity-60`}>
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
            Preporuka
          </span>
          <p className="text-xs font-semibold leading-relaxed">
            {state.recommendationDetail}
          </p>
        </div>

        {/* ── 8. Finish Cycle Checklist ── */}
        {state.finishCycleState.ready ? (
          <div className="px-4 py-3 bg-blue-950/40 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-400">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wide">
                Ciklus spreman za završetak
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {state.finishCycleState.criteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                    c.met === true  ? "bg-blue-500" :
                    c.met === false ? "bg-rose-700/50" :
                    "bg-muted/40"
                  }`}>
                    {c.met === true && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    )}
                  </span>
                  <span className={`text-[10px] ${c.met === true ? "text-blue-200" : "text-muted-foreground"}`}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-4 py-2.5 flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Uvjeti za završetak ciklusa
            </span>
            <ul className="flex flex-col gap-1 mt-0.5">
              {state.finishCycleState.criteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                    c.met === true  ? "bg-green-500 border-green-500" :
                    c.met === false ? "bg-rose-900/50 border-rose-700/50" :
                    "bg-transparent border-muted-foreground/30"
                  }`} />
                  <span className={`text-[10px] ${
                    c.met === true  ? "text-green-400" :
                    c.met === false ? "text-rose-400/70 line-through" :
                    "text-muted-foreground/60"
                  }`}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
