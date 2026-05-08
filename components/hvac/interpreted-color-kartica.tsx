"use client";

/**
 * InterpretedColorKartica
 *
 * Spec: "App mora interpretirati stanje — NE samo prikazivati input boju."
 *
 * Prikazuje DVA pogleda na boju:
 *   1. SELECTABLE COLOR  — korisnički unos (što servisnik vidi vizualno)
 *   2. INTERPRETED CHEMISTRY COLOR — app interpretacija iz pH + foam + bubbling
 *
 * Interpreted color UVIJEK dolazi iz product enginea (colorZones).
 * Korisnikov unos je sekundaran — služi za provjeru i mismatch detekciju.
 */

import React from "react";
import type { InterpretedColorState } from "@/lib/live-interpretation";
import type { EngineColorZone } from "@/lib/product-engine-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InterpretedColorKarticaProps {
  /** App interpretacija — dolazi iz product engine (pH + foam + bubbling) */
  interpretedColor: InterpretedColorState;
  /** Korisnički unos — što servisnik vidi vizualno (opcionalno) */
  selectedColor?: string;
  /** Sve dostupne boje za ovaj engine — chip selector */
  availableColors?: EngineColorZone[];
  /** Callback za promjenu korisničke boje */
  onColorChange?: (colorName: string) => void;
  /** Naziv enginea — za context */
  engineName?: string;
  /** Kompaktni mod */
  compact?: boolean;
}

// ─── Chemical strength badge ──────────────────────────────────────────────────

