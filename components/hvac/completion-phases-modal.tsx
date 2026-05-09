"use client";

import { useState, useEffect } from "react";
import { DRAFT_KEYS, readDraft, writeDraft, clearDraft } from "@/lib/draft-state";
import type {
  IspiranjeData,
  NeutralizacijaData,
  ZavrsniPhCheck,
  FinalPhStatus,
  IzgledIzlazneVode,
  JedinicaKemikalije,
  DrainSediment,
  SystemCategory,
} from "@/lib/types";
import {
  IZGLED_IZLAZNE_VODE_LABELS,
  DRAIN_SEDIMENT_LABELS,
} from "@/lib/types";
import { evaluateFinalPh, evaluateRinsePh } from "@/lib/preporuka";
import type { RinsePhStatus } from "@/lib/types";

// ─── Helpers ───────────────────────────────────────────────────────────────────

import { genId, nowISO } from "@/lib/utils";

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1 border-b border-border pb-2">
      {label}
    </p>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all";
const selectCls =
  "w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all";

// ─── ISPIRANJE MODAL ──────────────────────────────────────────────────────────

const RINSE_PH_STATUS_STYLES: Record<RinsePhStatus, { bg: string; border: string; text: string; label: string }> = {
  prihvatljivo:        { bg: "bg-emerald-500/8",  border: "border-emerald-500/30",  text: "text-emerald-800 dark:text-emerald-200",  label: "Ispiranje prihvatljivo" },
  provjeriti:          { bg: "bg-amber-400/8",    border: "border-amber-400/30",    text: "text-amber-800   dark:text-amber-200",    label: "Provjeriti ispiranje" },
  nastaviti_ispiranje: { bg: "bg-rose-500/8",     border: "border-rose-500/30",     text: "text-rose-800    dark:text-rose-200",     label: "Nastaviti ispiranje / razmotriti neutralizaciju" },
};

interface IspiranjeFazaProps {
  onSave: (data: IspiranjeData) => void;
  onClose: () => void;
  sessionId?: string;
  systemCategory?: SystemCategory;
}

