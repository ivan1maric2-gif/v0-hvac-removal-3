import type { SnagaSredstva } from "./product-types";

// ─── Chemical Strength Matrix ─────────────────────────────────────────────────
//
// Spec: document-HmyH6 — pH + Color → Chemical Strength Matrix
//
// Priority rule:
//   If color is manually selected  → use color as primary source
//   If no color                    → use pH
//
// Warning rule:
//   If mismatch between pH strength and color strength → warning = true
//
// This matrix defines ONLY chemical strength.
// It does NOT determine cleaning result or presence of scale.
// ──────────────────────────────────────────────────────────────────────────────

export interface ChemicalStrengthResult {
  /** Final resolved chemical strength */
  finalStrength: SnagaSredstva | null;
  /** Source used for final strength determination */
  source: "pH" | "boja" | null;
  /** True if pH and color disagree (mismatch) */
  warning: boolean;
  /** Croatian warning message, or null if no warning */
  warningMessage: string | null;
}

/**
 * Matrix decision table for cases where both pH and color are present.
 * Color always wins (Priority Rule 5).
 * Warning is raised when they disagree (Warning Rule 6).
 *
 * Groups of strength values for matrix comparison:
 *   strong  = jako | aktivno
 *   weak    = slabi | pri_kraju
 *   exhaust = iscrpljeno
 */
function strengthGroup(s: SnagaSredstva): "strong" | "weak" | "exhaust" {
  if (s === "jako" || s === "aktivno") return "strong";
  if (s === "slabi" || s === "pri_kraju") return "weak";
  return "exhaust";
}

function isMismatch(phStrength: SnagaSredstva, colorStrength: SnagaSredstva): boolean {
  const phGroup    = strengthGroup(phStrength);
  const colorGroup = strengthGroup(colorStrength);
  return phGroup !== colorGroup;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Resolves final chemical strength from pH and/or manual color input.
 *
 * @param phStrength    Strength derived from pH via product indicator zones (null if not available)
 * @param colorStrength Strength derived from manually selected color (null if not selected)
 */
export function resolveChemicalStrength(
  phStrength: SnagaSredstva | null,
  colorStrength: SnagaSredstva | null
): ChemicalStrengthResult {
  // Neither available
  if (!phStrength && !colorStrength) {
    return { finalStrength: null, source: null, warning: false, warningMessage: null };
  }

  // Only pH available (no manual color)
  if (phStrength && !colorStrength) {
    return { finalStrength: phStrength, source: "pH", warning: false, warningMessage: null };
  }

  // Only color available (no pH zones configured)
  if (!phStrength && colorStrength) {
    return { finalStrength: colorStrength, source: "boja", warning: false, warningMessage: null };
  }

  // Both available — apply matrix
  const ph    = phStrength!;
  const color = colorStrength!;
  const mismatch = isMismatch(ph, color);

  return {
    finalStrength:  color, // color always wins (Priority Rule 5)
    source:         "boja",
    warning:        mismatch,
    warningMessage: mismatch
      ? "Boja ne odgovara pH procjeni — provjerite mjerenje ili stanje."
      : null,
  };
}
