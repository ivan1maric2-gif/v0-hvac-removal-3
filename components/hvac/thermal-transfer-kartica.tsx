"use client";

// ─── Thermal Transfer Status Kartica ────────────────────────────────────────────
//
// Prikazuje: TEMP IN, TEMP OUT, ΔT, thermal trend, thermal stability
// Interpretacija ΔT po specu:
//   Visok ΔT       → "Moguće slab prijenos topline ili začepljenje."
//   ΔT se smanjuje → "Poboljšava se prijenos topline."
//   Nagli rast ΔT  → "Moguća djelomična blokada ili slab protok."
//   Stabilan nizak → "Toplinski prijenos stabilan."
//
// ΔT je SEKUNDARNI indikator — ne koristiti kao glavni saturation signal.

import React from "react";
import { TempOutTrendKartica } from "@/components/hvac/tempout-trend-kartica";
import { tempOutTrendAnalysis } from "@/lib/live-interpretation";

// ─── ΔT trend tipovi ─────────────────────────────────────────────────────────

export type DeltaTTrend =
  | "stabilan_nizak"   // ΔT stabilan i nizak — dobar prijenos
  | "smanjuje_se"      // ΔT se smanjuje → čišćenje poboljšava prijenos
  | "raste"            // Normalan rast
  | "nagli_rast"       // Nagli rast → moguća blokada
  | "visok"            // Visok ΔT → slab prijenos / začepljenje
  | "nepoznato";

export type ThermalStability =
  | "stabilan"
  | "nestabilan"
  | "poboljšava_se"
  | "pogoršava_se"
  | "nepoznato";

// ─── Interpretacija ΔT ────────────────────────────────────────────────────────

export interface DeltaTInterpretation {
  trend: DeltaTTrend;
  stability: ThermalStability;
  message: string;
  level: "ok" | "info" | "caution" | "warning";
}

const DELTA_T_THRESHOLDS = {
  /** Iznad ovog = visok ΔT */
  high: 15,
  /** Normalan raspon */
  normalHigh: 10,
  normalLow: 2,
  /** Ispod ovog = odličan prijenos */
  excellent: 2,
  /** Nagli rast između mjerenja */
  suddenRise: 5,
};

