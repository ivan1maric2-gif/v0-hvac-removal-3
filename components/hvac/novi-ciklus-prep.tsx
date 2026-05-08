"use client";

import { useState, useEffect, useCallback } from "react";
import type { RazlogCiklusa, DrainAppearance, RinseMethod, JedinicaProtoka } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Kontekst prethodnog ciklusa za pametno povezivanje */
export interface PreviousCycleContext {
  endPh?: number;
  endFlow?: number;
  flowUnit?: JedinicaProtoka;
  status: "zavrsen" | "prekinut" | "aktivan";
  reason?: RazlogCiklusa;
  timestamp?: string;
}

interface Props {
  cycleNumber: number;
  isFirst: boolean;
  previousCycle?: PreviousCycleContext;
  /** Ako je true, prikazuje upozorenje da prethodni ciklus nije zatvoren */
  previousCycleNotClosed?: boolean;
  /** Callback za zatvaranje prethodnog ciklusa */
  onClosePreviousCycle?: () => void;
  onContinue: (data: PrepData) => void;
  onCancel: () => void;
}

export interface PrepData {
  // Card 1: Zatvaranje prethodnog
  previousCycleStatus: "zavrsen" | "prekinut";
  drainAppearance: DrainAppearance;
  drainSediment: "nema" | "malo" | "srednje" | "puno";
  drainQuantityL: string;
  drainTimestamp: string; // automatski
  // Card 2: Ispiranje
  rinsed: boolean;
  rinseMethod: RinseMethod;
  rinsePhAfter: string;
  rinseTds: string;
  rinseTimestamp: string; // automatski
  // Card 3: Pokretanje novog ciklusa
  cycleName: string;
  reason: RazlogCiklusa;
  napomena: string;
  cycleTimestamp: string; // automatski - vrijeme pokretanja
}

// ─── Options ──────────────────────────────────────────────────────────────────

const CYCLE_STATUS = [
  { value: "zavrsen", label: "Završen" },
  { value: "prekinut", label: "Prekinut" },
] as const;

const DRAIN_APPEARANCE: { value: DrainAppearance; label: string; color: string }[] = [
  { value: "bistra", label: "Bistra", color: "bg-emerald-500" },
  { value: "mutna", label: "Mutna", color: "bg-amber-500" },
  { value: "jako_mutna", label: "Jako mutna", color: "bg-orange-500" },
  { value: "puno_taloga", label: "Puno taloga", color: "bg-red-500" },
];

const DRAIN_SEDIMENT = [
  { value: "nema", label: "Nema" },
  { value: "malo", label: "Malo" },
  { value: "srednje", label: "Srednje" },
  { value: "puno", label: "Puno" },
] as const;

const RINSE_METHOD: { value: RinseMethod; label: string }[] = [
  { value: "mrezna_voda", label: "Mrežna voda" },
  { value: "djelomicno_ispiranje", label: "Djelomično" },
  { value: "potpuno_ispiranje", label: "Potpuno" },
];


const RAZLOZI: { value: RazlogCiklusa; label: string; helper?: string }[] = [
  { value: "prvi_ciklus", label: "Prvi ciklus" },
  { 
    value: "otopina_iscrpljena", 
    label: "Otopina iscrpljena",
    helper: "Prethodna kemija više nema dovoljno reakcijskog kapaciteta."
  },
  { 
    value: "nadopuna_vise_nije_ucinkovita", 
    label: "Nadopuna nije učinkovita",
    helper: "Dodavanje kemije više ne daje značajno poboljšanje reakcije."
  },
  { 
    value: "protok_nije_poboljsan", 
    label: "Protok i dalje slab",
    helper: "Moguća jaka blokada ili tvrdokorni kamenac."
  },
  { 
    value: "previse_taloga", 
    label: "Puno kamenca / taloga",
    helper: "Sustav sadrži veliku količinu naslaga koje zahtijevaju novo punjenje."
  },
  { 
    value: "servisna_odluka", 
    label: "Servisna odluka",
    helper: "Tehničar je procijenio da je potreban novi ciklus."
  },
];

/** Vraća helper tekst za odabrani razlog */
function getReasonHelper(reason: RazlogCiklusa): string | null {
  const found = RAZLOZI.find(r => r.value === reason);
  return found?.helper ?? null;
}

// ─── Storage keys for preferences ─────────────────────────────────────────────
const STORAGE_KEY_DRAFT = "hvac_prep_draft";

