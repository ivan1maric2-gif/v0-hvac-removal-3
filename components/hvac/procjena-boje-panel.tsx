"use client";

/**
 * ProcjenaBojePanel
 *
 * Shared component — rendered everywhere a pH value is entered or displayed.
 * Shows: expected indicator color, chemical strength, explanation (all per product zones).
 * Optionally renders product-specific color chips for manual correction.
 *
 * Spec: config-sOOIu.yaml — "APPLY PH → COLOR → STRENGTH ON EVERY PH INPUT"
 */

import React, { useMemo } from "react";
import type { IndicatorZona, SnagaSredstva } from "@/lib/product-types";
import { nadjiIndikatorZonu, SNAGA_SREDSTVA_LABELS } from "@/lib/product-types";
import type { ColorIndicator as CI } from "@/lib/types";
import { resolveChemicalStrength } from "@/lib/chemical-strength-matrix";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorIndicatorDef {
  id: string;
  colorName: string;
  colorHex?: string;
  meaning: string;
  chemicalStatus?: string;
}

export interface ProcjanaBojePanelProps {
  /** Current pH value (null = not yet entered) */
  ph: number | null;
  /** From product.indicatorZones (TDS) */
  indicatorZones: IndicatorZona[];
  /** From product.colorIndicators */
  colorIndicators?: ColorIndicatorDef[];
  /** Currently selected color (manual override, raw colorName string) */
  selectedColor?: string;
  /** If provided, renders interactive color chips for manual correction */
  onColorChange?: (colorName: string) => void;
  /** Whether to show chips (default: show if onColorChange provided) */
  showChips?: boolean;
  /** Compact mode: hide description text */
  compact?: boolean;
}

// ─── Strength border color ─────────────────────────────────────────────────

function strengthBorder(s: SnagaSredstva | null): string {
  switch (s) {
    case "jako":
    case "aktivno":
      return "border-green-500/50";
    case "slabi":
    case "pri_kraju":
      return "border-amber-500/50";
    case "iscrpljeno":
      return "border-rose-500/50";
    default:
      return "border-border";
  }
}

function strengthTextColor(s: SnagaSredstva | null): string {
  switch (s) {
    case "jako":
    case "aktivno":
      return "text-green-700 dark:text-green-400";
    case "slabi":
    case "pri_kraju":
      return "text-amber-700 dark:text-amber-400";
    case "iscrpljeno":
      return "text-rose-700 dark:text-rose-400";
    default:
      return "text-foreground";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProcjenaBojePanel({
  ph,
  indicatorZones,
  colorIndicators = [],
  selectedColor,
  onColorChange,
  showChips,
  compact = false,
}: ProcjanaBojePanelProps) {
  const showColorChips = showChips ?? !!onColorChange;

  // pH → indicatorZone
  const phZona: IndicatorZona | null = useMemo(
    () => (ph !== null && indicatorZones.length > 0 ? nadjiIndikatorZonu(ph, indicatorZones) : null),
    [ph, indicatorZones]
  );

  // Manual color → indicatorZone strength (direct name match)
  const colorBasedStrength: SnagaSredstva | null = useMemo(() => {
    if (!selectedColor || indicatorZones.length === 0) return null;
    const match =
      indicatorZones.find((z) => z.colorName?.toLowerCase() === selectedColor.toLowerCase()) ??
      indicatorZones.find(
        (z) =>
          z.colorName &&
          (z.colorName.toLowerCase().includes(selectedColor.toLowerCase()) ||
            selectedColor.toLowerCase().includes(z.colorName.toLowerCase()))
      );
    return match?.strength ?? null;
  }, [selectedColor, indicatorZones]);

  const matrix = useMemo(
    () => resolveChemicalStrength(phZona?.strength ?? null, colorBasedStrength),
    [phZona, colorBasedStrength]
  );

  const finalStrength = matrix.finalStrength;
  const border = strengthBorder(finalStrength);
  const textColor = strengthTextColor(finalStrength);

  // Nothing to show until pH is entered and zones exist
  if (ph === null || indicatorZones.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">

      {/* ── Kartica 1: Snaga sredstva ────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 ${border} bg-card px-4 pt-3 pb-3 flex flex-col gap-1`}>
        <span className="text-xl font-black text-foreground tracking-tight">
          Snaga sredstva — Procjena po pH
        </span>
        {phZona ? (
          <span className={`text-xl font-black leading-tight ${textColor}`}>
            {SNAGA_SREDSTVA_LABELS[finalStrength ?? phZona.strength]}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            pH {ph.toFixed(2)} nije u definiranim zonama.
          </span>
        )}
      </div>

      {phZona && (
        <>
          {/* ── Kartica 2: Boja indikatora + Objašnjenje ────────────────────── */}
          <div className="rounded-2xl border-2 border-border bg-card px-4 pt-3 pb-3 flex flex-col gap-0">
            <span className="text-xl font-black text-foreground tracking-tight">
              Boja indikatora
            </span>
            <span className="text-xl font-black text-sky-700 dark:text-sky-300">
              {phZona.colorName ?? "—"}
            </span>
            {!compact && phZona.description && (
              <span className="text-xs font-semibold text-muted-foreground leading-snug mt-1">
                {phZona.description}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Ručna korekcija (opcionalno, samo kad je onColorChange dan) ──────── */}
      {showColorChips && colorIndicators.length > 0 && (
        <div className="border-t border-border/50 px-4 pt-3 pb-3 flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Stvarna boja (ručna korekcija)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {colorIndicators.map((ci) => (
              <button
                key={ci.id}
                type="button"
                onClick={() => onColorChange?.(selectedColor === ci.colorName ? "" : ci.colorName)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  selectedColor === ci.colorName
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {ci.colorHex && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-border/60 shrink-0"
                    style={{ backgroundColor: ci.colorHex }}
                  />
                )}
                {ci.colorName}
              </button>
            ))}
          </div>

          {/* Stvarna vrijednost po boji */}
          {selectedColor && colorBasedStrength && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-24 shrink-0">
                Stvarna vrijednost po boji
              </span>
              <span className={`text-sm font-black ${strengthTextColor(colorBasedStrength)}`}>
                {SNAGA_SREDSTVA_LABELS[colorBasedStrength]}
              </span>
            </div>
          )}

          {/* Mismatch upozorenje */}
          {matrix.warning && matrix.warningMessage && (
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 leading-snug">
              Upozorenje: {matrix.warningMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