export function IspiranjeFazaModal({ onSave, onClose, systemCategory = "technical_water" }: IspiranjeFazaProps) {
  const [solutionDrained, setSolutionDrained] = useState(false);
  const [drainDuration, setDrainDuration] = useState("");
  const [systemRinsed, setSystemRinsed] = useState(false);
  const [rinsePhInlet, setRinsePhInlet] = useState("");
  const [rinsePhOutlet, setRinsePhOutlet] = useState("");
  const [rinseAppearance, setRinseAppearance] = useState<IzgledIzlazneVode | "">("");
  const [rinseSediment, setRinseSediment] = useState<DrainSediment | "">("");
  const [note, setNote] = useState("");

  const rinsePhInletVal = rinsePhInlet ? parseFloat(rinsePhInlet) : undefined;
  const rinsePhOutletVal = rinsePhOutlet ? parseFloat(rinsePhOutlet) : undefined;

  const rinseEval = systemRinsed && rinsePhOutletVal !== undefined && !isNaN(rinsePhOutletVal)
    ? evaluateRinsePh({ rinsePhInlet: rinsePhInletVal, rinsePhOutlet: rinsePhOutletVal, systemCategory })
    : null;

  const canSave = systemRinsed;

  function handleSave() {
    if (!canSave) return;
    const _now = nowISO();
    const data: IspiranjeData = {
      id: genId("rinse"),
      completedAt: _now,
      createdAt: _now,
      updatedAt: _now,
      solutionDrained,
      drainDurationMinutes: drainDuration ? parseFloat(drainDuration) : undefined,
      systemRinsedWithCleanWater: systemRinsed,
      rinsePhValue: rinsePhOutletVal,
      rinsePhInlet: rinsePhInletVal,
      rinsePhOutlet: rinsePhOutletVal,
      rinsePhDiff: rinseEval?.diff ?? undefined,
      rinsePhStatus: rinseEval?.status ?? undefined,
      neutralizationRequired: rinseEval?.neutralizationRequired ?? true,
      rinseWaterAppearance: rinseAppearance || undefined,
      rinseSediment: rinseSediment || undefined,
      note: note || undefined,
    };
    onSave(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-label="Faza ispiranja"
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">Faza završetka</p>
            <h2 className="text-xl font-black leading-tight tracking-tight text-foreground">Ispiranje sustava</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Ispirati sustav čistom vodom. pH nakon ispiranja određuje je li neutralizacija potrebna.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
            aria-label="Zatvori"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          <SectionHeader label="Ispuštanje otopine" />

          <label className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-colors ${solutionDrained ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
            <input
              type="checkbox"
              checked={solutionDrained}
              onChange={(e) => setSolutionDrained(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
            />
            <span className="text-sm font-medium text-foreground leading-snug">
              Otopina je ispuštena iz sustava
            </span>
          </label>

          {solutionDrained && (
            <FieldRow label="Trajanje ispuštanja (min)">
              <input
                type="number"
                min={0}
                step={1}
                value={drainDuration}
                onChange={(e) => setDrainDuration(e.target.value)}
                placeholder="npr. 10"
                className={inputCls}
              />
            </FieldRow>
          )}

          <SectionHeader label="Ispiranje čistom vodom" />

          <label className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-colors ${systemRinsed ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
            <input
              type="checkbox"
              checked={systemRinsed}
              onChange={(e) => setSystemRinsed(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
            />
            <span className="text-sm font-medium text-foreground leading-snug">
              Sustav je ispran čistom vodom
            </span>
          </label>

          {systemRinsed && (
            <>
              <SectionHeader label="Kontrola pH nakon ispiranja" />

              <FieldRow label="pH ulazne / mrežne vode">
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.1}
                  value={rinsePhInlet}
                  onChange={(e) => setRinsePhInlet(e.target.value)}
                  placeholder="npr. 7.5"
                  className={inputCls}
                />
              </FieldRow>

              <FieldRow label="pH izlazne vode nakon ispiranja *">
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.1}
                  value={rinsePhOutlet}
                  onChange={(e) => setRinsePhOutlet(e.target.value)}
                  placeholder="npr. 7.2"
                  className={inputCls}
                />
              </FieldRow>

              {/* Live evaluation card */}
              {rinseEval && (
                <div className={`rounded-2xl border-2 px-4 py-4 flex flex-col gap-2 ${RINSE_PH_STATUS_STYLES[rinseEval.status].bg} ${RINSE_PH_STATUS_STYLES[rinseEval.status].border}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-base font-black ${RINSE_PH_STATUS_STYLES[rinseEval.status].text}`}>
                      {RINSE_PH_STATUS_STYLES[rinseEval.status].label}
                    </p>
                    {rinseEval.diff !== null && (
                      <span className={`text-sm font-mono font-bold tabular-nums ${RINSE_PH_STATUS_STYLES[rinseEval.status].text}`}>
                        Δ {rinseEval.diff.toFixed(2)} pH
                      </span>
                    )}
                  </div>
                  <p className={`text-sm leading-relaxed ${RINSE_PH_STATUS_STYLES[rinseEval.status].text} opacity-80`}>
                    {rinseEval.statusDescription}
                  </p>
                  <div className={`flex items-center gap-2 mt-1 px-3 py-2 rounded-xl bg-background/40 border border-current/10 ${RINSE_PH_STATUS_STYLES[rinseEval.status].text}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rinseEval.neutralizationRequired
                        ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                        : <><polyline points="20 6 9 17 4 12"/></>
                      }
                    </svg>
                    <span className="text-sm font-bold">
                      Neutralizacija: {rinseEval.neutralizationRequired ? "preporučena / potrebna" : "nije potrebna"}
                    </span>
                  </div>
                </div>
              )}

              <FieldRow label="Izgled izlazne vode">
                <select
                  value={rinseAppearance}
                  onChange={(e) => setRinseAppearance(e.target.value as IzgledIzlazneVode | "")}
                  className={selectCls}
                >
                  <option value="">— odaberi —</option>
                  {(Object.entries(IZGLED_IZLAZNE_VODE_LABELS) as [IzgledIzlazneVode, string][]).map(
                    ([k, v]) => <option key={k} value={k}>{v}</option>
                  )}
                </select>
              </FieldRow>

              <FieldRow label="Talog / zamućenje">
                <select
                  value={rinseSediment}
                  onChange={(e) => setRinseSediment(e.target.value as DrainSediment | "")}
                  className={selectCls}
                >
                  <option value="">— odaberi —</option>
                  {(Object.entries(DRAIN_SEDIMENT_LABELS) as [DrainSediment, string][]).map(
                    ([k, v]) => <option key={k} value={k}>{v}</option>
                  )}
                </select>
              </FieldRow>
            </>
          )}

          <FieldRow label="Napomena">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Slobodna napomena..."
              className={`${inputCls} resize-none`}
            />
          </FieldRow>

          {!canSave && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-amber-400/8 px-4 py-3.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Potvrdite da je sustav ispran čistom vodom za nastavak.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2.5 p-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-2xl bg-primary text-primary-foreground font-bold text-base py-4 transition-all disabled:opacity-40 active:scale-[0.98] shadow-sm"
            style={{ minHeight: 56 }}
          >
            Spremi ispiranje
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl border border-border text-muted-foreground font-semibold text-sm py-3.5 hover:bg-muted/50 active:scale-[0.98] transition-all"
            style={{ minHeight: 48 }}
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NEUTRALIZACIJA MODAL ─────────────────────────────────────────────────────

interface NeutralizacijaFazaProps {
  onSave: (data: NeutralizacijaData) => void;
  onClose: () => void;
}

const UNIT_OPTIONS: { value: JedinicaKemikalije; label: string }[] = [
  { value: "L", label: "L" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
];

export function NeutralizacijaFazaModal({ onSave, onClose }: NeutralizacijaFazaProps) {
  const [neutralizerName, setNeutralizerName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<JedinicaKemikalije>("L");
  const [circulationMinutes, setCirculationMinutes] = useState("");
  const [phAfter, setPhAfter] = useState("");
  const [note, setNote] = useState("");

  const canSave = neutralizerName.trim().length > 0 && parseFloat(amount) > 0;

  function handleSave() {
    if (!canSave) return;
    const _now = nowISO();
    const data: NeutralizacijaData = {
      id: genId("neut"),
      completedAt: _now,
      createdAt: _now,
      updatedAt: _now,
      neutralizerProductName: neutralizerName.trim(),
      neutralizerAmount: parseFloat(amount),
      neutralizerUnit: unit,
      circulationMinutes: circulationMinutes ? parseFloat(circulationMinutes) : undefined,
      phAfterNeutralization: phAfter ? parseFloat(phAfter) : undefined,
      note: note || undefined,
    };
    onSave(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-label="Neutralizacija"
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">Faza završetka</p>
            <h2 className="text-xl font-black leading-tight tracking-tight text-foreground">Neutralizacija</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Neutralizacija je obavezna faza prije završetka posla.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
            aria-label="Zatvori"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <SectionHeader label="Neutralizator" />

          <FieldRow label="Naziv neutralizatora *">
            <input
              type="text"
              value={neutralizerName}
              onChange={(e) => setNeutralizerName(e.target.value)}
              placeholder="npr. Fernox Neutraliser F7"
              className={inputCls}
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Količina *">
              <input
                type="number"
                min={0}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className={inputCls}
              />
            </FieldRow>
            <FieldRow label="Jedinica">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as JedinicaKemikalije)}
                className={selectCls}
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FieldRow>
          </div>

          <SectionHeader label="Cirkulacija" />

          <FieldRow label="Trajanje cirkulacije neutralizatora (min)">
            <input
              type="number"
              min={0}
              step={1}
              value={circulationMinutes}
              onChange={(e) => setCirculationMinutes(e.target.value)}
              placeholder="npr. 15"
              className={inputCls}
            />
          </FieldRow>

          <SectionHeader label="Provjera pH" />

          <FieldRow label="pH nakon neutralizacije">
            <input
              type="number"
              min={0}
              max={14}
              step={0.1}
              value={phAfter}
              onChange={(e) => setPhAfter(e.target.value)}
              placeholder="npr. 7.0"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Napomena">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Slobodna napomena..."
              className={`${inputCls} resize-none`}
            />
          </FieldRow>

          {!canSave && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-amber-400/8 px-4 py-3.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Unesite naziv neutralizatora i količinu za nastavak.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2.5 p-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-2xl bg-primary text-primary-foreground font-bold text-base py-4 transition-all disabled:opacity-40 active:scale-[0.98] shadow-sm"
            style={{ minHeight: 56 }}
          >
            Spremi neutralizaciju
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl border border-border text-muted-foreground font-semibold text-sm py-3.5 hover:bg-muted/50 active:scale-[0.98] transition-all"
            style={{ minHeight: 48 }}
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ZAVRŠNI PH MODAL ─────────────────────────────────────────────────────────

interface ZavrsniPhCheckProps {
  sessionId?: string;
  systemCategory: SystemCategory;
  onSave: (data: ZavrsniPhCheck) => void;
  onClose: () => void;
  /** Automatski popunjen završni protok iz zadnjeg LIVE mjerenja */
  autoFinalFlowLMin?: number;
}

const FINAL_PH_STATUS_COLORS: Record<FinalPhStatus, { bg: string; text: string; border: string }> = {
  prihvatljiv:       { bg: "bg-emerald-500/8", text: "text-emerald-800 dark:text-emerald-200", border: "border-2 border-emerald-500/30" },
  nestabilan:        { bg: "bg-rose-500/8",    text: "text-rose-800    dark:text-rose-200",    border: "border-2 border-rose-500/40" },
  izvan_raspona:     { bg: "bg-rose-500/8",    text: "text-rose-800    dark:text-rose-200",    border: "border-2 border-rose-500/40" },
  potrebna_provjera: { bg: "bg-amber-400/8",   text: "text-amber-800   dark:text-amber-200",   border: "border-2 border-amber-400/30" },
};

const FINAL_PH_STATUS_LABELS: Record<FinalPhStatus, string> = {
  prihvatljiv: "Završni pH prihvatljiv",
  nestabilan: "Završni pH nestabilan",
  izvan_raspona: "Završni pH izvan raspona",
  potrebna_provjera: "Potrebna potvrda servisera",
};

export function ZavrsniPhCheckModal({ sessionId, systemCategory, onSave, onClose, autoFinalFlowLMin }: ZavrsniPhCheckProps) {
  const draftKey = DRAFT_KEYS.zavrsniPh(sessionId ?? "global");
  const d = readDraft<{
    inletPh: string; ph1: string; ph2: string; ph3: string;
    minutesBetween: string; finalFlow: string; finalAppearance: string; note: string;
  }>(draftKey);

  const [inletPh, setInletPh] = useState(d?.inletPh ?? "");
  const [ph1, setPh1] = useState(d?.ph1 ?? "");
  const [ph2, setPh2] = useState(d?.ph2 ?? "");
  const [ph3, setPh3] = useState(d?.ph3 ?? "");
  const [minutesBetween, setMinutesBetween] = useState(d?.minutesBetween ?? "");
  // Pre-popuni iz auto vrijednosti ako nema drafta
  const [finalFlow, setFinalFlow] = useState(
    d?.finalFlow ?? (autoFinalFlowLMin != null ? autoFinalFlowLMin.toFixed(1) : "")
  );
  const [finalAppearance, setFinalAppearance] = useState<IzgledIzlazneVode | "">(d?.finalAppearance as IzgledIzlazneVode | "" ?? "");
  const [technicianConfirmed, setTechnicianConfirmed] = useState(false);
  const [roughEstimateEnabled, setRoughEstimateEnabled] = useState(false);
  const [note, setNote] = useState(d?.note ?? "");

  useEffect(() => {
    writeDraft(draftKey, { inletPh, ph1, ph2, ph3, minutesBetween, finalFlow, finalAppearance, note });
  }, [draftKey, inletPh, ph1, ph2, ph3, minutesBetween, finalFlow, finalAppearance, note]);

  const ph1Val = parseFloat(ph1);
  const ph2Val = ph2 ? parseFloat(ph2) : undefined;
  const ph3Val = ph3 ? parseFloat(ph3) : undefined;
  const inletPhVal = inletPh ? parseFloat(inletPh) : undefined;

  const phValid = !isNaN(ph1Val);

  const evaluatedStatus: FinalPhStatus | null = phValid
    ? evaluateFinalPh({ ph1: ph1Val, ph2: ph2Val, ph3: ph3Val, inletPh: inletPhVal, systemCategory })
    : null;

  const statusColors = evaluatedStatus ? FINAL_PH_STATUS_COLORS[evaluatedStatus] : null;

  const unstable = evaluatedStatus === "nestabilan" || evaluatedStatus === "izvan_raspona";
  const canSave = phValid && technicianConfirmed;

  function handleSave() {
    if (!canSave || !evaluatedStatus) return;
    const _now = nowISO();
    const data: ZavrsniPhCheck = {
      id: genId("finalph"),
      completedAt: _now,
      createdAt: _now,
      updatedAt: _now,
      inletPhValue: inletPhVal,
      ph1: ph1Val,
      ph2: ph2Val,
      ph3: ph3Val,
      minutesBetweenMeasurements: minutesBetween ? parseFloat(minutesBetween) : undefined,
      finalFlowLMin: finalFlow ? parseFloat(finalFlow) : undefined,
      finalWaterAppearance: finalAppearance || undefined,
      status: evaluatedStatus,
      technicianConfirmed,
      note: note || undefined,
    };
    clearDraft(draftKey);
    onSave(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-label="Kontrola završnog pH nakon ispiranja"
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-border shrink-0">
          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">Završetak sesije</p>
            <h2 className="text-xl font-black leading-tight tracking-tight text-foreground">Kontrola završnog pH</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Usporedba pH izlazne vode s pH mrežne vode. Kisela reakcija pripada ciklusu — ovdje se mjeri neutralnost ispiranja.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
            aria-label="Zatvori"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {systemCategory === "dhw_potable" && (
            <>
              <SectionHeader label="Referentna vrijednost" />
              <FieldRow label="pH ulazne / mrežne vode">
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.1}
                  value={inletPh}
                  onChange={(e) => setInletPh(e.target.value)}
                  placeholder="npr. 7.5"
                  className={inputCls}
                />
              </FieldRow>
            </>
          )}

          <SectionHeader label="Završna pH mjerenja" />

          <FieldRow label="Završni pH — mjerenje 1 *">
            <input
              type="number"
              min={0}
              max={14}
              step={0.1}
              value={ph1}
              onChange={(e) => setPh1(e.target.value)}
              placeholder="npr. 7.2"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Završni pH — mjerenje 2">
            <input
              type="number"
              min={0}
              max={14}
              step={0.1}
              value={ph2}
              onChange={(e) => setPh2(e.target.value)}
              placeholder="npr. 7.3"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Završni pH — mjerenje 3 (opcija)">
            <input
              type="number"
              min={0}
              max={14}
              step={0.1}
              value={ph3}
              onChange={(e) => setPh3(e.target.value)}
              placeholder="nije obvezno"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Vremenski razmak između mjerenja (min)">
            <input
              type="number"
              min={0}
              step={1}
              value={minutesBetween}
              onChange={(e) => setMinutesBetween(e.target.value)}
              placeholder="npr. 5"
              className={inputCls}
            />
          </FieldRow>

          {/* Live evaluation */}
          {evaluatedStatus && statusColors && (
            <div className={`rounded-2xl px-4 py-4 flex flex-col gap-2 ${statusColors.bg} ${statusColors.border}`}>
              <p className={`text-base font-black ${statusColors.text}`}>
                {FINAL_PH_STATUS_LABELS[evaluatedStatus]}
              </p>
              {unstable && (
                <div className={`flex items-start gap-2 text-sm font-semibold leading-relaxed ${statusColors.text}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Završni pH nije stabilan. Nastaviti ispiranje i/ili neutralizaciju.
                </div>
              )}
            </div>
          )}

          <SectionHeader label="Protok i izgled" />

          <FieldRow label="Završni protok (L/min)">
            <input
              type="number"
              min={0}
              step={0.1}
              value={finalFlow}
              onChange={(e) => setFinalFlow(e.target.value)}
              placeholder="npr. 12.5"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Izgled izlazne vode">
            <select
              value={finalAppearance}
              onChange={(e) => setFinalAppearance(e.target.value as IzgledIzlazneVode | "")}
              className={selectCls}
            >
              <option value="">— odaberi —</option>
              {(Object.entries(IZGLED_IZLAZNE_VODE_LABELS) as [IzgledIzlazneVode, string][]).map(
                ([k, v]) => <option key={k} value={k}>{v}</option>
              )}
            </select>
          </FieldRow>

          <FieldRow label="Napomena">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Slobodna napomena..."
              className={`${inputCls} resize-none`}
            />
          </FieldRow>

          {/* Rough scale estimate toggle */}
          <SectionHeader label="Procjena uklonjenog kamenca" />
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={roughEstimateEnabled}
              onChange={(e) => setRoughEstimateEnabled(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4"
            />
            <span className="text-xs text-foreground leading-snug">
              Uključi grubu procjenu uklonjenog kamenca (okvirna, nije laboratorijski dokaz)
            </span>
          </label>
          {roughEstimateEnabled && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-4 py-3.5">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Gruba procjena — ovo je okvirna procjena, ne laboratorijski dokaz.
              </p>
            </div>
          )}

          {/* Technician confirmation */}
          <SectionHeader label="Potvrda servisera" />
          <label className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-colors ${technicianConfirmed ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
            <input
              type="checkbox"
              checked={technicianConfirmed}
              onChange={(e) => setTechnicianConfirmed(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
            />
            <span className="text-sm font-semibold text-foreground leading-snug">
              Potvrđujem završni pH i rezultate ispiranja
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2.5 p-5 pt-3 border-t border-border shrink-0">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-2xl bg-primary text-primary-foreground font-bold text-base py-4 transition-all disabled:opacity-40 active:scale-[0.98] shadow-sm"
            style={{ minHeight: 56 }}
          >
            Spremi završni pH
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-2xl border border-border text-muted-foreground font-semibold text-sm py-3.5 hover:bg-muted/50 active:scale-[0.98] transition-all"
            style={{ minHeight: 48 }}
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}
