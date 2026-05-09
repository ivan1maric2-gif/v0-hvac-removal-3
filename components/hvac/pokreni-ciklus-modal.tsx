"use client";

import React, { useState, useMemo } from "react";
import type {
  Ciklus,
  RazlogCiklusa,
  JedinicaKemikalije,
  StatusCiklusa,
  DrainAppearance,
  DrainSediment,
  RinseMethod,
  CleaningMode,
} from "@/lib/types";
import { CLEANING_MODE_LABELS } from "@/lib/types";
import {
  izracunajCiklusKemiju,
  getMjerenjePH,
  getMjerenjeTimestamp,
  zadnjeMjerenjeCiklusa,
  DRAIN_APPEARANCE_LABELS,
  DRAIN_SEDIMENT_LABELS,
  RINSE_METHOD_LABELS,
} from "@/lib/types";
import type { Product } from "@/lib/product-types";
import { isMassBasedForm, allowedUnitsForForm, defaultUnitForForm } from "@/lib/product-types";
import { useProducts } from "@/lib/product-state";
import { ProductPickerSheet, SelectedProductChip } from "./product-picker";

import { genId, nowISO } from "@/lib/utils";

function nowIso() {
  return nowISO().slice(0, 16);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string): string {
  try {
    const diff = Date.now() - new Date(startIso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  } catch {
    return "—";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  subsessionId?: string;
  cycleNumber: number;
  hasActiveCycle: boolean;
  activeCycle?: Ciklus;           // the current active cycle (for summary)
  defaultWaterVolumeL?: number;
  defaultChemicalName?: string;
  /** Pre-select a product from the database by ID (e.g. passed from setup screen) */
  defaultProductId?: string;
  /** Pre-fill calculated dose in litres from setup concentration calculator */
  defaultDoseL?: number;
  /** Pre-fill concentration % from setup screen */
  defaultConcentrationPct?: number;
  /** Baseline flow rate (L/min) measured before chemicals — stored on the cycle */
  baselineFlowLMin?: number;
  /** Material from the subsession/session for product compatibility warnings */
  materialName?: string;
  /** Cleaning mode from the session — drives product filtering */
  cleaningMode?: CleaningMode;
  /** System category from the session — separates PTV/TPV from technical water */
  systemCategory?: import("@/lib/types").SystemCategory;
  onSave: (ciklus: Ciklus) => void;
  onClose: () => void;
  onOpenTopUp?: () => void;       // if user picks "Ne, ovo je nadopuna"
}

const RAZLOZI: { value: RazlogCiklusa; label: string }[] = [
  { value: "otopina_iscrpljena",          label: "Prethodna otopina iscrpljena" },
  { value: "previse_taloga",              label: "Previše taloga u otopini" },
  { value: "ph_prebrzo_raste",            label: "pH se brzo ponovno podigao nakon nadopune" },
  { value: "nadopuna_vise_nije_ucinkovita", label: "Nadopuna više nije učinkovita" },
  { value: "protok_nije_poboljsan",       label: "Protok se nije dovoljno poboljšao" },
  { value: "potrebno_jace_punjenje",      label: "Potrebno jače ili novo punjenje" },
  { value: "servisna_odluka",             label: "Servisna odluka" },
  { value: "prvi_ciklus",                 label: "Prvi ciklus" },
  { value: "drugo",                       label: "Drugo" },
];

const JEDINICE: JedinicaKemikalije[] = ["L", "ml", "kg", "g"];

const DRAIN_APPEARANCE_OPTIONS: { value: DrainAppearance; label: string }[] = [
  { value: "bistra",           label: "Bistra" },
  { value: "blago_mutna",      label: "Blago mutna" },
  { value: "mutna",            label: "Mutna" },
  { value: "jako_mutna",       label: "Jako mutna" },
  { value: "puno_taloga",      label: "Puno taloga" },
  { value: "nije_evidentirano", label: "Nije evidentirano" },
];

const DRAIN_SEDIMENT_OPTIONS: { value: DrainSediment; label: string }[] = [
  { value: "nema",    label: "Nema" },
  { value: "malo",    label: "Malo" },
  { value: "srednje", label: "Srednje" },
  { value: "puno",    label: "Puno" },
];

const RINSE_METHOD_OPTIONS: { value: RinseMethod; label: string }[] = [
  { value: "mrezna_voda",         label: "Mrežna voda" },
  { value: "djelomicno_ispiranje", label: "Djelomično ispiranje" },
  { value: "potpuno_ispiranje",   label: "Potpuno ispiranje" },
  { value: "nije_ispirano",       label: "Nije ispirano" },
];

type Step = "confirm" | "stanje" | "voda" | "sredstvo" | "pregled";

// ─── Form state ───────────────────────────────────────────────────────────────

type VizualnoStanje = "bistra" | "mutna" | "talog" | "komadi_kamenca" | "nije_provjereno";
type JedinicaProtoka = "L_min" | "sek_10L";

interface FormState {
  name: string;
  startDateTime: string;
  reason: RazlogCiklusa;
  // Drain fields
  previousSolutionDrained: boolean;
  drainConfirmedAt: string;
  drainVolumeL: string;
  drainAppearance: DrainAppearance;
  drainSediment: DrainSediment;
  drainNote: string;
  closedAsStatus: "zavrsen" | "prekinut";
  // Rinse
  rinsed: boolean;
  rinseMethod: RinseMethod;
  rinsePhAfter: string;
  rinseTdsAfter: string;
  rinseNote: string;
  // Stanje prije čišćenja (before water fill)
  initialFlowValue: string;
  initialFlowUnit: JedinicaProtoka;
  initialPhSustava: string;
  initialTempC: string;
  vizualnoStanje: VizualnoStanje;
  napomenaStanjePrije: string;
  // Water
  cleanWaterAdded: boolean;
  waterVolumeL: string;
  waterTempC: string;
  waterPh: string;
  waterTds: string;
  waterNote: string;
  // Chemical
  chemicalProductName: string;
  chemicalAmount: string;
  chemicalUnit: JedinicaKemikalije;
  chemicalConcentration: string;
  chemicalAddedAt: string;
  chemicalNote: string;
  chemicalDensityKgL: string;
}

function defaultForm(defaultWater?: number, defaultChem?: string, isFirst?: boolean): FormState {
  return {
    name: "",
    startDateTime: nowIso(),
    reason: isFirst ? "prvi_ciklus" : "otopina_iscrpljena",
    previousSolutionDrained: false,
    drainConfirmedAt: nowIso(),
    drainVolumeL: "",
    drainAppearance: "nije_evidentirano",
    drainSediment: "nema",
    drainNote: "",
    closedAsStatus: "zavrsen",
    rinsed: false,
    rinseMethod: "nije_ispirano",
    rinsePhAfter: "",
    rinseTdsAfter: "",
    rinseNote: "",
    initialFlowValue: "",
    initialFlowUnit: "L_min",
    initialPhSustava: "",
    initialTempC: "",
    vizualnoStanje: "nije_provjereno",
    napomenaStanjePrije: "",
    cleanWaterAdded: isFirst === true ? true : false,
    waterVolumeL: defaultWater ? String(defaultWater) : "",
    waterTempC: "",
    waterPh: "",
    waterTds: "",
    waterNote: "",
    chemicalProductName: defaultChem ?? "",
    chemicalAmount: "",
    chemicalUnit: "L",
    chemicalConcentration: "",
    chemicalAddedAt: nowIso(),
    chemicalNote: "",
    chemicalDensityKgL: "",
  };
}

// ─── Main component ─────────────────────────────────────���─────────────���───────

export function PokreniCiklusModal({
  sessionId,
  subsessionId,
  cycleNumber,
  hasActiveCycle,
  activeCycle,
  defaultWaterVolumeL,
  defaultChemicalName,
  defaultProductId,
  defaultDoseL,
  defaultConcentrationPct,
  baselineFlowLMin,
  materialName,
  cleaningMode,
  systemCategory,
  onSave,
  onClose,
  onOpenTopUp,
}: Props) {
  const { getProizvod } = useProducts();
  const isFirst = cycleNumber === 1;
  const [step, setStep] = useState<Step>(hasActiveCycle ? "confirm" : "stanje");

  // Pre-resolve product from defaultProductId so the picker shows it immediately
  const initialProduct = React.useMemo(
    () => (defaultProductId ? (getProizvod(defaultProductId) ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [form, setForm] = useState<FormState>(() => {
    const base = defaultForm(defaultWaterVolumeL, defaultChemicalName ?? initialProduct?.name, isFirst);
    if (defaultDoseL != null) base.chemicalAmount = String(defaultDoseL);
    if (defaultConcentrationPct != null) base.chemicalConcentration = String(defaultConcentrationPct);
    return base;
  });
  const [touched, setTouched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // ── Derived: product form / unit constraints ─────────────────────────────
  const productIsMass = selectedProduct ? isMassBasedForm(selectedProduct.form) : false;
  const availableUnits: JedinicaKemikalije[] = selectedProduct
    ? (allowedUnitsForForm(selectedProduct.form) as JedinicaKemikalije[])
    : ["L", "ml", "kg", "g"];

  // Auto-set unit when a product is selected and the current unit is incompatible
  React.useEffect(() => {
    if (!selectedProduct) return;
    const allowed = allowedUnitsForForm(selectedProduct.form);
    if (!allowed.includes(form.chemicalUnit)) {
      setForm((prev) => ({ ...prev, chemicalUnit: defaultUnitForForm(selectedProduct.form) as JedinicaKemikalije }));
    }
  }, [selectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: calculations ────────────────────────────────────────────────
  const waterL = parseFloat(form.waterVolumeL) || 0;
  const chemAmt = parseFloat(form.chemicalAmount) || 0;
  const densityKgL = parseFloat(form.chemicalDensityKgL) || undefined;

  const calcs = useMemo(
    () => izracunajCiklusKemiju(waterL, chemAmt, form.chemicalUnit, densityKgL),
    [waterL, chemAmt, form.chemicalUnit, densityKgL]
  );

  const needsDensity = (form.chemicalUnit === "kg" || form.chemicalUnit === "g") && !form.chemicalDensityKgL;

  // Initial flow: if unit is sek_10L, convert via 600 / seconds
  const initialFlowLMin: number | null = useMemo(() => {
    const v = parseFloat(form.initialFlowValue);
    if (isNaN(v) || v <= 0) return null;
    if (form.initialFlowUnit === "sek_10L") return Math.round((600 / v) * 100) / 100;
    return Math.round(v * 100) / 100;
  }, [form.initialFlowValue, form.initialFlowUnit]);

  // ── Derived: system category compatibility ───────────────────────────────
  const productIsSystemIncompatible = selectedProduct && systemCategory && systemCategory !== "unknown"
    ? (selectedProduct.applicationCategory !== "unverified" &&
       selectedProduct.applicationCategory !== "both" &&
       selectedProduct.applicationCategory !== systemCategory)
    : false;
  // Only flag as needing verification when explicitly marked unverified
  const productNeedsVerification = selectedProduct
    ? (selectedProduct.applicationCategory === "unverified" ||
       (selectedProduct as import("@/lib/product-types").Product).verificationStatus === "unverified")
    : false;
  // Warning shown ONLY for real incompatibility — verified products with no safeFor/notFor are fine
  const showSystemWarning = productIsSystemIncompatible || productNeedsVerification;
  const [systemWarningConfirmed, setSystemWarningConfirmed] = React.useState(false);

  // Reset confirmation when product changes
  React.useEffect(() => {
    setSystemWarningConfirmed(false);
  }, [selectedProduct?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ───────────────────────────────────────────────────────────
  const drainOk = isFirst
    ? form.cleanWaterAdded
    : form.previousSolutionDrained && form.cleanWaterAdded;

  const formValid =
    selectedProduct !== null &&
    form.waterVolumeL !== "" &&
    waterL > 0 &&
    form.chemicalProductName.trim() !== "" &&
    form.chemicalAmount !== "" &&
    chemAmt > 0 &&
    form.chemicalAddedAt !== "" &&
    drainOk &&
    (!productIsSystemIncompatible || systemWarningConfirmed);

  // ── Wizard step order ────────────────────────────────────────────────────
  const WIZARD_STEPS: Step[] = ["stanje", "voda", "sredstvo", "pregled"];
  const stepIndex = WIZARD_STEPS.indexOf(step as Exclude<Step, "confirm">);

  // Per-step forward validation — what must be true to advance
  // On non-first cycles, drain confirmation is required before proceeding
  const stepStanjeValid = isFirst ? true : form.previousSolutionDrained;
  const stepVodaValid = form.cleanWaterAdded && waterL > 0;
  const stepSredstvoValid =
    selectedProduct !== null &&
    form.chemicalProductName.trim() !== "" &&
    chemAmt > 0 &&
    form.chemicalAddedAt !== "" &&
    (!productIsSystemIncompatible || systemWarningConfirmed);

  function canAdvance(): boolean {
    if (step === "stanje") return stepStanjeValid;
    if (step === "voda") return stepVodaValid;
    if (step === "sredstvo") return stepSredstvoValid;
    return false;
  }

  function goNext() {
    const idx = WIZARD_STEPS.indexOf(step as Exclude<Step, "confirm">);
    if (idx < WIZARD_STEPS.length - 1) {
      setStep(WIZARD_STEPS[idx + 1]);
      setTouched(false);
    }
  }

  function goBack() {
    const idx = WIZARD_STEPS.indexOf(step as Exclude<Step, "confirm">);
    if (idx > 0) {
      setStep(WIZARD_STEPS[idx - 1]);
      setTouched(false);
    } else {
      hasActiveCycle ? setStep("confirm") : onClose();
    }
  }

  function handleNext() {
    setTouched(true);
    if (canAdvance()) goNext();
  }

  function handle(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((p) => ({ ...p, [name]: checked !== undefined ? checked : value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!formValid) return;

    const ciklus: Ciklus = {
      id: genId("cik"),
      sessionId,
      subsessionId,
      cycleNumber,
      broj: cycleNumber,
      name: form.name.trim() || undefined,
      startDateTime: form.startDateTime || nowISO(),
      timestamp_pocetka: form.startDateTime || nowISO(),
      reason: form.reason,
      // Product reference
      productId: selectedProduct?.id,
      productSnapshot: selectedProduct ? {
        id: selectedProduct.id,
        name: selectedProduct.name,
        brand: selectedProduct.brand,
        productType: selectedProduct.productType,
        productCategory: selectedProduct.productCategory,
        allowedCleaningModes: selectedProduct.allowedCleaningModes,
        form: selectedProduct.form,
        phZones: selectedProduct.phZones,
        indicatorZones: selectedProduct.indicatorZones ?? [],
        hasColorIndicator: selectedProduct.hasColorIndicator,
        colorIndicators: selectedProduct.colorIndicators,
        materialCompatibility: selectedProduct.materialCompatibility,
        densityKgL: selectedProduct.densityKgL,
        dosageMin: selectedProduct.dosageMin,
        dosageMax: selectedProduct.dosageMax,
        dosageUnit: selectedProduct.dosageUnit,
        topUpAllowed: selectedProduct.topUpAllowed,
        dosageNote: selectedProduct.dosageNote,
        sourceDocumentName: selectedProduct.sourceDocumentName,
        sourceDocumentType: selectedProduct.sourceDocumentType,
        neutralizationRequired: selectedProduct.neutralizationRequired,
        rinseRequired: selectedProduct.rinseRequired,
        hasMassBasedDosing: selectedProduct.hasMassBasedDosing,
        hasVolumeBasedDosing: selectedProduct.hasVolumeBasedDosing,
        allowedDoseUnits: selectedProduct.allowedDoseUnits,
        applicationCategory: selectedProduct.applicationCategory,
        applicationSourceDocument: selectedProduct.applicationSourceDocument,
        potableWaterWarning: selectedProduct.potableWaterWarning,
        technicalWaterWarning: selectedProduct.technicalWaterWarning,
      } : undefined,
      previousSolutionDrained: form.previousSolutionDrained,
      drainConfirmedAt: form.previousSolutionDrained ? form.drainConfirmedAt : undefined,
      drainVolumeL: form.drainVolumeL ? parseFloat(form.drainVolumeL) : undefined,
      drainAppearance: form.drainAppearance !== "nije_evidentirano" ? form.drainAppearance : "nije_evidentirano",
      drainSediment: form.drainSediment,
      drainNote: form.drainNote.trim() || undefined,
      closedAsStatus: undefined, // this is for the previous cycle
      systemRinsed: form.rinsed,
      rinsed: form.rinsed,
      rinseMethod: form.rinsed ? form.rinseMethod : undefined,
      rinsePhAfter: form.rinsePhAfter ? parseFloat(form.rinsePhAfter) : undefined,
      rinseTdsAfter: form.rinseTdsAfter.trim() || undefined,
      rinseNote: form.rinseNote.trim() || undefined,
      cleanWaterAdded: form.cleanWaterAdded,
      waterVolumeL: waterL,
      volumen_vode: waterL,
      waterTempC: form.waterTempC ? parseFloat(form.waterTempC) : undefined,
      waterPh: form.waterPh ? parseFloat(form.waterPh) : undefined,
      waterTds: form.waterTds.trim() || undefined,
      waterNote: form.waterNote.trim() || undefined,
      chemicalProductName: form.chemicalProductName.trim(),
      kemikalija: form.chemicalProductName.trim(),
      chemicalAmount: chemAmt,
      chemicalUnit: form.chemicalUnit,
      chemicalDensityKgL: densityKgL,
      chemicalVolumeL: calcs.chemicalVolumeL ?? undefined,
      kolicina_kemikalije: calcs.chemicalVolumeL ?? chemAmt,
      chemicalConcentration: form.chemicalConcentration.trim() || undefined,
      chemicalAddedAt: form.chemicalAddedAt || nowISO(),
      chemicalNote: form.chemicalNote.trim() || undefined,
      totalSolutionVolumeL: calcs.totalSolutionVolumeL ?? undefined,
      chemicalPercent: calcs.chemicalPercent ?? undefined,
      waterChemicalRatio: calcs.waterChemicalRatio ?? undefined,
      baselineFlowLMin: baselineFlowLMin ?? initialFlowLMin ?? undefined,
      initialFlowLMin: initialFlowLMin ?? undefined,
      initialPhSustava: form.initialPhSustava ? parseFloat(form.initialPhSustava) : undefined,
      initialTempCSustava: form.initialTempC ? parseFloat(form.initialTempC) : undefined,
      vizualnoStanjeVode: form.vizualnoStanje !== "nije_provjereno" ? form.vizualnoStanje : undefined,
      napomenaStanjePrije: form.napomenaStanjePrije.trim() || undefined,
      status: "ceka_pocetno_mjerenje" as StatusCiklusa,
      mjerenja: [],
      nadopune: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    onSave(ciklus);
  }

  // ─── Step 1: Confirmation ─────────────────────────────────────────────────

  if (step === "confirm") {
    const zadnjeMjer = activeCycle ? zadnjeMjerenjeCiklusa(activeCycle) : undefined;
    const zadnjiPH = zadnjeMjer ? getMjerenjePH(zadnjeMjer) : undefined;
    const zadnjiInterpretation = zadnjeMjer?.interpretation;

    return (
      <div
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end justify-center"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg bg-background rounded-t-3xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Red header bar */}
          <div className="bg-red-600 px-5 py-4 flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mt-0.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Pokreni novi ciklus?</h2>
              <p className="text-sm text-white/80 mt-1 leading-relaxed">
                Pokretanje novog ciklusa znači da je prethodna otopina ispuštena i da se kreće s
                čistom vodom i novim sredstvom.
              </p>
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4 pb-6">
            {/* Important distinction box */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">Vazna razlika:</p>
              <div className="flex flex-col gap-1 text-xs text-amber-700">
                <p><span className="font-bold">Nadopuna</span> = sredstvo se dodaje u postojecu koristenu otopinu.</p>
                <p><span className="font-bold">Novi ciklus</span> = stara otopina se ispusta i krece se s cistom vodom i novim sredstvom.</p>
              </div>
              {onOpenTopUp && (
                <p className="text-xs text-amber-600 mt-2">
                  Ako samo dodajete sredstvo u postojecu otopinu, koristite &apos;Dodaj nadopunu sredstva&apos;.
                </p>
              )}
            </div>

            {/* Previous cycle summary */}
            {activeCycle && (
              <div className="bg-muted/40 border border-border rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Pregled prethodnog ciklusa #{activeCycle.cycleNumber ?? activeCycle.broj}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <SummaryRow label="Pocetna voda" value={`${activeCycle.waterVolumeL ?? "—"} L`} />
                  <SummaryRow label="Pocetno sredstvo" value={activeCycle.chemicalProductName ?? activeCycle.kemikalija ?? "—"} />
                  <SummaryRow label="Broj mjerenja" value={String(activeCycle.mjerenja.length)} />
                  <SummaryRow label="Broj nadopuna" value={String(activeCycle.nadopune.length)} />
                  {zadnjiPH !== undefined && (
                    <SummaryRow label="Zadnji pH" value={zadnjiPH.toFixed(2)} />
                  )}
                  {zadnjeMjer?.foamLevel && (
                    <SummaryRow label="Zadnja pjena" value={zadnjeMjer.foamLevel} />
                  )}
                  {zadnjeMjer?.colorIndicator && (
                    <SummaryRow label="Zadnja boja" value={zadnjeMjer.colorIndicator} />
                  )}
                  {zadnjeMjer?.flowLMin !== undefined && (
                    <SummaryRow label="Zadnji protok" value={`${zadnjeMjer.flowLMin.toFixed(1)} L/min`} />
                  )}
                  <SummaryRow
                    label="Trajanje ciklusa"
                    value={formatDuration(activeCycle.startDateTime)}
                  />
                </div>
                {zadnjiInterpretation && (
                  <p className="text-xs text-muted-foreground italic mt-2 leading-relaxed border-t border-border pt-2">
                    {zadnjiInterpretation}
                  </p>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setStep("stanje")}
                className="w-full bg-red-600 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-red-700 active:scale-[0.98] transition-all"
              >
                Da, pokreni novi ciklus #{cycleNumber}
              </button>
              {onOpenTopUp && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenTopUp();
                  }}
                  className="w-full bg-amber-50 border border-amber-300 text-amber-800 rounded-xl py-3.5 font-semibold text-sm hover:bg-amber-100 active:scale-[0.98] transition-all"
                >
                  Ne, ovo je nadopuna
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full border border-border text-foreground rounded-xl py-3 font-medium text-sm hover:bg-muted/50 active:scale-[0.98] transition-all"
              >
                Odustani — nastavi s postojecim ciklusom
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Wizard steps ─────────────────────────────────────────────────────────

  const STEP_META: Record<Exclude<Step, "confirm">, { title: string; subtitle: string }> = {
    stanje: {
      title: "Stanje sustava",
      subtitle: "Zabilježite stanje prije čišćenja",
    },
    voda: {
      title: "Punjenje vodom",
      subtitle: "Unesite količinu čiste vode",
    },
    sredstvo: {
      title: "Kemijsko sredstvo",
      subtitle: "Odaberite sredstvo i unesite količinu",
    },
    pregled: {
      title: "Pregled i pokretanje",
      subtitle: "Provjerite podatke i pokrenite ciklus",
    },
  };

  const currentMeta = STEP_META[step as Exclude<Step, "confirm">] ?? STEP_META.stanje;

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Pokreni ciklus #${cycleNumber}`}
    >
      {/* Fixed header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border bg-background shrink-0">
        <button
          type="button"
          onClick={goBack}
          className="p-2 -ml-1.5 rounded-xl hover:bg-muted transition-colors"
          aria-label="Natrag"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest mb-0.5">
            {isFirst ? `Ciklus #${cycleNumber}` : `Ciklus #${cycleNumber} — Nova otopina`}
          </p>
          <h1 className="text-xl font-black leading-tight tracking-tight text-foreground text-balance">
            {currentMeta.title}
          </h1>
        </div>
        <span className="shrink-0 text-xs font-black text-muted-foreground/50 tabular-nums bg-muted px-2 py-1 rounded-lg">
          {stepIndex + 1}/{WIZARD_STEPS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
        />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <form
          id="ciklus-form"
          onSubmit={handleSubmit}
          className="max-w-lg mx-auto w-full px-4 py-5 flex flex-col gap-6"
        >
          {/* Step subtitle */}
          <p className="text-sm font-medium text-muted-foreground -mb-2 leading-relaxed">{currentMeta.subtitle}</p>
          {/* ════════════════════════════════════════════════════════ */}
          {/* STEP: STANJE — Identifikacija, Drain, Rinse, Stanje sustava */}
          {/* ════════════════════════════════════════════════════════ */}
          {step === "stanje" && <>

          {/* 1. Identifikacija ciklusa */}
          <CSection title="Identifikacija ciklusa">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <CField label="Ciklus br.">
                  <input
                    type="text"
                    value={`#${cycleNumber}`}
                    readOnly
                    className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-muted text-muted-foreground cursor-not-allowed"
                  />
                </CField>
              </div>
              <div className="col-span-2">
                <CField label="Naziv ciklusa (neobavezno)">
                  <input
                    name="name"
                    value={form.name}
                    onChange={handle}
                    placeholder="npr. Drugi prolaz zone B"
                    className={inputCls}
                  />
                </CField>
              </div>
            </div>
            <CField label="Datum i vrijeme pocetka">
              <input
                name="startDateTime"
                type="datetime-local"
                value={form.startDateTime}
                onChange={handle}
                className={inputCls}
              />
            </CField>
            <CField label="Razlog pokretanja novog ciklusa *">
              <select name="reason" value={form.reason} onChange={handle} className={inputCls}>
                {RAZLOZI.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </CField>
          </CSection>

          {/* Zatvaranje prethodnog ciklusa */}
          {!isFirst && (
            <CSection title="Zatvaranje prethodnog ciklusa">
              {/* Block if not drained */}
              {!form.previousSolutionDrained && touched && (
                <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <svg className="shrink-0 mt-0.5 text-red-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs text-red-700">
                    Nije moguce pokrenuti novi ciklus dok prethodna otopina nije ispustena.
                  </p>
                </div>
              )}
              <CCheckbox
                name="previousSolutionDrained"
                checked={form.previousSolutionDrained}
                onChange={handle}
                label="Prethodna otopina je ispustena"
                required
                error={touched && !form.previousSolutionDrained}
              />
              {form.previousSolutionDrained && (
                <>
                  <CField label="Kada je otopina ispustena">
                    <input
                      name="drainConfirmedAt"
                      type="datetime-local"
                      value={form.drainConfirmedAt}
                      onChange={handle}
                      className={inputCls}
                    />
                  </CField>
                  <CField label="Kolicina ispustene otopine (L) — neobavezno">
                    <input
                      name="drainVolumeL"
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.drainVolumeL}
                      onChange={handle}
                      placeholder="npr. 78"
                      className={inputCls}
                    />
                  </CField>
                  <div className="grid grid-cols-2 gap-3">
                    <CField label="Izgled ispustene otopine">
                      <select name="drainAppearance" value={form.drainAppearance} onChange={handle} className={inputCls}>
                        {DRAIN_APPEARANCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </CField>
                    <CField label="Talog nakon ispustanja">
                      <select name="drainSediment" value={form.drainSediment} onChange={handle} className={inputCls}>
                        {DRAIN_SEDIMENT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </CField>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <CField label="Status prethodnog ciklusa">
                      <select name="closedAsStatus" value={form.closedAsStatus} onChange={handle} className={inputCls}>
                        <option value="zavrsen">Zavrsen</option>
                        <option value="prekinut">Prekinut</option>
                      </select>
                    </CField>
                    <div />
                  </div>
                  <CField label="Napomena o ispustanju">
                    <textarea
                      name="drainNote"
                      value={form.drainNote}
                      onChange={handle}
                      rows={2}
                      placeholder="Vizualni pregled otopine, miris, boja..."
                      className={textareaCls}
                    />
                  </CField>
                </>
              )}
            </CSection>
          )}

          {/* Ispiranje sustava */}
          {!isFirst && (
            <CSection title="Ispiranje sustava">
              <CCheckbox
                name="rinsed"
                checked={form.rinsed}
                onChange={handle}
                label="Sustav je ispran prije novog ciklusa"
              />
              {form.rinsed && (
                <>
                  <CField label="Nacin ispiranja">
                    <select name="rinseMethod" value={form.rinseMethod} onChange={handle} className={inputCls}>
                      {RINSE_METHOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </CField>
                  <div className="grid grid-cols-2 gap-3">
                    <CField
                      label="pH vode nakon ispiranja"
                      hint="Unijeti pH izlazne vode nakon ispiranja. Usporediti s pH ulazne/mrežne vode."
                    >
                      <input
                        name="rinsePhAfter"
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        value={form.rinsePhAfter}
                        onChange={handle}
                        placeholder="npr. 7.2"
                        className={inputCls}
                      />
                    </CField>
                    <CField label="TDS / provodljivost">
                      <input
                        name="rinseTdsAfter"
                        value={form.rinseTdsAfter}
                        onChange={handle}
                        placeholder="npr. 180 µS/cm"
                        className={inputCls}
                      />
                    </CField>
                  </div>
                  <CField label="Napomena o ispiranju">
                    <textarea
                      name="rinseNote"
                      value={form.rinseNote}
                      onChange={handle}
                      rows={2}
                      placeholder="Broj prolaza, vidljive naslage..."
                      className={textareaCls}
                    />
                  </CField>
                </>
              )}
            </CSection>
          )}

          {/* Stanje sustava */}
          <CSection title="Stanje sustava prije čišćenja">
            {/* Flow */}
            <div className="grid grid-cols-2 gap-3">
              <CField label="Početni protok (neobavezno)">
                <input
                  name="initialFlowValue"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.initialFlowValue}
                  onChange={handle}
                  placeholder={form.initialFlowUnit === "sek_10L" ? "npr. 45" : "npr. 8.5"}
                  className={inputCls}
                />
              </CField>
              <CField label="Jedinica mjerenja">
                <select name="initialFlowUnit" value={form.initialFlowUnit} onChange={handle} className={inputCls}>
                  <option value="L_min">L/min</option>
                  <option value="sek_10L">Sekunde za 10 L</option>
                </select>
              </CField>
            </div>
            {initialFlowLMin !== null && form.initialFlowUnit === "sek_10L" && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                <span className="text-xs text-muted-foreground">Izračunati početni protok</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{initialFlowLMin} L/min</span>
              </div>
            )}
            {/* Optional: pH, temp, visual */}
            <div className="grid grid-cols-2 gap-3">
              <CField label="pH sustava prije čišćenja">
                <input
                  name="initialPhSustava"
                  type="number"
                  step="0.1"
                  min="0"
                  max="14"
                  value={form.initialPhSustava}
                  onChange={handle}
                  placeholder="npr. 7.8"
                  className={inputCls}
                />
              </CField>
              <CField label="Temperatura sustava (°C)">
                <input
                  name="initialTempC"
                  type="number"
                  step="0.5"
                  value={form.initialTempC}
                  onChange={handle}
                  placeholder="npr. 22"
                  className={inputCls}
                />
              </CField>
            </div>
            <CField label="Vizualno stanje vode">
              <select name="vizualnoStanje" value={form.vizualnoStanje} onChange={handle} className={inputCls}>
                <option value="nije_provjereno">Nije provjereno</option>
                <option value="bistra">Bistra</option>
                <option value="mutna">Mutna</option>
                <option value="talog">Talog</option>
                <option value="komadi_kamenca">Komadi kamenca</option>
              </select>
            </CField>
            <CField label="Napomena o stanju sustava">
              <textarea
                name="napomenaStanjePrije"
                value={form.napomenaStanjePrije}
                onChange={handle}
                rows={2}
                placeholder="Vizualni pregled, miris, vidljive naslage..."
                className={textareaCls}
              />
            </CField>
          </CSection>

          </>} {/* end step === "stanje" */}

          {/* ════════════════════════════════════════════════════════ */}
          {/* STEP: VODA — Punjenje vodom */}
          {/* ════════════════════════════════════════════════════════ */}
          {step === "voda" && <>

          {/* Punjenje cistom vodom */}
          <CSection title="Punjenje čistom vodom">
            <CCheckbox
              name="cleanWaterAdded"
              checked={form.cleanWaterAdded}
              onChange={handle}
              label="Sustav je napunjen cistom vodom"
              required
              error={touched && !form.cleanWaterAdded}
            />
            {touched && !form.cleanWaterAdded && (
              <p className="text-xs text-destructive font-medium">
                Potrebno potvrditi punjenje cistom vodom.
              </p>
            )}
            <CField label="Kolicina ciste vode (L) *" error={touched && waterL === 0 ? "Obavezno polje" : undefined}>
              <input
                name="waterVolumeL"
                type="number"
                step="0.5"
                min="0.5"
                value={form.waterVolumeL}
                onChange={handle}
                placeholder="npr. 80"
                className={inputCls}
              />
            </CField>
            <div className="grid grid-cols-2 gap-3">
              <CField label="Temperatura vode (°C)">
                <input name="waterTempC" type="number" step="0.5" value={form.waterTempC} onChange={handle} placeholder="npr. 15" className={inputCls} />
              </CField>
              <CField
                label="pH čiste/mrežne vode prije dodavanja sredstva"
                hint="Unosi se pH vode prije dodavanja kemije, ako je poznat."
              >
                <input name="waterPh" type="number" step="0.1" min="0" max="14" value={form.waterPh} onChange={handle} placeholder="npr. 7.2" className={inputCls} />
              </CField>
            </div>
            <CField label="TDS / provodljivost (neobavezno)">
              <input name="waterTds" value={form.waterTds} onChange={handle} placeholder="npr. 420 µS/cm" className={inputCls} />
            </CField>
            <CField label="Napomena o vodi">
              <textarea name="waterNote" value={form.waterNote} onChange={handle} rows={2}
                placeholder="Izvor vode, priprema..." className={textareaCls} />
            </CField>
          </CSection>

          </>} {/* end step === "voda" */}

          {/* ════════════════════════════════════════════════════════ */}
          {/* STEP: SREDSTVO — Kemijsko sredstvo */}
          {/* ════════════════════════════════════════════════════════ */}
          {step === "sredstvo" && <>

          {/* Kemijsko sredstvo */}
          <CSection title="Kemijsko sredstvo">
            {/* Product picker */}
            {selectedProduct ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Odabrani proizvod iz baze <span className="text-destructive">*</span>
                </p>
                <SelectedProductChip
                  product={selectedProduct}
                  materialName={materialName}
                  onClear={() => {
                    setSelectedProduct(null);
                    setForm((p) => ({ ...p, chemicalProductName: "", chemicalDensityKgL: "" }));
                  }}
                  onView={() => setShowProductPicker(true)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Odaberi iz baze ili unesi naziv ručno</p>
                <button
                  type="button"
                  onClick={() => setShowProductPicker(true)}
                  className="w-full flex items-center gap-2 border border-dashed border-border rounded-xl px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all text-left"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" /><path d="M16 3H8L4 7h16l-4-4Z" />
                  </svg>
                  Odaberi iz baze proizvoda
                </button>
              </div>
            )}
            {/* Cleaning mode incompatibility warning */}
            {selectedProduct && cleaningMode && (() => {
              const modes = selectedProduct.allowedCleaningModes ?? [];
              const isIncompat = modes.length > 0 && !modes.includes(cleaningMode);
              if (!isIncompat) return null;
              return (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-red-600">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-bold text-red-800">Nekompatibilno s odabranom vrstom čišćenja</p>
                    <p className="text-xs text-red-700">
                      <strong>{selectedProduct.name}</strong> nije namijenjeno za{" "}
                      <strong>{CLEANING_MODE_LABELS[cleaningMode]}</strong>. Odaberi drugi proizvod ili potvrdi
                      da svjesno koristiš ovaj proizvod.
                    </p>
                  </div>
                </div>
              );
            })()}
            {/* Dosage guidance from selected product — manufacturer range only */}
            {selectedProduct && (selectedProduct.dosageMin != null || selectedProduct.dosageNote) && (
              <div className="flex items-start gap-2.5 bg-muted/60 border border-border rounded-xl px-3 py-2.5">
                <svg className="shrink-0 mt-0.5 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selectedProduct.dosageMin != null && selectedProduct.dosageMax != null
                    ? `Preporučeni raspon doziranja: ${selectedProduct.dosageMin}–${selectedProduct.dosageMax} ${selectedProduct.dosageUnit ?? "%"}.`
                    : selectedProduct.dosageMin != null
                    ? `Minimalni preporučeni raspon: ${selectedProduct.dosageMin} ${selectedProduct.dosageUnit ?? "%"}.`
                    : null}
                  {selectedProduct.dosageNote ? ` ${selectedProduct.dosageNote}` : null}
                </p>
              </div>
            )}
            {/* Note when the selected product also supports top-ups */}
            {selectedProduct?.topUpAllowed === true && (
              <div className="flex items-start gap-2.5 bg-muted/60 border border-border rounded-xl px-3 py-2.5">
                <svg className="shrink-0 mt-0.5 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Napomena: proizvod <strong className="text-foreground">{selectedProduct.name}</strong> podrzava nadopunu. Provjerite da koristite ispravnu dozu za potpuno punjenje novog ciklusa.
                </p>
              </div>
            )}
            <CField label="Naziv sredstva *" error={touched && !form.chemicalProductName.trim() ? "Obavezno polje" : undefined}>
              <input
                name="chemicalProductName"
                value={form.chemicalProductName}
                onChange={(e) => {
                  handle(e);
                  if (selectedProduct && e.target.value !== selectedProduct.name) {
                    setSelectedProduct(null);
                  }
                }}
                placeholder={selectedProduct ? selectedProduct.name : "npr. AquaDescale Pro"}
                className={inputCls}
              />
            </CField>
            {/* Powder/crystal warning — shown when product form is mass-based */}
            {productIsMass && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5">
                <svg className="shrink-0 mt-0.5 text-amber-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>{selectedProduct?.name}</strong> je sredstvo u prahu/kristalima. Doziranje se unosi u kg ili g.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <CField label="Stvarno dodana količina *" error={touched && chemAmt === 0 ? "Obavezno" : undefined}>
                <input
                  name="chemicalAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.chemicalAmount}
                  onChange={handle}
                  placeholder={productIsMass ? "npr. 0.5" : "npr. 4"}
                  className={inputCls}
                />
              </CField>
              <CField label="Jedinica">
                <select name="chemicalUnit" value={form.chemicalUnit} onChange={handle} className={inputCls}>
                  {availableUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </CField>
            </div>
            {(form.chemicalUnit === "kg" || form.chemicalUnit === "g") && (
              <>
                <div className="flex gap-2.5 bg-muted/60 border border-border rounded-xl px-4 py-3">
                  <svg className="shrink-0 mt-0.5 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Za sredstva unesena u kg/g postotak volumena je priblizан. Za tocan izracun potrebna je gustoca proizvoda.
                  </p>
                </div>
                <CField label="Gustoca proizvoda (kg/L) — neobavezno">
                  <input
                    name="chemicalDensityKgL"
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={form.chemicalDensityKgL}
                    onChange={handle}
                    placeholder="npr. 1.15"
                    className={inputCls}
                  />
                </CField>
              </>
            )}
            <CField label="Vrijeme ulijevanja sredstva">
              <input name="chemicalAddedAt" type="datetime-local" value={form.chemicalAddedAt} onChange={handle} className={inputCls} />
            </CField>

            {/* Live concentration summary — shown when both water and chemical amount are entered */}
            {waterL > 0 && chemAmt > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Početna koncentracija otopine
                </p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Stvarno dodana količina</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {form.chemicalAmount} {form.chemicalUnit}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Ukupni volumen otopine</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {calcs.totalSolutionVolumeL != null
                        ? `${Math.round(calcs.totalSolutionVolumeL * 10) / 10} L`
                        : `${waterL} L`}
                    </span>
                  </div>
                  {calcs.chemicalPercent != null && (
                    <div className="border-t border-border pt-2 flex justify-between items-baseline">
                      <span className="text-xs font-semibold text-muted-foreground">Stvarna početna koncentracija</span>
                      <span className="text-base font-black text-foreground tabular-nums">
                        {Math.round(calcs.chemicalPercent * 10) / 10} %
                      </span>
                    </div>
                  )}
                  {calcs.waterChemicalRatio != null && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Omjer voda : sredstvo</span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {calcs.waterChemicalRatio}
                      </span>
                    </div>
                  )}
                  {calcs.needsDensity && (
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Za točan izračun unesite gustoću proizvoda iznad.
                    </p>
                  )}
                </div>
              </div>
            )}
            <CField label="Napomena o sredstvu">
              <textarea name="chemicalNote" value={form.chemicalNote} onChange={handle} rows={2}
                placeholder="Serija, rok trajanja, razrjedenje..." className={textareaCls} />
            </CField>
          </CSection>

          {/* Izracunate vrijednosti */}
          {(waterL > 0 && chemAmt > 0) && (
            <CSection title="Izračunate vrijednosti">
              {calcs.chemicalVolumeL !== null ? (
                <div className="grid grid-cols-3 gap-3">
                  <CalcBox
                    label="Ukupni volumen otopine"
                    value={calcs.totalSolutionVolumeL !== null ? `${calcs.totalSolutionVolumeL!.toFixed(1)} L` : "—"}
                  />
                  <CalcBox
                    label="Postotak sredstva"
                    value={calcs.chemicalPercent !== null ? `${calcs.chemicalPercent!.toFixed(2)} %` : "—"}
                    highlight
                  />
                  <CalcBox
                    label="Omjer voda : sredstvo"
                    value={calcs.waterChemicalRatio ?? "—"}
                  />
                </div>
              ) : needsDensity ? (
                <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-xs text-muted-foreground text-center">
                  Unesite gustocu proizvoda za izracun postotka volumena.
                </div>
              ) : null}
            </CSection>
          )}

          </>} {/* end step === "sredstvo" */}

          {/* ════════════════════════════════════════════════════════ */}
          {/* STEP: PREGLED — Summary before submit */}
          {/* ════════════════════════════════════════════════════════ */}
          {step === "pregled" && <>

          <CSection title="Pregled unesenih podataka">
            <div className="flex flex-col gap-2">
              {/* Stanje row */}
              <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stanje sustava</span>
                  <button
                    type="button"
                    onClick={() => { setStep("stanje"); setTouched(false); }}
                    className="text-[11px] font-semibold text-primary hover:opacity-70"
                  >
                    Uredi
                  </button>
                </div>
                {initialFlowLMin !== null && (
                  <SummaryRow label="Početni protok" value={`${initialFlowLMin} L/min`} />
                )}
                {form.initialPhSustava && (
                  <SummaryRow label="pH sustava" value={form.initialPhSustava} />
                )}
                {form.vizualnoStanje !== "nije_provjereno" && (
                  <SummaryRow label="Vizualno stanje" value={form.vizualnoStanje.replace(/_/g, " ")} />
                )}
                {!initialFlowLMin && !form.initialPhSustava && form.vizualnoStanje === "nije_provjereno" && (
                  <p className="text-xs text-muted-foreground italic">Stanje nije zabilježeno</p>
                )}
              </div>
              {/* Voda row */}
              <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Voda</span>
                  <button
                    type="button"
                    onClick={() => { setStep("voda"); setTouched(false); }}
                    className="text-[11px] font-semibold text-primary hover:opacity-70"
                  >
                    Uredi
                  </button>
                </div>
                <SummaryRow label="Kolicina vode" value={waterL > 0 ? `${waterL} L` : "—"} />
                {form.waterTempC && <SummaryRow label="Temperatura" value={`${form.waterTempC} °C`} />}
                {form.waterPh && <SummaryRow label="pH vode" value={form.waterPh} />}
              </div>
              {/* Sredstvo row */}
              <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Kemijsko sredstvo</span>
                  <button
                    type="button"
                    onClick={() => { setStep("sredstvo"); setTouched(false); }}
                    className="text-[11px] font-semibold text-primary hover:opacity-70"
                  >
                    Uredi
                  </button>
                </div>
                <SummaryRow label="Sredstvo" value={form.chemicalProductName || "—"} />
                <SummaryRow label="Kolicina" value={chemAmt > 0 ? `${form.chemicalAmount} ${form.chemicalUnit}` : "—"} />
                {calcs.chemicalPercent != null && (
                  <SummaryRow label="Koncentracija" value={`${Math.round(calcs.chemicalPercent * 10) / 10} %`} />
                )}
              </div>
            </div>
          </CSection>

          {/* Incompatibility — requires confirmation checkbox */}
          {productIsSystemIncompatible && selectedProduct && (
            <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <svg className="shrink-0 mt-0.5 text-red-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p className="text-xs font-semibold leading-relaxed text-red-800">
                  Odabrano sredstvo nije prikladno za ovaj tip sustava.
                </p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemWarningConfirmed}
                  onChange={(e) => setSystemWarningConfirmed(e.target.checked)}
                  className="mt-0.5 accent-primary shrink-0"
                />
                <span className="text-xs font-semibold leading-relaxed text-red-800">
                  Razumijem i potvrđujem servisnu odluku.
                </span>
              </label>
            </div>
          )}
          {/* Unverified caution — informational only, does not block */}
          {!productIsSystemIncompatible && productNeedsVerification && selectedProduct && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <svg className="shrink-0 mt-0.5 text-amber-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p className="text-xs text-amber-800 leading-relaxed">
                Primjena ovog sredstva nije potvrđena prema tehničkom listu proizvođača. Provjeriti TDS/SDS dokumentaciju.
              </p>
            </div>
          )}

          </>} {/* end step === "pregled" */}

        </form>
      </div>

      {/* Fixed footer — step-aware navigation */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-4 flex flex-col gap-2.5 max-w-lg mx-auto w-full">

        {/* Voda step: block if water not confirmed */}
        {step === "voda" && touched && !form.cleanWaterAdded && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
            <svg className="shrink-0 text-destructive" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-destructive font-medium">
              Potrebno potvrditi punjenje čistom vodom i unijeti količinu.
            </p>
          </div>
        )}
        {step === "voda" && touched && form.cleanWaterAdded && waterL === 0 && (
          <div className="flex items-center gap-2.5 bg-destructive/8 border border-destructive/25 rounded-2xl px-4 py-3.5">
            <svg className="shrink-0 text-destructive" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-bold text-destructive">
              Unesite količinu čiste vode (L).
            </p>
          </div>
        )}

        {/* Stanje step: block if drain not confirmed on non-first cycle */}
        {step === "stanje" && touched && !isFirst && !form.previousSolutionDrained && (
          <div className="flex items-center gap-2.5 bg-destructive/8 border border-destructive/25 rounded-2xl px-4 py-3.5">
            <svg className="shrink-0 text-destructive" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-bold text-destructive">
              Potvrdite ispustanje prethodne otopine.
            </p>
          </div>
        )}

        {/* Sredstvo step: missing product or amount */}
        {step === "sredstvo" && touched && !selectedProduct && (
          <p className="text-xs text-center text-destructive font-medium">
            Odaberi kemijsko sredstvo iz baze.
          </p>
        )}
        {step === "sredstvo" && touched && selectedProduct && chemAmt === 0 && (
          <p className="text-xs text-center text-destructive font-medium">
            Unesite stvarno dodanu količinu sredstva.
          </p>
        )}

        {/* Pregled: next-step hint */}
        {step === "pregled" && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3.5 flex flex-col gap-1">
            <p className="text-sm font-bold text-foreground">
              Sljedeci korak: Referentno mjerenje otopine (~3 min cirkulacije)
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pokrenite cirkulaciju i nakon oko 3 minute unesite referentno mjerenje.
            </p>
          </div>
        )}

        {/* Next button (non-final steps) */}
        {step !== "pregled" && (
          <button
            type="button"
            onClick={handleNext}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
            style={{ minHeight: 56 }}
          >
            {step === "stanje" ? "Nastavi na punjenje vodom" :
             step === "voda"   ? "Nastavi na kemijsko sredstvo" :
                                 "Nastavi na pregled"}
          </button>
        )}

        {/* Submit — only on pregled */}
        {step === "pregled" && (
          <button
            type="submit"
            form="ciklus-form"
            disabled={!formValid}
            onClick={() => setTouched(true)}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm"
            style={{ minHeight: 56 }}
          >
            Pokreni ciklus #{cycleNumber}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full border border-border text-muted-foreground rounded-2xl py-3.5 font-semibold text-sm hover:bg-muted/50 active:scale-[0.98] transition-all"
          style={{ minHeight: 48 }}
        >
          Odustani
        </button>
      </div>

      {/* Product picker sheet */}
      {showProductPicker && (
        <ProductPickerSheet
          selectedProductId={selectedProduct?.id}
          materialName={materialName}
          cleaningMode={cleaningMode}
          systemCategory={systemCategory}
          onSelectProduct={(p) => {
            setSelectedProduct(p);
            setForm((prev) => ({
              ...prev,
              chemicalProductName: p.name,
              chemicalDensityKgL: p.densityKgL ? String(p.densityKgL) : prev.chemicalDensityKgL,
            }));
            setShowProductPicker(false);
          }}
          onClearProduct={() => {
            setSelectedProduct(null);
            setForm((prev) => ({ ...prev, chemicalProductName: "", chemicalDensityKgL: "" }));
            setShowProductPicker(false);
          }}
          onClose={() => setShowProductPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Small helper for previous cycle summary ──────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium text-foreground text-right truncate">{value}</span>
    </div>
  );
}

// ─── Shared styling constants ─────────────────────────────────────────────────

const inputCls =
  "w-full border border-input rounded-2xl px-4 py-3.5 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all";
const textareaCls =
  "w-full border border-input rounded-2xl px-4 py-3.5 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none leading-relaxed";

// ─── Section wrapper ───────────────────────────────────────────────────────────

function CSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function CField({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/60 leading-snug">{hint}</p>}
      {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function CCheckbox({
  name,
  checked,
  onChange,
  label,
  required,
  error,
}: {
  name: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <label
      style={{ minHeight: 52 }}
      className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-colors ${
        error
          ? "border-destructive bg-destructive/5"
          : checked
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:bg-muted/40"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 accent-primary shrink-0"
      />
      <span className="text-sm font-medium text-foreground leading-snug">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
    </label>
  );
}

// ─── Calc display box ────────────────────────────────────────────────────────

function CalcBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1.5 text-center">
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 leading-tight">{label}</span>
      <span className={`text-lg font-black ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Calc display box ────────���──��────────────────────────────────────���────────


