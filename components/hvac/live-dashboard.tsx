"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { getStatusTheme } from "@/lib/status-theme";
import { MjerenjeTimer } from "./mjerenje-timer";
import { ProcjenaBojePanel } from "./procjena-boje-panel";
import { CleaningDecisionKartica } from "./cleaning-decision-kartica";
import { GlasovniUnos, govori, VoiceCommandButton, parseVoiceCommand } from "./glasovni-unos";
import type { GlasovniRezultat, VoiceCommandResult } from "./glasovni-unos";

import type {
  Ciklus,
  Mjerenje,
  FoamLevel,
  ColorIndicator,
  ReactionStabilityResult,
} from "@/lib/types";
import { getMjerenjePH, getMjerenjeTimestamp } from "@/lib/types";
import { calcFlowImprovement } from "@/lib/preporuka";
import { nadjiIndikatorZonu, SNAGA_SREDSTVA_LABELS } from "@/lib/product-types";
import { estimateScaleByReactionParams, formatReactionEstimateRange } from "@/lib/scale-removal-estimate";

// ─── pH zone logic ─────────────────────────────────────────────────────────────

interface PhZone {
  label: string;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
}

function getPhZone(ph: number): PhZone {
  // Cycle pH zones — acid descaling context (1.0–3.0 is correct and expected)
  if (ph < 1.5) return {
    label: "Aktivna kisela zona — intenzivna",
    bg: "bg-green-950/80", text: "text-green-200", border: "border-green-800/60",
    badgeBg: "bg-green-900/60", badgeText: "text-green-200",
  };
  if (ph < 2.0) return {
    label: "Aktivna kisela zona — jaka",
    bg: "bg-green-950/70", text: "text-green-200", border: "border-green-800/60",
    badgeBg: "bg-green-900/60", badgeText: "text-green-200",
  };
  if (ph < 3.0) return {
    label: "Aktivna kisela zona",
    bg: "bg-green-950/60", text: "text-green-200", border: "border-green-800/50",
    badgeBg: "bg-green-900/50", badgeText: "text-green-200",
  };
  if (ph < 4.0) return {
    label: "Sredstvo slabi",
    bg: "bg-amber-950/70", text: "text-amber-200", border: "border-amber-800/60",
    badgeBg: "bg-amber-900/60", badgeText: "text-amber-200",
  };
  if (ph < 4.5) return {
    label: "Sredstvo pri kraju",
    bg: "bg-rose-950/80", text: "text-rose-300", border: "border-rose-700/60",
    badgeBg: "bg-rose-900/60", badgeText: "text-rose-300",
  };
  return {
    label: "Sredstvo iscrpljeno",
    bg: "bg-slate-900/70", text: "text-slate-300", border: "border-slate-700/60",
    badgeBg: "bg-slate-800/60", badgeText: "text-slate-300",
  };
}

// ─── Reaction status logic ─────────────────────────────────────────────────────

type Severity = "ok" | "warn" | "critical" | "info";

interface ReakcijaStatus {
  label: string;
  explanation: string;
  nextStep: string;
  nextStepReason: string;
  primaryAction: "mjerenje" | "nadopuna" | "novi_ciklus" | "zavrsi";
  severity: Severity;
  phTrend: "raste" | "pada" | "stabilno";
  flowTrend: "raste" | "pada" | "stabilno";
  reakcija: "jaka" | "normalna" | "slaba";
  otopina: "cista" | "blago_mutna" | "mutna" | "zasicena";
}