function strengthBadgeStyle(s: InterpretedColorState["chemicalStrength"]): string {
  switch (s) {
    case "maksimalno": return "bg-emerald-900/40 text-emerald-300 border-emerald-700/40";
    case "aktivno":    return "bg-green-900/40 text-green-300 border-green-700/40";
    case "slabi":      return "bg-amber-900/40 text-amber-300 border-amber-700/40";
    case "iscrpljeno": return "bg-rose-900/40 text-rose-300 border-rose-700/40";
    case "neutralizirano": return "bg-blue-900/40 text-blue-300 border-blue-700/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function strengthLabel(s: InterpretedColorState["chemicalStrength"]): string {
  switch (s) {
    case "maksimalno":    return "Maksimalno aktivno";
    case "aktivno":       return "Aktivno";
    case "slabi":         return "Slabi";
    case "iscrpljeno":    return "Iscrpljeno";
    case "neutralizirano":return "Neutralizirano";
  }
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function ColorSwatch({
  hex,
  size = "lg",
  pulse = false,
}: {
  hex: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}) {
  const sizeClass = size === "lg" ? "w-12 h-12" : size === "md" ? "w-8 h-8" : "w-5 h-5";
  return (
    <div
      className={`${sizeClass} rounded-xl border-2 border-white/10 shrink-0 shadow-lg ${pulse ? "animate-pulse" : ""}`}
      style={{ backgroundColor: hex }}
      aria-hidden="true"
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InterpretedColorKartica({
  interpretedColor,
  selectedColor,
  availableColors = [],
  onColorChange,
  engineName,
  compact = false,
}: InterpretedColorKarticaProps) {
  const hasUserColor  = !!selectedColor;
  const hasMismatch   = hasUserColor && interpretedColor.matchesUserInput === false;
  const hasColorChips = availableColors.length > 0 && !!onColorChange;

  // Pronađi hex za korisničku boju
  const userColorZone = availableColors.find(
    (z) => z.colorName.toLowerCase() === (selectedColor ?? "").toLowerCase()
  );

  return (
    <div className="flex flex-col gap-0 rounded-2xl border border-border overflow-hidden bg-card">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Kemijsko stanje reakcije
          </span>
          {engineName && (
            <span className="text-[10px] text-muted-foreground/40">{engineName}</span>
          )}
        </div>
        {/* Strength badge */}
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${strengthBadgeStyle(interpretedColor.chemicalStrength)}`}>
          {strengthLabel(interpretedColor.chemicalStrength)}
        </span>
      </div>

      {/* ── Sekcija 1: INTERPRETED CHEMISTRY COLOR ──────────────────────────── */}
      {/* SPEC: "interpreted color mora dolaziti iz product enginea" */}
      <div className="px-4 py-4 flex flex-col gap-3">

        {/* Label */}
        <div className="flex items-start gap-3">
          <ColorSwatch
            hex={interpretedColor.colorHex}
            size="lg"
            pulse={interpretedColor.chemicalStrength === "aktivno" || interpretedColor.chemicalStrength === "maksimalno"}
          />
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Interpretirana boja reakcije
            </span>
            {/* SPEC: prikazivati interpretirano stanje, NE samo "Zelena" */}
            <span className="text-base font-black text-foreground leading-tight text-balance">
              {interpretedColor.reactionColorState}
            </span>
            {/* colorName je sekundarni — prikazati samo ako se razlikuje od reactionColorState */}
            {interpretedColor.colorName !== interpretedColor.reactionColorState && (
              <span className="text-[10px] text-muted-foreground/50">
                {interpretedColor.colorName}
              </span>
            )}
            {!compact && (
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5">
                {interpretedColor.description}
              </p>
            )}
          </div>
        </div>

        {/* Mismatch warning */}
        {hasMismatch && interpretedColor.mismatchWarning && (
          <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/30 rounded-xl px-3 py-2.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber-400 mt-0.5 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[10px] text-amber-300/80 leading-relaxed">
              {interpretedColor.mismatchWarning}
            </p>
          </div>
        )}
      </div>

      {/* ── Sekcija 2: SELECTABLE COLOR (korisnički unos) ───────────────────── */}
      {/* SPEC: "1. selectable color (korisnički unos)" */}
      {hasColorChips && (
        <div className="border-t border-border/50 px-4 py-3 flex flex-col gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Stvarna boja (korisnički unos)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {availableColors.map((zone) => {
              const isSelected = selectedColor?.toLowerCase() === zone.colorName.toLowerCase();
              return (
                <button
                  key={zone.colorName}
                  type="button"
                  onClick={() => onColorChange?.(isSelected ? "" : zone.colorName)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                    isSelected
                      ? "border-white/20 bg-white/10 text-foreground"
                      : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: zone.colorHex }}
                  />
                  {zone.colorName}
                </button>
              );
            })}
          </div>

          {/* Usporedba: korisnički unos vs interpretacija */}
          {hasUserColor && (
            <div className="flex items-center gap-3 pt-1">
              {/* Korisnička boja */}
              <div className="flex items-center gap-1.5">
                {userColorZone && (
                  <ColorSwatch hex={userColorZone.colorHex} size="sm" />
                )}
                <div className="flex flex-col gap-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Uneseno</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{selectedColor}</span>
                </div>
              </div>

              {/* Arrow */}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`shrink-0 ${hasMismatch ? "text-amber-500" : "text-green-500"}`}>
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>

              {/* App interpretacija */}
              <div className="flex items-center gap-1.5">
                <ColorSwatch hex={interpretedColor.colorHex} size="sm" />
                <div className="flex flex-col gap-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">App interpretacija</span>
                  <span className={`text-[10px] font-bold ${hasMismatch ? "text-amber-400" : "text-green-400"}`}>
                    {interpretedColor.colorName}
                  </span>
                </div>
              </div>

              {/* Match/mismatch ikona */}
              {interpretedColor.matchesUserInput !== undefined && (
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                  interpretedColor.matchesUserInput
                    ? "bg-green-900/30 text-green-400 border-green-700/30"
                    : "bg-amber-900/30 text-amber-400 border-amber-700/30"
                }`}>
                  {interpretedColor.matchesUserInput ? "Podudaranje" : "Raskorak"}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sekcija 3: Kemijsko stanje reakcije — sažetak ────────────────────── */}
      {!compact && (
        <div className="border-t border-border/50 px-4 py-3 grid grid-cols-2 gap-3">
          {/* Status */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Kemijsko stanje
            </span>
            <span className={`text-[11px] font-bold ${
              interpretedColor.chemicalStrength === "maksimalno" || interpretedColor.chemicalStrength === "aktivno"
                ? "text-green-400"
                : interpretedColor.chemicalStrength === "slabi"
                  ? "text-amber-400"
                  : interpretedColor.chemicalStrength === "iscrpljeno"
                    ? "text-rose-400"
                    : "text-blue-400"
            }`}>
              {strengthLabel(interpretedColor.chemicalStrength)}
            </span>
          </div>
          {/* Label */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Zona
            </span>
            <span className="text-[11px] font-bold text-foreground/70">
              {interpretedColor.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
