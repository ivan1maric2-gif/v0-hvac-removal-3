// ─── Recommendation engine for HVAC descaling field guide ──────────────────
// All labels and texts in Croatian.

import type {
  Mjerenje,
  Ciklus,
  Podsesija,
  Sesija,
  FoamLevel,
  VisibleReaction,
  Turbidity,
  Sediment,
  CleaningMode,
} from "./types";
import { getMjerenjePH, getMjerenjeTimestamp } from "./types";
import type { Product, ProductPhZone, IndicatorZona } from "./product-types";
import { nadjiZonuZaPH, PH_ZONE_STATUS_LABELS, nadjiIndikatorZonu, SNAGA_SREDSTVA_LABELS } from "./product-types";
import { generirajCleaningDecision } from "./cleaning-decision-engine";
import { getProductEngine } from "./product-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PreporukaAkcija =
  | "continue_circulation"
  | "monitor_next_measurement"
  | "add_top_up"
  | "start_new_cycle"
  | "finish_cycle"
  | "rinse_system"
  | "finish_subsession"
  | "finish_session";

export type PreporukaSigurnost = "low" | "medium" | "high";

export interface Preporuka {
  id: string;
  sessionId: string;
  subsessionId?: string;
  cycleId?: string;
  measurementId?: string;
  createdAt: string;
  // Display
  statusLabel: string;
  explanation: string;
  recommendedAction: PreporukaAkcija;
  recommendedActionLabel: string;
  confidence: PreporukaSigurnost;
  confidenceLabel: string;
  alternatives: string[];
  warnings: string[];
  // pH zone info
  phZoneLabel: string;
  phZoneColor: "green" | "yellow" | "orange" | "red";
  phRateLabel: string | null;
  // Reaction status
  reactionStatusLabel: string;
  // Product-specific info
  usedProductRule: boolean;       // true if product pH zones were used
  productName?: string;
  productPhZoneLabel?: string;    // zone label from the product
  productPhZoneStatus?: string;   // status label from the product
  materialWarningFromProduct?: string;
  // Top-up quantity recommendation (only set when action === "add_top_up")
  recommendedAddAmountL?: number;
  recommendedAddPercent?: number;
  topUpSafetyNote?: string;
  topUpActionBadge?: TopUpActionBadge;
  topUpReason?: string;
  topUpWarning?: string;
  // Scale presence estimate
  scaleStatus?: string;
  scaleRecommendation?: string;
  scaleBadge?: ScaleBadge;
  scaleAddNote?: string;
  scaleAddWarning?: string;
  // Cycle-level decision (rules 1–4)
  cycleDecision?: string;
  cycleDecisionType?: import("./types").CycleDecisionType;
  cycleDecisionReason?: string;
  // Spec engine meta
  elapsedMinutesFromLastAction?: number | null;
  numberOfCycles?: number;
  currentConcPercent?: number | null;
  // Cleaning Decision Engine
  cleaningDecision?: import("./cleaning-decision-engine").CleaningDecision;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const AKCIJA_LABELS: Record<PreporukaAkcija, string> = {
  continue_circulation: "Dodaj novo mjerenje",
  monitor_next_measurement: "Prati još jedno mjerenje",
  add_top_up: "Dodaj nadopunu sredstva",
  start_new_cycle: "Pokreni novi ciklus",
  finish_cycle: "Završi ciklus",
  rinse_system: "Isperi sustav",
  finish_subsession: "Završi podsesiju",
  finish_session: "Završi sesiju",
};

export const SIGURNOST_LABELS: Record<PreporukaSigurnost, string> = {
  low: "Niska",
  medium: "Srednja",
  high: "Visoka",
};

// ─── pH zone ──────────────────────────────────────────────────────────────────

function phZone(ph: number): {
  label: string;
  color: "green" | "yellow" | "orange" | "red";
  meaning: string;
} {
  if (ph < 1.5) {
    return {
      label: "Vrlo agresivna zona",
      color: "red",
      meaning: "Sredstvo je vrlo jako. Pratiti materijal, vrijeme kontakta i sigurnost.",
    };
  }
  if (ph < 2.0) {
    return {
      label: "Jaka aktivnost",
      color: "orange",
      meaning: "Sredstvo je aktivno i ima dobru snagu za otapanje kamenca.",
    };
  }
  if (ph < 3.0) {
    return {
      label: "Optimalna radna zona",
      color: "green",
      meaning: "Sredstvo radi u korisnoj zoni za čišćenje kamenca.",
    };
  }
  if (ph < 4.0) {
    return {
      label: "Reakcija slabi",
      color: "yellow",
      meaning: "Sredstvo se troši ili je reakcija pri kraju.",
    };
  }
  return {
    label: "Otopina nije aktivna",
    color: "red",
    meaning: "Sredstvo je izgubilo učinkovitost. pH ≥ 4.0 — reakcija nije aktivna.",
  };
}

// ─── pH rate zone ─────────────────────────────────────────────────────────────

function phRateLabel(rate: number | undefined): string | null {
  if (rate === undefined || rate === null) return null;
  if (rate > 0.05) return "Brza potrošnja sredstva";
  if (rate >= 0.02) return "Normalna reakcija";
  if (rate > 0) return "Spora reakcija";
  if (rate <= 0) return "pH stabilan ili pada";
  return null;
}

// ─── Rate zone classification ─────────────────────────────────────────────────

export type RateZoneStatus = "Jaka reakcija" | "Normalna reakcija" | "Slaba reakcija";

export interface RateZone {
  status: RateZoneStatus;
  meaning: string;
  /** "up" | "stable" | "down" — for trend arrow display */
  trend: "up" | "stable" | "down";
  rate: number;
}

/**
 * Classifies a ΔpH/min value into one of three spec-defined reaction zones.
 * Returns null when rate is undefined or null.
 */
export function calcRateZone(ratePerMin: number | undefined | null): RateZone | null {
  if (ratePerMin == null) return null;
  const rate = ratePerMin;

  if (rate > 0.05) {
    return { status: "Jaka reakcija", meaning: "Intenzivno otapanje kamenca", trend: "up", rate };
  }
  if (rate >= 0.02) {
    return { status: "Normalna reakcija", meaning: "Stabilno otapanje", trend: "up", rate };
  }
  return {
    status: "Slaba reakcija",
    meaning: rate < 0 ? "Reakcija završena / pH pada" : "Reakcija usporava ili završava",
    trend: rate < -0.005 ? "down" : "stable",
    rate,
  };
}

// ─── Foam / reaction helpers ──────────────────────────────────────────────────

function isHighFoam(foam: FoamLevel | undefined): boolean {
  return foam === "jaka" || foam === "vrlo_jaka";
}

function isMediumFoam(foam: FoamLevel | undefined): boolean {
  return foam === "srednja";
}

function isNoFoam(foam: FoamLevel | undefined): boolean {
  return !foam || foam === "nema";
}

function reactionStatusLabel(foam: FoamLevel | undefined, reaction: VisibleReaction | undefined): string {
  if (isHighFoam(foam) || reaction === "jaka" || reaction === "vrlo_jaka") return "Aktivna reakcija";
  if (isMediumFoam(foam) || reaction === "normalna") return "Reakcija još traje";
  if (foam === "slaba" || reaction === "slaba") return "Reakcija slabi";
  if (isNoFoam(foam) && (!reaction || reaction === "nema")) return "Nema vidljive reakcije";
  return "Nepoznato stanje reakcije";
}

// ─── Flow helpers ─────────────�����─────────────────��─────────────────────────────

function flowLabel(changeFromInitial: number | undefined): string | null {
  if (changeFromInitial === undefined) return null;
  const pct = changeFromInitial; // already in L/min delta — use as is for qualitative label
  if (pct > 10) return "Protok se značajno poboljšao";
  if (pct >= 3) return "Protok se blago poboljšao";
  if (pct >= -3) return "Protok je uglavnom stabilan";
  return "Protok se pogoršao — moguće začepljenje, talog ili mjerna greška";
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function isSedimentHeavy(s: Sediment | undefined): boolean {
  return s === "puno";
}

function isTurbidityHeavy(t: Turbidity | undefined): boolean {
  return t === "jaka";
}

// ─── Top-up quantity recommendation ──────────────────────────────────────────

/**
 * Calculates the suggested chemical top-up amount based on:
 * - current pH vs optimal zone
 * - pH rate (how fast pH is rising)
 * - total solution volume
 * - foam/reaction presence (indicates active scale still present)
 *
 * Returns null if product is missing or no top-up is needed.
 */
export type TopUpActionBadge =
  | "Ne dodavati"
  | "Dodaj malo"
  | "Dodaj srednje"
  | "Novi ciklus"
  | "Ispiranje";

export interface TopUpRecommendation {
  recommendedAddAmountL: number;
  recommendedAddPercent: number;
  topUpSafetyNote: string;
  correctionLevel: "none" | "mild" | "medium" | "strong";
  topUpActionBadge: TopUpActionBadge;
  topUpReason: string;
  topUpWarning?: string;
}

/**
 * Spec-defined chemical top-up recommendation engine.
 * Uses current pH, target working pH range, rate, elapsed time,
 * solution volume, and total chemical already added to determine
 * the recommended top-up amount and action badge.
 */
export function calcTopUpRecommendation({
  ph,
  phRate,
  totalSolutionVolumeL,
  totalChemicalAddedL,
  elapsedTimeMinutes,
  product,
  foamPresent,
  reactionPresent,
  isOptimalZone,
}: {
  ph: number;
  phRate: number | undefined;
  totalSolutionVolumeL: number | undefined;
  totalChemicalAddedL?: number | null;
  elapsedTimeMinutes?: number | null;
  product?: { name: string; dosageMin?: number | null; dosageMax?: number | null; dosageUnit?: string | null } | null;
  foamPresent: boolean;
  reactionPresent: boolean;
  isOptimalZone: boolean;
}): TopUpRecommendation | null {
  if (!product) return null;
  if (isOptimalZone) return null;

  const vol = totalSolutionVolumeL ?? 0;
  if (vol <= 0) return null;

  const rate = phRate ?? 0;
  const addedL = totalChemicalAddedL ?? 0;

  // Determine target working pH ceiling from product name
  // FX: ideal 2.0–3.0 | DS3: ideal 1.5–3.0 | default: 3.0
  const productNameUpper = (product.name ?? "").toUpperCase();
  const targetWorkingPH = productNameUpper.includes("DS3") ? 3.0 : 3.0;

  // Safety warning: elapsed time < 10 min
  const topUpWarning =
    elapsedTimeMinutes != null && elapsedTimeMinutes < 10
      ? "Ne donositi odluku prerano. Pričekati minimalno 10 minuta od zadnjeg dodavanja."
      : undefined;

  // Rule 1 — pH still in working zone → no addition
  if (ph < targetWorkingPH) {
    return {
      recommendedAddAmountL: 0,
      recommendedAddPercent: 0,
      topUpSafetyNote: "pH je još dovoljno nizak.",
      correctionLevel: "none",
      topUpActionBadge: "Ne dodavati",
      topUpReason: "pH je još dovoljno nizak",
      topUpWarning,
    };
  }

  // Rule 4 — pH exhausted (> 4.0) → new cycle, don't top-up
  if (ph > 4.0) {
    return {
      recommendedAddAmountL: 0,
      recommendedAddPercent: 0,
      topUpSafetyNote: "Otopina je iscrpljena. Ispiranje i novi ciklus.",
      correctionLevel: "none",
      topUpActionBadge: "Novi ciklus",
      topUpReason: "Otopina je iscrpljena; preporuka je ispiranje i novi ciklus",
      topUpWarning,
    };
  }

  // Rule 2 — pH in 3.0–4.0 AND rate > 0.02 → small top-up (10% of already added)
  // Rule 3 — pH in 3.0–4.0 AND rate < 0.02 → medium top-up (20% of already added)
  const baseRef = addedL > 0 ? addedL : vol; // fall back to solution volume if nothing added yet
  let percentOfRef: number;
  let correctionLevel: TopUpRecommendation["correctionLevel"];
  let topUpActionBadge: TopUpActionBadge;
  let topUpReason: string;

  if (rate > 0.02) {
    // Reaction still running but pH is rising
    percentOfRef = 0.10;
    correctionLevel = "mild";
    topUpActionBadge = "Dodaj malo";
    topUpReason = "Reakcija još traje, ali pH raste";
  } else {
    // Reaction slowing or stopped
    percentOfRef = 0.20;
    correctionLevel = "medium";
    topUpActionBadge = "Dodaj srednje";
    topUpReason = "Kemija slabi i reakcija je spora";
  }

  let recommendedAddAmountL = Math.round(baseRef * percentOfRef * 10) / 10;
  const recommendedAddPercent = Math.round(percentOfRef * 100 * 10) / 10;

  // Safety rule — top-up > 25% of solution volume → force new cycle
  if (recommendedAddAmountL > vol * 0.25) {
    return {
      recommendedAddAmountL: 0,
      recommendedAddPercent: 0,
      topUpSafetyNote: "Nadopuna bi bila prevelika i nepouzdana.",
      correctionLevel: "none",
      topUpActionBadge: "Novi ciklus",
      topUpReason: "Nadopuna bi bila prevelika i nepouzdana",
      topUpWarning,
    };
  }

  return {
    recommendedAddAmountL,
    recommendedAddPercent,
    topUpSafetyNote: "Dodavati postupno, uz miješanje i kontrolu pH nakon 5–10 minuta.",
    correctionLevel,
    topUpActionBadge,
    topUpReason,
    topUpWarning,
  };
}

// ─── Cleaning effectiveness calculation ──────────────────────────────────────

export type CleaningEffectivenessStatus =
  | "Slab učinak"
  | "Umjeren učinak"
  | "Dobar učinak"
  | "Vrlo dobar učinak";

export interface CleaningEffectiveness {
  firstFlowLMin: number | null;
  latestFlowLMin: number | null;
  flowImprovementPercent: number | null;
  cleaningEffectivenessStatus: CleaningEffectivenessStatus | null;
  effectivenessExplanation: string;
  warning?: string;
  additionalNote?: string;
}

/**
 * Calculates cleaning effectiveness from first and last measurements in a cycle.
 * Returns null for both status fields if no flow data is available.
 */
export function calcCleaningEffectiveness(
  mjerenja: import("./types").Mjerenje[]
): CleaningEffectiveness {
  if (mjerenja.length === 0) {
    return {
      firstFlowLMin: null,
      latestFlowLMin: null,
      flowImprovementPercent: null,
      cleaningEffectivenessStatus: null,
      effectivenessExplanation: "Nema mjerenja za izračun učinkovitosti.",
    };
  }

  // Find first and last measurements with flow data
  const withFlow = mjerenja.filter((m) => m.flowLMin != null && m.flowLMin > 0);
  const firstFlow = withFlow.length > 0 ? (withFlow[0].flowLMin ?? null) : null;
  const latestFlow = withFlow.length > 0 ? (withFlow[withFlow.length - 1].flowLMin ?? null) : null;

  if (firstFlow === null || latestFlow === null || firstFlow === 0) {
    // pH activity check as fallback
    const firstPh = mjerenja.length > 0 ? (mjerenja[0].ph ?? mjerenja[0].pH) : null;
    const latestPh = mjerenja.length > 1 ? (mjerenja[mjerenja.length - 1].ph ?? mjerenja[mjerenja.length - 1].pH) : null;
    const phReacted =
      firstPh != null && latestPh != null && Math.abs((latestPh as number) - (firstPh as number)) > 0.3;
    return {
      firstFlowLMin: null,
      latestFlowLMin: null,
      flowImprovementPercent: null,
      cleaningEffectivenessStatus: null,
      effectivenessExplanation: phReacted
        ? "Nema podataka o protoku, ali reakcija pH je zabilježena."
        : "Nema dovoljno podataka o protoku za izračun učinkovitosti.",
    };
  }

  // Rule: flow L/min = 600 / flowSeconds10L (already stored as flowLMin on Mjerenje)
  const flowImprovementPercent = ((latestFlow - firstFlow) / firstFlow) * 100;

  let cleaningEffectivenessStatus: CleaningEffectivenessStatus;
  let effectivenessExplanation: string;

  // Rules 1–4
  if (flowImprovementPercent > 20) {
    cleaningEffectivenessStatus = "Vrlo dobar učinak";
    effectivenessExplanation = `Protok se poboljšao za ${flowImprovementPercent.toFixed(1)}%. Izvrsni rezultati čišćenja.`;
  } else if (flowImprovementPercent >= 10) {
    cleaningEffectivenessStatus = "Dobar učinak";
    effectivenessExplanation = `Protok se poboljšao za ${flowImprovementPercent.toFixed(1)}%. Dobri rezultati čišćenja.`;
  } else if (flowImprovementPercent >= 3) {
    cleaningEffectivenessStatus = "Umjeren učinak";
    effectivenessExplanation = `Protok se poboljšao za ${flowImprovementPercent.toFixed(1)}%. Umjeren učinak — moguće je nastaviti s daljnjim tretmanom.`;
  } else {
    cleaningEffectivenessStatus = "Slab učinak";
    effectivenessExplanation = `Protok se nije značajno poboljšao (${flowImprovementPercent.toFixed(1)}%). Preporučuje se ponavljanje tretmana.`;
  }

  // Rule 5 — pH reaction present but flow didn't improve
  const firstPh = mjerenja[0].ph ?? mjerenja[0].pH ?? null;
  const latestPh = mjerenja[mjerenja.length - 1].ph ?? mjerenja[mjerenja.length - 1].pH ?? null;
  const phReacted =
    firstPh != null && latestPh != null && Math.abs((latestPh as number) - (firstPh as number)) > 0.3;
  const additionalNote =
    phReacted && flowImprovementPercent < 5
      ? "Kemijska reakcija je bila prisutna, ali protok se nije značajno poboljšao."
      : undefined;

  // Rule 6 — flow worsened
  const warning =
    flowImprovementPercent < -2
      ? "Protok je lošiji nego na početku. Provjeri filter, začepljenje ili otpuštene naslage."
      : undefined;

  return {
    firstFlowLMin: Math.round(firstFlow * 10) / 10,
    latestFlowLMin: Math.round(latestFlow * 10) / 10,
    flowImprovementPercent: Math.round(flowImprovementPercent * 10) / 10,
    cleaningEffectivenessStatus,
    effectivenessExplanation,
    warning,
    additionalNote,
  };
}

// ─── Cycle decision engine ────────────────────────────────────────────────────

import type { CycleDecisionType } from "./types";

export interface CycleDecisionResult {
  decision: CycleDecisionType;
  decisionLabel: string;
  reason: string;
}

export const CYCLE_DECISION_LABELS: Record<CycleDecisionType, string> = {
  nastavi_ciklus: "Nastavi ciklus",
  nadopuni_sredstvo: "Nadopuni sredstvo",
  zavrsi_i_isperi: "Završi ciklus i isperi",
  zavrsi_i_novi_ciklus: "Završi ciklus i pokreni novi",
  zavrsi_posao: "Završi posao",
  operator_override: "Ručni odabir operatera",
};

/**
 * Determines the cycle-level decision based on pH, reaction indicators, and history.
 * Implements the 4 spec rules.
 */
export function calcCycleDecision({
  ph,
  phRising,
  phStable,
  phRate,
  isOptimalZone,
  foamPresent,
  reactionPresent,
  scaleStatus,
  totalTopUps,
  flowImproved,
}: {
  ph: number;
  phRising: boolean;
  phStable: boolean;
  phRate: number | undefined;
  isOptimalZone: boolean;
  foamPresent: boolean;
  reactionPresent: boolean;
  scaleStatus: string | undefined;
  totalTopUps: number;
  flowImproved: boolean;
}): CycleDecisionResult {
  const rate = phRate ?? 0;

  // Rule 1 — Continue current cycle
  // pH in optimal zone AND rate shows reaction AND foam present or scale likely
  if (
    isOptimalZone &&
    rate > 0.01 &&
    (foamPresent || scaleStatus?.toLowerCase().includes("ima"))
  ) {
    return {
      decision: "nastavi_ciklus",
      decisionLabel: CYCLE_DECISION_LABELS["nastavi_ciklus"],
      reason: "Sredstvo je još aktivno i reakcija traje.",
    };
  }

  // Rule 2 — Top up chemical
  // pH above optimal AND reaction still visible AND top-ups < 2
  if (ph > 3.2 && (reactionPresent || foamPresent) && totalTopUps < 2) {
    return {
      decision: "nadopuni_sredstvo",
      decisionLabel: CYCLE_DECISION_LABELS["nadopuni_sredstvo"],
      reason: "Reakcija još postoji, ali sredstvo slabi.",
    };
  }

  // Rule 4 — End and start new cycle (check before rule 3)
  // pH high and stable AND foam was present (scale uncertain) AND flow not improved AND top-ups >= 2
  if (phStable && ph > 3.8 && !flowImproved && totalTopUps >= 2) {
    return {
      decision: "zavrsi_i_novi_ciklus",
      decisionLabel: CYCLE_DECISION_LABELS["zavrsi_i_novi_ciklus"],
      reason: "Sredstvo je iscrpljeno, a postoji mogućnost zaostalog kamenca.",
    };
  }

  // Rule 3 — End current cycle and rinse
  // pH high and stable AND no foam AND flow improved AND scale likely clean
  if (
    phStable &&
    ph > 3.8 &&
    !foamPresent &&
    flowImproved &&
    (scaleStatus?.toLowerCase().includes("čišćen") || scaleStatus?.toLowerCase().includes("cisteni"))
  ) {
    return {
      decision: "zavrsi_i_isperi",
      decisionLabel: CYCLE_DECISION_LABELS["zavrsi_i_isperi"],
      reason: "Reakcija je završila i protok je poboljšan.",
    };
  }

  // Default — continue and monitor
  return {
    decision: "nastavi_ciklus",
    decisionLabel: CYCLE_DECISION_LABELS["nastavi_ciklus"],
    reason: "Nastavi cirkulaciju i prati sljedeće mjerenje.",
  };
}

// ─── Scale presence detection ─────────────────────────────────────────────────

export type ScaleBadge = "Nastavi" | "Dodaj kemiju" | "Ispiranje" | "Novi ciklus" | "Gotovo";

export interface ScaleStatusResult {
  scaleStatus: string;
  scaleRecommendation: string;
  badge: ScaleBadge;
  addNote?: string;
  addWarning?: string;
}

/**
 * Determines scale presence based on the spec-defined decision engine.
 * Uses rate, pH, foam, and flow data to produce a status, recommendation,
 * an action badge, and optional contextual notes/warnings.
 */
export function calcScaleStatus({
  ph,
  phRising,
  phStable,
  phRate,
  foamPresent,
  reactionPresent,
  flowImprovedFromStart,
  flowBefore,
  flowCurrent,
}: {
  ph: number;
  phRising: boolean;
  phStable: boolean;
  phRate: number | undefined;
  foamPresent: boolean;
  reactionPresent: boolean;
  flowImprovedFromStart: boolean;
  flowBefore?: number | null;
  flowCurrent?: number | null;
}): ScaleStatusResult {
  const rate = phRate ?? 0;

  // ── Core decision rules (rate + pH combinations) ─────────────────────────────

  let scaleStatus: string;
  let scaleRecommendation: string;
  let badge: ScaleBadge;

  if (rate > 0.05) {
    // Rule 1 — Very strong reaction
    scaleStatus = "Još ima puno kamenca";
    scaleRecommendation = "Nastavi cirkulaciju. Ne ispirati još.";
    badge = "Nastavi";
  } else if (rate >= 0.02) {
    // Rule 2 — Normal reaction
    scaleStatus = "Još ima kamenca";
    scaleRecommendation = "Nastavi pratiti pH svakih 10–15 min.";
    badge = "Nastavi";
  } else if (rate < 0.02 && ph < 3.0) {
    // Rule 3 — Weakening but chemistry still active
    scaleStatus = "Reakcija slabi, ali kemija je još aktivna";
    scaleRecommendation = "Nastavi još 10–15 min i ponovi mjerenje.";
    badge = "Nastavi";
  } else if (rate < 0.02 && ph >= 3.0 && ph <= 4.0) {
    // Rule 4 — Possible end of reaction
    scaleStatus = "Mogući kraj reakcije";
    scaleRecommendation = "Provjeri protok. Ako se protok ne poboljšava, napravi ispiranje ili novi ciklus.";
    badge = "Ispiranje";
  } else {
    // Rule 5 — Chemistry exhausted or reaction finished (rate < 0.02 AND pH > 4.0)
    scaleStatus = "Kemija iscrpljena ili reakcija završena";
    scaleRecommendation = "Ne nastavljati s istom otopinom. Ispiranje ili novi ciklus.";
    badge = "Novi ciklus";
  }

  // ── Additional indicators ─────────────────────────────────────────────────────

  let addNote: string | undefined;
  let addWarning: string | undefined;

  // Foam + active rate confirms scale reaction
  if (foamPresent && rate > 0.02) {
    addNote = "Pjena potvrđuje aktivnu reakciju s kamencem.";
  }

  // Flow is improving
  if (
    flowCurrent != null && flowBefore != null
      ? flowCurrent > flowBefore
      : flowImprovedFromStart
  ) {
    const flowNote = "Protok se poboljšava — čišćenje daje rezultat.";
    addNote = addNote ? `${addNote} ${flowNote}` : flowNote;
    // Override badge if flow clearly improved and reaction is ending
    if (badge === "Ispiranje") badge = "Gotovo";
  }

  // No flow improvement and reaction is weak
  const flowWorsened =
    flowCurrent != null && flowBefore != null
      ? flowCurrent <= flowBefore
      : !flowImprovedFromStart;

  if (flowWorsened && rate < 0.02) {
    addWarning = "Nema poboljšanja protoka i reakcija je slaba — moguće začepljenje komadima kamenca ili potreban novi ciklus.";
    if (badge !== "Novi ciklus") badge = "Novi ciklus";
  }

  return { scaleStatus, scaleRecommendation, badge, addNote, addWarning };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

function genId(): string {
  return `prp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface PreporukaInput {
  mjerenje: Mjerenje;
  ciklus: Ciklus;
  previousMjerenje?: Mjerenje;
  sessionId: string;
  subsessionId?: string;
  materialWarning?: string | null;
  /** Pass the product (from productSnapshot or live DB) for product-specific rules. */
  product?: Product | import("./product-types").ProductSnapshot | null;
  /** Material string from subsession (e.g. "Bakar") for material lookup in product. */
  materialName?: string | null;
  /** Part type from subsession — used for product-category vs system-type mismatch check. */
  partType?: import("./types").VrstaDijela | null;
  /** Cleaning mode from the parent session (descaling only). */
  cleaningMode?: CleaningMode | null;
}

export function generirajPreporuku(input: PreporukaInput): Preporuka {
  const { mjerenje, ciklus, sessionId, subsessionId, materialWarning, product, materialName, partType } = input;

  const ph = getMjerenjePH(mjerenje);

  // ��─ Product pH zone lookup ──────────────────────���─────────────────────────
  const productZones = product?.phZones;
  const productPhZone = productZones ? nadjiZonuZaPH(ph, productZones) : null;

  // Product indicator zones — TDS-based, product-specific pH → strength mapping.
  // When available these take priority over generic hardcoded thresholds.
  const productIndZones = (product as import("./product-types").Product)?.indicatorZones ?? [];
  const hasIndZones = productIndZones.length > 0;
  const productIndZone: IndicatorZona | null = hasIndZones
    ? nadjiIndikatorZonu(ph, productIndZones)
    : null;

  // ── Product Engine — koristimo za exhaustionPH i engine-specifičnu logiku ──
  // getProductEngine() vraća specifični engine (DS3, FX, DS40...) ili generic.
  const productEngine = getProductEngine(product as { indicatorType?: string; name?: string; brand?: string } | null);
  // Exhaustion pH iz engine-a — koristi se u generickim pravilima (12+) kao fallback
  const engineExhaustionPH: number = productEngine.exhaustionPH;

  const usedProductRule = Boolean(productPhZone);

  // ── Product material warning override ─────────────────────────────────────
  let materialWarningFromProduct: string | undefined;
  if (product && materialName) {
    const matCompat = product.materialCompatibility.find((m) => m.material === materialName);
    if (matCompat && matCompat.compatibilityStatus !== "compatible") {
      materialWarningFromProduct = matCompat.warning || `${matCompat.material}: ${matCompat.compatibilityStatus}`;
    }
  }

  // Merge material warnings — product-specific overrides generic
  const effectiveMaterialWarning = materialWarningFromProduct ?? materialWarning ?? null;
  const rate = mjerenje.phRatePerMinute;
  const foam = mjerenje.foamLevel;
  const reaction = mjerenje.visibleReaction;
  const turbidity = mjerenje.turbidity;
  const sediment = mjerenje.sediment;
  const flowChange = mjerenje.flowChangeFromInitial;
  const phChange = mjerenje.phChange;
  const topUps = ciklus.nadopune?.length ?? 0;
  const isAfterTopUp = mjerenje.measurementType === "after_top_up";

  const zone = phZone(ph);
  const rateLabel = phRateLabel(rate);
  const reactionLabel = reactionStatusLabel(foam, reaction);
  const hasPrevious = mjerenje.previousPh !== undefined;

  const warnings: string[] = [];
  if (effectiveMaterialWarning) warnings.push(effectiveMaterialWarning);
  if (ph < 1.5) warnings.push("Vrlo agresivna zona — pratiti materijal i sigurnost.");
  if (isSedimentHeavy(sediment)) warnings.push("Puno taloga — otopina može biti zasićena.");
  if (isTurbidityHeavy(turbidity)) warnings.push("Jako zamućena otopina.");
  if (topUps >= 3) warnings.push("Više od 2 nadopune u ovom ciklusu ��� razmotriti novi ciklus.");

  // ── Product-category × system-type mismatch warning ──────────────────────────
  const TPV_PART_SET = new Set<string>(["Spremnik TPV", "Spirala TPV"]);
  if (product && partType) {
    const productCat = (product as import("./product-types").Product).productCategory;
    const partIsTpv = TPV_PART_SET.has(partType);
    if (productCat === "TECHNICAL_CLEANER" && partIsTpv) {
      warnings.push(
        `Upozorenje: odabrano sredstvo (${product.name}) nije namijenjeno za sustave potrošne tople vode (TPV). Za TPV sustave koristiti TPV/DHW odmrzivač kamenca.`
      );
    } else if (productCat === "TPV_DESCALER" && !partIsTpv) {
      warnings.push(
        `Napomena: odabrano sredstvo (${product.name}) je namijenjeno za sustave potrošne tople vode (TPV). Za zatvorene grijačke/rashladne sustave preporučuje se tehničko sredstvo za čišćenje.`
      );
    }
  }

  // ── Colour indicator integration ──────────────────────────────────────────────
  const colourStatus = mjerenje.colorIndicator;
  if (colourStatus && product && (product as import("./product-types").Product).hasColorIndicator) {
    const indicators = (product as import("./product-types").Product).colorIndicators ?? [];
    // Map ColorIndicator values to colour names used in product indicators
    const colourToNameMap: Record<string, string> = {
      plava: "Plava",
      plavo_zelena: "Plavo-zelena",
      zelena: "Zelena",
      zuta: "Žuta / bez boje",
      smeda: "Smeđa / zamućena",
      bez_boje: "Žuta / bez boje",
    };
    const matchedIndicator = indicators.find(
      (ci) => ci.colorName === (colourToNameMap[colourStatus] ?? colourStatus)
    );
    if (matchedIndicator) {
      if (matchedIndicator.chemicalStatus === "exhausted" || matchedIndicator.chemicalStatus === "unknown") {
        warnings.push(`Indikator boje: "${matchedIndicator.colorName}" — ${matchedIndicator.meaning}`);
      } else if (matchedIndicator.chemicalStatus === "weakening") {
        warnings.push(`Indikator boje: "${matchedIndicator.colorName}" — ${matchedIndicator.meaning}`);
      }
    }
  }

  // ── Determine recommended action ───��────────────────────────────────────────

  let action: PreporukaAkcija;
  let statusLabel: string;
  let explanation: string;
  let confidence: PreporukaSigurnost;
  let alternatives: string[] = [];

  const phRising = (phChange !== undefined && phChange > 0) || (rate !== undefined && rate > 0);
  const phStable = rate !== undefined && Math.abs(rate) < 0.01;
  const phFalling = (phChange !== undefined && phChange < 0) || (rate !== undefined && rate < 0);
  const foamPresent = foam && foam !== "nema";
  const reactionPresent = reaction && reaction !== "nema";

  // ���─ Spec inputs derived from ciklus and mjerenje ────────────────────────────
  const lastTopUpTimestamp = ciklus.nadopune?.length
    ? ciklus.nadopune[ciklus.nadopune.length - 1]?.timestamp
    : null;
  const lastActionIso = lastTopUpTimestamp ?? ciklus.createdAt ?? ciklus.timestamp_pocetka ?? null;
  const currentMjTime = new Date(mjerenje.measuredAt ?? mjerenje.timestamp ?? Date.now()).getTime();
  const elapsedMinutesFromLastAction = lastActionIso
    ? Math.round((currentMjTime - new Date(lastActionIso).getTime()) / 60000)
    : null;

  const numberOfCycles = ciklus.cycleNumber ?? 1;
  const currentConcPercent = ciklus.currentChemicalPercent ?? ciklus.chemicalPercent ?? null;
  const flowBeforeLMin = ciklus.mjerenja.length > 0
    ? (ciklus.mjerenja[0].flowLMin ?? null)
    : null;
  const flowCurrentLMin = mjerenje.flowLMin ?? null;
  const flowImprovedEnough = flowBeforeLMin !== null && flowCurrentLMin !== null
    ? (flowCurrentLMin - flowBeforeLMin) / flowBeforeLMin > 0.05
    : null;

  // ── SPEC RULE 0 — Elapsed time guard (highest priority, before all others) ──
  // IF elapsed_time_minutes < 10 → always NASTAVI regardless of other indicators
  if (
    hasPrevious &&
    elapsedMinutesFromLastAction !== null &&
    elapsedMinutesFromLastAction < 10
  ) {
    action = "continue_circulation";
    statusLabel = "Prerano za odluku";
    explanation = "Prerano je za odluku. Pričekati minimalno 10 minuta od zadnjeg dodavanja kemije ili mjerenja.";
    confidence = "high";
    alternatives = ["Nastavi cirkulaciju i ponovi mjerenje za 10 minuta."];
    warnings.push(`Prošlo je samo ${elapsedMinutesFromLastAction} min od zadnje akcije.`);
  }

  // 0. Product-specific zone override — use indicatorZones (TDS) first, fall back to phZones.
  //    Never use global hardcoded thresholds when product data is available.
  let productZoneOverride: { action: PreporukaAkcija; statusLabel: string; explanation: string; confidence: PreporukaSigurnost; alternatives: string[] } | null = null;

  if (hasPrevious) {
    // ── 0a. indicatorZones override (TDS-based, highest priority) ──────────────
    if (productIndZone) {
      const pName = product!.name;
      if (productIndZone.strength === "iscrpljeno") {
        // Ako protok i dalje raste — kemija je iscrpljena ali čišćenje još napreduje
        if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
          productZoneOverride = {
            action: "continue_circulation",
            statusLabel: `Reakcija slabi — čišćenje i dalje napreduje`,
            explanation: `Kemija je oslabljena (${productIndZone.label}), ali protok se još poboljšava. Nastaviti kratko praćenje i razmotriti nadopunu ili novi ciklus.`,
            confidence: "medium",
            alternatives: [
              "Prati protok i ponovi mjerenje za 10–15 minuta.",
              "Pokreni novi ciklus ako se protok prestane poboljšavati.",
            ],
          };
        } else {
          productZoneOverride = {
            action: "start_new_cycle",
            statusLabel: `Sredstvo iscrpljeno`,
            explanation: `${productIndZone.label} (${pName}): ${productIndZone.description} Preporučuje se novi ciklus ili završetak.`,
            confidence: "high",
            alternatives: ["Završi ciklus i isperi sustav.", "Dodaj nadopunu samo ako otopina nije zasićena i bez prethodnih nadopuna."],
          };
        }
      } else if (productIndZone.strength === "pri_kraju" && topUps < 3) {
        // If flow is still clearly improving, don't push "Dodaj sredstvo" yet
        if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
          productZoneOverride = {
            action: "continue_circulation",
            statusLabel: "Čišćenje u tijeku — ima kamenca",
            explanation: `Protok se još poboljšava, čišćenje daje učinak. Nastaviti cirkulaciju i pratiti protok. (Zona: ${productIndZone.label})`,
            confidence: "medium",
            alternatives: ["Prati protok i ponovi mjerenje za 10–15 minuta.", "Dodaj nadopunu tek kada se protok prestane poboljšavati."],
          };
        } else {
          productZoneOverride = {
            action: "add_top_up",
            statusLabel: `${productIndZone.label} — ${SNAGA_SREDSTVA_LABELS[productIndZone.strength]} (${pName})`,
            explanation: `Zona po proizvođaču "${pName}": ${productIndZone.description}`,
            confidence: "medium",
            alternatives: ["Nastavi cirkulaciju i prati još jedno mjerenje.", "Pokreni novi ciklus ako je otopina zasićena talogom."],
          };
        }
      } else if (productIndZone.strength === "slabi" && topUps < 3) {
        // If flow is still clearly improving, don't push "Dodaj sredstvo" yet
        if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
          productZoneOverride = {
            action: "continue_circulation",
            statusLabel: "Čišćenje u tijeku — ima kamenca",
            explanation: `Protok se još poboljšava, čišćenje daje učinak. Nastaviti cirkulaciju i pratiti protok. (Zona: ${productIndZone.label})`,
            confidence: "medium",
            alternatives: ["Prati protok i ponovi mjerenje za 10–15 minuta.", "Dodaj nadopunu tek kada se protok prestane poboljšavati."],
          };
        } else {
          productZoneOverride = {
            action: "add_top_up",
            statusLabel: `${productIndZone.label} — ${SNAGA_SREDSTVA_LABELS[productIndZone.strength]} (${pName})`,
            explanation: `Zona po proizvođaču "${pName}": ${productIndZone.description}`,
            confidence: "medium",
            alternatives: ["Nastavi cirkulaciju i prati još jedno mjerenje.", "Pokreni novi ciklus ako je otopina zasićena talogom."],
          };
        }
      } else if (productIndZone.strength === "jako") {
        warnings.push(`Zona po proizvođaču "${pName}": ${productIndZone.description}`);
      }
    }
    // ── 0b. phZones fallback (legacy, only when no indicatorZones) ─────────────
    else if (productPhZone && !hasIndZones) {
      if (productPhZone.status === "exhausted") {
        productZoneOverride = {
          action: "start_new_cycle",
          statusLabel: `${productPhZone.label} (${product!.name})`,
          explanation: `Prema pH zonama proizvoda "${product!.name}": ${productPhZone.description} Preporuka je ispustiti otopinu i pokrenuti novi ciklus.`,
          confidence: "high",
          alternatives: ["Dodaj nadopunu ako otopina nije zasićena i nema prethodnih nadopuna.", "Završi ciklus i isperi sustav."],
        };
      } else if (productPhZone.status === "weakening" && topUps < 3) {
        if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
          productZoneOverride = {
            action: "continue_circulation",
            statusLabel: "Čišćenje u tijeku — ima kamenca",
            explanation: `Protok se još poboljšava, čišćenje daje učinak. Nastaviti cirkulaciju i pratiti protok. (${productPhZone.label})`,
            confidence: "medium",
            alternatives: ["Prati protok i ponovi mjerenje za 10–15 minuta.", "Dodaj nadopunu tek kada se protok prestane poboljšavati."],
          };
        } else {
          productZoneOverride = {
            action: "add_top_up",
            statusLabel: `${productPhZone.label} (${product!.name})`,
            explanation: `Prema pH zonama proizvoda "${product!.name}": ${productPhZone.description}`,
            confidence: "medium",
            alternatives: ["Nastavi cirkulaciju i prati još jedno mjerenje.", "Pokreni novi ciklus ako je otopina zasićena talogom."],
          };
        }
      } else if (productPhZone.status === "too_strong") {
        warnings.push(`Prema proizvodu "${product!.name}": ${productPhZone.description}`);
      }
    }
  }

  // ── Spec decision rules (primary path) ─────────────────────────────��────────
  // Rate helpers (use undefined-safe access)
  const rateVal = rate ?? 0;

  // RULE 1 — Initial measurement (always first, no trend available)
  if (!hasPrevious && mjerenje.measurementType === "initial_cycle_measurement") {
    action = "monitor_next_measurement";
  statusLabel = "Referentno mjerenje";
  explanation = "Ovo je referentno mjerenje ciklusa. Potrebno je još jedno mjerenje za izračun trenda i ocjenu reakcije.";
    confidence = "high";
    alternatives = ["Nastavi cirkulaciju i ponovi mjerenje za 10–15 minuta."];
  }

  // RULE 2 — STRONG REACTION: pH < 2.5 AND rate > 0.03/min
  else if (ph < 2.5 && hasPrevious && rateVal > 0.03) {
    action = "continue_circulation";
    statusLabel = "Jaka reakcija";
    explanation = "Sredstvo je jako aktivno. Nastaviti cirkulaciju i pratiti vrijednost pH. Ne dodavati kemikaliju.";
    confidence = "high";
    alternatives = [
      "Nastavi cirkulaciju i ponovi mjerenje za 10 minuta.",
      "Završi ciklus ranije ako je materijal osjetljiv na niski pH.",
    ];
    // Foam note: possible scale remains
    if (foamPresent && phRising) {
      warnings.push("Reakcija prisutna — moguće još kamenca.");
    }
  }

  // RULE 3 — NORMAL REACTION: pH 2.5–3.2 AND rate 0.015–0.03
  else if (ph >= 2.5 && ph <= 3.2 && hasPrevious && rateVal >= 0.015 && rateVal <= 0.03) {
    action = "continue_circulation";
    statusLabel = "Normalna reakcija";
    explanation = "Sredstvo je u normalnoj zoni aktivnosti. Nastaviti cirkulaciju i pratiti trend pH.";
    confidence = "medium";
    alternatives = [
      "Nastavi i prati — sljedeće mjerenje za 10–15 minuta.",
      "Dodaj nadopunu ako pH dosegne 3.5.",
    ];
    if (foamPresent && phRising) {
      warnings.push("Reakcija prisutna — moguće još kamenca.");
    }
  }

  // RULE 4 — WEAKENING REACTION: pH > 3.2 AND rising AND rate < 0.015
  //           GUARD: if flow is still clearly improving → "Nastavi cirkulaciju", NOT "Dodaj sredstvo"
  else if (ph > 3.2 && phRising && hasPrevious && rateVal < 0.015) {
    if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
      // Flow still improving — current solution is working on scale, don't waste chemical
      action = "continue_circulation";
      statusLabel = "Čišćenje u tijeku — ima kamenca";
      explanation = "Protok se još poboljšava, čišćenje daje učinak. Nastaviti cirkulaciju i pratiti protok.";
      confidence = "medium";
      alternatives = [
        "Prati protok i ponovi mjerenje za 10–15 minuta.",
        "Dodaj nadopunu tek kada se protok prestane poboljšavati.",
      ];
      if (foamPresent) {
        warnings.push("Reakcija prisutna — moguće još kamenca.");
      }
    } else {
      action = "add_top_up";
      statusLabel = "Reakcija slabi";
      explanation = "Sredstvo slabi. pH raste, ali sporo. Razmotriti nadopunu sredstva u postojeću otopinu.";
      confidence = ph > 3.6 ? "high" : "medium";
      alternatives = [
        "Nastavi cirkulaciju i prati još jedno mjerenje.",
        "Pokreni novi ciklus ako je otopina zasićena talogom.",
      ];
      if (foamPresent && phRising) {
        warnings.push("Reakcija prisutna — moguće još kamenca.");
      }
    }
  }

  // RULE 5 — CHEMICAL EXHAUSTED: pH > 3.8 AND stable (rate ≈ 0)
  //           GUARD: if flow is still improving, downgrade to continue (not finish yet)
  else if (ph > 3.8 && phStable && hasPrevious && rateVal < 0.01) {
    // Flow still improving → don't end yet even if pH is stable/high
    if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true) {
      action = "continue_circulation";
      statusLabel = "Sredstvo slabi, ali protok raste";
      explanation = "pH je visok i sredstvo slabi, ali protok se poboljšava. Nastaviti cirkulaciju dok se protok ne stabilizira ili dosegne zadovoljavajuću razinu.";
      confidence = "medium";
      alternatives = [
        "Prati protok i ponovi mjerenje za 10–15 minuta.",
        "Ako protok stagnira, dodaj nadopunu ili pokreni novi ciklus.",
      ];
    } else if (isAfterTopUp || topUps >= 2) {
      action = "start_new_cycle";
      statusLabel = "Sredstvo iscrpljeno — nadopuna nije pomogla";
      explanation = "pH je visok i stabilan nakon nadopune. Nadopuna više nije optimalna. Ispustiti otopinu i pokrenuti novi ciklus.";
      confidence = "high";
      alternatives = ["Završi ciklus i isperi sustav."];
    } else {
      action = "start_new_cycle";
      statusLabel = "Sredstvo iscrpljeno";
      explanation = "pH je visok i stabilan — sredstvo je izgubilo učinkovitost. Završi ciklus ili dodaj sredstvo.";
      confidence = "medium";
      alternatives = [
        "Dodaj nadopunu sredstva ako otopina još nije zasićena i nije bilo nadopuna.",
        "Završi ciklus i isperi sustav.",
      ];
    }
  }

  // RULE 6 — POSSIBLE SCALE REMAINS: foam present AND pH rising (any pH)
  else if (foamPresent && phRising && hasPrevious) {
    action = "continue_circulation";
    statusLabel = "Reakcija prisutna";
    explanation = "Pjena je prisutna i pH raste — reakcija traje, moguće ima još kamenca. Nastaviti cirkulaciju.";
    confidence = "medium";
    alternatives = [
      "Nastavi cirkulaciju i ponovi mjerenje za 10–15 minuta.",
      "Dodaj nadopunu ako pH dosegne 3.5.",
    ];
    warnings.push("Reakcija prisutna — moguće još kamenca.");
  }

  // RULE 7 — CLEAN SYSTEM LIKELY: no foam + pH stable high > 3.8 + no reaction
  //           GUARD: must NOT trigger if Δ pH > 0 or Δ protok > 0 (still improving)
  else if (
    isNoFoam(foam) &&
    phStable &&
    ph > 3.8 &&
    (!reaction || reaction === "nema" || reaction === "slaba") &&
    // Do NOT finish if pH is still rising
    !phRising &&
    // Do NOT finish if flow is still clearly improving
    !(flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true)
  ) {
    action = "finish_cycle";
    statusLabel = "Sustav vjerojatno čist";
    explanation = "Nema pjene, pH je visok i stabilan, bez vidljive reakcije. Sustav je vjerojatno čist. Preporuka je ispuštanje otopine i ispiranje.";
    confidence = "high";
    alternatives = [
      "Nastavi cirkulaciju još 10 minuta za potvrdu.",
      "Dodaj nadopunu ako protok još nije zadovoljavajući.",
    ];
  }

  // RULE 7b — Flow still improving but pH stabilised → keep circulating
  else if (
    isNoFoam(foam) &&
    phStable &&
    ph > 3.8 &&
    (!reaction || reaction === "nema" || reaction === "slaba") &&
    flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true
  ) {
    action = "continue_circulation";
    statusLabel = "Protok se poboljšava — nastavi";
    explanation = "pH je visok i stabilan, ali protok se i dalje poboljšava. Nastaviti cirkulaciju dok se protok ne stabilizira.";
    confidence = "medium";
    alternatives = [
      "Prati protok i ponovi mjerenje za 10–15 minuta.",
      "Završi ciklus ako protok dosegne zadovoljavajuću razinu.",
    ];
  }

  // ── SPEC RULE A — Concentration too low → new cycle ─────────────────────────
  // IF current_concentration_percent < 1.0 AND pH is in weak zone → start new cycle
  else if (
    currentConcPercent !== null &&
    currentConcPercent < 1.0 &&
    ph >= 3.0 &&
    hasPrevious
  ) {
    action = "start_new_cycle";
    statusLabel = "Koncentracija preniska";
    explanation = `Koncentracija kemijskog sredstva (${currentConcPercent.toFixed(2)}%) je ispod 1% — otopina nema dovoljno aktivne tvari za učinkovito čišćenje. Preporuka je novi ciklus s čistom otopinom.`;
    confidence = "high";
    alternatives = [
      "Dodaj nadopunu ako sustav to dopušta i volumen to omogućuje.",
      "Završi ciklus i isperi sustav.",
    ];
  }

  // ── SPEC RULE B — Multiple cycles + no flow improvement → escalate ───────────
  // IF number_of_cycles > 2 AND flow not improved ��� recommend professional inspection
  else if (
    numberOfCycles > 2 &&
    flowBeforeLMin !== null &&
    flowCurrentLMin !== null &&
    flowImprovedEnough === false &&
    ph >= 3.0 &&
    hasPrevious
  ) {
    action = "finish_cycle";
    statusLabel = "Bez napretka protoka";
    explanation = `Ovo je ${numberOfCycles}. ciklus čišćenja, a protok se nije značajno poboljšao (${flowBeforeLMin.toFixed(1)} → ${flowCurrentLMin.toFixed(1)} L/min). Razmotriti mehaničko čišćenje, inspekciju ili drugačiji kemijski tretman.`;
    confidence = "medium";
    alternatives = [
      "Nastavi s još jednim ciklusom uz drugu vrstu kemijskog sredstva.",
      "Konsultiraj stručnjaka za mehaničko čišćenje.",
    ];
    warnings.push("Kemijsko čišćenje nije postiglo zadovoljavajuće poboljšanje protoka.");
  }

  // ── Legacy fallback rules (kept unchanged) ───────────────────────────────────

  // LEGACY 1 — pH > 4 strong signal (catches cases outside spec rate conditions)
  //             GUARD: if flow still clearly improving, don't finish yet
  else if (ph > 4.0) {
    // Flow still improving — keep circulating despite high pH
    if (flowChange !== undefined && flowChange > 0 && flowImprovedEnough === true && !isAfterTopUp && topUps < 2) {
      action = "continue_circulation";
      statusLabel = "pH visok, ali protok raste";
      explanation = "pH je visok, ali protok se i dalje poboljšava. Nastaviti cirkulaciju i pratiti protok. Ne zaključivati gotovo dok se protok poboljšava.";
      confidence = "medium";
      alternatives = [
        "Prati protok i ponovi mjerenje za 10–15 minuta.",
        "Ako pH nastavlja rasti i protok stagnira, pokreni novi ciklus.",
      ];
    }
    // If this is after a top-up, extra weight on new cycle
    else if (isAfterTopUp || topUps >= 2) {
      action = "start_new_cycle";
      statusLabel = "Sredstvo iscrpljeno — nadopuna nije pomogla";
      explanation = "pH je i dalje visok nakon nadopune. Nadopuna vjerojatno više nije optimalna. Preporuka je ispustiti otopinu, isprati sustav i pokrenuti novi ciklus s čistom vodom i novim sredstvom.";
      confidence = "high";
      alternatives = ["Završi ciklus i isperi sustav."];
    } else if (isSedimentHeavy(sediment) || isTurbidityHeavy(turbidity)) {
      action = "start_new_cycle";
      statusLabel = "Sredstvo iscrpljeno — jako onečišćena otopina";
      explanation = "pH je visok i otopina je jako onečišćena. Nadopuna vjerojatno više nije optimalna. Preporuka je ispustiti otopinu, isprati sustav i pokrenuti novi ciklus s čistom vodom i novim sredstvom.";
      confidence = "high";
      alternatives = ["Završi ciklus i isperi sustav."];
    } else {
      action = "start_new_cycle";
      statusLabel = "Otopina nije aktivna";
      explanation = "pH je iznad 4.0. Sredstvo je izgubilo učinkovitost — otopina više nije aktivna. Ispustiti otopinu, isprati sustav i pokrenuti novi ciklus.";
      confidence = "medium";
      alternatives = [
        "Dodaj nadopunu sredstva ako je otopina još čista i ako nije bilo nadopuna.",
        "Završi ciklus i isperi sustav.",
      ];
    }
  }

  // 3. Heavy sediment + turbidity → new cycle
  else if (isSedimentHeavy(sediment) && isTurbidityHeavy(turbidity)) {
    action = "start_new_cycle";
    statusLabel = "Jako onečišćena otopina";
    explanation = "Puno taloga i jako zamućena otopina. Nastavak cirkulacije s ovom otopinom nije preporučljivo. Ispustiti otopinu i pokrenuti novi ciklus.";
    confidence = "high";
    alternatives = ["Završi ciklus ako je čišćenje dovoljno."];
  }

  // 4. pH 3.0–4.5 + rising + foam present + not too many top-ups → add top-up
  else if (
    ph >= 3.0 && ph <= 4.5 &&
    phRising &&
    foamPresent &&
    topUps < 3 &&
    !isSedimentHeavy(sediment)
  ) {
    action = "add_top_up";
    statusLabel = "Reakcija traje — sredstvo slabi";
    explanation = "Sredstvo slabi, ali reakcija još traje. Moguća je nadopuna sredstva u postojeću otopinu.";
    confidence = ph > 3.5 ? "high" : "medium";
    alternatives = [
      "Nastavi cirkulaciju i prati trend pH još jedno mjerenje.",
      "Pokreni novi ciklus ako je otopina zasićena talogom ili jako onečišćena.",
    ];
  }

  // 5. pH 1.5–3.0 + foam or reaction + rising or normal rate → continue
  //    pH must be strictly below 3.0 — above that is "Sredstvo slabi" territory
  else if (
    ph >= 1.5 && ph < 3.0 &&
    (foamPresent || reactionPresent) &&
    (phRising || (rate !== undefined && rate >= 0.02))
  ) {
    action = "continue_circulation";
    statusLabel = "Aktivna reakcija";
    explanation = "Sredstvo je aktivno. Nastaviti cirkulaciju i ponoviti mjerenje za 10–15 minuta.";
    confidence = isHighFoam(foam) && phRising ? "high" : "medium";
    alternatives = [
      "Prati još jedno mjerenje ako je trend nejasan.",
      "Dodaj nadopunu ako pH dosegne 3.0–4.0.",
    ];
  }

  // 6. pH stable + no foam + no reaction → finish cycle
  else if (
    phStable &&
    isNoFoam(foam) &&
    (!reaction || reaction === "nema" || reaction === "slaba") &&
    ph >= 2.0
  ) {
    action = "finish_cycle";
    statusLabel = "Reakcija pri kraju";
    explanation = "Reakcija je slaba ili stabilna. Ciklus se može završiti, zatim ispustiti otopinu i isprati sustav.";
    confidence = ph > 3.0 ? "high" : "medium";
    alternatives = [
      "Nastavi cirkulaciju još 10–15 minuta i ponovi mjerenje.",
      "Dodaj nadopunu ako su protok ili stanje sustava još uvijek nezadovoljavajući.",
    ];
  }

  // 7. pH < 1.5 → monitor with warning
  else if (ph < 1.5) {
    action = "monitor_next_measurement";
    statusLabel = "Vrlo agresivna zona";
    explanation = "pH je vrlo nizak. Sredstvo je jako. Pratiti materijal, vrijednost pH i temperaturu. Ponoviti mjerenje za 10 minuta.";
    confidence = "medium";
    alternatives = [
      "Nastavi cirkulaciju i prati trend.",
      "Završi ciklus ranije ako je materijal osjetljiv.",
    ];
  }

  // 8. pH falling after top-up → good sign, monitor
  else if (isAfterTopUp && phFalling) {
    action = "monitor_next_measurement";
    statusLabel = "Nadopuna učinkovita — pH pada";
    explanation = "pH se smanjio nakon nadopune, što znači da sredstvo ponovno radi. Nastaviti cirkulaciju i pratiti trend.";
    confidence = "high";
    alternatives = ["Nastavi cirkulaciju i ponovi mjerenje za 10–15 minuta."];
  }

  // 9. After top-up but pH still rising quickly → new cycle likely needed
  else if (isAfterTopUp && phRising && rate !== undefined && rate > 0.05) {
    action = "start_new_cycle";
    statusLabel = "Nadopuna nije zaustavila pH rast";
    explanation = "pH se i dalje brzo diže nakon nadopune. Nadopuna vjerojatno nije bila dovoljna. Razmotriti novi ciklus.";
    confidence = "medium";
    alternatives = [
      "Prati još jedno mjerenje.",
      "Dodaj još nadopune ako topUp < 2.",
    ];
  }

  // 10. Data unclear → monitor
  else if (!hasPrevious || (phChange === undefined && rate === undefined)) {
    action = "monitor_next_measurement";
    statusLabel = "Nedovoljno podataka";
    explanation = "Podaci nisu dovoljni za sigurnu odluku. Ponoviti mjerenje nakon kratke cirkulacije i usporediti trend.";
    confidence = "low";
    alternatives = ["Nastavi cirkulaciju 10–15 minuta i ponovi mjerenje."];
  }

  // 11. pH stable but foam still present → monitor
  else if (phStable && foamPresent) {
    action = "monitor_next_measurement";
    statusLabel = "pH stabilan, pjena prisutna";
    explanation = "Podaci nisu dovoljni za sigurnu odluku. Ponoviti mjerenje nakon kratke cirkulacije i usporediti trend.";
    confidence = "low";
    alternatives = [
      "Nastavi cirkulaciju i prati pjenu.",
      "Dodaj nadopunu ako pH dosegne 3.5.",
    ];
  }

  // 12. pH iznad exhaustionPH (engine-specifično) → sredstvo iscrpljeno
  else if (ph > engineExhaustionPH && hasPrevious) {
    action = "start_new_cycle";
    statusLabel = "Sredstvo iscrpljeno";
    explanation = `pH je iznad ${engineExhaustionPH} — kemija više nema dovoljan reakcijski kapacitet. Preporučuje se novi ciklus ili završetak.`;
    confidence = "high";
    alternatives = [
      "Ispusti otopinu i pokreni novi ciklus.",
      "Završi ciklus ako je čišćenje postiglo cilj.",
    ];
  }

  // 13. pH u zoni slabljenja (80% exhaustionPH – exhaustionPH) + protok raste → još napreduje
  else if (ph >= engineExhaustionPH * 0.8 && ph <= engineExhaustionPH && hasPrevious && flowChange !== undefined && flowChange > 0) {
    action = "continue_circulation";
    statusLabel = "Reakcija slabi — čišćenje i dalje napreduje";
    explanation = "Kemija je oslabljena, ali protok se još poboljšava. Nastaviti kratko praćenje i razmotriti nadopunu.";
    confidence = "medium";
    alternatives = [
      "Prati protok i ponovi mjerenje za 10–15 minuta.",
      "Dodaj nadopunu ako se protok prestane poboljšavati.",
      `Pokreni novi ciklus ako pH dosegne iznad ${engineExhaustionPH}.`,
    ];
  }

  // 14. pH u zoni slabljenja + protok se stabilizira → reakcija pri kraju
  else if (ph >= engineExhaustionPH * 0.8 && ph <= engineExhaustionPH && hasPrevious) {
    action = "add_top_up";
    statusLabel = "Reakcija pri kraju";
    explanation = "Kemija je pri kraju, a protok se stabilizira. Razmotriti nadopunu ili novi ciklus.";
    confidence = "medium";
    alternatives = [
      "Dodaj nadopunu ako topUp < 3 i otopina nije zasićena.",
      "Pokreni novi ciklus ako je otopina zasićena talogom.",
    ];
  }

  // 15. pH 2.6–3.5 + bez pjene + bez aktivne reakcije → reakcija slabi
  else if (ph >= 2.6 && ph <= 3.5 && hasPrevious && !foamPresent && !reactionPresent) {
    action = "add_top_up";
    statusLabel = "Reakcija slabi";
    explanation = "Kemija se troši, ali još može raditi. Razmotriti nadopunu sredstva.";
    confidence = "medium";
    alternatives = [
      "Nastavi cirkulaciju i prati pH trend.",
      "Dodaj nadopunu ako topUp < 3.",
    ];
  }

  // 16. Default — continue monitoring
  else {
    action = "monitor_next_measurement";
    statusLabel = "Praćenje u tijeku";
    explanation = "Podaci nisu dovoljni za sigurnu odluku. Ponoviti mjerenje nakon kratke cirkulacije i usporediti trend.";
    confidence = "low";
    alternatives = ["Nastavi cirkulaciju 10–15 minuta i ponovi mjerenje."];
  }

  // ── Apply product zone override (if any and not initial measurement) ─────────
  if (productZoneOverride && mjerenje.measurementType !== "initial_cycle_measurement") {
    action = productZoneOverride.action;
    statusLabel = productZoneOverride.statusLabel;
    explanation = productZoneOverride.explanation;
    confidence = productZoneOverride.confidence;
    alternatives = productZoneOverride.alternatives;
  }

  // ── Top-up quantity recommendation ───────────────────────────────────────────
  const isOptimalZoneForProduct = Boolean(productPhZone && productPhZone.status === "optimal");
  // Derive elapsed minutes from last top-up or cycle start
  const lastTopUpAt = ciklus.nadopune?.length
    ? ciklus.nadopune[ciklus.nadopune.length - 1]?.timestamp
    : null;
  const elapsedBaseIso = lastTopUpAt ?? ciklus.createdAt ?? ciklus.timestamp_pocetka ?? null;
  const elapsedTimeMinutes = elapsedBaseIso
    ? Math.round((new Date(mjerenje.measuredAt ?? mjerenje.timestamp ?? Date.now()).getTime() - new Date(elapsedBaseIso).getTime()) / 60000)
    : null;

  const topUpRec = action === "add_top_up"
    ? calcTopUpRecommendation({
        ph,
        phRate: rate,
        totalSolutionVolumeL: ciklus.totalSolutionVolumeL ?? ciklus.waterVolumeL,
        totalChemicalAddedL: ciklus.totalChemicalAddedL ?? null,
        elapsedTimeMinutes,
        product: product ?? null,
        foamPresent: Boolean(foamPresent),
        reactionPresent: Boolean(reactionPresent),
        isOptimalZone: isOptimalZoneForProduct,
      })
    : null;

  // ── Scale presence detection ─────────────────────────────────────────────────
  const flowImprovedFromStart =
    flowChange !== undefined && flowChange !== null
      ? flowChange > 0
      : false;

  const scaleResult =
    mjerenje.measurementType !== "initial_cycle_measurement" && hasPrevious
      ? calcScaleStatus({
          ph,
          phRising,
          phStable,
          phRate: rate,
          foamPresent: Boolean(foamPresent),
          reactionPresent: Boolean(reactionPresent),
          flowImprovedFromStart,
          flowBefore: null,
          flowCurrent: null,
        })
      : null;

  // ── Cycle decision (rules 1–4) ────────────────────────────────────────────────
  const isOptimalZoneForCycleDecision = Boolean(
    productPhZone ? productPhZone.status === "optimal" : ph <= 3.2
  );
  const cycleDecisionResult =
    mjerenje.measurementType !== "initial_cycle_measurement" && hasPrevious
      ? calcCycleDecision({
          ph,
          phRising,
          phStable,
          phRate: rate,
          isOptimalZone: isOptimalZoneForCycleDecision,
          foamPresent: Boolean(foamPresent),
          reactionPresent: Boolean(reactionPresent),
          scaleStatus: scaleResult?.scaleStatus,
          totalTopUps: ciklus.nadopune?.length ?? ciklus.totalTopUps ?? 0,
          flowImproved: flowImprovedFromStart,
        })
      : null;

  // ── Flow adjustment to recommendation ───────────────────────────────────────

  const flowNote = flowLabel(flowChange);
  if (flowNote) {
    if (flowNote.includes("poboljšao") && action === "finish_cycle") {
      confidence = "high"; // flow improvement confirms finish
    }
    if (flowNote.includes("pogoršao") && action === "continue_circulation") {
      alternatives.push("Protok se pogoršao — provjeriti začepljenje ili talog.");
    }
  }

  // ── Material warning bump to low confidence if aggressive zone ──────────────
  if (materialWarning && ph < 1.5 && confidence === "high") {
    confidence = "medium";
  }

  // ── Cleaning Decision Engine ─────────────────────────────────────────────────
  // Compute stable count — how many recent measurements have stable flow (< 1% change)
  const stableFlowCount = (() => {
    const mjSorted = [...ciklus.mjerenja].sort((a, b) =>
      new Date(a.measuredAt ?? a.timestamp ?? 0).getTime() -
      new Date(b.measuredAt ?? b.timestamp ?? 0).getTime()
    );
    let count = 0;
    for (let i = mjSorted.length - 1; i >= 0; i--) {
      const m = mjSorted[i];
      const pct = m.flowLMin != null && flowBeforeLMin != null && flowBeforeLMin > 0
        ? Math.abs(((m.flowLMin - flowBeforeLMin) / flowBeforeLMin) * 100)
        : null;
      if (pct != null && pct < 1.0) count++;
      else break;
    }
    return count;
  })();

  const cleaningDecision = generirajCleaningDecision({
    ph,
    phChange:               mjerenje.phChange ?? null,
    phRate:                 rate ?? null,
    flowLMin:               typeof mjerenje.flowLMin === "number" ? mjerenje.flowLMin : null,
    flowInitialLMin:        flowBeforeLMin,
    flowChangeFromInitial:  mjerenje.flowChangeFromInitial ?? null,
    flowChangeFromPrevious: mjerenje.flowChangeFromPrevious ?? null,
    measurementCount:       ciklus.mjerenja.length,
    stableCount:            stableFlowCount,
    indicatorZones:         productIndZones,
    selectedColor:          typeof mjerenje.colorIndicator === "string" ? mjerenje.colorIndicator : null,
    foam:                   mjerenje.foamLevel ?? null,
  });

  return {
    id: genId(),
    sessionId,
    subsessionId,
    cycleId: ciklus.id,
    measurementId: mjerenje.id,
    createdAt: new Date().toISOString(),
    statusLabel,
    explanation,
    recommendedAction: action,
    recommendedActionLabel: AKCIJA_LABELS[action],
    confidence,
    confidenceLabel: SIGURNOST_LABELS[confidence],
    alternatives,
    warnings,
    phZoneLabel: productPhZone ? productPhZone.label : zone.label,
    phZoneColor: productPhZone
      ? (productPhZone.status === "optimal" ? "green"
        : productPhZone.status === "weakening" ? "yellow"
        : productPhZone.status === "active" ? "orange"
        : "red")
      : zone.color,
    phRateLabel: rateLabel,
    reactionStatusLabel: reactionLabel,
    // Product-specific
    usedProductRule,
    productName: product?.name,
    productPhZoneLabel: productPhZone?.label,
    productPhZoneStatus: productPhZone ? PH_ZONE_STATUS_LABELS[productPhZone.status] : undefined,
    materialWarningFromProduct,
    // Top-up quantity recommendation
    recommendedAddAmountL: topUpRec?.recommendedAddAmountL,
    recommendedAddPercent: topUpRec?.recommendedAddPercent,
    topUpSafetyNote: topUpRec?.topUpSafetyNote,
    topUpActionBadge: topUpRec?.topUpActionBadge,
    topUpReason: topUpRec?.topUpReason,
    topUpWarning: topUpRec?.topUpWarning,
    // Scale presence estimate
    scaleStatus: scaleResult?.scaleStatus,
    scaleRecommendation: scaleResult?.scaleRecommendation,
    scaleBadge: scaleResult?.badge,
    scaleAddNote: scaleResult?.addNote,
    scaleAddWarning: scaleResult?.addWarning,
    // Cycle decision
    cycleDecision: cycleDecisionResult?.decisionLabel,
    cycleDecisionType: cycleDecisionResult?.decision,
    cycleDecisionReason: cycleDecisionResult?.reason,
    // Spec engine meta
    elapsedMinutesFromLastAction,
    numberOfCycles,
    currentConcPercent,
    // Cleaning Decision Engine
    cleaningDecision,
  };
}

// ─── Subsession / session finish eligibility ─────────────────────────────────��

export interface ZavrsetakEligibilnost {
  canFinish: boolean;
  blockers: string[];
  recommendation: string;
}

export function mozeLiZavrsitiPodsesiju(podsesija: {
  ciklusi: Ciklus[];
  status: string;
}): ZavrsetakEligibilnost {
  const blockers: string[] = [];

  // 1 — active cycle must be closed
  const aktivni = podsesija.ciklusi.find(
    (c) => c.status !== "zavrsen" && c.status !== "prekinut"
  );
  if (aktivni) blockers.push("Postoji aktivan ciklus koji nije zatvoren.");

  // 2 — at least one closed cycle must exist
  const imaZavrsnih = podsesija.ciklusi.some((c) => c.status === "zavrsen" || c.status === "prekinut");
  if (!imaZavrsnih) blockers.push("Nije evidentirano ni jedan zatvoren ciklus.");

  // 3 — completion phases must be valid on the last finished cycle
  const zadnji = [...podsesija.ciklusi]
    .reverse()
    .find((c) => c.status === "zavrsen" || c.status === "prekinut");
  const phases = zadnji?.completionPhases;

  if (!phases?.ispiranje || !phases.ispiranje.systemRinsedWithCleanWater) {
    blockers.push("Faza ispiranja nije završena.");
  }

  const rinsePhAcceptable = phases?.ispiranje?.neutralizationRequired === false;
  if (!rinsePhAcceptable && (!phases?.neutralizacija || !phases.neutralizacija.neutralizerProductName)) {
    blockers.push("Neutralizacija nije provedena ili evidentirana.");
  }

  if (!phases?.zavrsniPH) {
    blockers.push("Završno mjerenje pH nije uneseno.");
  } else if (phases.zavrsniPH.status === "nestabilan") {
    blockers.push("Završni pH nije stabilan — nastaviti ispiranje.");
  } else if (phases.zavrsniPH.status === "izvan_raspona") {
    blockers.push("Završni pH je izvan prihvatljivog raspona.");
  } else if (!phases.zavrsniPH.technicianConfirmed) {
    blockers.push("Serviser mora potvrditi završni pH.");
  }

  return {
    canFinish: blockers.length === 0,
    blockers,
    recommendation: blockers.length === 0
      ? "Podsesija se može završiti — svi uvjeti su ispunjeni."
      : `Podsesija se ne može završiti: ${blockers.join(" ")}`,
  };
}

export function mozeLiZavrsitiSesiju(sesija: {
  workMode: string;
  podsesije: { status: string }[];
  ciklusi?: Ciklus[];
}): ZavrsetakEligibilnost {
  const blockers: string[] = [];

  if (sesija.workMode === "with_subsessions") {
    const aktivnePodsesije = sesija.podsesije.filter(
      (p) => p.status !== "zavrseno" && p.status !== "prekinuto"
    );
    if (aktivnePodsesije.length > 0) {
      const nazivi = aktivnePodsesije.map((p) => (p as { naziv?: string }).naziv).filter(Boolean).join(", ");
      blockers.push(
        `Završetak nije moguć — postoje aktivni dijelovi sustava: ${nazivi || `${aktivnePodsesije.length} podsesija`}.`
      );
    }
  } else {
    const aktivniCiklus = (sesija.ciklusi ?? []).find(
      (c) => c.status !== "zavrsen" && c.status !== "prekinut"
    );
    if (aktivniCiklus) blockers.push("Postoji aktivan ciklus koji nije zatvoren.");
    if ((sesija.ciklusi ?? []).length === 0) blockers.push("Nije evidentirano ni jedan ciklus.");
  }

  return {
    canFinish: blockers.length === 0,
    blockers,
    recommendation: blockers.length === 0
      ? "Sesija se može završiti kada su sve podsesije završene ili jasno označene kao prekinute."
      : `Sesija se ne može završiti: ${blockers.join(" ")}`,
  };
}

// ─── Reaction stability analysis ─────────────────────────────────────────────

import type { ReactionStabilityResult } from "./types";
import { getMjerenjePH as getPH } from "./types";

/**
 * Analyses the last 2–3 measurements in the active cycle to determine
 * whether the chemical cleaning reaction has stabilised.
 *
 * A reaction is considered STABLE when:
 * - pH change across the window is ≤ 0.2 pH
 * - Average pH rate per minute is < 0.02
 * - Foam is none or weak in all analysed measurements
 * - No major new sediment
 *
 * Returns "inconclusive" when there are fewer than 2 measurements.
 */
export function analyseReactionStability(
  mjerenja: import("./types").Mjerenje[],
  ciklus: import("./types").Ciklus,
): ReactionStabilityResult {
  // Need at least 2 measurements
  if (mjerenja.length < 2) {
    return {
      status: "inconclusive",
      statusLabel: "Nedovoljno mjerenja",
      explanation: "Potrebna su najmanje 2 mjerenja za procjenu stabilnosti reakcije.",
      nextStep: "Nastaviti cirkulaciju i ponoviti mjerenje.",
      lastPhValues: mjerenja.map((m) => getPH(m)),
      maxPhDelta: 0,
      avgPhRate: null,
      foamAbsent: false,
      flowImproved: false,
    };
  }

  // Take last 3 (or 2 if that's all we have)
  const window = mjerenja.slice(-3);
  const phValues = window.map((m) => getPH(m));
  const maxPh = Math.max(...phValues);
  const minPh = Math.min(...phValues);
  const maxPhDelta = maxPh - minPh;

  // Average pH rate per minute (from stored phRatePerMinute field)
  const rates = window
    .map((m) => m.phRatePerMinute)
    .filter((r): r is number => r !== undefined && r !== null);
  const avgPhRate = rates.length > 0
    ? rates.reduce((s, r) => s + r, 0) / rates.length
    : null;

  // Foam: absent in the last measurement AND not strong in any of the window
  const lastFoam = window[window.length - 1].foamLevel;
  const foamAbsent =
    (!lastFoam || lastFoam === "nema" || lastFoam === "slaba") &&
    window.every((m) => !m.foamLevel || m.foamLevel === "nema" || m.foamLevel === "slaba");

  // Visible reaction: none or weak in last measurement
  const lastReaction = window[window.length - 1].visibleReaction;
  const reactionAbsent = !lastReaction || lastReaction === "nema" || lastReaction === "slaba";

  // Flow: compare last measurement flow vs cycle start flow
  const firstFlow = mjerenja.length > 0 ? (mjerenja[0].flowLMin ?? null) : null;
  const lastFlow = window[window.length - 1].flowLMin ?? null;
  const flowImproved = firstFlow !== null && lastFlow !== null && lastFlow > firstFlow;

  const latestPh = phValues[phValues.length - 1];

  // Stable: pH delta ≤ 0.2, avgRate < 0.02 (or unknown), foam absent, reaction absent
  const phStable = maxPhDelta <= 0.20;
  const rateStable = avgPhRate === null || Math.abs(avgPhRate) < 0.02;

  if (phStable && rateStable && foamAbsent && reactionAbsent && latestPh >= 2.5) {
    return {
      status: "stable",
      statusLabel: "REAKCIJA STABILNA",
      explanation: `pH je stabilan kroz ${window.length} mjerenja (Δ${maxPhDelta.toFixed(2)} pH) i reakcija slabi.`,
      nextStep: "Kemijsko čišćenje vjerojatno završeno — slijedi ispiranje i neutralizacija.",
      lastPhValues: phValues,
      maxPhDelta,
      avgPhRate,
      foamAbsent,
      flowImproved,
    };
  }

  // If pH delta or rate is marginal but foam is gone
  if (phStable && foamAbsent && latestPh >= 3.0) {
    return {
      status: "stable",
      statusLabel: "ČIŠĆENJE VJEROJATNO ZAVRŠENO",
      explanation: `pH je stabilan (Δ${maxPhDelta.toFixed(2)} pH) i pjene nema.`,
      nextStep: "Kemijsko čišćenje vjerojatno završeno — slijedi ispiranje i neutralizacija.",
      lastPhValues: phValues,
      maxPhDelta,
      avgPhRate,
      foamAbsent,
      flowImproved,
    };
  }

  return {
    status: "unstable",
    statusLabel: "Reakcija u tijeku",
    explanation: "pH se još mijenja ili je reakcija prisutna.",
    nextStep: "Nastaviti cirkulaciju i pratiti sljedeće mjerenje.",
    lastPhValues: phValues,
    maxPhDelta,
    avgPhRate,
    foamAbsent,
    flowImproved,
  };
}

// ─── Completion phase blockers (extended with mandatory phases) ───────────────

/**
 * Returns a list of human-readable blockers that prevent "Završi posao".
 * Checks all mandatory phases: active cycle, rinsing, neutralization, final pH.
 */
export function getCompletionBlockers(
  sesija: import("./types").Sesija,
  activeCycle?: import("./types").Ciklus | null,
): { canFinishJob: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // 1 — active chemical cycle must be closed
  if (activeCycle && activeCycle.status !== "zavrsen" && activeCycle.status !== "prekinut") {
    blockers.push("Aktivni kemijski ciklus mora biti zatvoren.");
  }

  // Find the last finished cycle (where completion phases should live)
  const allCycles = sesija.workMode === "no_subsessions"
    ? (sesija.ciklusi ?? [])
    : sesija.podsesije.flatMap((p) => p.ciklusi);
  const lastFinished = [...allCycles]
    .reverse()
    .find((c) => c.status === "zavrsen" || c.status === "prekinut");

  const phases = lastFinished?.completionPhases;

  // 2 — rinsing phase
  if (!phases?.ispiranje || !phases.ispiranje.systemRinsedWithCleanWater) {
    blockers.push("Faza ispiranja nije završena.");
  }

  // 3 — neutralization (skip when rinse pH was acceptable and neutralization not required)
  const rinsePhAcceptable = phases?.ispiranje?.neutralizationRequired === false;
  if (!rinsePhAcceptable && (!phases?.neutralizacija || !phases.neutralizacija.neutralizerProductName)) {
    blockers.push("Neutralizacija je obavezna faza prije završetka posla.");
  }

  // 4 — final pH
  if (!phases?.zavrsniPH) {
    blockers.push("Završno mjerenje pH nije uneseno.");
  } else if (phases.zavrsniPH.status === "nestabilan") {
    blockers.push("Završni pH nije stabilan. Nastaviti ispiranje i/ili neutralizaciju.");
  } else if (phases.zavrsniPH.status === "izvan_raspona") {
    blockers.push("Završni pH je izvan prihvatljivog raspona. Potrebno dodatno ispiranje ili neutralizacija.");
  } else if (!phases.zavrsniPH.technicianConfirmed) {
    blockers.push("Serviser mora potvrditi završni pH.");
  }

  return { canFinishJob: blockers.length === 0, blockers };
}

// ─── Final pH evaluation ──────────────────────────────────────────────────────

/**
 * Evaluates the final pH measurements and returns a FinalPhStatus.
 * For DHW/PTV systems compares against inlet pH ± tolerance.
 * For technical water systems uses a fixed acceptable range (5.5–9.0 as safe default).
 */
/**
 * Evaluates rinse pH outcome based on the difference between outlet and inlet water.
 * Returns the status and whether neutralization is still required.
 */
export function evaluateRinsePh({
  rinsePhInlet,
  rinsePhOutlet,
  systemCategory,
  configuredTargetPhMin,
  configuredTargetPhMax,
}: {
  rinsePhInlet?: number;
  rinsePhOutlet: number;
  systemCategory: import("./types").SystemCategory;
  configuredTargetPhMin?: number;
  configuredTargetPhMax?: number;
}): {
  status: import("./types").RinsePhStatus;
  diff: number | null;
  neutralizationRequired: boolean;
  statusLabel: string;
  statusDescription: string;
} {
  if (systemCategory === "dhw_potable") {
    if (rinsePhInlet === undefined) {
      // Can't evaluate without reference — require neutralization to be safe
      return {
        status: "nastaviti_ispiranje",
        diff: null,
        neutralizationRequired: true,
        statusLabel: "Nedostaje pH ulazne vode",
        statusDescription: "Unesite pH ulazne/mrežne vode za provjeru ispiranja.",
      };
    }
    const diff = Math.abs(rinsePhOutlet - rinsePhInlet);
    if (diff <= 0.3) {
      return {
        status: "prihvatljivo",
        diff,
        neutralizationRequired: false,
        statusLabel: "Ispiranje prihvatljivo",
        statusDescription: "pH nakon ispiranja je prihvatljiv. Neutralizacija nije potrebna.",
      };
    }
    if (diff <= 0.5) {
      return {
        status: "provjeriti",
        diff,
        neutralizationRequired: true,
        statusLabel: "Provjeriti ispiranje",
        statusDescription: "Preporuka: dodatno ispiranje ili provjera neutralizacije.",
      };
    }
    return {
      status: "nastaviti_ispiranje",
      diff,
      neutralizationRequired: true,
      statusLabel: "Nastaviti ispiranje / razmotriti neutralizaciju",
      statusDescription: "pH nakon ispiranja odstupa. Nastaviti ispiranje i/ili provesti neutralizaciju.",
    };
  }

  // Technical water — use configured range or default tolerance from inlet
  const diff = rinsePhInlet !== undefined ? Math.abs(rinsePhOutlet - rinsePhInlet) : null;
  const tolerance = 0.5;

  if (configuredTargetPhMin !== undefined && configuredTargetPhMax !== undefined) {
    const inRange = rinsePhOutlet >= configuredTargetPhMin && rinsePhOutlet <= configuredTargetPhMax;
    if (inRange) {
      return {
        status: "prihvatljivo",
        diff,
        neutralizationRequired: false,
        statusLabel: "Ispiranje prihvatljivo",
        statusDescription: "pH u konfiguriranom ciljnom rasponu. Neutralizacija nije potrebna.",
      };
    }
    return {
      status: "nastaviti_ispiranje",
      diff,
      neutralizationRequired: true,
      statusLabel: "pH izvan ciljnog raspona",
      statusDescription: "pH nakon ispiranja je izvan konfiguriranog ciljnog raspona. Razmotriti neutralizaciju.",
    };
  }

  // No configured range — fall back to inlet diff tolerance
  if (diff !== null && diff <= tolerance) {
    return {
      status: "prihvatljivo",
      diff,
      neutralizationRequired: false,
      statusLabel: "Ispiranje prihvatljivo",
      statusDescription: "Razlika pH je unutar tolerancije. Neutralizacija nije potrebna.",
    };
  }

  if (diff !== null && diff <= 1.0) {
    return {
      status: "provjeriti",
      diff,
      neutralizationRequired: true,
      statusLabel: "Provjeriti ispiranje",
      statusDescription: "Preporuka: provjera neutralizacije.",
    };
  }

  return {
    status: "nastaviti_ispiranje",
    diff,
    neutralizationRequired: true,
    statusLabel: "Nastaviti ispiranje",
    statusDescription: "pH nakon ispiranja značajno odstupa. Nastaviti ispiranje i/ili provesti neutralizaciju.",
  };
}

export function evaluateFinalPh({
  ph1,
  ph2,
  ph3,
  inletPh,
  systemCategory,
}: {
  ph1: number;
  ph2?: number;
  ph3?: number;
  inletPh?: number;
  systemCategory: import("./types").SystemCategory;
}): import("./types").FinalPhStatus {
  const values = [ph1, ph2, ph3].filter((v): v is number => v !== undefined);

  // Stability: max delta across measurements
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const delta = maxVal - minVal;

  if (values.length >= 2 && delta > 0.5) return "nestabilan";

  const avgPh = values.reduce((s, v) => s + v, 0) / values.length;

  if (systemCategory === "dhw_potable" && inletPh !== undefined) {
    const diff = Math.abs(avgPh - inletPh);
    if (diff > 0.5) return "izvan_raspona";
    if (diff > 0.3) return "potrebna_provjera";
    return "prihvatljiv";
  }

  // Technical water: acceptable range 5.5–9.0 (conservative default)
  if (avgPh < 5.5 || avgPh > 9.0) return "izvan_raspona";
  if (avgPh < 6.0 || avgPh > 8.5) return "potrebna_provjera";
  return "prihvatljiv";
}

// ─── Flow improvement classification ─────────────────────────────────────────

/**
 * Classifies system condition (kamenac severity) based on how much flow has
 * improved from the reference measurement.
 *
 * Formula: deltaFlowPercent = ((currentFlow - referenceFlow) / referenceFlow) × 100
 *
 * Scale levels:
 *   < 10 %  → Slab kamenac
 *  10–25 %  → Srednji kamenac
 *  25–50 %  → Jak kamenac
 *   ≥ 50 %  → Ekstremno zaprljan sustav
 *
 * Stagnation: last 2 flows differ by < 1 % relative → "Dosegnut maksimalni učinak"
 */
export function calcFlowImprovement({
  currentFlow,
  referenceFlow,
  prevFlow,
}: {
  currentFlow: number;
  referenceFlow: number;
  prevFlow?: number | null;
}): import("./types").FlowImprovementResult {
  const deltaFlowPercent =
    ((currentFlow - referenceFlow) / referenceFlow) * 100;

  // Stagnation: if previous flow is available and the relative change
  // between the two last measurements is below 1 %, cleaning has plateaued.
  const stagnation =
    prevFlow != null
      ? Math.abs(currentFlow - prevFlow) / Math.max(referenceFlow, 0.01) < 0.01
      : false;

  type ScaleLevel = import("./types").ScaleLevel;
  let scaleLevel: ScaleLevel;
  let scaleLevelLabel: string;

  if (deltaFlowPercent < 10) {
    scaleLevel = "slab_kamenac";
    scaleLevelLabel = "Slab kamenac";
  } else if (deltaFlowPercent < 25) {
    scaleLevel = "srednji_kamenac";
    scaleLevelLabel = "Srednji kamenac";
  } else if (deltaFlowPercent < 50) {
    scaleLevel = "jak_kamenac";
    scaleLevelLabel = "Jak kamenac";
  } else {
    scaleLevel = "ekstremno_zaprljano";
    scaleLevelLabel = "Ekstremno zaprljan sustav";
  }

  const statusLabel = stagnation
    ? "Dosegnut maksimalni učinak"
    : scaleLevelLabel;

  return {
    deltaFlowPercent: Math.round(deltaFlowPercent * 10) / 10,
    scaleLevel,
    scaleLevelLabel,
    stagnation,
    statusLabel,
  };
}

// ─── Scale estimate ───────────────────────────────────────────────────────────

/**
 * Estimates the amount of CaCO3 removed based on total product used and
 * the product's scaleDissolvingCapacityCaCO3 field.
 */
export function calcScaleEstimate({
  totalProductUsedKg,
  scaleDissolvingCapacityCaCO3,
  scaleDissolvingCapacityUnit,
  roughEstimateEnabled,
}: {
  totalProductUsedKg?: number | null;
  scaleDissolvingCapacityCaCO3?: number | null;
  scaleDissolvingCapacityUnit?: string | null;
  roughEstimateEnabled?: boolean;
}): import("./types").ProcjenaKamenca {
  if (!totalProductUsedKg || totalProductUsedKg <= 0) {
    return {
      estimatedKgCaCO3: null,
      isRoughEstimate: false,
      basedOnProductData: false,
      note: "Ukupna kolicina korištenog sredstva nije dostupna za izracun.",
    };
  }

  if (scaleDissolvingCapacityCaCO3 && scaleDissolvingCapacityCaCO3 > 0) {
    const estimated = totalProductUsedKg * scaleDissolvingCapacityCaCO3;
    return {
      estimatedKgCaCO3: Math.round(estimated * 100) / 100,
      isRoughEstimate: false,
      basedOnProductData: true,
      note: `Procjena temeljena na kapacitetu otapanja kamenca sredstva (${scaleDissolvingCapacityCaCO3} ${scaleDissolvingCapacityUnit ?? "kg CaCO3/kg"}).`,
    };
  }

  if (roughEstimateEnabled) {
    // Rough estimate: ~0.5 kg CaCO3 per kg of standard acid descaler at ~10% dilution
    const roughFactor = 0.5;
    const estimated = totalProductUsedKg * roughFactor;
    return {
      estimatedKgCaCO3: Math.round(estimated * 100) / 100,
      isRoughEstimate: true,
      basedOnProductData: false,
      note: "Gruba procjena kapaciteta otapanja. Nije temeljena na sluzbenom podatku proizvođaca.",
      warning: "Ovo je okvirna procjena, ne laboratorijski dokaz.",
    };
  }

  return {
    estimatedKgCaCO3: null,
    isRoughEstimate: false,
    basedOnProductData: false,
    note: "Procjena uklonjenog kamenca nije dostupna jer u bazi sredstva nedostaje sluzbeni podatak o kapacitetu otapanja kamenca.",
  };
}