function ocijeniStatus(mjerenje: Mjerenje, baseline?: Mjerenje | null, prevMjerenje?: Mjerenje | null): ReakcijaStatus {
  const ph = getMjerenjePH(mjerenje);
  const foam = mjerenje.foamLevel;
  const turbidity = mjerenje.turbidity;
  const sediment = mjerenje.sediment;
  const phRate = mjerenje.phRatePerMinute ?? 0;
  const baseFlow = baseline?.flowLMin;
  const currFlow = mjerenje.flowLMin;
  const prevFlow = prevMjerenje?.flowLMin ?? null;

  // ── Derived booleans ─────────────────────────────────────────────────────
  const foamPresent = foam === "slaba" || foam === "srednja" || foam === "jaka" || foam === "vrlo_jaka";
  const foamStrong = foam === "jaka" || foam === "vrlo_jaka";
  const foamWeak = foam === "nema" || foam === "slaba";
  const highTurbidity = turbidity === "jaka" || turbidity === "srednja";
  const highSediment = sediment === "puno" || sediment === "srednje";

  // ── Trends ───────────────────────────────────────────────────────────────
  const prevPh = prevMjerenje ? getMjerenjePH(prevMjerenje) : (baseline ? getMjerenjePH(baseline) : null);
  const deltaPh = prevPh !== null ? ph - prevPh : null;

  const phTrend: ReakcijaStatus["phTrend"] =
    deltaPh != null && deltaPh > 0.1 ? "raste" :
    deltaPh != null && deltaPh < -0.1 ? "pada" : "stabilno";

  // Flow trend: compare current to previous measurement (not baseline) for Δ trend.
  // If no prev, compare to baseline.
  const flowRef = prevFlow ?? baseFlow ?? null;
  const flowDelta = flowRef != null && currFlow != null ? currFlow - flowRef : null;
  const flowDeltaFromBase = baseFlow != null && currFlow != null ? currFlow - baseFlow : null;

  const flowTrend: ReakcijaStatus["flowTrend"] =
    flowDelta != null && flowDelta > 0.5 ? "raste" :
    flowDelta != null && flowDelta < -0.5 ? "pada" : "stabilno";

  // Flow stagnation: Δ protok < 1% between last 2 measurements (spec rule 4)
  const flowStagnating =
    prevFlow != null && currFlow != null && baseFlow != null && baseFlow > 0
      ? Math.abs(currFlow - prevFlow) / baseFlow < 0.01
      : false;

  // Flow rising overall from baseline
  const flowRising = flowDeltaFromBase != null && flowDeltaFromBase > 1;

  const reakcija: ReakcijaStatus["reakcija"] =
    foamStrong ? "jaka" : foamPresent ? "normalna" : "slaba";

  const otopina: ReakcijaStatus["otopina"] =
    highTurbidity && highSediment ? "zasicena" :
    turbidity === "srednja" || sediment === "srednje" ? "mutna" :
    turbidity === "slaba" || sediment === "malo" ? "blago_mutna" : "cista";

  const base: Pick<ReakcijaStatus, "phTrend" | "flowTrend" | "reakcija" | "otopina"> = {
    phTrend, flowTrend, reakcija, otopina,
  };

  // ── Foam modifier suffix ──────────────────────────────────────────────────
  function foamSuffix(): string {
    if (foamStrong)  return " — reakcija traje";
    if (foamWeak)    return " — reakcija zavrsava";
    return " — reakcija slabi";
  }

  // ── Flow context suffix for "why" sentences ───────────────────────────────
  function flowSuffix(): string {
    // Delta od referentnog mjerenja — jedina ispravna osnova za opis
    const deltaFromBase = baseFlow != null && currFlow != null ? currFlow - baseFlow : null;
    const deltaFlowPercent = deltaFromBase != null && baseFlow != null && baseFlow > 0
      ? ((currFlow! - baseFlow) / baseFlow) * 100
      : null;

    // Trend od prethodnog mjerenja (za smjer, ne za apsolutni prikaz)
    const deltaFromPrev = prevFlow != null && currFlow != null ? currFlow - prevFlow : null;
    const flowStatus = deltaFromPrev != null
      ? (deltaFromPrev > 0.2 ? "Protok raste" : deltaFromPrev < -0.2 ? "Protok pada" : "Protok stabilan")
      : deltaFromBase != null
      ? (deltaFromBase > 0.5 ? "Protok raste" : deltaFromBase < -0.5 ? "Protok pada" : "Protok stabilan")
      : null;

    if (flowStatus === "Protok raste") {
      return ` ${flowStatus} — čišćenje napreduje${deltaFlowPercent != null ? ` (${deltaFlowPercent > 0 ? "+" : ""}${deltaFlowPercent.toFixed(1)}%)` : ""}.`;
    }
    if (flowStatus === "Protok pada") {
      return ` ${flowStatus} — provjeri cirkulaciju.`;
    }
    if (flowStatus === "Protok stabilan") {
      return ` ${flowStatus} — nema daljnjeg poboljšanja.`;
    }
    return "";
  }

  // ── SPEC RULE: pH > 4.0 MUST NEVER be "Aktivna reakcija" ────────────────

  // CASE A: pH > 4.0, flow stagnating or not rising → PREKINI (exhausted + no progress)
  if (ph > 4.0 && (flowStagnating || !flowRising)) {
    const foamNote = foamStrong ? " Pjena jos prisutna — ostatak reakcije." : "";
    const fs = flowSuffix();
    return { ...base,
      label: "Sredstvo iscrpljeno",
      explanation: `Otopina je iscrpljena i protok se više ne mijenja. pH visok (${ph.toFixed(2)}).${foamNote}${fs}`,
      nextStep: flowRising ? "Nadopuna" : "Novi ciklus",
      nextStepReason: "Ispustiti otopinu i pokrenuti novi ciklus s čistom otopinom.",
      primaryAction: "novi_ciklus", severity: "critical",
    };
  }

  // CASE B: pH > 4.0, but flow still rising → DODAJ SREDSTVO (exhausted but flow trend positive)
  if (ph > 4.0 && flowRising) {
    return { ...base,
      label: `Sredstvo iscrpljeno — protok raste${foamSuffix()}`,
      explanation: `pH visok (${ph.toFixed(2)}), ali protok još raste. Sredstvo se troši, no čišćenje napreduje.${flowSuffix()}`,
      nextStep: "Dodaj sredstvo ili pokreni novi ciklus",
      nextStepReason: "Nadopuniti kemikaliju dok protok raste. Bez dodavanja reakcija će prestati.",
      primaryAction: "nadopuna", severity: "critical",
    };
  }

  // ── PRIORITY 1: Flow + pH both stable → GOTOVO regardless of pH zone ───────
  // Spec exact thresholds: abs(deltaPh) < 0.05 AND abs(deltaFlow) < 0.2 L/min
  const absDeltaPh = deltaPh != null ? Math.abs(deltaPh) : null;
  const absDeltaFlow = flowDelta != null ? Math.abs(flowDelta) : null;

  const phStableExact = absDeltaPh != null ? absDeltaPh < 0.05 : (phTrend === "stabilno");
  const flowStableExact = absDeltaFlow != null ? absDeltaFlow < 0.2 : (flowTrend === "stabilno");
  const reactionWeak = !foamStrong; // spec: reaction = weak OR none

  const cleaningComplete = phStableExact && flowStableExact && reactionWeak;

  // CASE C: any pH 2.0–4.0, flow stable + pH stable + weak/no reaction → GOTOVO
  if (ph >= 2.0 && ph < 4.0 && cleaningComplete) {
    const deltaFlowPct = flowDeltaFromBase != null && baseFlow != null && baseFlow > 0
      ? (flowDeltaFromBase / baseFlow) * 100
      : null;
    const noSignificantFlow = deltaFlowPct != null && Math.abs(deltaFlowPct) < 5;
    const extraSentence = ph < 3.5
      ? " Sredstvo još ima snage, ali nema više reakcije."
      : "";
    return { ...base,
      label: "Kemijsko čišćenje gotovo",
      explanation: `pH i protok su stabilni — nema daljnjeg poboljšanja.${extraSentence}${noSignificantFlow ? " Bez značajnog poboljšanja protoka." : ""}`,
      nextStep: "Ispiranje i neutralizacija",
      nextStepReason: noSignificantFlow
        ? "Sustav je vjerojatno čist ili s minimalnim kamencem."
        : "pH i protok stabilni — čišćenje je završeno. Slijedi ispiranje.",
      primaryAction: "zavrsi", severity: "ok",
    };
  }

  // CASE D: pH 3.0–4.0 AND phRate > 0.02 OR phTrend rising AND flow still rising → NASTAVI
  // Only suggest nadopuna if flow is NOT rising (no progress) and pH is actively degrading
  if (ph >= 3.0 && ph < 4.0 && (phRate > 0.02 || phTrend === "raste")) {
    const fs = flowSuffix();
    const explanation = flowRising
      ? `Sredstvo slabi, ali protok se još poboljšava. pH ${ph.toFixed(2)} raste.${fs}`
      : `Sredstvo slabi i protok se više ne mijenja. pH ${ph.toFixed(2)} raste.${fs}`;
    return { ...base,
      label: `Sredstvo slabi${foamSuffix()}`,
      explanation,
      nextStep: flowRising ? "Ponovi mjerenje" : "Razmotri nadopunu",
      nextStepReason: flowRising
        ? "Protok još raste — nastavi cirkulirati i prati pH."
        : "Dodati sredstvo samo ako pH nastavlja rasti > 0.05/min.",
      primaryAction: flowRising ? "mjerenje" : "nadopuna", severity: "warn",
    };
  }

  // CASE E: pH 3.0–4.0, low rate — weakening but flow not stagnating yet
  // Never suggest nadopuna here; flow is the primary signal
  if (ph >= 3.0 && ph < 4.0) {
    return { ...base,
      label: `Sredstvo slabi${foamPresent ? " — reakcija još postoji" : ""}`,
      explanation: `pH ${ph.toFixed(2)} — zona slabljenja.${foamPresent ? " Pjena prisutna." : ""}${flowSuffix()}`,
      nextStep: "Ponovi mjerenje",
      nextStepReason: flowRising
        ? "Protok raste — ne dodavati sredstvo. Prati pH."
        : "pH i protok su stabilni — nema daljnjeg poboljšanja.",
      primaryAction: "mjerenje", severity: "warn",
    };
  }

  // CASE F: pH 2.0–3.0, active, flow still rising — continue
  if (ph >= 2.0 && ph < 3.0 && phTrend === "stabilno") {
    return { ...base,
      label: "Reakcija stabilna",
      explanation: `pH ${ph.toFixed(2)} stabilan — sredstvo radi ravnomjerno.${flowSuffix()}`,
      nextStep: "Dodaj novo mjerenje",
      nextStepReason: "Stabilna reakcija. Pratiti pH i protok.",
      primaryAction: "mjerenje", severity: "ok",
    };
  }

  // CASE H: pH 2.0–3.0, active
  if (ph >= 2.0 && ph < 3.0) {
    return { ...base,
      label: "Aktivna reakcija",
      explanation: `pH ${ph.toFixed(2)} — sredstvo aktivno radi.${flowSuffix()}`,
      nextStep: "Dodaj novo mjerenje",
      nextStepReason: "Sredstvo u optimalnoj zoni. Ne dodavati kemikaliju.",
      primaryAction: "mjerenje", severity: "ok",
    };
  }

  // pH 1.5–2.0 → Jaka aktivnost
  if (ph >= 1.5 && ph < 2.0) {
    return { ...base,
      label: "Jaka aktivnost",
      explanation: `pH ${ph.toFixed(2)} — jako kisela otopina, reakcija intenzivna.${flowSuffix()}`,
      nextStep: "Dodaj novo mjerenje",
      nextStepReason: "Pratiti materijal. Ne dodavati kemikaliju.",
      primaryAction: "mjerenje", severity: "ok",
    };
  }

  // pH < 1.5 → Vrlo jaka reakcija
  if (ph < 1.5) {
    return { ...base,
      label: "Vrlo jaka reakcija",
      explanation: `pH ${ph.toFixed(2)} — izrazito kisela otopina. Paziti na materijal.${flowSuffix()}`,
      nextStep: "Dodaj novo mjerenje",
      nextStepReason: "Pratiti temperaturu i materijal. Moguća korozija.",
      primaryAction: "mjerenje", severity: "ok",
    };
  }

  // Fallback
  return { ...base,
    label: "Aktivna reakcija",
    explanation: `pH ${ph.toFixed(2)} — sredstvo u optimalnoj radnoj zoni (pH 2.0–3.0).${flowSuffix()}`,
    nextStep: "Dodaj novo mjerenje",
    nextStepReason: "Pratiti pH i pjenu.",
    primaryAction: "mjerenje", severity: "ok",
  };
}

