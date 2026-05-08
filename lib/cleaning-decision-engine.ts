// ─── Cleaning Decision Engine ─────────────────────────────────────────────────
// Produces STANJE ČIŠĆENJA, GLAVNA UPUTA and ZAŠTO from field measurements.
// All labels in Croatian. Pure functions — no side effects.
//
// Architecture:
//   Step 1 — Chemical Strength  : resolveChemicalStrength (from chemical-strength-matrix.ts)
//   Step 2 — Flow State         : resolveFlowState
//   Step 3 — Cleaning State     : SNAGA × FLOW matrix → CleaningState
//   Step 4 — Primary Instruction: state → GLAVNA UPUTA
//   Step 5 — ZAŠTO              : combine pH/flow/color signals into one sentence
// ──────────────────────────────────────────────────────────────────────────────

import type { FoamLevel } from "./types";
import type { IndicatorZona, SnagaSredstva } from "./product-types";
import { nadjiIndikatorZonu, SNAGA_SREDSTVA_LABELS } from "./product-types";
import { resolveChemicalStrength } from "./chemical-strength-matrix";

// ─── Flow State ───────────────────────────────────────────────────────────────

/** Direction of flow change relative to previous measurement or cycle start. */
export type FlowState =
  | "jako_raste"    // Δ > 5% — significant improvement
  | "raste"         // Δ 1–5% — improving
  | "stabilno"      // Δ –1% to +1% — stable / no clear change
  | "pada"          // Δ < –1% — declining
  | "nepoznat";     // no flow data

export const FLOW_STATE_LABELS: Record<FlowState, string> = {
  jako_raste: "Protok jako raste",
  raste:      "Protok raste",
  stabilno:   "Protok stabilan",
  pada:       "Protok pada / stagnira",
  nepoznat:   "Protok nepoznat",
};

// ─── Cleaning State ───────────────────────────────────────────────────────────

export type CleaningState =
  | "aktivno_ciscenje"     // Strong/active chemical + flow rising     → continue
  | "ciscenje_u_tijeku"    // Chemical weakening but flow still rising  → continue, watch
  | "sredstvo_slabi"       // Weakening + stagnating flow               → consider top-up
  | "dodaj_sredstvo"       // Near-exhausted + any flow state           → add top-up
  | "novi_ciklus"          // Exhausted / near-exhausted + no progress  → new cycle
  | "provjeri_stanje"      // Strong chemical but flow not improving     → check system
  | "cekaj_mjerenje";      // Not enough data                           → wait for next

export const CLEANING_STATE_LABELS: Record<CleaningState, string> = {
  aktivno_ciscenje:   "Čišćenje u tijeku — ima kamenca",  // Rule A / C
  ciscenje_u_tijeku:  "Čišćenje usporava",                 // Rule B
  sredstvo_slabi:     "Čišćenje usporava",                 // Rule B variant
  dodaj_sredstvo:     "Dosegnut maksimalni učinak",        // Rule D
  novi_ciklus:        "Kemijsko čišćenje gotovo",          // Rule E
  provjeri_stanje:    "Potrebna provjera",                 // Rule F
  cekaj_mjerenje:     "Nedovoljno podataka",               // Rule G
};

export const CLEANING_STATE_SEVERITY: Record<CleaningState, "ok" | "warn" | "critical" | "info"> = {
  aktivno_ciscenje:  "ok",
  ciscenje_u_tijeku: "ok",
  sredstvo_slabi:    "warn",
  dodaj_sredstvo:    "warn",
  novi_ciklus:       "critical",
  provjeri_stanje:   "warn",
  cekaj_mjerenje:    "info",
};

// ─── Primary Instruction ─────────────────────────────────────────────────────

export type GlavnaUputa =
  | "nastavi_cirkulaciju"
  | "nastavi_i_prati"
  | "dodaj_nadopunu"
  | "pokusaj_nadopunu_ili_novi_ciklus"
  | "pokreni_novi_ciklus"
  | "isperi_i_novi_ciklus"
  | "provjeri_protok"
  | "pricekaj_mjerenje";

