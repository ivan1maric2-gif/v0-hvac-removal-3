"use client";

import React, { useState, useMemo } from "react";
import type {
  Ciklus,
  Mjerenje,
  NadopunaKemikalije,
  JedinicaKemikalije,
  RazlogNadopune,
} from "@/lib/types";
import {
  RAZLOZI_NADOPUNE,
  izracunajNadopunuVolumen,
  getMjerenjePH,
  getMjerenjeTimestamp,
} from "@/lib/types";
import type { Product, ProductSnapshot } from "@/lib/product-types";
import { isMassBasedForm, allowedUnitsForForm, defaultUnitForForm } from "@/lib/product-types";
import { ProductPickerSheet, SelectedProductChip } from "./product-picker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { genId, nowISO } from "@/lib/utils";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const FOAM_LABELS: Record<string, string> = {
  nema: "Nema", slaba: "Slaba", srednja: "Srednja", jaka: "Jaka", vrlo_jaka: "Vrlo jaka",
};
const COLOR_LABELS: Record<string, string> = {
  plava: "Plava", plavo_zelena: "Plavo-zelena", zelena: "Zelena",
  zuta: "Zuta", smeda: "Smeda", bez_boje: "Bez boje", nije_primjenjivo: "N/A",
};

const UNIT_OPTIONS: { value: JedinicaKemikalije; label: string }[] = [
  { value: "L", label: "L" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1 border-b border-border pb-2">
      {label}
    </p>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text", step, min,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; step?: string; min?: string;
}) {
  return (
    <input
      type={type} value={value} step={step} min={min}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-input rounded-2xl px-4 py-3.5 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NadopunaModalProps {
  ciklus: Ciklus;
  sessionId: string;
  subsessionId?: string;
  /** Material from the subsession/session for product compatibility warnings */
  materialName?: string;
  /** System category from the session — used to filter products by applicationCategory */
  systemCategory?: import("@/lib/types").SystemCategory;
  /** Pre-fill the amount field with a recommended value (from recommendation engine) */
  prefilledAmountL?: number;
  onSave: (nadopuna: NadopunaKemikalije) => void;
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NadopunaModal({
  ciklus,
  sessionId,
  subsessionId,
  materialName,
  systemCategory,
  prefilledAmountL,
  onSave,
  onClose,
}: NadopunaModalProps) {
  // Zadnje mjerenje = zadnji element niza (mjerenja su pohranjena kronološki)
  // Koristimo sve osim nultog (initial_cycle_measurement) jer su to referentne početne vrijednosti
  const zadnjeMjer: Mjerenje | undefined = useMemo(() => {
    const nonInitial = ciklus.mjerenja.filter(
      (m) => m.measurementType !== "initial_cycle_measurement"
    );
    if (nonInitial.length === 0) return undefined;
    return nonInitial[nonInitial.length - 1];
  }, [ciklus]);

  // Previous volumes
  const previousTotalSolutionVolumeL =
    ciklus.currentTotalSolutionVolumeL ?? ciklus.totalSolutionVolumeL ?? ciklus.waterVolumeL ?? 0;
  const previousChemicalVolumeL =
    (ciklus.totalChemicalAddedL ?? 0) + (ciklus.chemicalVolumeL ?? 0);
  const topUpNumber = (ciklus.totalTopUps ?? ciklus.nadopune.length) + 1;

  // Snapshot from the cycle's previous product (if any)
  const cycleSnapshot: ProductSnapshot | undefined = ciklus.productSnapshot;

  // ── Form state ──────────────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState(false);
  // "reuse" = use cycle's previous product; "new" = pick a different one
  const [productMode, setProductMode] = useState<"reuse" | "new">(
    cycleSnapshot ? "reuse" : "new"
  );
  // selectedProduct is a Product-shaped object; snapshot satisfies it for display
  const [selectedProduct, setSelectedProduct] = useState<Product | ProductSnapshot | null>(
    cycleSnapshot ?? null
  );
  const [showProductPicker, setShowProductPicker] = useState(false);

  // ── Derived: product form / unit constraints ─────────────────────────────
  const productIsMass = selectedProduct ? isMassBasedForm(selectedProduct.form) : false;
  const availableUnits: JedinicaKemikalije[] = selectedProduct
    ? (allowedUnitsForForm(selectedProduct.form) as JedinicaKemikalije[])
    : ["L", "ml", "kg", "g"];

  // Auto-set unit when product changes and current unit is incompatible
  React.useEffect(() => {
    if (!selectedProduct) return;
    const allowed = allowedUnitsForForm(selectedProduct.form);
    if (!allowed.includes(form.unit)) {
      setForm((prev) => ({ ...prev, unit: defaultUnitForForm(selectedProduct.form) as JedinicaKemikalije }));
    }
  }, [selectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: system category compatibility ───────────────────────────────
  const productIsSystemIncompatible = selectedProduct && systemCategory && systemCategory !== "unknown"
    ? (selectedProduct.applicationCategory !== "unverified" &&
       selectedProduct.applicationCategory !== "both" &&
       selectedProduct.applicationCategory !== systemCategory)
    : false;
  // Only flag as "needs verification" when explicitly marked unverified
  const productNeedsVerification = selectedProduct
    ? (selectedProduct.applicationCategory === "unverified" ||
       (selectedProduct as import("@/lib/product-types").Product).verificationStatus === "unverified")
    : false;
  // Warning shown ONLY for real incompatibility — not for verified products with no safeFor/notFor
  const showSystemWarning = productIsSystemIncompatible || productNeedsVerification;
  const [systemWarningConfirmed, setSystemWarningConfirmed] = React.useState(false);

  React.useEffect(() => {
    setSystemWarningConfirmed(false);
  }, [selectedProduct?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({
    addedAt: new Date().toISOString().slice(0, 16),
    reason: "" as RazlogNadopune | "",
    chemicalProductName: ciklus.chemicalProductName ?? ciklus.kemikalija ?? "",
    // Pre-fill from recommendation engine if provided, otherwise empty
    amount: prefilledAmountL != null ? String(prefilledAmountL) : "",
    unit: "L" as JedinicaKemikalije,
    // Pre-seed density from the cycle's product snapshot if available
    densityKgL: cycleSnapshot?.densityKgL ? String(cycleSnapshot.densityKgL) : "",
    note: "",
  });

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  const needsMassUnit = form.unit === "kg" || form.unit === "g";
  const amountNum = parseFloat(form.amount);
  const densityNum = parseFloat(form.densityKgL);

  const volumen = useMemo(() => {
    if (!form.amount || isNaN(amountNum)) return null;
    return izracunajNadopunuVolumen(
      previousTotalSolutionVolumeL,
      previousChemicalVolumeL,
      amountNum,
      form.unit,
      needsMassUnit && form.densityKgL ? densityNum : undefined
    );
  }, [form.amount, form.unit, form.densityKgL, previousTotalSolutionVolumeL, previousChemicalVolumeL, amountNum, needsMassUnit, densityNum]);

  const canSave =
    confirmed &&
    selectedProduct !== null &&
    form.reason !== "" &&
    form.chemicalProductName.trim() !== "" &&
    form.amount !== "" &&
    !isNaN(amountNum) &&
    amountNum > 0 &&
    (!needsMassUnit || !volumen?.needsDensity || (form.densityKgL !== "" && !isNaN(densityNum))) &&
    (!productIsSystemIncompatible || systemWarningConfirmed);

  function handleSave() {
    if (!canSave) return;
    const now = nowISO();
    const nad: NadopunaKemikalije = {
      id: genId("nad"),
      sessionId,
      subsessionId,
      cycleId: ciklus.id,
      topUpNumber,
      addedAt: new Date(form.addedAt).toISOString(),
      timestamp: new Date(form.addedAt).toISOString(),
      reason: form.reason as RazlogNadopune,
      productId: selectedProduct?.id,
      // Works whether selectedProduct is a full Product or a ProductSnapshot
      productSnapshot: selectedProduct ? {
        id: selectedProduct.id,
        name: selectedProduct.name,
        brand: selectedProduct.brand,
        productType: selectedProduct.productType,
        form: selectedProduct.form,
        phZones: selectedProduct.phZones,
        hasColorIndicator: selectedProduct.hasColorIndicator,
        colorIndicators: selectedProduct.colorIndicators,
        materialCompatibility: selectedProduct.materialCompatibility,
        densityKgL: selectedProduct.densityKgL,
        dosageMin: selectedProduct.dosageMin,
        dosageMax: selectedProduct.dosageMax,
        dosageUnit: selectedProduct.dosageUnit,
        topUpAllowed: selectedProduct.topUpAllowed,
        dosageNote: selectedProduct.dosageNote,
        hasMassBasedDosing: selectedProduct.hasMassBasedDosing,
        hasVolumeBasedDosing: selectedProduct.hasVolumeBasedDosing,
        allowedDoseUnits: selectedProduct.allowedDoseUnits,
        applicationCategory: selectedProduct.applicationCategory,
        applicationSourceDocument: selectedProduct.applicationSourceDocument,
        potableWaterWarning: selectedProduct.potableWaterWarning,
        technicalWaterWarning: selectedProduct.technicalWaterWarning,
      } as ProductSnapshot : undefined,
      previousMeasurementId: zadnjeMjer?.id,
      previousPh: zadnjeMjer ? getMjerenjePH(zadnjeMjer) : undefined,
      previousFoamLevel: zadnjeMjer?.foamLevel,
      previousColorIndicator: zadnjeMjer?.colorIndicator,
      previousFlowLMin: zadnjeMjer?.flowLMin,
      previousInterpretation: zadnjeMjer?.interpretation,
      chemicalProductName: form.chemicalProductName.trim(),
      kemikalija: form.chemicalProductName.trim(),
      amount: amountNum,
      unit: form.unit,
      densityKgL: needsMassUnit && form.densityKgL ? densityNum : undefined,
      addedChemicalVolumeL: volumen?.addedChemicalVolumeL ?? undefined,
      kolicina: volumen?.addedChemicalVolumeL ?? amountNum,
      previousTotalSolutionVolumeL,
      newTotalSolutionVolumeL: volumen?.newTotalSolutionVolumeL ?? previousTotalSolutionVolumeL,
      previousChemicalVolumeL,
      totalChemicalVolumeL: volumen?.totalChemicalVolumeL ?? undefined,
      newChemicalPercent: volumen?.newChemicalPercent ?? undefined,
      requiresFollowUpMeasurement: true,
      note: form.note || undefined,
      napomena: form.note || undefined,
      createdAt: now,
      updatedAt: now,
    };
    onSave(nad);
  }

  // ── Clarification screen (shown first) ──────────────────────────────────
  if (!confirmed) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-border">
          <button onClick={onClose} className="text-muted-foreground p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="text-base font-semibold text-foreground">Dodaj nadopunu sredstva</h1>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">
          {/* Visual distinction labels */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Ciklus", desc: "Nova voda + novo sredstvo", color: "bg-violet-50 border-violet-200 text-violet-700" },
              { label: "Nadopuna", desc: "Sredstvo u postojecu otopinu", color: "bg-amber-50 border-amber-300 text-amber-800", active: true },
              { label: "Mjerenje", desc: "Provjera parametara", color: "bg-blue-50 border-blue-200 text-blue-700" },
            ].map(({ label, desc, color, active }) => (
              <div key={label} className={`border rounded-xl px-2 py-2.5 flex flex-col gap-1 ${color} ${active ? "ring-2 ring-amber-400" : ""}`}>
                <span className="text-xs font-bold">{label}</span>
                <span className="text-[10px] leading-tight">{desc}</span>
              </div>
            ))}
          </div>

          {/* Warning block */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-amber-900">Vazno — procitajte prije nastavka</p>
                <p className="text-sm text-amber-800 leading-relaxed">
                  Nadopuna znaci da se sredstvo dodaje u <strong>postojecu otopinu</strong>. Stara otopina se ne ispusta.
                </p>
                <p className="text-sm text-amber-700 leading-relaxed mt-1">
                  Ako je otopina ispustena i dodana cista voda, koristite <strong>&quot;Pokreni novi ciklus&quot;</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Cycle context */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aktivni ciklus</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-sm font-bold text-foreground">Ciklus #{ciklus.cycleNumber ?? ciklus.broj}</span>
              <span className="text-sm text-muted-foreground">{ciklus.chemicalProductName ?? ciklus.kemikalija}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Volumen otopine: <strong className="text-foreground">{previousTotalSolutionVolumeL.toFixed(1)} L</strong></span>
              <span>Nadopuna #{topUpNumber}</span>
              {ciklus.nadopune.length > 0 && (
                <span>Prethodnih nadopuna: {ciklus.nadopune.length}</span>
              )}
            </div>
          </div>

          {/* Safety notes */}
          <div className="flex flex-col gap-2">
            <SectionHeader label="Sigurnosne napomene" />
            {[
              "Nadopuna ne zamjenjuje novi ciklus ako je otopina zasicena talodom.",
              "Ako se pH brzo ponovno dize nakon nadopune, mozda je potreban novi ciklus.",
              "Ako je prisutno puno taloga ili promjena boje, razmotriti ispustanje otopine.",
            ].map((txt, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="shrink-0 w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center mt-0.5">
                  <span className="text-[9px] font-bold text-orange-600">{i + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{txt}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 pb-8 pt-3 border-t border-border flex flex-col gap-3">
          <button
            onClick={() => setConfirmed(true)}
            className="w-full bg-amber-500 text-white rounded-2xl py-4 font-bold text-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
          >
            Razumijem — dodajem nadopunu, ne novi ciklus
          </button>
          <button
            onClick={onClose}
            className="w-full bg-transparent text-muted-foreground py-2 text-sm font-medium"
          >
            Otkazi
          </button>
        </div>
      </div>
    );
  }

  // ── Top-up form ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0">
        <button onClick={() => setConfirmed(false)} className="p-2 -ml-1.5 rounded-xl hover:bg-muted transition-colors" aria-label="Natrag">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/70 mb-0.5">
            {prefilledAmountL != null ? `Preporucena kolicina: ${prefilledAmountL} L` : "Nadopuna kemikalije"}
          </p>
          <h1 className="text-xl font-black leading-tight tracking-tight text-foreground">
            Nadopuna #{topUpNumber}
          </h1>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors" aria-label="Zatvori">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* ── Section 1: Identification ── */}
        <div className="flex flex-col gap-3">
          <SectionHeader label="1. Identifikacija" />

          <div className="flex flex-col gap-1">
            <FieldLabel>Datum i vrijeme nadopune</FieldLabel>
            <TextInput
              type="datetime-local"
              value={form.addedAt}
              onChange={(v) => set("addedAt", v)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Razlog nadopune</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(RAZLOZI_NADOPUNE) as [RazlogNadopune, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("reason", key)}
                  style={{ minHeight: 48 }}
                  className={`px-3 py-3 rounded-2xl border text-sm font-semibold text-left transition-all active:scale-95 ${
                    form.reason === key
                      ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                      : "bg-card border-border text-foreground hover:border-amber-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 2: State before top-up ── */}
        <div className="flex flex-col gap-3">
          <SectionHeader label="2. Stanje otopine prije nadopune" />

          {zadnjeMjer ? (
            <div className="bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-300/60 dark:border-blue-700/40 rounded-2xl p-4 flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
                  Automatski preuzeto
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {formatTime(getMjerenjeTimestamp(zadnjeMjer))}
                </span>
              </div>

              {/* Grid vrijednosti */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">pH</span>
                  <span className="text-2xl font-black text-blue-700 dark:text-blue-300 tabular-nums leading-tight">
                    {getMjerenjePH(zadnjeMjer).toFixed(2)}
                  </span>
                </div>
                {zadnjeMjer.flowLMin !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Protok</span>
                    <span className="text-2xl font-black text-foreground tabular-nums leading-tight">
                      {zadnjeMjer.flowLMin.toFixed(1)} <span className="text-sm font-semibold">L/min</span>
                    </span>
                  </div>
                )}
                {zadnjeMjer.tempOutC !== undefined && (
                  <div className="flex flex-col mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Temperatura</span>
                    <span className="text-lg font-black text-orange-600 tabular-nums leading-tight">
                      {zadnjeMjer.tempOutC.toFixed(1)} °C
                    </span>
                  </div>
                )}
                {zadnjeMjer.colorIndicator && (
                  <div className="flex flex-col mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Boja indikatora</span>
                    <span className="text-lg font-bold text-foreground leading-tight">
                      {COLOR_LABELS[zadnjeMjer.colorIndicator] ?? zadnjeMjer.colorIndicator}
                    </span>
                  </div>
                )}
                {zadnjeMjer.foamLevel && (
                  <div className="flex flex-col mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pjena / reakcija</span>
                    <span className="text-lg font-bold text-foreground leading-tight">
                      {FOAM_LABELS[zadnjeMjer.foamLevel] ?? zadnjeMjer.foamLevel}
                    </span>
                  </div>
                )}
              </div>

              {zadnjeMjer.interpretation && (
                <div className="pt-2 border-t border-blue-200 dark:border-blue-700/40">
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{zadnjeMjer.interpretation}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-xs text-amber-800 leading-relaxed">
                Preporuka: prije nadopune unesite mjerenje kako bi se znalo stanje otopine.
              </p>
            </div>
          )}
        </div>

        {/* ── Section 3: Chemical added ── */}
        <div className="flex flex-col gap-3">
          <SectionHeader label="3. Dodano sredstvo" />

          {/* Cycle product — "Sredstvo u ovom ciklusu" label + explicit change button */}
          {cycleSnapshot && productMode === "reuse" && (
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                  Sredstvo u ovom ciklusu
                </p>
                <p className="text-sm font-semibold text-foreground truncate">{cycleSnapshot.name}</p>
                {cycleSnapshot.brand && (
                  <p className="text-[10px] text-muted-foreground">{cycleSnapshot.brand}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setProductMode("new");
                  setSelectedProduct(null);
                  set("chemicalProductName", "");
                  set("densityKgL", "");
                }}
                className="shrink-0 text-xs text-primary font-medium hover:underline"
              >
                Koristi drugo sredstvo
              </button>
            </div>
          )}

          {/* Show selected product chip or picker button — only in "new" mode */}
          {productMode === "new" && (
            selectedProduct ? (
              // New mode with a product selected: show chip with clear/view
              <SelectedProductChip
                product={selectedProduct as Product}
                materialName={materialName}
                onClear={() => {
                  setSelectedProduct(null);
                  set("chemicalProductName", "");
                  set("densityKgL", "");
                }}
                onView={() => setShowProductPicker(true)}
              />
            ) : (
              // New mode, nothing selected yet: show picker button
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
            )
          )}

          {/* topUpAllowed warning — inline in section (before the amount fields) */}
          {selectedProduct?.topUpAllowed === false && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <svg className="shrink-0 mt-0.5 text-red-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-xs text-red-800 leading-relaxed">
                Proizvod <strong>{selectedProduct.name}</strong> nije preporucen za nadopunu — namijenjen je za novi ciklus.
              </p>
            </div>
          )}

          {/* Dosage hint from selected product */}
          {selectedProduct && (selectedProduct.dosageMin != null || selectedProduct.dosageNote) && (
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
              <svg className="shrink-0 mt-0.5 text-blue-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-xs text-blue-800 leading-relaxed">
                {selectedProduct.dosageMin != null && selectedProduct.dosageMax != null
                  ? `Preporucena doza za nadopunu: ${selectedProduct.dosageMin}–${selectedProduct.dosageMax} ${selectedProduct.dosageUnit ?? "%"}.`
                  : selectedProduct.dosageMin != null
                  ? `Minimalna doza: ${selectedProduct.dosageMin} ${selectedProduct.dosageUnit ?? "%"}.`
                  : null}
                {selectedProduct.dosageNote ? ` ${selectedProduct.dosageNote}` : null}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <FieldLabel required>Naziv sredstva koje se dodaje</FieldLabel>
            <TextInput
              value={form.chemicalProductName}
              onChange={(v) => {
                set("chemicalProductName", v);
                // Deselect product if name no longer matches
                if (selectedProduct && v !== selectedProduct.name) {
                  setSelectedProduct(null);
                  setProductMode("new");
                }
              }}
              placeholder={selectedProduct ? selectedProduct.name : "Naziv sredstva"}
            />
          </div>

          {/* Powder/crystal warning for top-up */}
          {productIsMass && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5">
              <svg className="shrink-0 mt-0.5 text-amber-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p className="text-xs text-amber-800 leading-relaxed">
                Nadopuna <strong>{selectedProduct?.name}</strong> unosi se kao masa sredstva u kg ili g, ne kao litra tekućine.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <FieldLabel required>Kolicina</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(v) => set("amount", v)}
                placeholder={productIsMass ? "npr. 0.1" : "npr. 1.5"}
              />
            </div>
            <div className="w-24 flex flex-col gap-1">
              <FieldLabel required>Jedinica</FieldLabel>
              <div className="grid grid-cols-2 gap-1">
                {availableUnits.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("unit", value)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-all ${
                      form.unit === value
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-card border-border text-foreground hover:border-primary/50"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {needsMassUnit && (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-xs text-orange-800 leading-relaxed">
                  Za sredstva unesena u kg/g postotak volumena je priblizna. Za tocan izracun potrebna je gustoca proizvoda.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel>Gustoca proizvoda (kg/L) — neobavezno</FieldLabel>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={form.densityKgL}
                  onChange={(v) => set("densityKgL", v)}
                  placeholder="npr. 1.18"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <FieldLabel>Napomena o sredstvu</FieldLabel>
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              placeholder="Opcionalna napomena..."
              className="w-full border border-input rounded-2xl px-4 py-3.5 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
            />
          </div>
        </div>

        {/* ── Section 4: Volume calculations ── */}
        <div className="flex flex-col gap-3">
          <SectionHeader label="4. Izracun volumena" />

          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1.5">
            <InfoRow label="Prethodni volumen otopine" value={`${previousTotalSolutionVolumeL.toFixed(2)} L`} />
            <InfoRow
              label="Dodana kolicina sredstva"
              value={
                volumen?.addedChemicalVolumeL != null
                  ? `${volumen.addedChemicalVolumeL.toFixed(3)} L`
                  : form.amount
                  ? `${form.amount} ${form.unit}`
                  : "—"
              }
            />
            <div className="border-t border-border my-1" />
            <InfoRow
              label="Novi ukupni volumen otopine"
              value={volumen?.newTotalSolutionVolumeL != null ? `${volumen.newTotalSolutionVolumeL.toFixed(2)} L` : "—"}
              accent
            />
            <InfoRow
              label="Ukupno dodano sredstva u ciklusu"
              value={
                volumen?.totalChemicalVolumeL != null
                  ? `${volumen.totalChemicalVolumeL.toFixed(3)} L`
                  : "—"
              }
            />
            <InfoRow
              label="Nova priblizna koncentracija"
              value={
                volumen?.newChemicalPercent != null
                  ? `${volumen.newChemicalPercent.toFixed(2)} %${volumen.isApproximate ? " *" : ""}`
                  : "—"
              }
              accent={volumen?.newChemicalPercent != null}
            />
            <InfoRow label="Nadopuna u ovom ciklusu" value={`#${topUpNumber}`} />
            {volumen?.needsDensity && (
              <p className="text-[10px] text-orange-600 italic mt-1">
                * Unesite gustocu za tocan izracun koncentracije.
              </p>
            )}
            {volumen?.isApproximate && !volumen.needsDensity && (
              <p className="text-[10px] text-muted-foreground/60 italic mt-1">
                * Priblizni postotak temeljen na gustoci {form.densityKgL} kg/L.
              </p>
            )}
          </div>
        </div>

        {/* ── Section 5: Safety notes ── */}
        <div className="flex flex-col gap-2">
          <SectionHeader label="5. Sigurnosne napomene" />
          {[
            "Nadopuna ne zamjenjuje novi ciklus ako je otopina zasicena talogom.",
            "Ako se pH brzo ponovno dize nakon nadopune, mozda je potreban novi ciklus.",
            "Ako je prisutno puno taloga ili promjena boje, razmotriti ispustanje otopine.",
          ].map((txt, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="shrink-0 w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center mt-0.5">
                <span className="text-[9px] font-bold text-orange-600">{i + 1}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{txt}</p>
            </div>
          ))}
        </div>

        {/* ── Section 6: Follow-up measurement info ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs text-blue-800 leading-relaxed">
            <strong>Sljedeci korak:</strong> nakon kratke cirkulacije unesite mjerenje nakon nadopune.
            Mjerenje ce biti oznaceno kao <strong>&quot;Mjerenje nakon nadopune&quot;</strong>.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-8 pt-3 border-t border-border shrink-0 flex flex-col gap-3">
        {selectedProduct ? (
          <p className="text-xs text-center text-muted-foreground">
            Odabrano sredstvo: <strong className="text-foreground">{selectedProduct.name}</strong>
          </p>
        ) : (
          <p className="text-xs text-center text-destructive font-medium">
            Odaberi sredstvo prije nastavka.
          </p>
        )}
        {!canSave && form.reason === "" && selectedProduct && (
          <p className="text-xs text-center text-muted-foreground">Odaberite razlog nadopune za nastavak.</p>
        )}

        {/* Incompatibility warning + confirmation checkbox — shown ONLY for real incompatibility */}
        {productIsSystemIncompatible && selectedProduct && (
          <div className="rounded-2xl border-2 border-rose-500/50 bg-rose-500/8 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <svg className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-bold text-foreground">
                  Odabrano sredstvo nije prikladno za ovaj tip sustava.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provjeriti tehnički list proizvođača prije primjene. Konačnu odluku donosi serviser.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-3.5 cursor-pointer p-3 rounded-xl bg-background/60 border border-rose-500/20">
              <input
                type="checkbox"
                checked={systemWarningConfirmed}
                onChange={(e) => setSystemWarningConfirmed(e.target.checked)}
                className="mt-0.5 accent-primary shrink-0"
              />
              <span className="text-sm font-semibold leading-relaxed text-foreground">
                Razumijem i potvrđujem servisnu odluku.
              </span>
            </label>
          </div>
        )}
        {/* Unverified caution — shown without checkbox, does not block action */}
        {!productIsSystemIncompatible && productNeedsVerification && selectedProduct && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/8 px-4 py-3.5 flex items-start gap-3">
            <svg className="shrink-0 mt-0.5 text-amber-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-sm text-foreground leading-relaxed">
              Primjena ovog sredstva nije potvrđena prema tehničkom listu proizvođača. Provjeriti TDS/SDS dokumentaciju.
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-amber-500 text-white rounded-2xl py-4 font-bold text-base hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm"
          style={{ minHeight: 56 }}
        >
          Spremi nadopunu
        </button>
      </div>

      {/* Product picker sheet */}
      {showProductPicker && (
        <ProductPickerSheet
          selectedProductId={selectedProduct?.id}
          materialName={materialName}
          systemCategory={systemCategory}
          onSelectProduct={(p) => {
            setSelectedProduct(p);
            set("chemicalProductName", p.name);
            if (p.densityKgL) set("densityKgL", String(p.densityKgL));
            setShowProductPicker(false);
          }}
          onClearProduct={() => {
            setSelectedProduct(null);
            set("chemicalProductName", "");
            set("densityKgL", "");
            setShowProductPicker(false);
          }}
          onClose={() => setShowProductPicker(false)}
        />
      )}
    </div>
  );
}