// ─── Helper: get smart recommendation based on previous cycle ─────────────────
function getSmartRecommendation(previousCycle?: PreviousCycleContext): string | null {
  if (!previousCycle) return null;
  
  if (previousCycle.reason === "otopina_iscrpljena") {
    return "Preporučeno novo punjenje ili jača koncentracija.";
  }
  if (previousCycle.reason === "protok_nije_poboljsan") {
    return "Moguća jaka blokada ili potreba za dodatnim ciklusom.";
  }
  if (previousCycle.reason === "nadopuna_vise_nije_ucinkovita") {
    return "Nadopune više ne pomažu — potrebno potpuno novo punjenje.";
  }
  if (previousCycle.status === "prekinut") {
    return "Prethodni ciklus je prekinut — provjerite stanje sustava.";
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NoviCiklusPrep({ 
  cycleNumber, 
  isFirst, 
  previousCycle, 
  previousCycleNotClosed,
  onClosePreviousCycle,
  onContinue, 
  onCancel 
}: Props) {
  // Card 1: Zatvaranje prethodnog
  const [cycleStatus, setCycleStatus] = useState<"zavrsen" | "prekinut">(() => {
    if (previousCycle?.status === "aktivan") return "zavrsen";
    return previousCycle?.status || "zavrsen";
  });
  const [drainAppearance, setDrainAppearance] = useState<DrainAppearance>("bistra");
  const [drainSediment, setDrainSediment] = useState<"nema" | "malo" | "srednje" | "puno">("nema");
  const [drainQuantityL, setDrainQuantityL] = useState("");
  
  // Card 2: Ispiranje — obavezno potvrditi (DA ili NE, ali MORA biti odabrano)
  const [rinsed, setRinsed] = useState<boolean | null>(null); // null = nije odabrano
  const [rinseMethod, setRinseMethod] = useState<RinseMethod>("mrezna_voda");
  const [rinsePhAfter, setRinsePhAfter] = useState("");
  const [rinseTds, setRinseTds] = useState("");
  
  // Card 3: Novi ciklus
  const [cycleName, setCycleName] = useState("");
  const [reason, setReason] = useState<RazlogCiklusa>(isFirst ? "prvi_ciklus" : "otopina_iscrpljena");

  // Jedna zajednička napomena
  const [napomena, setNapomena] = useState("");

  const [touched, setTouched] = useState(false);

  // ─── Auto-save draft ────────────────────────────────────────────────────────
  const saveDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const draft = {
      cycleStatus, drainAppearance, drainSediment, drainQuantityL,
      rinsed: rinsed ?? null, rinseMethod, rinsePhAfter, rinseTds,
      cycleName, reason, napomena,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(draft));
  }, [cycleStatus, drainAppearance, drainSediment, drainQuantityL, rinsed, rinseMethod, rinsePhAfter, rinseTds, cycleName, reason, napomena]);

  // Restore draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        // Restore only if draft is recent (within 1 hour)
        const savedTime = new Date(draft.savedAt).getTime();
        if (Date.now() - savedTime < 60 * 60 * 1000) {
          setCycleStatus(draft.cycleStatus || "zavrsen");
          setDrainAppearance(draft.drainAppearance || "bistra");
          setDrainSediment(draft.drainSediment || "nema");
          setDrainQuantityL(draft.drainQuantityL || "");
          setRinsed(draft.rinsed ?? null);
          setRinseMethod(draft.rinseMethod || "mrezna_voda");
          setRinsePhAfter(draft.rinsePhAfter || "");
          setRinseTds(draft.rinseTds || "");
          setCycleName(draft.cycleName || "");
          setReason(draft.reason || (isFirst ? "prvi_ciklus" : "otopina_iscrpljena"));
          setNapomena(draft.napomena || "");
        } else {
          localStorage.removeItem(STORAGE_KEY_DRAFT);
        }
      } catch { /* ignore */ }
    }
  }, [isFirst]);

  // Auto-save on any change
  useEffect(() => {
    const timeout = setTimeout(saveDraft, 500);
    return () => clearTimeout(timeout);
  }, [saveDraft]);

  // Pametna preporuka
  const smartRecommendation = getSmartRecommendation(previousCycle);

  // ─── VALIDACIJE ─────────────────────────────────────────────────────────────

  // Helper: parse numeric value
  const parseNum = (val: string) => {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const rinsePhValue = parseNum(rinsePhAfter);
  const rinsePhError = rinsePhValue !== null && (rinsePhValue < 0 || rinsePhValue > 14);

  // pH upozorenje - ako pH nakon ispiranja jako odstupa od neutralnog
  const EXPECTED_MREZNA_PH_MIN = 6.5;
  const EXPECTED_MREZNA_PH_MAX = 8.5;
  const rinsePhWarning = rinsed === true && rinsePhValue !== null && 
    (rinsePhValue < EXPECTED_MREZNA_PH_MIN || rinsePhValue > EXPECTED_MREZNA_PH_MAX);

  const hasReason = !!reason;
  // Za ne-prvi ciklus: ispiranje mora biti POTVRĐENO (DA ili NE, ali ne null)
  const rinseConfirmed = isFirst || rinsed !== null;
  const canContinue = hasReason && !rinsePhError && rinseConfirmed;

  // Skupljene poruke upozorenja
  const warnings: string[] = [];
  if (rinsePhWarning) warnings.push("pH izlazne vode još odstupa od ulazne vode. Mogući ostaci kemije u sustavu.");

  const handleContinue = () => {
    setTouched(true);
    if (!canContinue) return;
    
    const now = new Date().toISOString();
    
    // Clear draft after successful submission
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    }
    
    onContinue({
      // Card 1
      previousCycleStatus: cycleStatus,
      drainAppearance,
      drainSediment,
      drainQuantityL,
      drainTimestamp: now,
      // Card 2
      rinsed: rinsed ?? false,
      rinseMethod: rinsed ? rinseMethod : "nije_ispirano",
      rinsePhAfter,
      rinseTds,
      rinseTimestamp: rinsed ? now : "",
      // Card 3
      cycleName,
      reason,
      napomena,
      cycleTimestamp: now,
    });
  };

  // Workflow progress: isFirst = 1 kartica (samo razlog), inace = 1 (drain) + 1 (ispiranje) + 1 (razlog)
  const steps = isFirst ? 1 : 3;
  const completedSteps = isFirst
    ? 1
    : 1 + (rinsed !== null ? 1 : 0) + 1;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="shrink-0 bg-primary text-primary-foreground px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all"
            aria-label="Odustani"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Novi ciklus #{cycleNumber}</h1>
            <p className="text-sm text-primary-foreground/70 mt-0.5">Priprema za punjenje</p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full transition-all duration-300"
              style={{ width: `${(completedSteps / steps) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-primary-foreground/80">
            {completedSteps}/{steps}
          </span>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PRETHODNI CIKLUS SUMMARY - kompaktan info banner */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isFirst && previousCycle && (
        <div className="shrink-0 bg-muted/50 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Prethodni ciklus:</span>
              {previousCycle.endPh && (
                <span className="ml-3">pH: <span className="font-mono font-semibold text-foreground">{previousCycle.endPh.toFixed(1)}</span></span>
              )}
              {previousCycle.endFlow && (
                <span className="ml-3">Protok: <span className="font-mono font-semibold text-foreground">{previousCycle.endFlow.toFixed(1)}</span></span>
              )}
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
              previousCycle.status === "zavrsen" 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                : previousCycle.status === "aktivan"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}>
              {previousCycle.status === "zavrsen" ? "Završen" : previousCycle.status === "aktivan" ? "Aktivan" : "Prekinut"}
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* UPOZORENJE - Prethodni ciklus nije zatvoren */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {previousCycleNotClosed && !isFirst && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">
                Prethodni ciklus nije zatvoren
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                Zatvorite ga prije pokretanja novog ciklusa ili nastavite kao servisna odluka.
              </p>
              <div className="flex gap-2">
                {onClosePreviousCycle && (
                  <button
                    type="button"
                    onClick={onClosePreviousCycle}
                    className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
                  >
                    Zatvori prethodni ciklus
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReason("servisna_odluka")}
                  className="px-3 py-2 bg-white dark:bg-background border border-amber-500/50 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                >
                  Nastavi kao servisna odluka
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PAMETNA PREPORUKA - prikazuje se ako je relevantna */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {smartRecommendation && !previousCycleNotClosed && (
        <div className="shrink-0 bg-blue-500/10 border-b border-blue-500/20 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {smartRecommendation}
            </p>
          </div>
        </div>
      )}

      {/* Cards - vertikalni scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-4">
          
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* CARD 1: Zatvaranje prethodnog ciklusa */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {!isFirst && (
            <WorkflowCard
              step={1}
              title="Zatvaranje prethodnog ciklusa"
              completed={true}
            >
              {/* Info tekst */}
              <p className="text-sm text-muted-foreground mb-4">
                Zabilježite stanje prethodne otopine prije pokretanja novog ciklusa.
              </p>

              {/* 1. Status ciklusa - segmented control */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Status ciklusa
                </label>
                <div className="grid grid-cols-2 gap-0 p-1 bg-muted/50 rounded-xl">
                  {CYCLE_STATUS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setCycleStatus(s.value)}
                      className={`py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                        cycleStatus === s.value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Izgled otopine - large selectable chips */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Izgled otopine
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DRAIN_APPEARANCE.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setDrainAppearance(o.value)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all min-h-[56px] ${
                        drainAppearance === o.value
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full shrink-0 ${o.color}`} />
                      <span className={`text-sm font-medium ${
                        drainAppearance === o.value ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {o.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Talog nakon ispuštanja - segmented buttons */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Talog nakon ispuštanja
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DRAIN_SEDIMENT.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setDrainSediment(s.value)}
                      className={`py-3 px-2 rounded-xl text-sm font-medium transition-all min-h-[48px] ${
                        drainSediment === s.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/70 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Količina ispuštene otopine - kompaktni input */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Količina otopine (neobavezno)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={drainQuantityL}
                    onChange={(e) => setDrainQuantityL(e.target.value)}
                    placeholder="0"
                    className="w-full h-12 border border-input rounded-xl px-4 pr-12 text-base bg-background text-foreground"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    L
                  </span>
                </div>
              </div>
            </WorkflowCard>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* CARD 2: Ispiranje sustava — OBAVEZNO EVIDENTIRATI */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {!isFirst && (
            <WorkflowCard
              step={2}
              title="Ispiranje sustava"
              completed={rinsed === true}
              error={touched && rinsed === null}
            >
              {/* Info tekst */}
              <p className="text-sm text-muted-foreground mb-1">
                Ispiranje uklanja ostatke prethodne kemije i priprema sustav za novu reakciju.
              </p>
              <p className="text-xs font-semibold text-foreground/70 mb-4">
                Obavezno evidentirati — novi ciklus ne smije krenuti bez potvrde o ispiranju.
              </p>

              {/* 1. Status ispiranja - veliki segmented control */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Sustav ispran prije novog ciklusa <span className="text-destructive">*</span>
                </label>
                <div className={`grid grid-cols-2 gap-0 p-1 rounded-xl ${
                  touched && rinsed === null
                    ? "bg-destructive/10 border border-destructive/40"
                    : "bg-muted/50"
                }`}>
                  <button
                    type="button"
                    onClick={() => setRinsed(true)}
                    className={`py-4 px-4 rounded-lg text-base font-bold transition-all ${
                      rinsed === true
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    DA
                  </button>
                  <button
                    type="button"
                    onClick={() => setRinsed(false)}
                    className={`py-4 px-4 rounded-lg text-base font-bold transition-all ${
                      rinsed === false
                        ? "bg-amber-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    NE
                  </button>
                </div>
                {touched && rinsed === null && (
                  <p className="text-xs text-destructive mt-1.5 font-medium">
                    Obavezno potvrditi status ispiranja prije nastavka.
                  </p>
                )}
              </div>

              {/* Conditional: NE — upozorenje */}
              {rinsed === false && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-3">
                  <div className="flex items-start gap-2.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0 mt-0.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                      Sustav nije ispran — nova otopina će se miješati s ostacima prethodne kemije. Evidentirano kao servisna bilješka.
                    </p>
                  </div>
                </div>
              )}

              {/* Conditional: DA - prikaži dodatna polja */}
              {rinsed === true && (
                <>
                  {/* A) Način ispiranja - selectable chips */}
                  <div className="mb-5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Način ispiranja
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {RINSE_METHOD.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setRinseMethod(m.value)}
                          className={`py-3 px-2 rounded-xl text-sm font-medium transition-all min-h-[48px] ${
                            rinseMethod === m.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/70 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* B) pH nakon ispiranja */}
                  <div className="mb-5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                      pH nakon ispiranja
                    </label>
                    <p className="text-xs text-muted-foreground/70 mb-2">
                      Usporediti s pH mrežne/ulazne vode (6.5–8.5).
                    </p>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="14"
                      value={rinsePhAfter}
                      onChange={(e) => setRinsePhAfter(e.target.value)}
                      placeholder="npr. 7.2"
                      className={`w-full h-12 border rounded-xl px-4 text-base bg-background text-foreground ${
                        rinsePhError 
                          ? "border-destructive" 
                          : rinsePhWarning 
                            ? "border-amber-500" 
                            : "border-input"
                      }`}
                    />
                    {rinsePhError && (
                      <p className="text-sm text-destructive mt-2 font-medium">
                        pH mora biti između 0 i 14.
                      </p>
                    )}
                    {rinsePhWarning && !rinsePhError && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
                        pH izlazne vode još odstupa od ulazne vode. Mogući ostaci kemije u sustavu.
                      </p>
                    )}
                  </div>

                  {/* C) TDS / provodljivost - neobavezno, kompaktno */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      TDS / Provodljivost <span className="font-normal opacity-60">(neobavezno)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={rinseTds}
                        onChange={(e) => setRinseTds(e.target.value)}
                        placeholder="0"
                        className="w-full h-12 border border-input rounded-xl px-4 pr-16 text-base bg-background text-foreground"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        ppm
                      </span>
                    </div>
                  </div>
                </>
              )}
            </WorkflowCard>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* CARD 3: Pokretanje novog ciklusa */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <WorkflowCard
            step={isFirst ? 1 : 3}
            title="Pokretanje novog ciklusa"
            completed
          >
            {/* Info tekst */}
            <p className="text-sm text-muted-foreground mb-5">
              Novi ciklus predstavlja novo kemijsko punjenje i novu reakciju sustava.
            </p>

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* Automatski broj ciklusa - prominentan prikaz */}
            {/* ──���──────────────────────────────────────────────────────────────── */}
            <div className="mb-5 p-4 bg-primary/10 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xl font-black text-primary-foreground">{cycleNumber}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Novi ciklus
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    Ciklus #{cycleNumber}
                  </p>
                </div>
              </div>
            </div>

            {/* ─────────────────────────────────────��───────────────────────────── */}
            {/* Naziv ciklusa (opcionalno) */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Naziv ciklusa <span className="font-normal opacity-60">(neobavezno)</span>
              </label>
              <input
                type="text"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="npr. Izmjenjivač, Spiralni dio, Sekundarni krug..."
                className="w-full h-12 border border-input rounded-xl px-4 text-base bg-background text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* Razlog pokretanja - GLAVNO POLJE */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                Razlog pokretanja novog ciklusa
              </label>
              <div className="grid grid-cols-2 gap-2">
                {RAZLOZI.filter(r => isFirst ? r.value === "prvi_ciklus" : r.value !== "prvi_ciklus").map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all min-h-[72px] text-left ${
                      reason === r.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        reason === r.value ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {reason === r.value && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm font-semibold leading-tight ${
                        reason === r.value ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {r.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Conditional helper tekst */}
              {getReasonHelper(reason) && (
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {getReasonHelper(reason)}
                  </p>
                </div>
              )}
            </div>

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* Servisna napomena */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Servisna napomena <span className="font-normal opacity-60">(neobavezno)</span>
              </label>
              <textarea
                value={napomena}
                onChange={(e) => setNapomena(e.target.value)}
                placeholder="Bilješke o stanju sustava, posebne okolnosti..."
                rows={3}
                className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background resize-none focus:border-primary focus:ring-0 transition-colors"
              />
            </div>
          </WorkflowCard>

          {/* Spacer za sticky footer */}
          <div className="h-4" />
        </div>
      </div>

      {/* Sticky Footer */}
      <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {/* Obavezna polja hint */}
        {!canContinue && touched && (
          <p className="text-xs text-destructive text-center mb-2 font-medium">
            {!rinseConfirmed
              ? "Obavezno potvrditi status ispiranja"
              : !hasReason
              ? "Odaberite razlog pokretanja novog ciklusa"
              : "Ispravite greške prije nastavka"}
          </p>
        )}
        
        {/* Warnings banner */}
        {warnings.length > 0 && canContinue && (
          <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
              {warnings[0]}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-14 border-2 border-border text-foreground rounded-xl font-semibold text-base hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            Odustani
          </button>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className={`flex-[2] h-14 rounded-xl font-bold text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
              canContinue
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            Nastavi na punjenje
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── WorkflowCard Component ───────────────────────────────────────────────────

function WorkflowCard({
  step,
  title,
  description,
  completed,
  optional,
  error,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  completed?: boolean;
  optional?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-5 transition-all ${
        error
          ? "border-destructive bg-destructive/5"
          : completed
          ? "border-emerald-500/50 bg-card"
          : "border-border bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            error
              ? "bg-destructive text-white"
              : completed
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {completed && !error ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            step
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{title}</h3>
            {optional && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Opcionalno
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      
      {/* Content */}
      {children}
    </div>
  );
}
