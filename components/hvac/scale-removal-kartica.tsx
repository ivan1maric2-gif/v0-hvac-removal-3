"use client";

/**
 * ScaleRemovalKartica
 *
 * Prikazuje procjenu skinutog kamenca na 3 razine:
 *   1. Od zadnjeg mjerenja (incremental)
 *   2. Kumulativ ciklusa
 *   3. Kumulativ sesije
 *
 * SPEC: uvijek raspon, uvijek "procjena", nikad točna brojka.
 */

import * as React from "react";
import type { Ciklus, Mjerenje, Sesija } from "@/lib/types";
import {
  estimatePerMjerenje,
  estimatePerCiklus,
  estimatePerSesija,
  formatEstimateRange,
  iskoristjenostKemije,
  resolveCiklusStatus,
  type ScaleEstimate,
  type ReactionLevel,
} from "@/lib/scale-removal-estimate";
import { pocetnoMjerenjeCiklusa } from "@/lib/types";

// ─── Helpers za boje ──────────────────────────────────────────────────────────

function reactionColor(level: ReactionLevel): string {
  switch (level) {
    case "jaka":       return "text-red-700 dark:text-red-400";
    case "srednja":    return "text-sky-400";
    case "slaba":      return "text-muted-foreground";
    case "iscrpljena": return "text-muted-foreground/60";
  }
}

function reactionLabel(level: ReactionLevel): string {
  switch (level) {
    case "jaka":       return "Jaka reakcija";
    case "srednja":    return "Srednja reakcija";
    case "slaba":      return "Slaba reakcija";
    case "iscrpljena": return "Kemija iscrpljena";
  }
}

// Kvalitativna procjena količine kamenca — bez kg brojki
function kolicinuKamencaLabel(level: ReactionLevel, isSesija = false): string {
  switch (level) {
    case "jaka":       return isSesija ? "Veća količina kamenca" : "Veća količina kamenca";
    case "srednja":    return "Umjerena količina kamenca";
    case "slaba":      return "Mala količina kamenca";
    case "iscrpljena": return "Mala količina kamenca";
  }
}

// ─── Linija raspona ───────────────────────────────────────────────────────────