// ─── Severity palette → resolved at runtime via getStatusTheme() ───────────────

// ─── Color / foam labels ───────────────────────────────────────────────────────

const COLOR_LABELS: Record<ColorIndicator, string> = {
  plava: "Plava",
  plavo_zelena: "Plavo-zelena",
  zelena: "Zelena",
  zuta: "Zuta",
  smeda: "Smeda",
  bez_boje: "Bez boje",
  nije_primjenjivo: "N/A",
};

const COLOR_SUBLABEL: Record<ColorIndicator, string> = {
  plava: "Svjeze sredstvo",
  plavo_zelena: "Aktivna otopina",
  zelena: "Reaktivno",
  zuta: "Slabi",
  smeda: "Zasiceno talogom",
  bez_boje: "Iscrpljeno",
  nije_primjenjivo: "Nije primjenjivo",
};

const COLOR_DOT: Record<ColorIndicator, string> = {
  plava: "bg-blue-500",
  plavo_zelena: "bg-teal-500",
  zelena: "bg-green-500",
  zuta: "bg-yellow-400",
  smeda: "bg-amber-800",
  bez_boje: "bg-slate-300",
  nije_primjenjivo: "bg-slate-200",
};

const FOAM_LABELS: Record<FoamLevel, string> = {
  nema: "Nema",
  slaba: "Slaba",
  srednja: "Srednja",
  jaka: "Jaka",
  vrlo_jaka: "Vrlo jaka",
};

const FOAM_SUBLABEL: Record<FoamLevel, string> = {
  nema: "Nema reakcije",
  slaba: "Slaba reakcija",
  srednja: "Reakcija traje",
  jaka: "Snazna reakcija",
  vrlo_jaka: "Intenzivna reakcija",
};

const FOAM_DOT: Record<FoamLevel, string> = {
  nema: "bg-slate-300",
  slaba: "bg-sky-300",
  srednja: "bg-blue-400",
  jaka: "bg-indigo-500",
  vrlo_jaka: "bg-violet-600",
};

function fTime(iso: string) {
  return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
}