export const GLAVNA_UPUTA_LABELS: Record<GlavnaUputa, string> = {
  nastavi_cirkulaciju:                "Nastavi cirkulaciju",               // A
  nastavi_i_prati:                    "Nastavi i napravi novo mjerenje",   // A gentle
  dodaj_nadopunu:                     "Dodaj sredstvo",                    // B
  pokusaj_nadopunu_ili_novi_ciklus:   "Pokreni novi ciklus",              // C
  pokreni_novi_ciklus:                "Prekini ciklus i ispusti otopinu",  // D
  isperi_i_novi_ciklus:               "Ispiranje i neutralizacija",        // E
  provjeri_protok:                    "Provjeri sustav",                   // F
  pricekaj_mjerenje:                  "Nastavi cirkulaciju i napravi novo mjerenje", // G
};

// ─── Output ───────────────────────────────────────────────────────────────────

/** STANJE SREDSTVA — chemical state, spec section 2 */
export type StanjeSredstva = "aktivno" | "slabi" | "pri_kraju" | "iscrpljeno" | "nepoznato";

export const STANJE_SREDSTVA_LABELS: Record<StanjeSredstva, string> = {
  aktivno:    "Aktivno",
  slabi:      "Slabi",
  pri_kraju:  "Pri kraju",
  iscrpljeno: "Iscrpljeno",
  nepoznato:  "Nepoznato",
};

