"use client";

// ─── TEMP OUT Trend Kartica ───────────────────────────────────────────────────
//
// SPEC: TEMP OUT je GLAVNI thermal indikator za descaling.
// ΔT ostaje POMOĆNI indikator.
//
// Prikazuje:
//   - Trenutni TEMP OUT
//   - Prethodni TEMP OUT
//   - Delta TEMP OUT (currentTempOut - previousTempOut)
//   - Thermal interpretation (improving / stable / worsening)
//   - Poruka po specu

import React from "react";
import type { TempOutTrendAnalysis, TempOutThermalStatus } from "@/lib/live-interpretation";

// ─── Helpers za boje ─────────────────────────────────────────────────────────

function statusColor(status: TempOutThermalStatus): string {
  if (status === "improving") return "text-green-400";
  if (status === "worsening") return "text-amber-400";
  return "text-sky-400";
}

function statusBg(level: TempOutTrendAnalysis["level"]): string {
  if (level === "ok")      return "bg-green-950/20 border-green-700/35";
  if (level === "warning") return "bg-red-950/20 border-red-700/40";
  if (level === "caution") return "bg-amber-950/15 border-amber-700/35";
  return "bg-muted/20 border-border";
}

function statusBadgeCss(status: TempOutThermalStatus): string {
  if (status === "improving") return "bg-green-900/40 text-green-300 border-green-700/50";
  if (status === "worsening") return "bg-amber-900/40 text-amber-300 border-amber-700/50";
  return "bg-sky-900/40 text-sky-300 border-sky-700/50";
}

// Thermal interpretation label — SPEC: "Aktivna reakcija", "Poboljšava se prijenos topline."
const THERMAL_INTERPRETATION: Record<TempOutThermalStatus, { title: string; subtitle: string }> = {
  improving: { title: "Poboljšava se prijenos topline",   subtitle: "TEMP OUT raste — kamenac reagira" },
  stable:    { title: "Prijenos topline stabilan",         subtitle: "TEMP OUT stabilan" },
  worsening: { title: "Moguća blokada / slab protok",     subtitle: "TEMP OUT pada — pratiti sustav" },
};

const STATUS_LABEL: Record<TempOutThermalStatus, string> = {
  improving: "Poboljšanje",
  stable:    "Stabilno",
  worsening: "Upozorenje",
};

// ─── Delta arrow ─────────────────────────────────────────────────────────────

function DeltaArrow({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.5) {
    return <span className="text-sky-400 text-[13px] font-black">→</span>;
  }
  if (delta > 0) {
    return <span className="text-green-400 text-[13px] font-black">▲</span>;
  }
  return <span className="text-amber-400 text-[13px] font-black">▼</span>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TempOutTrendKarticaProps {
  /** TEMP OUT trend analiza iz tempOutTrendAnalysis() ili ReactionTrend.tempOutTrend */
  analysis: TempOutTrendAnalysis;
  /** Prikazati "ΔT = pomoćni indikator" napomenu */
  showDeltaTNote?: boolean;
}

// ─── TempOutTrendKartica ──────────────────────────────────────────────────────

export function TempOutTrendKartica({
  analysis,
  showDeltaTNote = true,
}: TempOutTrendKarticaProps) {
  const {
    currentTempOut,
    referenceTempOut,
    deltaTempOut,
    thermalStatus,
    message,
    level,
  } = analysis;

  // SPEC: prikazati "Referentno: X°C → Trenutno: Y°C (+Z°C)"
  const hasReference = referenceTempOut !== undefined && deltaTempOut !== undefined;

  return (
    <div className={`rounded-xl border overflow-hidden ${statusBg(level)}`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            TEMP OUT Trend
          </span>
          <span className="text-[9px] text-muted-foreground/50">
            Glavni thermal indikator
          </span>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadgeCss(thermalStatus)}`}>
          {STATUS_LABEL[thermalStatus]}
        </span>
      </div>

      {/* TEMP OUT prikaz — SPEC: "Referentno: 39°C → Trenutno: 41°C (+2.0°C)" */}
      <div className="px-4 py-3 flex flex-col gap-2">

        {hasReference ? (
          /* Format po specu: Referentno → Trenutno + delta */
          <div className="flex items-center gap-2 flex-wrap">
            {/* Referentno TEMP OUT — iz initial_cycle_measurement */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold">Referentno</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[22px] font-black tabular-nums leading-none text-foreground/50">
                  {referenceTempOut!.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground/50">°C</span>
              </div>
            </div>

            {/* Arrow */}
            <DeltaArrow delta={deltaTempOut!} />

            {/* Trenutni TEMP OUT */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Trenutno</span>
              <div className="flex items-baseline gap-0.5">
                <span className={`text-[22px] font-black tabular-nums leading-none ${statusColor(thermalStatus)}`}>
                  {currentTempOut.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">°C</span>
              </div>
            </div>

            {/* Delta badge — "Promjena: +2.0°C" */}
            <span className={`ml-auto text-[13px] font-black tabular-nums px-2.5 py-1 rounded-lg border ${
              deltaTempOut! > 0 ? "bg-green-900/30 text-green-300 border-green-700/40" :
              deltaTempOut! < 0 ? "bg-amber-900/30 text-amber-300 border-amber-700/40" :
              "bg-sky-900/20 text-sky-300 border-sky-700/30"
            }`}>
              Promjena: {deltaTempOut! > 0 ? "+" : ""}{deltaTempOut!.toFixed(1)} °C
            </span>
          </div>
        ) : (
          /* Nema referentnog mjerenja — prikazati samo trenutni + napomenu */
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[32px] font-black tabular-nums leading-none ${statusColor(thermalStatus)}`}>
              {currentTempOut.toFixed(1)}
            </span>
            <span className="text-[14px] text-muted-foreground">°C</span>
            <span className="text-[10px] text-muted-foreground/50 ml-1">TEMP OUT</span>
          </div>
        )}

        <span className="text-[9px] text-muted-foreground/50">Temperatura izlaza (TEMP OUT)</span>
      </div>

      {/* Thermal Interpretation — SPEC: "Aktivna reakcija", "Poboljšava se prijenos topline." */}
      <div className={`px-4 py-3 border-t border-white/5 flex flex-col gap-0.5`}>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Thermal Interpretation
        </span>
        <span className={`text-[13px] font-black leading-tight ${
          thermalStatus === "improving" ? "text-green-300" :
          thermalStatus === "worsening" ? "text-amber-300" :
          "text-sky-300"
        }`}>
          {THERMAL_INTERPRETATION[thermalStatus].title}
        </span>
        <p className={`text-[10px] leading-relaxed mt-0.5 ${
          thermalStatus === "improving" ? "text-green-300/70" :
          thermalStatus === "worsening" ? "text-amber-300/70" :
          "text-sky-300/70"
        }`}>
          {message}
        </p>
        <span className="text-[9px] text-muted-foreground/40 mt-0.5">
          {THERMAL_INTERPRETATION[thermalStatus].subtitle}
        </span>
      </div>

      {/* Napomena — ΔT je pomoćni indikator */}
      {showDeltaTNote && (
        <div className="px-4 py-2 border-t border-white/5">
          <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
            TEMP OUT = primarni thermal indikator. ΔT = pomoćni indikator.
          </p>
        </div>
      )}

    </div>
  );
}