export function interpretDeltaT(
  currentDeltaT: number,
  previousDeltaT?: number,
): DeltaTInterpretation {
  const delta = previousDeltaT !== undefined ? currentDeltaT - previousDeltaT : undefined;

  // Nagli rast
  if (delta !== undefined && delta > DELTA_T_THRESHOLDS.suddenRise) {
    return {
      trend: "nagli_rast",
      stability: "nestabilan",
      message: "Moguća djelomična blokada ili slab protok.",
      level: "warning",
    };
  }

  // ΔT se smanjuje — poboljšanje
  if (delta !== undefined && delta < -1 && currentDeltaT < DELTA_T_THRESHOLDS.high) {
    return {
      trend: "smanjuje_se",
      stability: "poboljšava_se",
      message: "Poboljšava se prijenos topline.",
      level: "ok",
    };
  }

  // Visok ΔT
  if (currentDeltaT > DELTA_T_THRESHOLDS.high) {
    return {
      trend: "visok",
      stability: "pogoršava_se",
      message: "Moguće slab prijenos topline ili začepljenje.",
      level: "warning",
    };
  }

  // Stabilan i nizak — odličan prijenos
  if (currentDeltaT <= DELTA_T_THRESHOLDS.excellent && (delta === undefined || Math.abs(delta) < 1)) {
    return {
      trend: "stabilan_nizak",
      stability: "stabilan",
      message: "Toplinski prijenos stabilan.",
      level: "ok",
    };
  }

  // Normalan rast
  if (delta !== undefined && delta > 0) {
    return {
      trend: "raste",
      stability: "nestabilan",
      message: "ΔT raste — pratiti prijenos topline.",
      level: "info",
    };
  }

  // Stabilan u normalnom rasponu
  if (Math.abs(currentDeltaT) <= DELTA_T_THRESHOLDS.normalHigh) {
    return {
      trend: "stabilan_nizak",
      stability: "stabilan",
      message: "Toplinski prijenos stabilan.",
      level: "ok",
    };
  }

  return {
    trend: "nepoznato",
    stability: "nepoznato",
    message: "Nedovoljno podataka za analizu.",
    level: "info",
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ThermalTransferKarticaProps {
  tempInC?: number | null;
  tempOutC?: number | null;
  /** Auto ili proslijeđeno — ako null, prikazuje "—" */
  deltaTC?: number | null;
  /** ΔT iz prethodnog mjerenja — za trend analizu */
  previousDeltaTC?: number | null;
  /** Prethodni TEMP IN — za trend */
  previousTempInC?: number | null;
  /**
   * TEMP OUT iz referentnog mjerenja (initial_cycle_measurement).
   * SPEC: deltaTempOut = currentTempOut - referenceTempOut
   */
  referenceTempOutC?: number | null;
  /** Legacy single temperature (backward compat) */
  temperatureC?: number | null;
}

// ─── Helper: boja za ΔT vrijednost ───────────────────────────────────────────

function deltaTColor(dt: number): string {
  if (dt > DELTA_T_THRESHOLDS.high) return "text-amber-400";
  if (dt > DELTA_T_THRESHOLDS.normalHigh) return "text-yellow-400";
  if (dt <= DELTA_T_THRESHOLDS.excellent) return "text-green-400";
  return "text-foreground";
}

function deltaTBg(level: DeltaTInterpretation["level"]): string {
  if (level === "warning") return "bg-amber-950/20 border-amber-700/40";
  if (level === "caution") return "bg-yellow-950/20 border-yellow-700/35";
  if (level === "ok")      return "bg-green-950/15 border-green-700/30";
  return "bg-muted/30 border-border";
}

// ─── Level badge ──────────────────────────────────────────────────────────────

const TREND_LABEL: Record<DeltaTTrend, string> = {
  stabilan_nizak: "Stabilan",
  smanjuje_se:    "Poboljšanje",
  raste:          "Raste",
  nagli_rast:     "Nagli rast",
  visok:          "Visok ΔT",
  nepoznato:      "—",
};

const STABILITY_LABEL: Record<ThermalStability, string> = {
  stabilan:       "Stabilan",
  nestabilan:     "Nestabilan",
  poboljšava_se:  "Poboljšava se",
  pogoršava_se:   "Pogoršava se",
  nepoznato:      "—",
};

// ─── ThermalTransferKartica ───────────────────────────────────────────────────

export function ThermalTransferKartica({
  tempInC,
  tempOutC,
  deltaTC,
  previousDeltaTC,
  previousTempInC,
  referenceTempOutC,
  temperatureC,
}: ThermalTransferKarticaProps) {
  // ΔT = TEMP OUT - TEMP IN (pomoćni indikator)
  // SPEC: ΔT = TEMP OUT - TEMP IN unutar istog mjerenja — POMOĆNI
  const computedDeltaT =
    deltaTC !== null && deltaTC !== undefined
      ? deltaTC
      : tempInC !== null && tempInC !== undefined && tempOutC !== null && tempOutC !== undefined
        ? parseFloat((tempOutC - tempInC).toFixed(1))
        : null;

  // Interpretacija ΔT (pomoćni)
  const interpretation = computedDeltaT !== null
    ? interpretDeltaT(computedDeltaT, previousDeltaTC ?? undefined)
    : null;

  // Nema dovoljno podataka za prikaz
  const hasDualTemp = tempInC !== null && tempInC !== undefined && tempOutC !== null && tempOutC !== undefined;
  const hasAnyTemp  = hasDualTemp || (temperatureC !== null && temperatureC !== undefined);

  // TEMP OUT Trend — SPEC: delta = currentTempOut - referenceTempOut (initial_cycle_measurement)
  const hasTempOut = tempOutC !== null && tempOutC !== undefined;
  const tempOutAnalysis = hasTempOut
    ? tempOutTrendAnalysis(
        tempOutC as number,
        (referenceTempOutC !== null && referenceTempOutC !== undefined) ? referenceTempOutC : undefined,
      )
    : null;

  if (!hasAnyTemp) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${interpretation ? deltaTBg(interpretation.level) : "bg-muted/20 border-border/50"}`}>

      {/* Header — badge iz TEMP OUT trend (referentni), ne iz ΔT unutar mjerenja */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Thermal Transfer Status
        </span>
        {tempOutAnalysis ? (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            tempOutAnalysis.level === "ok"      ? "bg-green-900/40 text-green-300 border-green-700/50" :
            tempOutAnalysis.level === "warning" ? "bg-amber-900/40 text-amber-300 border-amber-700/50" :
            tempOutAnalysis.level === "caution" ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50" :
            "bg-muted/40 text-muted-foreground border-border"
          }`}>
            {tempOutAnalysis.label}
          </span>
        ) : interpretation ? (
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-muted/40 text-muted-foreground border-border">
            ΔT: {TREND_LABEL[interpretation.trend]}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0 divide-y divide-white/5">

        {/* TEMP OUT Trend — SPEC: TEMP OUT je GLAVNI thermal indikator */}
        {tempOutAnalysis && (
          <div className="px-3 py-3">
            <TempOutTrendKartica analysis={tempOutAnalysis} showDeltaTNote={false} />
          </div>
        )}

        {/* TEMP OUT — GLAVNI indikator */}
        <div className="px-4 py-3">
          {hasTempOut ? (
            <div className="flex items-end gap-4">
              {/* TEMP OUT — veliki prikaz */}
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">TEMP OUT</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-black tabular-nums leading-none text-foreground">
                    {tempOutC!.toFixed(1)}
                  </span>
                  <span className="text-[13px] text-muted-foreground">°C</span>
                </div>
                {referenceTempOutC !== null && referenceTempOutC !== undefined && (
                  <span className="text-[10px] text-muted-foreground/60">
                    ref. {referenceTempOutC.toFixed(1)} °C
                  </span>
                )}
              </div>

              {/* Δ TEMP OUT od referentnog — mali ali jasan */}
              {referenceTempOutC !== null && referenceTempOutC !== undefined && (() => {
                const dOut = parseFloat((tempOutC! - referenceTempOutC).toFixed(1));
                return (
                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Δ TEMP OUT</span>
                    <span className={`text-[22px] font-black tabular-nums leading-none ${
                      dOut > 0.5 ? "text-green-400" :
                      dOut < -0.5 ? "text-red-400" :
                      "text-muted-foreground/60"
                    }`}>
                      {dOut > 0 ? "+" : ""}{dOut.toFixed(1)}
                      <span className="text-[13px] text-muted-foreground ml-0.5">°C</span>
                    </span>
                    <span className={`text-[10px] font-semibold ${
                      dOut > 0.5 ? "text-green-400" : dOut < -0.5 ? "text-red-400" : "text-muted-foreground/60"
                    }`}>
                      {dOut > 0.5 ? "Poboljšava se" : dOut < -0.5 ? "Pada" : "Stabilno"}
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Fallback: samo jedna temperatura (legacy) */
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Temperatura</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-black tabular-nums leading-none text-foreground">
                  {temperatureC!.toFixed(1)}
                </span>
                <span className="text-[13px] text-muted-foreground">°C</span>
              </div>
            </div>
          )}
        </div>

        {/* TEMP IN — optional, collapsible, advanced diagnostics */}
        {hasDualTemp && (
          <div className="px-4 py-2 border-t border-white/5 opacity-50">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              TEMP IN (referentno)
            </span>
            <span className="text-[11px] text-muted-foreground/60 ml-2 tabular-nums">
              {tempInC!.toFixed(1)} °C
            </span>
            {computedDeltaT !== null && (
              <span className="text-[11px] text-muted-foreground/50 ml-2">
                ΔT {computedDeltaT > 0 ? "+" : ""}{computedDeltaT.toFixed(1)} °C
              </span>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