function EstimateRow({
  label,
  estimate,
  secondary,
}: {
  label: string;
  estimate: ScaleEstimate;
  secondary?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</span>
        {secondary && (
          <span className="text-[9px] text-muted-foreground/50 leading-tight">{secondary}</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[13px] font-black leading-none text-right ${reactionColor(estimate.reactionLevel)}`}>
          {kolicinuKamencaLabel(estimate.reactionLevel)}
        </span>
        <span className={`text-[9px] font-semibold ${reactionColor(estimate.reactionLevel)}`}>
          {reactionLabel(estimate.reactionLevel)}
        </span>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScaleRemovalKarticaProps {
  /** Trenutni ciklus */
  ciklus: Ciklus;
  /** Sesija (za ukupni kumulativ) */
  sesija: Sesija;
  /** Compact: prikazuje samo ciklus + sesija bez per-mjerenje */
  compact?: boolean;
}

// ─── Glavna komponenta ────────────────────────────────────────────────────────

export function ScaleRemovalKartica({ ciklus, sesija, compact = false }: ScaleRemovalKarticaProps) {
  const mjerenja = [...(ciklus.mjerenja ?? [])].sort((a, b) =>
    (a.measuredAt ?? a.timestamp ?? "") < (b.measuredAt ?? b.timestamp ?? "") ? -1 : 1
  );
  const lastM = mjerenja.length > 0 ? mjerenja[mjerenja.length - 1] : null;
  const prevM = mjerenja.length > 1 ? mjerenja[mjerenja.length - 2] : null;
  const refM = pocetnoMjerenjeCiklusa(ciklus) ?? mjerenja[0] ?? null;

  // Ukupna kemija u ciklusu
  const initialChem = ciklus.chemicalVolumeL ?? (ciklus as any).kolicina_kemikalije ?? 0;
  const topUpChem = (ciklus.nadopune ?? []).reduce(
    (s, n) => s + (n.addedChemicalVolumeL ?? (n as any).kolicina ?? 0), 0
  );
  const totalChem = initialChem + topUpChem;

  // Per-mjerenje estimate (incremental)
  const perMjerenjeEst = !compact && lastM
    ? estimatePerMjerenje(
        lastM,
        prevM ?? refM,
        // nadopune između prethodnog i ovog mjerenja (sve za simplifikaciju)
        ciklus.nadopune ?? [],
        ciklus.productSnapshot,
        totalChem,
        mjerenja.length,
      )
    : null;

  // Per-ciklus kumulativ
  const ciklusEst = estimatePerCiklus(ciklus);

  // Per-sesija kumulativ
  const sesijaResult = estimatePerSesija(sesija);
  const sesijaEst = sesijaResult.estimate;

  // Status ciklusa
  const iskorPct = iskoristjenostKemije(ciklusEst.maxKg, ciklusEst.chemicalAmountUsed, ciklusEst.capacity);
  const statusResult = resolveCiklusStatus(lastM, ciklusEst, iskorPct);

  // Provjera ima li dovoljno podataka za prikaz
  const hasMeasurements = lastM && mjerenja.length > 0;
  const hasChemistry = totalChem > 0;

  // Ako nema kemije ili mjerenja — ne prikazivati karticu
  if (!hasMeasurements || !hasChemistry) {
    return null;
  }

  // Dodatna provjera: ako su sve procjene 0, ne prikazivati
  if (
    ciklusEst.minKg <= 0 &&
    ciklusEst.maxKg <= 0 &&
    sesijaEst.minKg <= 0 &&
    sesijaEst.maxKg <= 0
  ) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            Procjena uklonjenog kamenca
          </span>
        </div>
        {/* Status badge */}
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
          statusResult.status === "zavrsi_ciklus"
            ? "bg-rose-900/30 text-rose-300 border-rose-700/40"
            : statusResult.status === "dodaj_kemiju"
            ? "bg-amber-900/30 text-amber-300 border-amber-700/40"
            : "bg-green-900/30 text-green-300 border-green-700/40"
        }`}>
          {statusResult.label}
        </span>
      </div>

      {/* Procjene — 3 razine */}
      <div className="px-4 py-1">
        {/* Razina 1: od zadnjeg mjerenja */}
        {perMjerenjeEst && (
          <EstimateRow
            label="Od zadnjeg mjerenja"
            estimate={perMjerenjeEst}
            secondary={`Kemije za ovu procjenu: ~${perMjerenjeEst.chemicalAmountUsed.toFixed(2)} L`}
          />
        )}

        {/* Razina 2: ciklus kumulativ */}
        <EstimateRow
          label="Ovaj ciklus (kumulativ)"
          estimate={ciklusEst}
          secondary={`Ukupno kemije: ${ciklusEst.chemicalAmountUsed.toFixed(1)} L • iskoristjenost: ~${iskorPct.toFixed(0)}%`}
        />

        {/* Razina 3: sesija kumulativ */}
        <EstimateRow
          label="Ukupno sesija"
          estimate={sesijaEst}
          secondary={`${sesijaResult.ukupnoCiklusa} ${sesijaResult.ukupnoCiklusa === 1 ? "ciklus" : "ciklusa"} • ${sesijaResult.ukupnoKemijeL.toFixed(1)} L kemije`}
        />
      </div>

      {/* Status reason + komentar */}
      {(statusResult.reason || ciklusEst.comment) && (
        <div className="px-4 py-2 border-t border-border/50 flex flex-col gap-1">
          {ciklusEst.comment && (
            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">{ciklusEst.comment}</p>
          )}
          <p className="text-[9px] text-muted-foreground/50 leading-relaxed italic">{statusResult.reason}</p>
        </div>
      )}

      {/* Flow improvement na sesiji */}
      {sesijaResult.flowImprovementPercent !== null && Math.abs(sesijaResult.flowImprovementPercent) >= 1 && (
        <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground/70 font-semibold">Poboljsanje protoka (sesija)</span>
          <span className={`text-[12px] font-black tabular-nums ${
            sesijaResult.flowImprovementPercent >= 5 ? "text-green-400" :
            sesijaResult.flowImprovementPercent > 0 ? "text-blue-400" :
            "text-rose-400"
          }`}>
            {sesijaResult.flowImprovementPercent > 0 ? "+" : ""}{sesijaResult.flowImprovementPercent.toFixed(1)}%
          </span>
        </div>
      )}

      {/* TEMP OUT improvement na sesiji */}
      {sesijaResult.tempOutImprovementC !== null && Math.abs(sesijaResult.tempOutImprovementC) >= 0.5 && (
        <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground/70 font-semibold">Poboljsanje TEMP OUT (sesija)</span>
          <span className={`text-[12px] font-black tabular-nums ${
            sesijaResult.tempOutImprovementC >= 1 ? "text-green-400" :
            sesijaResult.tempOutImprovementC > 0 ? "text-blue-400" :
            "text-amber-400"
          }`}>
            {sesijaResult.tempOutImprovementC > 0 ? "+" : ""}{sesijaResult.tempOutImprovementC.toFixed(1)} °C
          </span>
        </div>
      )}

      {/* Napomena */}
      <div className="px-4 py-1.5 border-t border-border/30">
        <p className="text-[8px] text-muted-foreground/40 leading-relaxed">
          Procjena. Stvarne vrijednosti ovise o tipu kamenca, temperaturi i uvjetima sustava. Ne koristiti kao mjernu potvrdu.
        </p>
      </div>
    </div>
  );
}
