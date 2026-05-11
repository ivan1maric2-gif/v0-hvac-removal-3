"use client";

/**
 * RezultatMjerenja — post-save result screen (Technician-First).
 *
 * ORDER (strict, per spec):
 *   1. Glavna uputa (najveci element)
 *   2. Zasto (1 recenica)
 *   3. Sredstvo (snaga + boja)
 *   4. pH (veliko + delta + zona)
 *   5. Protok (protok + delta + %)
 *   6. Temperatura (temp + delta + interpretacija)
 *   7. Napomena (ako postoji)
 */

import React, { useState, useCallback, useRef } from "react";
import type { Mjerenje, FoamLevel } from "@/lib/types";
import type { Preporuka, PreporukaAkcija } from "@/lib/preporuka";
import { AKCIJA_LABELS } from "@/lib/preporuka";
import { ProcjenaBojePanel } from "./procjena-boje-panel";

// ─── SljedecaAkcijaBlok — akcijska uputa + TTS gumb ──────────────────────────

function buildAkcijaText(
  phVal: number,
  dPH: number,
  dFlow: number | null,
  dTemp: number | null,
  foamAktivna: boolean
): string {
  const sredstvoAktivno = phVal < 3.0;
  const sredstvoSlabi   = phVal >= 3.0 && phVal < 4.5;
  const sredstvoIscrplj = phVal >= 4.5;
  const napredakJak     = (dFlow !== null && dFlow > 1.5) || (dTemp !== null && dTemp > 1.5);
  const napredakBlag    = (dFlow !== null && dFlow > 0.2) || (dTemp !== null && dTemp > 0.3);
  const napredakPada    = dFlow !== null && dFlow < -0.5;
  const napredakStagn   = dFlow !== null && Math.abs(dFlow) < 0.1 && (dTemp === null || Math.abs(dTemp) < 0.3);
  const phRasteBrzo     = dPH > 0.5;

  if (sredstvoIscrplj) {
    if (napredakBlag) return "Pratite reakciju i razmotrite završetak ciklusa.";
    return "Razmotrite nadopunu sredstva ili novi ciklus.";
  }
  if (sredstvoSlabi) {
    if (napredakJak)  return "Nastavite cirkulaciju i napravite novo mjerenje.";
    if (napredakBlag) return "Pratite reakciju i razmotrite završetak ciklusa.";
    return "Razmotrite nadopunu sredstva ili završetak ciklusa.";
  }
  if (sredstvoAktivno) {
    if (napredakPada)  return "Provjerite cirkulaciju i ispravnost spoja.";
    if (napredakStagn) return "Nema daljnjeg značajnog poboljšanja. Završite ciklus i isperite sustav.";
    if (phRasteBrzo)   return "Pratite reakciju i pripremite se za nadopunu.";
    if (napredakJak || foamAktivna) return "Nastavite cirkulaciju i napravite novo mjerenje.";
    return "Nastavite cirkulaciju i napravite novo mjerenje.";
  }
  return "Nastavite cirkulaciju i napravite novo mjerenje.";
}

interface SljedecaAkcijaBlokProps {
  ph: number;
  phChange: number;
  deltaFlowVal: number | null;
  referenceTempOutC: number | null;
  tempOutC?: number;
  foam: FoamLevel | undefined;
}