function flowDeltaPct(curr: number, base: number): string {
  if (base === 0) return "";
  const pct = ((curr - base) / base) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% od ref.`;
}

// ─── Main dashboard component ────���─────────────────────────────────────────────

export interface LiveDashboardCallbacks {
  onMjerenje?: () => void;
  onNadopuna?: () => void;
  onNoviCiklus?: () => void;
  onZavrsiCiklus?: () => void;
  /** Triggered when technician confirms rinsing should start */
  onIspiranje?: () => void;
  /** Called with voice-parsed values so parent can pre-fill the measurement form */
  onVoiceResult?: (r: GlasovniRezultat) => void;
  /** Called with voice command (technician actions like "Dodano 2 kg DS3") */
  onVoiceCommand?: (r: VoiceCommandResult) => void;
  /** Called when user wants to edit the initial (reference) measurement */
  onEditReferentno?: () => void;
  /** Context info for the sticky strip */
  objekt?: string;
  sredstvo?: string;
  nadacinRada?: string;
}

interface LiveDashboardProps {
  ciklus: Ciklus;
  callbacks?: LiveDashboardCallbacks;
  /** Optional pre-computed stability result from the parent (avoids re-computing inside). */
  stability?: ReactionStabilityResult | null;
  /** When true, suppress time-based warnings (e.g. short session note). */
  isTestMode?: boolean;
}

export function LiveDashboard({ ciklus, callbacks, stability, isTestMode = false }: LiveDashboardProps) {
  const [showVoice, setShowVoice] = useState(false);
  const [showPodsjetnik, setShowPodsjetnik] = useState(false);
  const [showSazetak, setShowSazetak] = useState(false);
  const [showDanger, setShowDanger] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme !== "light" : false;
  const lastSpokenRef = useRef<string>("");
  const isFirstLoadRef = useRef(true);
  const [vodičPauziran, setVodičPauziran] = useState(false);
  const vodičPauziranRef = useRef(vodičPauziran);
  
  // Sync ref with state
  useEffect(() => {
    vodičPauziranRef.current = vodičPauziran;
  }, [vodičPauziran]);

  // Listen for mic button press from nav-bar
  useEffect(() => {
    const toggle = () => setShowVoice((v) => !v);
    window.addEventListener("hvac:toggle-voice", toggle);
    return () => window.removeEventListener("hvac:toggle-voice", toggle);
  }, []);

  const allMjerenja = [...ciklus.mjerenja].sort(
    (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
  );

  const baseline = allMjerenja.find((m) => m.measurementType === "initial_cycle_measurement") ?? null;
  const regularMjerenja = allMjerenja.filter((m) => m.measurementType !== "initial_cycle_measurement");
  const lastMj = regularMjerenja.length > 0 ? regularMjerenja[regularMjerenja.length - 1] : (baseline ?? null);
  const prevMj = regularMjerenja.length > 1 ? regularMjerenja[regularMjerenja.length - 2] : baseline;

  if (!lastMj) return null;

  const ph = getMjerenjePH(lastMj);
  const zone = getPhZone(ph);
  const rs = ocijeniStatus(lastMj, baseline, prevMj);

  const phRate = lastMj.phRatePerMinute;
  const currFlow = lastMj.flowLMin;
  // Referentni protok = isključivo iz nultog mjerenja (odmah nakon kemije).
  // Ova aplikacija je za uklanjanje kamenca — nema pre-chemical baseline-a.
  const baseFlow = baseline?.flowLMin ?? undefined;

  // Flow improvement classification (scale level + stagnation detection)
  const flowImprovement =
    currFlow != null && baseFlow != null && baseFlow > 0
      ? calcFlowImprovement({
          currentFlow: currFlow,
          referenceFlow: baseFlow,
          prevFlow: prevMj?.flowLMin ?? null,
        })
      : null;

  // glasovna uputa — spoken later, after uputa is resolved (see below)

  const phTrendChar = phRate != null && phRate > 0.005 ? "↑" :
    phRate != null && phRate < -0.005 ? "↓" : "→";

  const flowArrowCurr = currFlow != null && prevMj?.flowLMin != null
    ? (currFlow - prevMj.flowLMin > 1 ? "↑" : currFlow - prevMj.flowLMin < -1 ? "↓" : "→")
    : (currFlow != null && baseFlow != null
        ? (currFlow - baseFlow > 1 ? "↑" : currFlow - baseFlow < -1 ? "↓" : "→")
        : null);

  const lastTs = getMjerenjeTimestamp(lastMj);

  const isStable = stability?.status === "stable";
  const isGotovo = isStable || rs.primaryAction === "zavrsi";

  // Minutes since last measurement — used for the "brzo mjerenje" note
  const minutesSinceLastMj = lastTs
    ? Math.round((Date.now() - new Date(lastTs).getTime()) / 60000)
    : null;
  const brzoMjerenjeNote =
    !isTestMode && minutesSinceLastMj != null && minutesSinceLastMj < 5
      ? "Mjerenje je brzo nakon zadnje akcije — po potrebi ponoviti za potvrdu."
      : null;

  // Action button primary label
  const primaryActionLabel =
    isGotovo ? "Pokreni ispiranje" :
    rs.primaryAction === "mjerenje" ? "Dodaj novo mjerenje" :
    rs.primaryAction === "nadopuna" ? "Dodaj nadopunu" :
    rs.primaryAction === "novi_ciklus" ? "Pokreni novi ciklus" :
    "Završi ciklus";

  const primaryActionFn =
    isGotovo ? (callbacks?.onIspiranje ?? callbacks?.onZavrsiCiklus) :
    rs.primaryAction === "mjerenje" ? callbacks?.onMjerenje :
    rs.primaryAction === "nadopuna" ? callbacks?.onNadopuna :
    rs.primaryAction === "novi_ciklus" ? callbacks?.onNoviCiklus :
    callbacks?.onZavrsiCiklus;

  // Trend strip helpers
  const reakcijaLabel = { jaka: "Jaka", normalna: "Normalna", slaba: "Slaba" }[rs.reakcija];
  const otopina = {
    cista: "Cista", blago_mutna: "Blago mutna", mutna: "Mutna", zasicena: "Zasicena"
  }[rs.otopina];

  // ── Glavna uputa — 5 spec states ─────────────────────────────────────────
  type UputaState = {
    label: string;
    why: string;
    bg: string;
    border: string;
    text: string;
    subtextColor: string;
    dotColor: string;
    btnBg: string;
    btnText: string;
    icon: React.ReactNode;
  };

  function resolveUputaState(): UputaState {
    // GOTOVO — stable (from stability engine) OR ocijeniStatus says zavrsi
    if (isGotovo) {
      return {
        label: "KEMIJSKO ČIŠĆENJE GOTOVO",
        why: "Sredstvo još ima snage, ali pH i protok su stabilni. Nema daljnjeg poboljšanja.",
        bg: "bg-slate-900",
        border: "border-slate-600",
        text: "text-white",
        subtextColor: "text-slate-300",
        dotColor: "bg-white",
        btnBg: "bg-white",
        btnText: "text-slate-900",
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ),
      };
    }

    // PREKINI CIKLUS — exhausted, no flow progress
    if (rs.primaryAction === "novi_ciklus") {
      return {
        label: "PREKINI CIKLUS I ISPUSTI OTOPINU",
        why: rs.explanation,
        bg: "bg-rose-900",
        border: "border-rose-600",
        text: "text-white",
        subtextColor: "text-rose-200",
        dotColor: "bg-rose-300",
        btnBg: "bg-white",
        btnText: "text-rose-900",
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        ),
      };
    }

    // DODAJ SREDSTVO — top-up needed
    if (rs.primaryAction === "nadopuna") {
      return {
        label: "DODAJ SREDSTVO",
        why: rs.explanation,
        bg: "bg-amber-800",
        border: "border-amber-500",
        text: "text-white",
        subtextColor: "text-amber-200",
        dotColor: "bg-amber-300",
        btnBg: "bg-white",
        btnText: "text-amber-900",
        icon: (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v20M2 12h20" />
          </svg>
        ),
      };
    }

    // Default — CIRKULACIJA AKTIVNA
    return {
      label: "CIRKULACIJA AKTIVNA",
      why: rs.explanation,
      bg: "bg-green-900",
      border: "border-green-600",
      text: "text-white",
      subtextColor: "text-green-200",
      dotColor: "bg-green-300",
      btnBg: "bg-white",
      btnText: "text-green-900",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      ),
    };
  }

  const uputa = resolveUputaState();

  // ── Glasovna uputa — triggerira se za svako novo mjerenje (po ID-u) ��─────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!lastMj) return;
    
    // Pri prvom učitavanju, uvijek čitaj status (ignoriraj key check)
    const isFirstLoad = isFirstLoadRef.current;
    if (isFirstLoad) {
      isFirstLoadRef.current = false;
    } else {
      // Na sljedećim renderiranjima, provjeri je li već govorljeno za ovo mjerenje
      const key = getMjerenjeTimestamp(lastMj) + "_" + (lastMj.id ?? "");
      if (lastSpokenRef.current === key) return;
      lastSpokenRef.current = key;
    }

    // Gradi bogatiju glasovnu poruku s kontekstom
    const basePh_ = baseline ? getMjerenjePH(baseline) : null;
    const currPh_ = getMjerenjePH(lastMj) ?? null;
    const currFlow_ = lastMj.flowLMin ?? null;
    const baseFlow_ = baseline?.flowLMin ?? null;
    const tOut_ = lastMj.tempOutC ?? null;
    const refTOut_ = baseline?.tempOutC ?? null;

    const dFlow_ = currFlow_ != null && baseFlow_ != null ? currFlow_ - baseFlow_ : null;
    const dTout_ = tOut_ != null && refTOut_ != null ? tOut_ - refTOut_ : null;

    // Izracunaj stanje za TTS
    const napreduje_ = dFlow_ != null && dFlow_ > 0.5;
    const trebaNadopuna_ = currPh_ != null && currPh_ > 4.5;
    const trebaNoviciklus_ = currPh_ != null && currPh_ > 6.0;

    // TTS — tocno prema specifikaciji dokumenta
    const phTekst = currPh_ != null ? currPh_.toFixed(2) : "nepoznat";

    const flowTekst = dFlow_ != null && dFlow_ > 0.5
      ? "raste"
      : dFlow_ != null && dFlow_ < -0.5
      ? "pada"
      : "stabilan, nema daljnjeg poboljsanja";

    const tempOutTekst = dTout_ != null && Math.abs(dTout_) > 0.3
      ? (dTout_ > 0 ? "raste" : "pada")
      : "bez promjene, reakcija stagnira";

    const uputaTekst = trebaNoviciklus_
      ? "Ciklus je pri kraju. Pripremi zavrsetak, ispusti otopinu, isperi sustav i pokreni novi ciklus."
      : trebaNadopuna_
      ? "Dodaj nadopunu kemijskog sredstva."
      : napreduje_
      ? "Nastavi cirkulaciju. Ciscenje aktivno napreduje."
      : "Nastavi cirkulaciju kratko vrijeme i prati promjene. Ako protok i Temp OUT ne mijenjaju vrijednosti, a pH ostaje nizak, reakcija je aktivna, ali napredak stagnira.";

    const sljedeciKorakTekst = trebaNoviciklus_
      ? "Pripremi zavrsetak ciklusa."
      : trebaNadopuna_
      ? "Dodaj nadopunu kemijskog sredstva."
      : napreduje_
      ? "Nastavi cirkulaciju, nema intervencije."
      : "Promijeni smjer cirkulacije, ili pripremi zavrsetak ciklusa.";

    const glasovnaTekst =
      "Cirkulacija aktivna. Status cirkulacije u tijeku. " +
      "pH " + phTekst + ". Paziti na materijal. " +
      "Protok " + flowTekst + ". " +
      "Temp OUT " + tempOutTekst + ". " +
      "Uputa serviseru: " + uputaTekst + " " +
      "Sljedeci korak: " + sljedeciKorakTekst;

    // Govori samo ako vodič NIJE pauziran
    console.log("[v0] useEffect TTS - vodičPauziranRef.current:", vodičPauziranRef.current);
    if (!vodičPauziranRef.current) {
      console.log("[v0] Pozivam govori() s tekstom:", glasovnaTekst.substring(0, 50) + "...");
      govori(glasovnaTekst);
    } else {
      console.log("[v0] TTS pauziran, preskačem govori()");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMj]);

  // ── Derived display values ───────────────────────────────────────────────
  const basePh = baseline ? getMjerenjePH(baseline) : null;
  const dPh = basePh !== null ? ph - basePh : null;

  const deltaFlowAbs = currFlow != null && baseFlow != null ? currFlow - baseFlow : null;
  const deltaFlowPct = flowImprovement?.deltaFlowPercent ?? null;

  const foamLabel = lastMj.foamLevel ? FOAM_LABELS[lastMj.foamLevel] : null;

  // Boja indikatora
  const colorLabel = lastMj.colorIndicator ? COLOR_LABELS[lastMj.colorIndicator] : null;
  const colorSubLabel = lastMj.colorIndicator ? COLOR_SUBLABEL[lastMj.colorIndicator] : null;
  const colorDot = lastMj.colorIndicator ? COLOR_DOT[lastMj.colorIndicator] : null;

  // Temperatura — referenca je Temp OUT iz nultog mjerenja
  const tOut = lastMj.tempOutC ?? null;
  const tIn  = lastMj.tempInC  ?? null;

  // refTOut: uzimamo tempOutC iz baseline (nulto mjerenje).
  // Ako baseline nema tempOutC, uzimamo najstarije regularno mjerenje (osim lastMj) koje ima tempOutC.
  const refTOut: number | null = (() => {
    if (baseline?.tempOutC != null) return baseline.tempOutC;
    // regularMjerenja su sortirana kronološki — tražimo najstarije koje ima tempOutC i nije lastMj
    const fallback = [...regularMjerenja]
      .sort((a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime())
      .find(m => m.id !== lastMj.id && m.tempOutC != null);
    return fallback?.tempOutC ?? null;
  })();

  // delta = trenutni Temp OUT − referentni Temp OUT (samo ako su različite vrijednosti)
  const dTout: number | null =
    tOut !== null && refTOut !== null
      ? parseFloat((tOut - refTOut).toFixed(1))
      : null;
  // trend = promjena Temp OUT od prethodnog mjerenja (za smjer kretanja)
  const prevTOut = prevMj?.tempOutC ?? null;
  const dToutPrev = tOut !== null && prevTOut !== null ? tOut - prevTOut : null;
  const tOutTrend: "raste" | "pada" | "stabilna" | null =
    dToutPrev === null ? null :
    dToutPrev > 0.3 ? "raste" :
    dToutPrev < -0.3 ? "pada" : "stabilna";

  // ── Live procjena uklonjenog kamenca ────────────────────────────────────────
  // Sve varijable (basePh, baseFlow, currFlow, tOut, refTOut) su definirane iznad
  const peakFoamLive = allMjerenja.reduce<Mjerenje["foamLevel"]>((peak, m) => {
    const order: Mjerenje["foamLevel"][] = ["nema", "slaba", "srednja", "jaka", "vrlo_jaka"];
    return order.indexOf(m.foamLevel ?? "nema") > order.indexOf(peak ?? "nema") ? m.foamLevel : peak;
  }, "nema");
  const liveEstimate = estimateScaleByReactionParams({
    phStart: basePh,
    phEnd: getMjerenjePH(lastMj) ?? null,
    flowStart: baseFlow ?? null,
    flowEnd: currFlow ?? null,
    tempOutStart: refTOut,
    tempOutEnd: tOut,
    peakFoam: peakFoamLive,
    brojMjerenja: allMjerenja.length,
    brojCiklusa: 1,
    totalChem: 0,
    productSnapshot: ciklus.productSnapshot ?? undefined,
  });

  return (
    <div className="flex flex-col gap-4">

      {/* ── 1. HEADER — info strip ────────────��─────────────────��───────────── */}
      <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-2xl px-4 py-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          {(ciklus.chemicalProductName ?? ciklus.kemikalija) && (
            <span className="text-[11px] text-muted-foreground truncate">
              <span className="text-muted-foreground/50">Sredstvo:</span>{" "}
              <strong className="text-foreground">{ciklus.chemicalProductName ?? ciklus.kemikalija}</strong>
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/50">Zadnje:</span>{" "}
            <strong className="text-foreground font-bold">{fTime(lastTs)}</strong>
          </span>
        </div>
        {callbacks?.onEditReferentno && baseline && (
          <button
            type="button"
            onClick={callbacks.onEditReferentno}
            className="shrink-0 flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl border border-border bg-secondary text-muted-foreground text-[11px] font-semibold hover:bg-muted active:scale-[0.98] transition-all"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Referentno
          </button>
        )}
      </div>

      {/* ── 3. CIRKULACIJA AKTIVNA + ZAŠTO + PREPORUKA ─────────────────────── */}
      {lastMj && (() => {
        const snagaSredstva: "jako" | "aktivno" | "slabi" | "iscrpljeno" =
          ph < 2.0 ? "jako" : ph < 3.0 ? "aktivno" : ph < 4.0 ? "slabi" : "iscrpljeno";
        const napreduje     = deltaFlowPct !== null && deltaFlowPct >= 3;
        const protokStagnira = deltaFlowPct === null || (deltaFlowPct > -1 && deltaFlowPct < 1);
        const trebaNadopuna = rs.primaryAction === "nadopuna";
        const trebaNoviciklus = rs.primaryAction === "novi_ciklus";
        const deltaTOut = tOut !== null && refTOut !== null ? parseFloat((tOut - refTOut).toFixed(1)) : null;
        const tempOutStagnira = deltaTOut === null || (deltaTOut > -0.3 && deltaTOut < 0.3);

        // ── Header status labels ────────────────────────────────────────────
        // pH — naslov + podnaslov
        const phStatusNaslov =
          snagaSredstva === "jako"      ? `pH ${ph.toFixed(2)} — izrazito kisela otopina`
          : snagaSredstva === "aktivno" ? `pH ${ph.toFixed(2)} — sredstvo aktivno`
          : snagaSredstva === "slabi"   ? `pH ${ph.toFixed(2)} — sredstvo slabi`
          :                               `pH ${ph.toFixed(2)} — sredstvo iscrpljeno`;
        const phStatusPodnaslov: string | null =
          snagaSredstva === "jako"      ? "Paziti na materijal."
          : snagaSredstva === "aktivno" ? null
          : snagaSredstva === "slabi"   ? "Razmotri nadopunu kemijskog sredstva."
          :                               "Pripremi završetak ciklusa.";

        // Protok — naslov + podnaslov
        const protokStatusNaslov =
          napreduje                                   ? `Protok raste +${deltaFlowPct!.toFixed(1)}% — čišćenje napreduje`
          : deltaFlowPct !== null && deltaFlowPct > 0 ? `Protok blago raste +${deltaFlowPct.toFixed(1)}%`
          : protokStagnira                            ? "Protok stabilan — nema daljnjeg poboljšanja"
          :                                             `Protok pada ${deltaFlowPct!.toFixed(1)}%`;
        const protokStatusPodnaslov: string | null =
          napreduje ? null
          : protokStagnira ? null
          : "Pratiti stanje sustava.";

        // Temp OUT — naslov + podnaslov
        const tempOutStatusNaslov =
          deltaTOut !== null && deltaTOut >= 0.5 ? `Temp OUT +${deltaTOut.toFixed(1)} °C — izmjena topline raste`
          : tempOutStagnira                       ? "Temp OUT bez promjene — reakcija stagnira"
          :                                         `Temp OUT ${deltaTOut!.toFixed(1)} °C — pada`;
        const tempOutStatusPodnaslov: string | null =
          deltaTOut !== null && deltaTOut >= 0.5 ? null
          : tempOutStagnira                       ? null
          : "Pratiti trend.";

        return (
          <div className="rounded-3xl overflow-hidden border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-700 to-emerald-800">

            {/* ── Naslov s ikonom u krugu ────────────────────────────────── */}
            <div className="px-4 pt-5 pb-3 flex items-start gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-300/40 flex items-center justify-center shrink-0 bg-emerald-600/30">
                <span className="text-xl">⇄</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-white leading-tight mb-1">
                  CIRKULACIJA AKTIVNA
                </h2>
                <p className="text-sm text-emerald-100">
                  {napreduje ? "Voda se uspješno cirkulira kroz sustav." : "Status cirkulacije u tijeku."}
                </p>
              </div>
            </div>

            {/* ── Status redovi s ikonama u krugovima ────────────────────── */}
            <div className="px-6 pb-6 pt-4 space-y-4">
              {/* pH */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-emerald-300/40 flex items-center justify-center shrink-0 bg-emerald-600/30">
                  <span className="text-xl">💧</span>
                </div>
                <div>
                  <p className="text-base font-bold text-white leading-snug">{phStatusNaslov}</p>
                  {phStatusPodnaslov && (
                    <p className="text-sm text-emerald-100 mt-0.5">{phStatusPodnaslov}</p>
                  )}
                </div>
              </div>

              {/* Protok */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-emerald-300/40 flex items-center justify-center shrink-0 bg-emerald-600/30">
                  <span className="text-xl">≈≈</span>
                </div>
                <div>
                  <p className="text-base font-bold text-white leading-snug">{protokStatusNaslov}</p>
                  {protokStatusPodnaslov && (
                    <p className="text-sm text-emerald-100 mt-0.5">{protokStatusPodnaslov}</p>
                  )}
                </div>
              </div>

              {/* Temp OUT */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-emerald-300/40 flex items-center justify-center shrink-0 bg-emerald-600/30">
                  <span className="text-xl">🌡</span>
                </div>
                <div>
                  <p className="text-base font-bold text-white leading-snug">{tempOutStatusNaslov}</p>
                  {tempOutStatusPodnaslov && (
                    <p className="text-sm text-emerald-100 mt-0.5">{tempOutStatusPodnaslov}</p>
                  )}
                </div>
              </div>
            </div>



            {/* ── Gumb Pauziraj / Nastavi vodič (samo TTS) ─────────────── */}
            <div className="px-6 py-3 border-t border-emerald-500/20 flex items-center justify-between bg-emerald-800/30">
              <span className="text-xs text-emerald-200/60 font-medium">
                {vodičPauziran ? "Glasovne upute pauzirane" : "Glasovne upute aktivne"}
              </span>
              <button
                type="button"
                onClick={() => {
                  console.log("[v0] Klik na gumb - trenutno vodičPauziran:", vodičPauziran);
                  setVodičPauziran((v) => !v);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  vodičPauziran
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-emerald-900/60 border-emerald-600/40 text-emerald-200 hover:bg-emerald-800/60"
                }`}
              >
                {vodičPauziran ? "Nastavi glasovne upute" : "Pauziraj glasovne upute"}
              </button>
            </div>

            {/* ── Uputa serviseru ────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-indigo-700/40 bg-indigo-950/50">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">
                Uputa serviseru
              </h3>
              <p className="text-sm font-medium text-indigo-100 leading-relaxed">
                {trebaNoviciklus
                  ? "Ciklus je pri kraju. Pripremi završetak — ispusti otopinu, isperi sustav i pokreni novi ciklus."
                  : trebaNadopuna
                  ? "Dodaj nadopunu kemijskog sredstva."
                  : napreduje
                  ? "Nastavi cirkulaciju. Čišćenje aktivno napreduje."
                  : "Nastavi cirkulaciju kratko vrijeme i prati promjene."}
              </p>
            </div>

            {/* ── Sljedeći korak ─────────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-indigo-700/40 bg-indigo-950/50">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">
                Sljedeći korak
              </h3>
              {trebaNoviciklus ? (
                <p className="text-sm font-bold text-indigo-100">Pripremi završetak ciklusa.</p>
              ) : trebaNadopuna ? (
                <p className="text-sm font-bold text-indigo-100">Dodaj nadopunu kemijskog sredstva.</p>
              ) : napreduje ? (
                <p className="text-sm font-bold text-indigo-100">Nastavi cirkulaciju — nema intervencije.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-indigo-100">Promijeni smjer cirkulacije</p>
                  <p className="text-xs text-indigo-500 font-semibold">ILI</p>
                  <p className="text-sm font-bold text-indigo-100">Pripremi završetak ciklusa.</p>
                </div>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── 4. GLAVNI PARAMETRI ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">

        {/* ── pH card ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Zone accent bar */}
          <div className={`h-1 w-full ${
            ph < 3.0 ? "bg-emerald-500" :
            ph < 4.0 ? "bg-amber-400" :
            "bg-rose-500"
          }`} />
          <div className="px-4 pt-3 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">pH</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ph < 3.0
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : ph < 4.0
                  ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              }`}>
                {zone.label}
              </span>
            </div>
            <div className="flex items-end justify-between flex-wrap gap-x-3 gap-y-1 overflow-hidden">
              <div className="flex items-baseline gap-2 min-w-0 shrink-0">
                <span className="text-5xl font-black tabular-nums text-foreground leading-none">{ph.toFixed(2)}</span>
                <span className={`text-xl font-black leading-none ${
                  phTrendChar === "↑" ? "text-rose-500" :
                  phTrendChar === "↓" ? "text-emerald-500" :
                  "text-muted-foreground/25"
                }`}>{phTrendChar}</span>
              </div>
              {dPh !== null && (
                <div className="flex flex-col items-end gap-0.5 pb-0.5 shrink-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Δ od ref.</span>
                  <span className={`text-lg font-black tabular-nums leading-none ${
                    dPh > 0.05 ? "text-rose-500" :
                    dPh < -0.05 ? "text-emerald-500" :
                    "text-muted-foreground/30"
                  }`}>
                    {dPh > 0 ? "+" : ""}{dPh.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Protok card ── */}
        <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Protok</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              rs.flowTrend === "raste"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : rs.flowTrend === "pada"
                ? "bg-rose-500/15 text-rose-500"
                : "bg-muted text-muted-foreground"
            }`}>
              {rs.flowTrend === "raste" ? "Raste" : rs.flowTrend === "pada" ? "Pada" : "Stabilan"}
            </span>
          </div>
          <div className="flex items-end justify-between flex-wrap gap-x-3 gap-y-1 overflow-hidden">
            <div className="flex items-baseline gap-1.5 min-w-0 shrink-0">
              {currFlow != null ? (
                <>
                  <span className="text-4xl font-black tabular-nums text-foreground leading-none">{currFlow.toFixed(1)}</span>
                  <span className="text-base font-bold text-muted-foreground">L/min</span>
                </>
              ) : (
                <span className="text-4xl font-black text-muted-foreground/20 leading-none">—</span>
              )}
            </div>
            {deltaFlowAbs !== null && (
              <div className="flex flex-col items-end gap-0.5 pb-0.5 shrink-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Δ od ref.</span>
                <span className={`text-lg font-black tabular-nums leading-none ${
                  deltaFlowAbs > 0.1 ? "text-emerald-500" :
                  deltaFlowAbs < -0.1 ? "text-rose-500" :
                  "text-muted-foreground/30"
                }`}>
                  {deltaFlowAbs > 0 ? "+" : ""}{deltaFlowAbs.toFixed(1)}{" "}
                  <span className="text-sm font-bold">L/min</span>
                </span>
                {deltaFlowPct !== null && (
                  <span className={`text-[10px] font-bold tabular-nums ${
                    deltaFlowPct > 0 ? "text-emerald-500" :
                    deltaFlowPct < 0 ? "text-rose-500" :
                    "text-muted-foreground/30"
                  }`}>
                    {deltaFlowPct > 0 ? "+" : ""}{deltaFlowPct.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Temp OUT card ── */}
        {(tOut !== null || refTOut !== null) && (
          <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">TEMP OUT</span>
              {tOut !== null && tOutTrend !== null ? (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  tOutTrend === "raste"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : tOutTrend === "pada"
                    ? "bg-rose-500/15 text-rose-500"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {tOutTrend === "raste" ? "Raste" : tOutTrend === "pada" ? "Pada" : "Stabilna"}
                </span>
              ) : refTOut !== null ? (
                <span className="text-[10px] text-muted-foreground/50">ref. {refTOut.toFixed(1)} °C</span>
              ) : null}
            </div>
            <div className="flex items-end justify-between flex-wrap gap-x-3 gap-y-1 overflow-hidden">
              <div className="flex items-baseline gap-1.5 min-w-0 shrink-0">
                {tOut !== null ? (
                  <>
                    <span className="text-4xl font-black tabular-nums text-foreground leading-none">{tOut.toFixed(1)}</span>
                    <span className="text-base font-bold text-muted-foreground">°C</span>
                  </>
                ) : refTOut !== null ? (
                  <span className="text-sm text-muted-foreground/50 italic">ref. {refTOut.toFixed(1)} °C</span>
                ) : null}
              </div>
              {dTout !== null && (
                <div className="flex flex-col items-end gap-0.5 pb-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Δ TEMP OUT OD REF.</span>
                  <span className={`text-lg font-black tabular-nums leading-none ${
                    dTout > 0.5 ? "text-emerald-500" :
                    dTout < -0.5 ? "text-rose-500" :
                    "text-muted-foreground/30"
                  }`}>
                    {dTout > 0 ? "+" : ""}{dTout.toFixed(1)}{" "}
                    <span className="text-sm font-bold">°C</span>
                  </span>
                  {refTOut !== null && (
                    <span className="text-[10px] text-muted-foreground/40">ref. {refTOut.toFixed(1)} °C</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Pjena + Boja row ── */}
        {(lastMj.foamLevel || (colorLabel && colorDot)) && (
          <div className="grid grid-cols-2 gap-2">
            {lastMj.foamLevel && (
              <div className="rounded-2xl border border-border bg-card px-3.5 py-3 flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Pjena</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${FOAM_DOT[lastMj.foamLevel]}`} />
                  <span className="text-sm font-bold text-foreground">{FOAM_LABELS[lastMj.foamLevel]}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{FOAM_SUBLABEL[lastMj.foamLevel]}</span>
              </div>
            )}
            {colorLabel && colorDot && (
              <div className="rounded-2xl border border-border bg-card px-3.5 py-3 flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Boja</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot}`} />
                  <span className="text-sm font-bold text-foreground">{colorLabel}</span>
                </div>
                {colorSubLabel && (
                  <span className="text-[11px] text-muted-foreground">{colorSubLabel}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Boja indikatora */}
        {colorLabel && colorDot && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Boja indikatora</span>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full shrink-0 ${colorDot}`} />
              <span className="text-sm font-bold text-foreground">{colorLabel}</span>
              {colorSubLabel && (
                <span className="text-xs text-muted-foreground">{colorSubLabel}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. AKCIJE ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {/* Primary CTA */}
        {primaryActionFn && (
          <button
            type="button"
            onClick={primaryActionFn}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base bg-primary text-primary-foreground active:scale-[0.98] transition-all hover:opacity-90 shadow-sm"
            style={{ minHeight: 56 }}
          >
            {rs.primaryAction === "mjerenje" && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {rs.primaryAction === "nadopuna" && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {rs.primaryAction === "novi_ciklus" && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            )}
            {primaryActionLabel}
          </button>
        )}

        {/* Secondary actions — 3-column row */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={callbacks?.onNadopuna}
            disabled={!callbacks?.onNadopuna}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border border-border bg-card text-foreground font-semibold text-xs active:scale-[0.98] transition-all disabled:opacity-30 hover:border-primary/40"
            style={{ minHeight: 52 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nadopuna
          </button>
          <button
            type="button"
            onClick={callbacks?.onNoviCiklus}
            disabled={!callbacks?.onNoviCiklus}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border border-border bg-card text-foreground font-semibold text-xs active:scale-[0.98] transition-all disabled:opacity-30 hover:border-primary/40"
            style={{ minHeight: 52 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
            </svg>
            Novi ciklus
          </button>
          <button
            type="button"
            onClick={callbacks?.onZavrsiCiklus}
            disabled={!callbacks?.onZavrsiCiklus}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border border-border bg-card text-muted-foreground font-semibold text-xs active:scale-[0.98] transition-all disabled:opacity-30 hover:border-rose-400/30"
            style={{ minHeight: 52 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Završi
          </button>
        </div>

        {brzoMjerenjeNote && (
          <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed px-2">{brzoMjerenjeNote}</p>
        )}
      </div>

      {/* ── 8. COLLAPSIBLE: Podsjetnik za mjerenje ───────────────────�������─────��─ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPodsjetnik(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <span className="text-xs font-semibold text-muted-foreground">Podsjetnik za mjerenje</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-muted-foreground transition-transform duration-200 ${showPodsjetnik ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showPodsjetnik && (
          <div className="border-t border-border px-4 py-3">
            <MjerenjeTimer
              lastMjerenjeAt={lastTs}
              onAlarm={() => {
                govori("Vrijeme je za novo mjerenje");
                callbacks?.onMjerenje?.();
              }}
              paused={false}
            />
          </div>
        )}
      </div>

      {/* ── 9. COLLAPSIBLE: Sažetak sesije ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSazetak(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <span className="text-xs font-semibold text-muted-foreground">Sažetak sesije</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-muted-foreground transition-transform duration-200 ${showSazetak ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showSazetak && (
          <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ciklus</span>
              <span className="font-bold text-foreground">#{ciklus.cycleNumber ?? ciklus.broj}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Mjerenja</span>
              <span className="font-bold text-foreground">{allMjerenja.length}</span>
            </div>
            {baseFlow != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ref. protok</span>
                <span className="font-bold text-foreground">{baseFlow.toFixed(1)} L/min</span>
              </div>
            )}
            {basePh !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ref. pH</span>
                <span className="font-bold text-foreground">{basePh.toFixed(2)}</span>
              </div>
            )}
            {tIn !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Temp IN</span>
                <span className="font-bold text-foreground">{tIn.toFixed(1)} °C</span>
              </div>
            )}

            {/* Live procjena uklonjenog kamenca */}
            {!liveEstimate.premaloPodata && (
              <div className="pt-2 border-t border-border flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Procjena kamenca</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    liveEstimate.reactionLevel === "jaka"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      : liveEstimate.reactionLevel === "srednja"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {liveEstimate.reactionLevel === "jaka" ? "jaka reakcija" :
                     liveEstimate.reactionLevel === "srednja" ? "srednja reakcija" : "slaba reakcija"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-black tabular-nums text-foreground">
                    {formatReactionEstimateRange(liveEstimate)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">CaCO3</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-snug">
                  Servisna procjena — ažurira se s mjerenjima.
                </p>
              </div>
            )}

            {/* Glasovni unos */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowVoice((v) => !v)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] border ${
                  showVoice
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Glasovni unos
              </button>
              {showVoice && (
                <div className="mt-2">
                  <GlasovniUnos
                    onParsed={(r) => {
                      callbacks?.onVoiceResult?.(r);
                      setShowVoice(false);
                      window.dispatchEvent(new CustomEvent("hvac:voice-closed"));
                      if (!r.akcija) callbacks?.onMjerenje?.();
                    }}
                    onSpremi={() => {
                      setShowVoice(false);
                      window.dispatchEvent(new CustomEvent("hvac:voice-closed"));
                      callbacks?.onMjerenje?.();
                    }}
                    onNovo={() => {
                      setShowVoice(false);
                      window.dispatchEvent(new CustomEvent("hvac:voice-closed"));
                      callbacks?.onMjerenje?.();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─�� 10. COLLAPSIBLE: Napredne akcije ──���──���──────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDanger(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        >
          <span className="text-xs font-semibold text-muted-foreground">Napredne akcije</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-red-400 transition-transform duration-200 ${showDanger ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showDanger && (
          <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
            {callbacks?.onVoiceCommand && (
              <VoiceCommandButton onCommand={callbacks.onVoiceCommand} />
            )}
            <button
              type="button"
              onClick={callbacks?.onZavrsiCiklus}
              disabled={!callbacks?.onZavrsiCiklus}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-30 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Zatvori bez završetka
            </button>
            <p className="text-[10px] text-muted-foreground/60 text-center leading-snug">
              Ove akcije ne mogu se poništiti.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
