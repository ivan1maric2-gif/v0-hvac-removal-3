"use client";

// ─── CleaningDecisionKartica ──────────────────────────────────────────────────
// Displays the output of the cleaning decision engine:
//   STANJE ČIŠĆENJA — current cleaning state chip
//   GLAVNA UPUTA    — bold primary instruction
//   ZAŠTO           — reason / explanation sentence
//   Flow state badge + Chemical strength badge
// All labels in Croatian.
// ──────────────────────────────────────────────────────────────────────────────

import React from "react";
import type { CleaningDecision } from "@/lib/cleaning-decision-engine";

// ─── Severity → visual tokens ────────────────────────────────────────────────

const SEVERITY_TOKENS = {
  ok: {
    border:     "border-green-500/40",
    stateBg:    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
    dot:        "bg-green-500",
  },
  warn: {
    border:     "border-amber-500/40",
    stateBg:    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    dot:        "bg-amber-400",
  },
  critical: {
    border:     "border-rose-500/50",
    stateBg:    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
    dot:        "bg-rose-500",
  },
  info: {
    border:     "border-border",
    stateBg:    "bg-muted text-muted-foreground border-border",
    dot:        "bg-slate-400",
  },
} as const;

// ─── Flow state → short badge ─────────────────────────────────────────────────

const FLOW_BADGE: Record<string, { label: string; color: string }> = {
  jako_raste: { label: "Protok jako raste",    color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" },
  raste:      { label: "Protok raste",          color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  stabilno:   { label: "Protok stabilan",       color: "bg-muted text-muted-foreground border-border" },
  pada:       { label: "Protok stagnira / pada", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  nepoznat:   { label: "Protok nepoznat",       color: "bg-muted text-muted-foreground/60 border-border" },
};

// ─── Foam level → readable label ──────────────────────────────────────────────

const FOAM_LABELS: Record<string, string> = {
  slaba:      "Slaba",
  srednja:    "Srednja",
  jaka:       "Jaka",
  vrlo_jaka:  "Vrlo jaka",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface CleaningDecisionKarticaProps {
  decision: CleaningDecision;
  /** Temperature value in °C (optional, shown if provided). */
  temperatura?: number | null;
  /** Foam/reaction level (optional, shown if provided). */
  reakcija?: string | null;
  /** Show the detail row (flow + snaga badges). Default true — kept for API compat. */
  showDetails?: boolean;
  /** Compact mode for list views. Default false. */
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CleaningDecisionKartica({
  decision,
  temperatura = null,
  reakcija = null,
  showDetails = true,
  compact = false,
}: CleaningDecisionKarticaProps) {
  const tokens = SEVERITY_TOKENS[decision.severity];
  const flowBadge = FLOW_BADGE[decision.flowState] ?? FLOW_BADGE.nepoznat;

  const hasTemperatura = temperatura != null;
  const hasReakcija    = reakcija != null && reakcija !== "nema";

  return (
    <div
      className={`rounded-2xl flex flex-col gap-0 bg-card border-2 ${tokens.border} overflow-hidden`}
    >
      {/* 1. GLAVNA UPUTA — first, most prominent */}
      <div className={`px-5 py-4 border-b border-border/40`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
          Glavna uputa
        </span>
        <p className={`font-black text-foreground leading-tight ${compact ? "text-base" : "text-lg"}`}>
          {decision.glavnaUputaLabel}
        </p>
      </div>

      {/* 2. STATUS ČIŠĆENJA */}
      <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-border/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Status
        </span>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tokens.dot}`} />
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${tokens.stateBg}`}>
            {decision.stanjeCiscentaLabel}
          </span>
        </div>
      </div>

      {/* 3. ZAŠTO */}
      <div className="px-5 py-3 border-b border-border/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
          Zašto
        </span>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {decision.zasto}
        </p>
        {decision.colorMismatch && decision.colorMismatchMessage && (
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-1">
            {decision.colorMismatchMessage}
          </p>
        )}
      </div>

      {/* 4. SREDSTVO — chemistry signal, separate from flow */}
      <div className={`px-5 py-3 flex items-center justify-between gap-3 border-b border-border/40`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sredstvo
        </span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${tokens.stateBg}`}>
          {decision.stanjeSredstvaLabel}
          {decision.colorSource && (
            <span className="font-normal opacity-70 ml-1">
              ({decision.colorSource === "boja" ? "po boji" : "po pH"})
            </span>
          )}
        </span>
      </div>

      {/* 5. PROTOK — system/flow signal, separate from chemistry */}
      <div className={`px-5 py-3 flex items-center justify-between gap-3 ${!hasTemperatura && !hasReakcija ? "" : "border-b border-border/40"}`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Protok
        </span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${flowBadge.color}`}>
          {flowBadge.label.replace(/^Protok /, "")}
        </span>
      </div>

      {/* 6. TEMPERATURA — shown only when available */}
      {hasTemperatura && (
        <div className={`px-5 py-3 flex items-center justify-between gap-3 ${!hasReakcija ? "" : "border-b border-border/40"}`}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Temperatura
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg border border-border bg-muted text-muted-foreground">
            {temperatura!.toFixed(1)} °C
          </span>
        </div>
      )}

      {/* 7. REAKCIJA / PJENA — shown only when available */}
      {hasReakcija && (
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Reakcija / pjena
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            {FOAM_LABELS[reakcija!] ?? reakcija}
          </span>
        </div>
      )}
    </div>
  );
}