function SljedecaAkcijaBlok({
  ph, phChange, deltaFlowVal, referenceTempOutC, tempOutC, foam,
}: SljedecaAkcijaBlokProps) {
  const [govori, setGovori] = useState<"idle" | "govor" | "unsupported">("idle");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const dTemp = referenceTempOutC !== null && tempOutC !== undefined
    ? parseFloat((tempOutC - referenceTempOutC).toFixed(1))
    : null;
  const foamAktivna = foam === "jaka" || foam === "vrlo_jaka";

  const akcija = buildAkcijaText(ph, phChange, deltaFlowVal, dTemp, foamAktivna);

  const govoriAkciju = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setGovori("unsupported");
      return;
    }

    // Ako trenutno govori — zaustavi
    if (govori === "govor") {
      window.speechSynthesis.cancel();
      setGovori("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(akcija);
    u.lang = "hr-HR";
    u.rate = 0.95;
    u.pitch = 1.0;

    // Fallback: ako hr-HR nije dostupan, probaj hr ili bs-BA
    const voices = window.speechSynthesis.getVoices();
    const hrVoice = voices.find((v) => v.lang.startsWith("hr") || v.lang.startsWith("bs") || v.lang.startsWith("sr"));
    if (hrVoice) u.voice = hrVoice;

    u.onstart = () => setGovori("govor");
    u.onend   = () => setGovori("idle");
    u.onerror = () => setGovori("idle");

    utterRef.current = u;
    window.speechSynthesis.speak(u);
  }, [akcija, govori]);

  return (
    <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 px-4 py-5 flex flex-col gap-3">
      {/* Header red: label + TTS gumb */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-teal-700 leading-none">→</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-teal-600/70">Sljedeća akcija</span>
        </div>
        {/* TTS gumb */}
        <button
          onClick={govoriAkciju}
          aria-label={govori === "govor" ? "Zaustavi govor" : "Reproduciraj uputu"}
          title={govori === "unsupported" ? "Glasovni izlaz nije podržan u ovom pregledniku" : undefined}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
            govori === "govor"
              ? "bg-teal-700 text-white animate-pulse"
              : govori === "unsupported"
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-teal-700/15 text-teal-700 hover:bg-teal-700/25"
          }`}
        >
          {govori === "govor" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </div>

      {/* Akcijski tekst — veći, istaknutiji */}
      <p className="text-base font-bold text-slate-800 leading-snug">{akcija}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStatusReakcijeLabel(
  preporuka: Preporuka | null | undefined,
  ph: number,
  foam: FoamLevel | undefined
): string {
  if (preporuka?.statusLabel) return preporuka.statusLabel;
  if (ph < 1.5) return "AKTIVNA KISELA ZONA — INTENZIVNA";
  if (ph < 2.0) return "AKTIVNA KISELA ZONA — JAKA";
  if (ph < 3.0) return "AKTIVNA KISELA ZONA";
  if (ph < 4.0) return "SREDSTVO SLABI";
  return "OTOPINA NIJE AKTIVNA";
}

function resolveZoneColor(
  preporuka: Preporuka | null | undefined,
  ph: number
): "green" | "yellow" | "orange" | "red" {
  if (preporuka?.phZoneColor) return preporuka.phZoneColor;
  if (ph < 3.0) return "green";
  if (ph < 4.0) return "yellow";
  return "red";
}

function resolveSljedeciKorak(
  preporuka: Preporuka | null | undefined
): { label: string; action: PreporukaAkcija } {
  if (preporuka?.recommendedAction) {
    return {
      label: AKCIJA_LABELS[preporuka.recommendedAction],
      action: preporuka.recommendedAction,
    };
  }
  return { label: "Dodaj novo mjerenje", action: "continue_circulation" };
}

function resolveExplanation(
  preporuka: Preporuka | null | undefined,
  ph: number,
  foam: FoamLevel | undefined
): string {
  if (preporuka?.explanation) return preporuka.explanation;
  if (foam === "jaka" || foam === "vrlo_jaka") return "Pjena je jos prisutna — reakcija traje.";
  if (ph < 2.5) return "Sredstvo je aktivno u radnoj zoni.";
  if (ph < 4.0) return "pH se podigao — reakcija usporava.";
  return "Sredstvo je vjerojatno iscrpljeno.";
}

/** Snaga sredstva — from pH */
function resolveSnagaSredstva(ph: number): { label: string; color: string } {
  if (ph < 2.0) return { label: "JAKO",       color: "text-green-700 bg-green-100 border-green-300" };
  if (ph < 3.0) return { label: "AKTIVNO",    color: "text-green-600 bg-green-50  border-green-200" };
  if (ph < 4.0) return { label: "SLABI",      color: "text-amber-700 bg-amber-50  border-amber-300" };
  return              { label: "ISCRPLJENO", color: "text-red-700   bg-red-50    border-red-300"   };
}

/** pH zona — human readable */
function resolvePHZonaLabel(ph: number): string {
  if (ph < 1.5) return "Intenzivna kisela zona";
  if (ph < 2.0) return "Jaka kisela zona";
  if (ph < 3.0) return "Aktivna kisela zona";
  if (ph < 4.0) return "Sredstvo slabi";
  return "Otopina neaktivna";
}

/**
 * Delta temperatura interpretacija.
 *
 * SPEC FIX: Ne prikazivati "značajan pad temperature" samo zato što je
 * TEMP OUT niži od TEMP IN — to je NORMALNO za sustave u zagrijavanju.
 *
 * deltaT ovdje = promjena temperature između mjerenja (vs. referentno),
 * NE razlika TEMP OUT - TEMP IN unutar istog mjerenja.
 *
 * Za čišćenje je bitna radna temperatura i stabilnost kroz vrijeme.
 */
function resolveDeltaTInterpretacija(
  deltaT: number | undefined,
  tempValue?: number
): string | null {
  if (deltaT === undefined) return null;

  // Ako je temperatura u radnom rasponu (35-50°C), naglasiti stabilnost
  const isWorkingTemp = tempValue !== undefined && tempValue >= 35 && tempValue <= 50;

  if (Math.abs(deltaT) < 0.5) {
    return isWorkingTemp
      ? "Temperatura radna i stabilna."
      : "Temperatura stabilna.";
  }

  if (deltaT > 2) {
    return "Temperatura raste — pratite sustav.";
  }
  if (deltaT > 0) {
    return isWorkingTemp
      ? "Temperatura radna — blagi porast."
      : "Blagi porast temperature.";
  }

  // Pad temperature — NE alarmirati ako je mala promjena ili sustav u zagrijavanju
  if (deltaT < -2) {
    return "Temperatura pada — provjerite izvor topline.";
  }
  return isWorkingTemp
    ? "Temperatura radna — prati stabilnost."
    : "Blagi pad temperature.";
}

// ─── Color maps ───────────────────────────────────────────────────────────────

const ZONE_BG: Record<"green" | "yellow" | "orange" | "red", string> = {
  green:  "border-emerald-500/30 bg-emerald-50  text-emerald-900",
  yellow: "border-amber-400/30  bg-amber-50   text-amber-900",
  orange: "border-orange-500/30 bg-orange-50  text-orange-900",
  red:    "border-rose-500/30   bg-rose-50    text-rose-900",
};

const ZONE_BADGE: Record<"green" | "yellow" | "orange" | "red", string> = {
  green:  "bg-emerald-100 text-emerald-700",
  yellow: "bg-amber-100  text-amber-700",
  orange: "bg-orange-100 text-orange-700",
  red:    "bg-rose-100   text-rose-700",
};

const ACTION_BG: Record<PreporukaAkcija, string> = {
  continue_circulation:     "bg-teal-700 text-white",
  monitor_next_measurement: "bg-teal-700 text-white",
  add_top_up:               "bg-amber-500 text-white",
  start_new_cycle:          "bg-red-600   text-white",
  finish_cycle:             "bg-green-600 text-white",
  rinse_system:             "bg-cyan-600  text-white",
  finish_subsession:        "bg-green-600 text-white",
  finish_session:           "bg-green-700 text-white",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RezultatMjerenjaProps {
  mjerenje: Mjerenje;
  referenceTempOutC?: number | null;
  referenceFlowLMin?: number | null;
  onNovoMjerenje: () => void;
  onDodajNadopunu: () => void;
  onNoviCiklus: () => void;
  /** Završava aktivni ciklus — prikazuje se samo dok je ciklus aktivan */
  onZavrsiCiklus?: () => void;
  onPrimaryAction: (action: PreporukaAkcija) => void;
  onClose: () => void;
  /** Ako je true — ciklus/sesija su završeni, prikazuje se završni izvještaj bez LIVE akcija */
  ciklusZavrsen?: boolean;
}

// ─── InitialDetailsSection — expandable sekundarni podaci ────────────────────

function InitialDetailsSection({ mjerenje }: { mjerenje: Mjerenje }) {
  const [open, setOpen] = useState(false);

  const hasTempIn  = mjerenje.tempInC !== undefined;
  const hasFoam    = !!mjerenje.foamLevel;
  const hasColor   = !!mjerenje.colorIndicator;
  const hasTime    = !!mjerenje.measuredAt;

  const hasAny = hasTempIn || hasFoam || hasColor || hasTime;
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Detalji mjerenja
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-slate-200">
          {/* Temp IN — sekundarni */}
          {hasTempIn && (
            <div className="flex items-baseline justify-between pt-3">
              <span className="text-xs text-slate-500">Temp IN (ulaz)</span>
              <span className="text-base font-bold tabular-nums text-slate-600">
                {mjerenje.tempInC!.toFixed(1)} °C
              </span>
            </div>
          )}

          {/* Pjena */}
          {hasFoam && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Pjena</span>
              <span className="text-sm font-bold text-slate-800 capitalize">
                {mjerenje.foamLevel!.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {/* Boja */}
          {hasColor && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Boja otopine</span>
              <span className="text-sm font-bold text-slate-800 capitalize">
                {mjerenje.colorIndicator!.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {/* Vrijeme */}
          {hasTime && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Vrijeme mjerenja</span>
              <span className="text-sm font-bold tabular-nums text-slate-800">
                {new Date(mjerenje.measuredAt!).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}
                {mjerenje.minutesFromCycleStart !== undefined && (
                  <span className="text-slate-400 font-normal ml-1.5">
                    ({mjerenje.minutesFromCycleStart} min)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────���───────────────────────────────────

export function RezultatMjerenja({
  mjerenje,
  referenceTempOutC = null,
  referenceFlowLMin = null,
  onNovoMjerenje,
  onDodajNadopunu,
  onNoviCiklus,
  onZavrsiCiklus,
  onPrimaryAction,
  onClose,
  ciklusZavrsen = false,
}: RezultatMjerenjaProps) {
  const preporuka   = mjerenje.preporuka ?? null;
  const ph          = mjerenje.ph;
  const foam        = mjerenje.foamLevel;
  const isInitial   = mjerenje.measurementType === "initial_cycle_measurement";

  const zoneColor     = resolveZoneColor(preporuka, ph);
  const sljedeciKorak = resolveSljedeciKorak(preporuka);
  const explanation   = resolveExplanation(preporuka, ph, foam);
  const snaga         = resolveSnagaSredstva(ph);
  const phZonaLabel   = resolvePHZonaLabel(ph);

  const [showExplanation, setShowExplanation] = useState(false);

  // Delta pH sign + color
  const phChangeSgn = mjerenje.phChange !== undefined
    ? (mjerenje.phChange > 0 ? "+" : "") + mjerenje.phChange.toFixed(2)
    : null;
  const phChangeColor = mjerenje.phChange === undefined || Math.abs(mjerenje.phChange) < 0.01
    ? "text-muted-foreground"
    : mjerenje.phChange > 0 ? "text-red-600" : "text-green-600";

  // Delta protok — preferiramo izračun iz referenceFlowLMin prop, fallback na flowChangeFromInitial
  const deltaFlowVal: number | null =
    referenceFlowLMin !== null && mjerenje.flowLMin !== undefined
      ? parseFloat((mjerenje.flowLMin - referenceFlowLMin).toFixed(1))
      : mjerenje.flowChangeFromInitial !== undefined
        ? mjerenje.flowChangeFromInitial
        : null;

  const flowChangeSgn = deltaFlowVal !== null
    ? (deltaFlowVal > 0 ? "+" : "") + deltaFlowVal.toFixed(1) + " L/min"
    : null;
  const flowChangeColor = deltaFlowVal === null || Math.abs(deltaFlowVal) < 0.1
    ? "text-muted-foreground/50"
    : deltaFlowVal > 0 ? "text-green-500" : "text-red-500";

  // Trend protoka
  const flowTrend: string | null =
    deltaFlowVal === null ? null
    : Math.abs(deltaFlowVal) < 0.1 ? "Stabilan"
    : deltaFlowVal > 1.5 ? "Raste brzo"
    : deltaFlowVal > 0 ? "Raste"
    : deltaFlowVal < -1.5 ? "Pada brzo"
    : "Pada";

  const flowTrendColor =
    deltaFlowVal === null || Math.abs(deltaFlowVal ?? 0) < 0.1 ? "text-muted-foreground/50"
    : (deltaFlowVal ?? 0) > 0 ? "text-green-500" : "text-red-500";

  // Temperatura — tempVal samo za fallback prikaz (stara mjerenja bez tempOutC/tempInC)
  const tempVal = mjerenje.tempOutC ?? mjerenje.tempInC ?? mjerenje.temperatureC;

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Rezultat mjerenja"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-5 pb-3 border-b border-slate-200 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Zatvori"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {isInitial ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-0.5">
                Referentno mjerenje
              </p>
              <h1 className="text-xl font-black leading-tight tracking-tight text-slate-900">
                Rezultat
              </h1>
            </>
          ) : (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                Mjerenje
              </p>
              <h1 className="text-xl font-black leading-tight tracking-tight text-slate-900">
                Rezultat
              </h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-600" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[10px] font-black text-emerald-600">Spremljeno</span>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto w-full px-4 py-5 flex flex-col gap-4">

          {/* ════════════ REFERENTNO MJERENJE ════════════ */}
          {isInitial && (
            <>
              {/* Banner */}
              <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400 shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                    Referentno mjerenje
                  </span>
                </div>
                <p className="text-base font-bold text-amber-100">
                  Bazna vrijednost ciklusa je spremljena.
                </p>
                <p className="text-sm text-amber-200/70 leading-relaxed">
                  Pokrenite cirkulaciju i pratite reakciju u LIVE pregledu.
                </p>
                <button
                  type="button"
                  onClick={() => setShowExplanation((p) => !p)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors w-fit"
                >
                  {showExplanation ? "Sakrij" : "Sto to znaci?"}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`transition-transform ${showExplanation ? "rotate-180" : ""}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showExplanation && (
                  <div className="flex flex-col gap-2 pt-1 border-t border-slate-700">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Referentno mjerenje je pocetna vrijednost nakon ulijevanja sredstva i kratke cirkulacije.
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Delta vrijednosti (&Delta; pH, &Delta; protok, &Delta; temperatura) racunaju se tek od sljedeceg mjerenja.
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Sljedeci korak: nastavite cirkulaciju i unesite redovno mjerenje prema procjeni servisera.
                    </p>
                  </div>
                )}
              </div>

              {/* ── PRIMARY: pH + Protok — side by side, veliki */}
              <div className="grid grid-cols-2 gap-3">
                {/* pH */}
                <div className="rounded-2xl border-2 border-amber-300 bg-white px-4 py-5 flex flex-col gap-1.5 shadow-sm">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">pH</span>
                  <span className="text-4xl font-black tabular-nums text-slate-900 leading-none">{ph.toFixed(2)}</span>
                  <span className="text-[11px] font-semibold text-slate-500 mt-1">{phZonaLabel}</span>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-xl border w-fit mt-0.5 ${snaga.color}`}>{snaga.label}</span>
                </div>

                {/* Protok */}
                <div className="rounded-2xl border-2 border-teal-200 bg-white px-4 py-5 flex flex-col gap-1.5 shadow-sm">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Protok</span>
                  {mjerenje.flowLMin !== undefined ? (
                    <>
                      <span className="text-4xl font-black tabular-nums text-slate-900 leading-none">
                        {mjerenje.flowLMin.toFixed(1)}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 mt-1">L/min</span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-slate-300 leading-none mt-1">—</span>
                  )}
                  <span className="text-[10px] text-slate-400 mt-1">&Delta; —</span>
                </div>
              </div>

              {/* ── PRIMARY: Temp OUT */}
              {mjerenje.tempOutC !== undefined && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Temp OUT</span>
                    <span className="text-[10px] text-slate-400">izlaz</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black tabular-nums text-slate-900 leading-none">
                      {mjerenje.tempOutC.toFixed(1)}
                    </span>
                    <span className="text-base font-bold text-slate-500">°C</span>
                  </div>
                </div>
              )}

              {/* ── TREND NOTICE — potrebno još jedno mjerenje */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-teal-700" aria-hidden="true">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-slate-800 leading-snug">
                    Potrebno još jedno mjerenje
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Trend i ocjena reakcije izračunavaju se tek od sljedećeg mjerenja.
                  </p>
                </div>
              </div>

              {/* ── STATUS REAKCIJE */}
              {(() => {
                const zc = resolveZoneColor(preporuka, ph);
                const statusLabel = resolveStatusReakcijeLabel(preporuka, ph, foam);
                const iconColor =
                  zc === "green"  ? "text-green-600"  :
                  zc === "yellow" ? "text-amber-600"  :
                  zc === "orange" ? "text-orange-600" :
                  "text-red-600";
                const iconBg =
                  zc === "green"  ? "bg-green-100"  :
                  zc === "yellow" ? "bg-amber-100"  :
                  zc === "orange" ? "bg-orange-100" :
                  "bg-red-100";
                const borderColor =
                  zc === "green"  ? "border-green-200"  :
                  zc === "yellow" ? "border-amber-200"  :
                  zc === "orange" ? "border-orange-200" :
                  "border-red-200";
                return (
                  <div className={`rounded-xl border ${borderColor} bg-white px-4 py-4 flex items-start gap-3 shadow-sm`}>
                    <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={iconColor} aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${iconColor}`}>
                        Status reakcije
                      </span>
                      <span className="text-base font-black leading-snug text-slate-900">
                        {statusLabel}
                      </span>
                      {explanation && (
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                          {explanation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── SEKUNDARNO: Temp IN + Pjena + Boja — expandable */}
              <InitialDetailsSection mjerenje={mjerenje} />

              {/* Napomena */}
              {mjerenje.note && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Napomena</span>
                  <p className="text-sm text-slate-800 leading-relaxed">{mjerenje.note}</p>
                </div>
              )}
            </>
          )}

          {/* ════════════ REDOVNO MJERENJE (strict order per spec) ════════════ */}
          {!isInitial && (
            <>
              {/* ── ZAVRŠENI CIKLUS: završni servisni zaključak bez LIVE akcija ── */}
              {ciklusZavrsen ? (
                (() => {
                  // Izračunaj završni summary iz podataka mjerenja
                  const flowEnd   = mjerenje.flowLMin ?? null;
                  const flowStart = referenceFlowLMin;
                  const flowImpPct = flowStart && flowEnd && flowStart > 0
                    ? ((flowEnd - flowStart) / flowStart) * 100 : null;
                  const dTempOut = referenceTempOutC !== null && mjerenje.tempOutC !== undefined
                    ? parseFloat((mjerenje.tempOutC - referenceTempOutC).toFixed(1)) : null;
                  const phFinal = ph ?? null;

                  const rezultatLabel =
                    flowImpPct !== null && flowImpPct >= 25 ? "Uspješno očišćeno"
                    : flowImpPct !== null && flowImpPct >= 10 ? "Djelomično očišćeno"
                    : flowImpPct !== null && flowImpPct >= 2 ? "Blago poboljšanje"
                    : "Bez značajne promjene";

                  const rezultatColor =
                    flowImpPct !== null && flowImpPct >= 25 ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : flowImpPct !== null && flowImpPct >= 10 ? "border-sky-300 bg-sky-50 text-sky-800"
                    : flowImpPct !== null && flowImpPct >= 2 ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600";

                  const zakljucakTekst =
                    flowImpPct !== null && flowImpPct >= 25
                      ? "Protočnost i prijenos topline značajno su poboljšani."
                      : flowImpPct !== null && flowImpPct >= 10
                      ? "Primjetno poboljšanje protočnosti. Preporučuje se kontrolno mjerenje."
                      : flowImpPct !== null && flowImpPct >= 2
                      ? "Manje poboljšanje. Razmotrite dodatni ciklus pri sljedećem servisu."
                      : "Nema dovoljno podataka za procjenu ili bez promjene.";

                  return (
                    <div className="flex flex-col gap-3">
                      {/* Rezultat čišćenja */}
                      <div className={`rounded-2xl border-2 px-5 py-4 flex flex-col gap-1 ${rezultatColor}`}>
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Rezultat čišćenja</span>
                        <span className="text-2xl font-black leading-tight">{rezultatLabel}</span>
                      </div>

                      {/* Zaključak */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex flex-col gap-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Zaključak</span>
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">{zakljucakTekst}</p>
                      </div>

                      {/* Δ protok i Δ Temp OUT — finalne vrijednosti */}
                      {(flowImpPct !== null || dTempOut !== null) && (
                        <div className="grid grid-cols-2 gap-2">
                          {flowImpPct !== null && (
                            <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Δ Protok</span>
                              <span className={`text-lg font-black tabular-nums ${flowImpPct >= 10 ? "text-emerald-500" : flowImpPct >= 2 ? "text-amber-500" : "text-muted-foreground"}`}>
                                {flowImpPct > 0 ? "+" : ""}{flowImpPct.toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {dTempOut !== null && (
                            <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Δ Temp OUT</span>
                              <span className={`text-lg font-black tabular-nums ${dTempOut >= 1 ? "text-emerald-500" : dTempOut >= 0.3 ? "text-amber-500" : "text-muted-foreground"}`}>
                                {dTempOut > 0 ? "+" : ""}{dTempOut.toFixed(1)} °C
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <>
              {/* 1. GLAVNA UPUTA — operativna naredba, ne samo status */}
              {/* SPEC: Na vrhu ekrana uvijek mora biti jedna velika glavna naredba */}
              <button
                type="button"
                onClick={() => onPrimaryAction(sljedeciKorak.action)}
                className={`w-full rounded-2xl px-5 py-6 flex flex-col gap-2 text-left active:scale-[0.98] transition-all shadow-md ${ACTION_BG[sljedeciKorak.action]}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {sljedeciKorak.action === "continue_circulation" ? "Sljedeća akcija" : "Glavna uputa"}
                </span>
                <span className="text-3xl font-black leading-none tracking-tight">
                  {preporuka?.cleaningDecision?.glavnaUputaLabel?.toUpperCase() ?? sljedeciKorak.label.toUpperCase()}
                </span>
              </button>

              {/* 2. ZASTO — kratko objašnjenje: što se događa, zašto app daje tu uputu */}
              {/* SPEC: Dodaj kratko objašnjenje ispod glavne upute */}
              <div className="px-1 flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-slate-800 leading-snug">
                  {preporuka?.cleaningDecision?.zasto ?? explanation}
                </p>
                {/* CleaningDecision — status čišćenja + snaga + protok, vidljivo */}
                {preporuka?.cleaningDecision && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {/* Stanje čišćenja */}
                    {preporuka.cleaningDecision.stanjeCiscentaLabel && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        preporuka.cleaningDecision.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : preporuka.cleaningDecision.severity === "warn"
                          ? "bg-amber-100 text-amber-700"
                          : preporuka.cleaningDecision.severity === "ok"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {preporuka.cleaningDecision.stanjeCiscentaLabel}
                      </span>
                    )}
                    {/* Snaga sredstva (iz cleaningDecision, engine-derived) */}
                    {preporuka.cleaningDecision.stanjeSredstvaLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {preporuka.cleaningDecision.stanjeSredstvaLabel}
                      </span>
                    )}
                    {/* Protok */}
                    {preporuka.cleaningDecision.flowStateLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                        {preporuka.cleaningDecision.flowStateLabel}
                      </span>
                    )}
                    {/* Color mismatch upozorenje */}
                    {preporuka.cleaningDecision.colorMismatch && preporuka.cleaningDecision.colorMismatchMessage && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        {preporuka.cleaningDecision.colorMismatchMessage}
                      </span>
                    )}
                  </div>
                )}
                {/* Confidence indikator */}
                {preporuka?.cleaningDecision?.confidence && preporuka.cleaningDecision.confidence !== "high" && (
                  <p className="text-[10px] text-slate-400">
                    Pouzdanost procjene:{" "}
                    <span className={`font-semibold ${
                      preporuka.cleaningDecision.confidence === "low" ? "text-amber-600" : "text-slate-600"
                    }`}>
                      {preporuka.cleaningDecision.confidence === "low" ? "Niska — nedovoljno podataka" : "Srednja"}
                    </span>
                  </p>
                )}
              </div>

              {/* 2b. TUMAČENJE — rečenice koje objašnjavaju što parametri znače za servisera */}
              {(() => {
                const linije: string[] = [];
                if (deltaFlowVal !== null) {
                  if (deltaFlowVal > 2)         linije.push("Protok raste — kamenac se otapa.");
                  else if (deltaFlowVal > 0.2)  linije.push("Protok blago raste — čišćenje napreduje.");
                  else if (deltaFlowVal < -1)   linije.push("Protok pada — provjerite cirkulaciju.");
                  else                          linije.push("Protok i Temp OUT stagniraju — čišćenje možda ne napreduje značajno.");
                }
                if (mjerenje.phChange !== undefined) {
                  const dPH = mjerenje.phChange;
                  if (dPH > 0.5)        linije.push("pH brzo raste — sredstvo se troši.");
                  else if (dPH > 0.15)  linije.push("pH raste — reakcija usporava.");
                  else if (dPH < -0.1)  linije.push("pH pada — reakcija se intenzivira.");
                }
                if (foam === "jaka" || foam === "vrlo_jaka")
                  linije.push("Pjena prisutna — reakcija aktivna.");
                else if (foam === "slaba" || foam === "nema")
                  linije.push("Pjena slabi — reakcija je pri kraju.");
                if (referenceTempOutC !== null && mjerenje.tempOutC !== undefined) {
                  const dT = parseFloat((mjerenje.tempOutC - referenceTempOutC).toFixed(1));
                  if (dT >= 2)        linije.push("Temp OUT raste — prijenos topline se poboljšava.");
                  else if (dT >= 0.5) linije.push("Temp OUT blago raste — kamenac reagira.");
                  else if (dT <= -1)  linije.push("Temp OUT pada — pratite izvor topline.");
                }
                if (linije.length === 0) return null;
                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex flex-col gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tumačenje</span>
                    {linije.map((l, i) => (
                      <p key={i} className="text-sm text-slate-700 leading-relaxed font-medium">{l}</p>
                    ))}
                  </div>
                );
              })()}

              {/* 2c. SLJEDEĆA AKCIJA — direktna akcijska uputa + TTS */}
              <SljedecaAkcijaBlok
                ph={ph ?? 7}
                phChange={mjerenje.phChange ?? 0}
                deltaFlowVal={deltaFlowVal}
                referenceTempOutC={referenceTempOutC}
                tempOutC={mjerenje.tempOutC}
                foam={foam}
              />
                </>
              )}

              {/* 3. SREDSTVO — ProcjenaBojePanel (product-specific zones, read-only post-save) */}
              {(mjerenje.productSnapshot?.indicatorZones ?? []).length > 0 ? (
                <ProcjenaBojePanel
                  ph={ph}
                  indicatorZones={mjerenje.productSnapshot?.indicatorZones ?? []}
                  colorIndicators={mjerenje.productSnapshot?.colorIndicators ?? []}
                  selectedColor={mjerenje.colorIndicator ?? ""}
                  showChips={false}
                  compact={false}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col gap-2 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Sredstvo
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-black px-3 py-1 rounded-xl border ${snaga.color}`}>
                      {snaga.label}
                    </span>
                    {mjerenje.colorIndicator && (
                      <span className="text-sm font-semibold text-slate-500 capitalize">
                        {mjerenje.colorIndicator.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  {foam && foam !== "nema" && (
                    <p className="text-xs text-slate-500">
                      Pjena: <span className="font-semibold text-slate-800 capitalize">{foam.replace(/_/g, " ")}</span>
                    </p>
                  )}
                </div>
              )}

              {/* 4. pH */}
              <div className={`rounded-2xl border-2 px-5 py-4 flex flex-col gap-1 ${ZONE_BG[zoneColor]}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">pH</span>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-black tabular-nums leading-none">{ph.toFixed(2)}</span>
                  {phChangeSgn && (
                    <span className={`text-xl font-bold tabular-nums pb-0.5 ${phChangeColor}`}>
                      &Delta; {phChangeSgn}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-bold mt-1 ${ZONE_BADGE[zoneColor]} rounded-full px-2 py-0.5 w-fit`}>
                  {phZonaLabel}
                </span>
                {mjerenje.phRatePerMinute !== undefined && (
                  <p className="text-xs opacity-60 tabular-nums mt-1">
                    {mjerenje.phRatePerMinute > 0 ? "pH raste " : "pH pada "}
                    ({mjerenje.phRatePerMinute > 0 ? "+" : ""}{mjerenje.phRatePerMinute.toFixed(3)}/min)
                  </p>
                )}
              </div>

              {/* 5. PROTOK */}
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Protok</span>
                  {referenceFlowLMin !== null && (
                    <span className="text-[10px] text-slate-400">ref. {referenceFlowLMin.toFixed(1)} L/min</span>
                  )}
                </div>
                <div className="flex items-end gap-3">
                  {mjerenje.flowLMin !== undefined ? (
                    <>
                      <span className="text-4xl font-black tabular-nums leading-none text-slate-900">
                        {mjerenje.flowLMin.toFixed(1)}
                      </span>
                      <span className="text-sm text-slate-500 pb-0.5">L/min</span>
                    </>
                  ) : (
                    <span className="text-4xl font-black tabular-nums leading-none text-slate-300">—</span>
                  )}
                  {flowChangeSgn && !isInitial && (
                    <div className="flex flex-col items-end gap-0 pb-0.5 ml-auto">
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Δ protok</span>
                      <span className={`text-xl font-black tabular-nums leading-tight ${flowChangeColor}`}>
                        {flowChangeSgn}
                      </span>
                    </div>
                  )}
                </div>
                {flowTrend && !isInitial && (
                  <p className={`text-xs font-semibold tabular-nums ${flowTrendColor}`}>
                    {flowTrend === "Stabilan" ? "→ Stabilan" :
                     flowTrend.startsWith("Raste") ? `↑ ${flowTrend}` :
                     `↓ ${flowTrend}`}
                  </p>
                )}
              </div>

              {/* 6. TEMPERATURA — Temp OUT primarni, Temp IN sekundarni */}
              {mjerenje.tempOutC !== undefined && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Temp OUT</span>
                    {referenceTempOutC !== null && (
                      <span className="text-[10px] text-slate-400">ref. {referenceTempOutC.toFixed(1)} °C</span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black tabular-nums text-slate-900 leading-none">
                        {mjerenje.tempOutC.toFixed(1)}
                      </span>
                      <span className="text-base font-bold text-slate-500">°C</span>
                    </div>
                    {referenceTempOutC !== null && !isInitial && (() => {
                      const dOut = parseFloat((mjerenje.tempOutC! - referenceTempOutC).toFixed(1));
                      const tempTrend =
                        Math.abs(dOut) < 0.3 ? "Stabilan"
                        : dOut > 1 ? "Raste brzo"
                        : dOut > 0 ? "Raste"
                        : dOut < -1 ? "Pada brzo"
                        : "Pada";
                      const tempTrendColor =
                        Math.abs(dOut) < 0.3 ? "text-slate-300"
                        : dOut > 0 ? "text-green-500" : "text-red-500";
                      return (
                        <div className="flex flex-col items-end gap-0">
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Δ OUT</span>
                          <span className={`text-xl font-black tabular-nums leading-tight ${tempTrendColor}`}>
                            {dOut > 0 ? "+" : ""}{dOut.toFixed(1)} °C
                          </span>
                          <span className={`text-[10px] font-semibold ${tempTrendColor}`}>
                            {tempTrend === "Stabilan" ? "→ Stabilan"
                              : tempTrend.startsWith("Raste") ? `↑ ${tempTrend}`
                              : `↓ ${tempTrend}`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  {/* Temp IN — sekundarno, manji tekst */}
                  {mjerenje.tempInC !== undefined && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest">Temp IN</span>
                      <span className="text-sm text-slate-500 tabular-nums">{mjerenje.tempInC.toFixed(1)} °C</span>
                    </div>
                  )}
                </div>
              )}
              {/* Fallback ako nema tempOutC ni tempInC ali ima staro temperatureC */}
              {mjerenje.tempOutC === undefined && mjerenje.tempInC === undefined && tempVal !== undefined && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Temperatura</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black tabular-nums text-slate-900 leading-none">{tempVal}</span>
                    <span className="text-base font-bold text-slate-500">°C</span>
                  </div>
                </div>
              )}

              {/* 7. NAPOMENA */}
              {mjerenje.note && (
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col gap-1 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Napomena</span>
                  <p className="text-sm text-slate-800 leading-relaxed">{mjerenje.note}</p>
                </div>
              )}

              {/* 8. CYCLE DECISION — prikaži samo kad nije nastavi */}
              {preporuka?.cycleDecisionType && preporuka.cycleDecisionType !== "nastavi_ciklus" && (
                <div className={`rounded-xl border-2 px-4 py-4 flex flex-col gap-1.5 ${
                  preporuka.cycleDecisionType === "zavrsi_i_isperi" || preporuka.cycleDecisionType === "zavrsi_posao"
                    ? "border-emerald-300 bg-emerald-50"
                    : preporuka.cycleDecisionType === "zavrsi_i_novi_ciklus"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    preporuka.cycleDecisionType === "zavrsi_i_isperi" || preporuka.cycleDecisionType === "zavrsi_posao"
                      ? "text-emerald-700"
                      : preporuka.cycleDecisionType === "zavrsi_i_novi_ciklus"
                      ? "text-red-700"
                      : "text-amber-700"
                  }`}>
                    Odluka o ciklusu
                  </span>
                  <p className={`text-sm font-bold leading-snug ${
                    preporuka.cycleDecisionType === "zavrsi_i_isperi" || preporuka.cycleDecisionType === "zavrsi_posao"
                      ? "text-emerald-900"
                      : preporuka.cycleDecisionType === "zavrsi_i_novi_ciklus"
                      ? "text-red-900"
                      : "text-amber-900"
                  }`}>
                    {preporuka.cycleDecision ?? "Nema podataka"}
                  </p>
                  {preporuka.cycleDecisionReason && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {preporuka.cycleDecisionReason}
                    </p>
                  )}
                </div>
              )}

              {/* 9. UPOZORENJA — uvijek vidljiva, kritična su visoko kontrastna */}
              {preporuka?.warnings && preporuka.warnings.length > 0 && (
                <div className="flex flex-col gap-2">
                  {preporuka.warnings.map((w, i) => {
                    // Heuristika za critical warnings (flow pad, iscrpljenost, blokada završetka)
                    const isCritical =
                      w.toLowerCase().includes("ispust") ||
                      w.toLowerCase().includes("iscrplj") ||
                      w.toLowerCase().includes("blokira") ||
                      w.toLowerCase().includes("neutraliz") ||
                      w.toLowerCase().includes("zaustavit") ||
                      w.toLowerCase().includes("opasn");
                    return (
                      <div
                        key={i}
                        className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
                          isCritical
                            ? "border-red-300 bg-red-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <svg
                          width="16" height="16"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className={`shrink-0 mt-0.5 ${isCritical ? "text-red-600" : "text-amber-600"}`}
                          aria-hidden="true"
                        >
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <p className={`text-sm font-semibold leading-relaxed ${
                          isCritical ? "text-red-800" : "text-amber-800"
                        }`}>
                          {w}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ── Sticky footer ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 flex flex-col gap-2.5 max-w-lg mx-auto w-full">
        {/* Završeni ciklus — samo zatvori, bez LIVE akcija */}
        {ciklusZavrsen ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 active:scale-[0.98] transition-all"
            style={{ minHeight: 56 }}
          >
            Zatvori
          </button>
        ) : isInitial ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-teal-700 text-white font-bold text-base hover:bg-teal-800 active:scale-[0.98] transition-all shadow-sm"
            style={{ minHeight: 56 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Idi na LIVE praćenje
          </button>
        ) : (
          <>
            {/* PRIMARY: Dodaj novo mjerenje — uvijek vidljiv dok je ciklus aktivan */}
            <button
              type="button"
              onClick={onNovoMjerenje}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-teal-700 text-white font-bold text-base hover:bg-teal-800 active:scale-[0.98] transition-all shadow-sm"
              style={{ minHeight: 56 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Dodaj novo mjerenje
            </button>

            {/* PRIMARY: Završi ciklus — vidljiv samo dok je ciklus aktivan (onZavrsiCiklus je proslijeđen) */}
            {onZavrsiCiklus && (
              <button
                type="button"
                onClick={onZavrsiCiklus}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-bold text-base hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm"
                style={{ minHeight: 56 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Završi ciklus
              </button>
            )}

            {/* SECONDARY: Nadopuna — uvijek vidljiva dok je ciklus aktivan */}
            <button
              type="button"
              onClick={onDodajNadopunu}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 font-bold text-sm hover:bg-amber-100 active:scale-95 transition-all"
              style={{ minHeight: 48 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nadopuna sredstva
            </button>

            {/* TERTIARY: Novi ciklus */}
            {!onZavrsiCiklus && (
              <button
                type="button"
                onClick={onNoviCiklus}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:border-red-300 hover:text-red-600 active:scale-95 transition-all"
                style={{ minHeight: 48 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Novi ciklus
              </button>
            )}

            {/* Sekundarna navigacija */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors text-center"
            >
              Natrag na sesiju
            </button>
          </>
        )}
      </div>
    </div>
  );
}