export interface CleaningDecision {
  /** STANJE SREDSTVA — spec section 2 */
  stanjeSredstva: StanjeSredstva;
  stanjeSredstvaLabel: string;
  /** STATUS ČIŠĆENJA — current cleaning state */
  stanjeCiscenja: CleaningState;
  stanjeCiscentaLabel: string;
  severity: "ok" | "warn" | "critical" | "info";
  /** Primary instruction */
  glavnaUputa: GlavnaUputa;
  glavnaUputaLabel: string;
  /** Reason / explanation sentence in Croatian */
  zasto: string;
  /** Flow state used in decision */
  flowState: FlowState;
  flowStateLabel: string;
  /** Resolved chemical strength */
  snagaSredstva: SnagaSredstva | null;
  snagaSredstvaLabel: string;
  /** Source of chemical strength */
  colorSource: "pH" | "boja" | null;
  /** True if pH and color estimates disagree */
  colorMismatch: boolean;
  colorMismatchMessage: string | null;
  /** Confidence in the decision */
  confidence: "low" | "medium" | "high";
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface CleaningDecisionInput {
  ph: number;
  /** Δ pH from previous measurement (positive = rising) */
  phChange?: number | null;
  /** pH rate of change per minute */
  phRate?: number | null;
  /** Current flow in L/min */
  flowLMin?: number | null;
  /** Initial flow at cycle start in L/min (for % calc) */
  flowInitialLMin?: number | null;
  /** Δ L/min from cycle start (positive = better flow) */
  flowChangeFromInitial?: number | null;
  /** Δ % from cycle start (pre-computed if available) */
  flowChangePct?: number | null;
  /** Δ L/min from previous measurement */
  flowChangeFromPrevious?: number | null;
  /** Number of measurements in this cycle (for rule G) */
  measurementCount?: number | null;
  /** Number of consecutive stable measurements (for rule E) */
  stableCount?: number | null;
  /** Product indicator zones (from productSnapshot) */
  indicatorZones: IndicatorZona[];
  /** Manual color selected by technician (raw colorName string) */
  selectedColor?: string | null;
  /** Foam / reaction level */
  foam?: FoamLevel | null;
}

// ─── Step 1 — Chemical Strength from pH zone ─────────────────────────────────

function resolvePhStrength(ph: number, zones: IndicatorZona[]): SnagaSredstva | null {
  if (zones.length === 0) return null;
  const zone = nadjiIndikatorZonu(ph, zones);
  return zone?.strength ?? null;
}

function resolveColorStrength(
  selectedColor: string | null | undefined,
  zones: IndicatorZona[]
): SnagaSredstva | null {
  if (!selectedColor || zones.length === 0) return null;
  const lc = selectedColor.toLowerCase();
  const exact = zones.find((z) => z.colorName && z.colorName.toLowerCase() === lc);
  if (exact) return exact.strength;
  const partial = zones.find(
    (z) =>
      z.colorName &&
      (z.colorName.toLowerCase().includes(lc) || lc.includes(z.colorName.toLowerCase()))
  );
  return partial?.strength ?? null;
}

// ─── Step 1b — STANJE SREDSTVA (spec section 2) ──────────────────────────────

function resolveStanjeSredstva(snaga: SnagaSredstva | null): StanjeSredstva {
  switch (snaga) {
    case "jako":
    case "aktivno":   return "aktivno";
    case "slabi":     return "slabi";
    case "pri_kraju": return "pri_kraju";
    case "iscrpljeno": return "iscrpljeno";
    default:          return "nepoznato";
  }
}

// ─── Step 2 — Flow State ─────────────────────────────────────────────────────

const FLOW_RISE_STRONG_PCT   =  5.0;   // > 5% = jako_raste
const FLOW_RISE_PCT          =  1.0;   // > 1% = raste
const FLOW_STABLE_PCT        = -1.0;   // ≥ -1% = stabilno

function resolveFlowState(input: CleaningDecisionInput): FlowState {
  // Prefer %-based change from initial (most reliable)
  let pct: number | null = input.flowChangePct ?? null;

  // Auto-compute pct from flowChangeFromInitial + flowInitialLMin if not provided
  if (pct == null && input.flowChangeFromInitial != null && input.flowInitialLMin != null && input.flowInitialLMin > 0) {
    pct = (input.flowChangeFromInitial / input.flowInitialLMin) * 100;
  }
  // Auto-compute pct from flowLMin - flowInitialLMin
  if (pct == null && input.flowLMin != null && input.flowInitialLMin != null && input.flowInitialLMin > 0) {
    pct = ((input.flowLMin - input.flowInitialLMin) / input.flowInitialLMin) * 100;
  }

  if (pct != null) {
    if (pct > FLOW_RISE_STRONG_PCT) return "jako_raste";
    if (pct > FLOW_RISE_PCT)        return "raste";
    if (pct >= FLOW_STABLE_PCT)     return "stabilno";
    return "pada";
  }
  // Fallback: absolute Δ from initial
  if (input.flowChangeFromInitial != null) {
    const d = input.flowChangeFromInitial;
    if (d > 1.0)  return "raste";
    if (d >= 0)   return "stabilno";
    return "pada";
  }
  // Fallback: Δ from previous measurement
  if (input.flowChangeFromPrevious != null) {
    const d = input.flowChangeFromPrevious;
    if (d > 0.5)  return "raste";
    if (d >= 0)   return "stabilno";
    return "pada";
  }
  // No flow data
  return "nepoznat";
}

// ─── Step 3 — Cleaning State (spec rules A–G) ────────────────────────────────
//
// A) flow strongly improves (>5%)                          → aktivno_ciscenje
// B) flow improves but slows + chemical slabi/pri_kraju    → ciscenje_u_tijeku
// C) chemical iscrpljeno + flow still improves             → aktivno_ciscenje  (new cycle needed)
// D) chemical iscrpljeno + flow stable                     → dodaj_sredstvo    (max effect)
// E) flow stable 2-3 mjerenja + pH stable + no reaction    → novi_ciklus       (done)
// F) flow decreases                                        → provjeri_stanje
// G) only 1 measurement                                    → cekaj_mjerenje

function resolveCleaningState(
  snaga: SnagaSredstva | null,
  flow: FlowState,
  input: CleaningDecisionInput
): CleaningState {
  // Rule G — not enough data
  if (!snaga || flow === "nepoznat") return "cekaj_mjerenje";
  if ((input.measurementCount ?? 1) <= 1) return "cekaj_mjerenje";

  const strongRising = flow === "jako_raste";
  const rising       = flow === "raste" || strongRising;
  const stable       = flow === "stabilno";
  const falling      = flow === "pada";

  const iscrpljeno = snaga === "iscrpljeno";
  const pri_kraju  = snaga === "pri_kraju";
  const slabi      = snaga === "slabi";
  const aktivno    = snaga === "aktivno" || snaga === "jako";

  // Priority order per spec: PROTOK > REAKCIJA > STANJE SREDSTVA > pH
  const hasReaction = input.foam && input.foam !== "nema";

  // Rule F — flow decreasing → check system (highest priority)
  if (falling) return "provjeri_stanje";

  // Rule E — stable 2-3 measurements, no reaction, chemical exhausted/near end
  const stableCount = input.stableCount ?? 0;
  if (stable && stableCount >= 2 && !hasReaction && (iscrpljeno || pri_kraju)) {
    return "novi_ciklus"; // cleaning done
  }

  // REAKCIJA priority — strong foam + rising flow overrides chemical exhaustion
  // (visible reaction means cleaning is still active regardless of pH reading)
  if (hasReaction && (input.foam === "jaka" || input.foam === "vrlo_jaka") && rising) {
    return "aktivno_ciscenje";
  }

  // Rule C — exhausted + flow still improves → still has scale, needs new cycle
  if (iscrpljeno && rising) return "aktivno_ciscenje";

  // Rule D — exhausted + stable → max effect reached
  if (iscrpljeno && stable) return "dodaj_sredstvo";

  // Rule B — chemical slabi/pri_kraju + flow improving but slowing
  if ((slabi || pri_kraju) && rising) return "ciscenje_u_tijeku";

  // Rule B variant — slabi/pri_kraju + stable → needs top-up
  if ((slabi || pri_kraju) && stable) return "sredstvo_slabi";

  // Rule A — strong chemical + flow strongly improves
  if (aktivno && rising) return "aktivno_ciscenje";

  // Active chemical + stable → still cleaning or no scale
  if (aktivno && stable) return "aktivno_ciscenje";

  return "cekaj_mjerenje";
}

// ─── Step 4 — Primary Instruction (spec rules A–G) ───────────────────────────
//
// A → Nastavi cirkulaciju
// B → Dodaj sredstvo
// C → Pokreni novi ciklus
// D → Prekini ciklus i ispusti otopinu
// E → Ispiranje i neutralizacija
// F → Provjeri sustav
// G → Nastavi i napravi novo mjerenje

function resolveGlavnaUputa(state: CleaningState, flow: FlowState, snaga: SnagaSredstva | null): GlavnaUputa {
  const rising = flow === "raste" || flow === "jako_raste";

  let uputa: GlavnaUputa;
  switch (state) {
    case "aktivno_ciscenje":
      // Rule C: exhausted but flow improves → must start new cycle
      if (snaga === "iscrpljeno") { uputa = "pokusaj_nadopunu_ili_novi_ciklus"; break; }
      uputa = "nastavi_cirkulaciju"; break; // Rule A
    case "ciscenje_u_tijeku":
      uputa = "dodaj_nadopunu"; break; // Rule B
    case "sredstvo_slabi":
      uputa = "dodaj_nadopunu"; break; // Rule B variant
    case "dodaj_sredstvo":
      uputa = "pokreni_novi_ciklus"; break; // Rule D
    case "novi_ciklus":
      uputa = "isperi_i_novi_ciklus"; break; // Rule E
    case "provjeri_stanje":
      uputa = "provjeri_protok"; break; // Rule F
    case "cekaj_mjerenje":
    default:
      uputa = "pricekaj_mjerenje"; break; // Rule G
  }

  // ─── Contradiction guard (spec rule 4) ─────────────────���────────────────────
  // If flow is rising, NEVER allow: Dodaj sredstvo, Ispiranje, Prekini ciklus
  // Override to: Nastavi cirkulaciju
  if (rising && (
    uputa === "dodaj_nadopunu" ||
    uputa === "isperi_i_novi_ciklus" ||
    uputa === "pokreni_novi_ciklus"
  )) {
    return "nastavi_cirkulaciju";
  }

  return uputa;
}

// ─── Step 5 — ZAŠTO sentence ─────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH: flow trend controls the explanation first.
// State/snaga are used only to add context — never to contradict flow.

function resolveZasto(
  input: CleaningDecisionInput,
  snaga: SnagaSredstva | null,
  flow: FlowState,
  state: CleaningState
): string {
  const phFmt = input.ph.toFixed(2);

  // ── Primary branch: flowState controls the explanation ───────────────────────
  switch (flow) {
    case "jako_raste":
      // Acceptance test spec: this must always return the strong-flow sentence
      return `Protok se snažno povećava → čišćenje vrlo učinkovito.`;

    case "raste":
      if (snaga === "iscrpljeno") {
        return `Protok se poboljšava, ali sredstvo je iscrpljeno → ima kamenca, pokrenuti novi ciklus.`;
      }
      return `Protok se poboljšava → čišćenje aktivno (pH ${phFmt}).`;

    case "stabilno": {
      const stableCount = input.stableCount ?? 0;
      if (state === "novi_ciklus" && stableCount >= 2) {
        return `Protok stabilan ${stableCount} mjerenja bez reakcije → kemijsko čišćenje gotovo.`;
      }
      if (state === "novi_ciklus") {
        return `Protok stabilan, nema aktivne reakcije → kemijsko čišćenje gotovo.`;
      }
      if (state === "dodaj_sredstvo") {
        return `Nema promjene protoka → dosegnut maksimalni učinak. Prekini ciklus i ispusti otopinu.`;
      }
      if (snaga === "slabi" || snaga === "pri_kraju") {
        return `Nema promjene protoka → učinak čišćenja slab. Razmotri nadopunu sredstva (pH ${phFmt}).`;
      }
      return `Nema promjene protoka → učinak čišćenja slab (pH ${phFmt}).`;
    }

    case "pada":
      return `Protok pada → mogući problem u sustavu (pH ${phFmt}). Provjeri spojeve i protok.`;

    case "nepoznat":
    default:
      return `Nema podataka o protoku — nastavi cirkulaciju i napravi novo mjerenje (pH ${phFmt}).`;
  }
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function resolveConfidence(
  snaga: SnagaSredstva | null,
  flow: FlowState,
  hasIndicatorZones: boolean
): "low" | "medium" | "high" {
  if (!snaga && flow === "nepoznat") return "low";
  if (!hasIndicatorZones) return "low";
  if (flow === "nepoznat" || !snaga) return "medium";
  return "high";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a structured cleaning decision from field measurement data.
 * Pure function — no side effects.
 */
export function generirajCleaningDecision(
  input: CleaningDecisionInput
): CleaningDecision {
  const phStrength    = resolvePhStrength(input.ph, input.indicatorZones);
  const colorStrength = resolveColorStrength(input.selectedColor, input.indicatorZones);
  const chemResult    = resolveChemicalStrength(phStrength, colorStrength);

  const snaga          = chemResult.finalStrength;
  const stanjeSredstva = resolveStanjeSredstva(snaga);
  const flowState      = resolveFlowState(input);
  const state          = resolveCleaningState(snaga, flowState, input);
  const uputa          = resolveGlavnaUputa(state, flowState, snaga);
  const zasto          = resolveZasto(input, snaga, flowState, state);
  const confidence     = resolveConfidence(snaga, flowState, input.indicatorZones.length > 0);

  return {
    stanjeSredstva,
    stanjeSredstvaLabel:   STANJE_SREDSTVA_LABELS[stanjeSredstva],
    stanjeCiscenja:        state,
    stanjeCiscentaLabel:   CLEANING_STATE_LABELS[state],
    severity:              CLEANING_STATE_SEVERITY[state],
    glavnaUputa:           uputa,
    glavnaUputaLabel:      GLAVNA_UPUTA_LABELS[uputa],
    zasto,
    flowState,
    flowStateLabel:        FLOW_STATE_LABELS[flowState],
    snagaSredstva:         snaga,
    snagaSredstvaLabel:    snaga ? SNAGA_SREDSTVA_LABELS[snaga] : "—",
    colorSource:           chemResult.source,
    colorMismatch:         chemResult.warning,
    colorMismatchMessage:  chemResult.warningMessage,
    confidence,
  };
}
