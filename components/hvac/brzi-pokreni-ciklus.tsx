"use client";

import { useState, useMemo, useEffect } from "react";
import { useProducts } from "@/lib/product-state";
import { isMassBasedForm, defaultUnitForForm, OBLIK_PROIZVODA_LABELS, APPLICATION_CATEGORY_LABELS, evaluirajUpozorenjeProizvoda } from "@/lib/product-types";
import { izracunajCiklusKemiju } from "@/lib/types";
import type { Ciklus, JedinicaKemikalije, SystemCategory, CleaningMode } from "@/lib/types";
import type { Product } from "@/lib/product-types";
import { DRAFT_KEYS, readDraft, writeDraft, clearDraft } from "@/lib/draft-state";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONCENTRATION_PRESETS = [5, 10, 15, 20] as const;

interface BrziCiklusDraft {
  selectedProductId: string;
  waterL: string;
  concentrationPctStr: string;
  freeInputStr: string;
  manualAmount: string;
  isManual: boolean;
}

import { genId, nowISO } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Session ID — used as draft key */
  sessionId?: string;
  /** For displaying context (read-only) */
  nazivObjekta: string;
  dioSustava?: string;
  tipProblema: string;
  tipSustava: string;
  /** Pre-fill water volume from setup (procijenjeni volumen uređaja) */
  procijenjeniVolumenL?: number;

  /** For product filtering */
  systemCategory?: SystemCategory;
  cleaningMode?: CleaningMode;

  onSave: (ciklus: Ciklus) => void;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BrziPokreniCiklus({
  sessionId,
  nazivObjekta,
  dioSustava,
  tipProblema,
  tipSustava,
  procijenjeniVolumenL,
  systemCategory,
  cleaningMode,
  onSave,
  onBack,
}: Props) {
  // ── Load from the same product store as "Baza proizvoda" ─────────────────
  const { proizvodi } = useProducts();

  // ── Restore draft from in-memory store ───────────────────────────────────
  const draftKey = DRAFT_KEYS.brziCiklus(sessionId ?? "global");
  const savedDraft = readDraft<BrziCiklusDraft>(draftKey);

  // Determine default water volume: draft > procijenjeniVolumenL > 50
  const defaultWater = savedDraft?.waterL
    ?? (procijenjeniVolumenL != null && procijenjeniVolumenL > 0
        ? String(procijenjeniVolumenL)
        : "50");

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedProductId, setSelectedProductId] = useState<string>(savedDraft?.selectedProductId ?? "");
  const [waterL, setWaterL] = useState<string>(defaultWater);
  // concentrationPctStr: one of "5"|"10"|"15"|"20"|"free"|""
  const [concentrationPctStr, setConcentrationPctStr] = useState<string>(savedDraft?.concentrationPctStr ?? "");
  const [freeInputStr, setFreeInputStr] = useState<string>(savedDraft?.freeInputStr ?? "");
  // manual override of calculated amount
  const [manualAmount, setManualAmount] = useState<string>(savedDraft?.manualAmount ?? "");
  const [isManual, setIsManual] = useState<boolean>(savedDraft?.isManual ?? false);
  const [touched, setTouched] = useState(false);
  // manual unit override (only shown when product form is unknown/nepoznato)
  const [manualUnit, setManualUnit] = useState<JedinicaKemikalije>("L");
  // confirmation required when product is incompatible with system type
  const [incompatibilityConfirmed, setIncompatibilityConfirmed] = useState(false);

  const waterPrefilled = procijenjeniVolumenL != null && procijenjeniVolumenL > 0 && !savedDraft?.waterL;

  // ── Persist draft ─────────────────────────────────────────────────────────
  useEffect(() => {
    writeDraft<BrziCiklusDraft>(draftKey, {
      selectedProductId, waterL, concentrationPctStr, freeInputStr, manualAmount, isManual,
    });
  }, [draftKey, selectedProductId, waterL, concentrationPctStr, freeInputStr, manualAmount, isManual]);

  // ── Product lists ─────────────────────────────────────────────────────────
  // All non-archived products (same rule as "Baza proizvoda")
  const svaAktivna: Product[] = useMemo(
    () => proizvodi.filter((p) => p.status !== "arhiviran"),
    [proizvodi]
  );

  // Primary list: matches system category OR is "both" (confirmed)
  // Also includes unverified — they are NOT excluded, just shown with a warning
  const primaryProducts: Product[] = useMemo(() => {
    if (!systemCategory || systemCategory === "unknown") return svaAktivna;
    return svaAktivna.filter((p) => {
      if (cleaningMode && p.allowedCleaningModes.length > 0) {
        if (!p.allowedCleaningModes.includes(cleaningMode)) return false;
      }
      const cat = p.applicationCategory;
      return cat === "both" || cat === systemCategory || cat === "unverified";
    });
  }, [svaAktivna, systemCategory, cleaningMode]);

  // Fallback list: shown when filtering by system type leaves no confirmed products.
  // Confirmed = applicationCategory !== "unverified"
  const confirmedInPrimary = primaryProducts.filter(
    (p) => p.applicationCategory !== "unverified"
  );
  const needsFallback = confirmedInPrimary.length === 0 && svaAktivna.length > 0;

  // When fallback is needed show ALL active products
  const fallbackProducts: Product[] = needsFallback
    ? svaAktivna.filter((p) => !primaryProducts.includes(p))
    : [];

  // The full selectable list (primary + fallback)
  const availableProducts: Product[] = needsFallback
    ? [...primaryProducts, ...fallbackProducts]
    : primaryProducts;

  // ── Selected product ──────────────────────────────────────────────────────
  const selectedProduct: Product | null = useMemo(
    () => availableProducts.find((p) => p.id === selectedProductId) ?? null,
    [availableProducts, selectedProductId]
  );

  useEffect(() => {
    if (!selectedProduct && availableProducts.length > 0) {
      setSelectedProductId(availableProducts[0].id);
    }
  }, [availableProducts, selectedProduct]);

  // ── Unit ──────────────────────────────────────────────────────────────────
  const formKnown = selectedProduct
    ? selectedProduct.form != null && selectedProduct.form !== "nepoznato"
    : false;
  const isMass = selectedProduct ? isMassBasedForm(selectedProduct.form) : false;
  const unit: JedinicaKemikalije = formKnown
    ? (defaultUnitForForm(selectedProduct!.form) as JedinicaKemikalije)
    : manualUnit;

  // ── Product warning (derived, no state) ─────────────�����────────────────────
  const produktUpozorenje = selectedProduct
    ? evaluirajUpozorenjeProizvoda(selectedProduct, systemCategory)
    : null;

  // ── Numbers ───────────────────────────────────────────────────────────────
  const waterNum = parseFloat(waterL) || 0;

  // Selected concentration %
  const selectedPct: number | null = useMemo(() => {
    if (concentrationPctStr === "free") {
      const v = parseFloat(freeInputStr);
      return isNaN(v) || v <= 0 ? null : v;
    }
    const v = parseFloat(concentrationPctStr);
    return isNaN(v) ? null : v;
  }, [concentrationPctStr, freeInputStr]);

  // Calculated amount from water + concentration
  const calculatedAmount: number | null = useMemo(() => {
    if (waterNum <= 0 || selectedPct === null) return null;
    // amount = waterL * pct / 100  (simple % of total volume)
    const raw = (waterNum * selectedPct) / 100;
    return Math.round(raw * 100) / 100;
  }, [waterNum, selectedPct]);

  // Effective amount (manual override or calculated)
  const effectiveAmountNum: number = useMemo(() => {
    if (isManual && manualAmount !== "") {
      const v = parseFloat(manualAmount);
      return isNaN(v) ? 0 : v;
    }
    return calculatedAmount ?? 0;
  }, [isManual, manualAmount, calculatedAmount]);

  // Actual concentration from effective amount
  const calcs = useMemo(
    () =>
      waterNum > 0 && effectiveAmountNum > 0
        ? izracunajCiklusKemiju(waterNum, effectiveAmountNum, unit, selectedProduct?.densityKgL ?? undefined)
        : null,
    [waterNum, effectiveAmountNum, unit, selectedProduct]
  );

  const actualConcentrationPct = calcs?.chemicalPercent ?? null;
  const wasManuallyAdjusted =
    isManual && manualAmount !== "" && calculatedAmount !== null &&
    Math.abs(parseFloat(manualAmount) - calculatedAmount) > 0.001;

  // ── Validation ────────────────────────────────────────────────────────────
  const isValid =
    selectedProduct !== null &&
    waterNum > 0 &&
    selectedPct !== null &&
    effectiveAmountNum > 0 &&
    (produktUpozorenje?.requiresConfirmation !== true || incompatibilityConfirmed);

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    setTouched(true);
    if (!isValid || !selectedProduct) return;

    clearDraft(draftKey);

    const now = nowISO();
    const ciklus: Ciklus = {
      id: genId("ciklus"),
      cycleNumber: 1,
      startDateTime: now,
      reason: "prvi_ciklus",
      previousSolutionDrained: false,
      systemRinsed: false,
      cleanWaterAdded: true,
      waterVolumeL: waterNum,
      productId: selectedProduct.id,
      productSnapshot: {
        id: selectedProduct.id,
        name: selectedProduct.name,
        brand: selectedProduct.brand,
        productType: selectedProduct.productType,
        productCategory: selectedProduct.productCategory,
        allowedCleaningModes: selectedProduct.allowedCleaningModes,
        form: selectedProduct.form,
        phZones: selectedProduct.phZones,
        indicatorZones: selectedProduct.indicatorZones,
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
      },
      chemicalProductName: selectedProduct.name,
      chemicalAmount: effectiveAmountNum,
      chemicalUnit: unit,
      chemicalDensityKgL: selectedProduct.densityKgL,
      chemicalVolumeL: calcs?.chemicalVolumeL ?? undefined,
      chemicalAddedAt: now,
      totalSolutionVolumeL: calcs?.totalSolutionVolumeL ?? undefined,
      chemicalPercent: actualConcentrationPct ?? undefined,
      waterChemicalRatio: calcs?.waterChemicalRatio ?? undefined,
      selectedConcentrationPercent: selectedPct ?? undefined,
      calculatedChemicalAmount: calculatedAmount ?? undefined,
      wasAmountManuallyAdjusted: wasManuallyAdjusted || undefined,
      sessionId: sessionId ?? "",
      status: "ceka_pocetno_mjerenje",
      mjerenja: [],
      nadopune: [],
      createdAt: now,
      updatedAt: now,
    };

    onSave(ciklus);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-slate-50 min-h-0">

      {/* Header */}
      <header className="bg-teal-700 text-white px-4 pt-5 pb-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors mb-3 text-sm"
          aria-label="Natrag"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Natrag
        </button>
        <p className="text-xs text-white/60 uppercase tracking-widest font-medium mb-0.5">
          {nazivObjekta}{dioSustava ? ` — ${dioSustava}` : ""}
        </p>
        <h1 className="text-xl font-bold leading-tight text-white">Pokreni ciklus</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs bg-white/15 text-white/80 rounded-full px-2.5 py-1 font-medium">{tipSustava}</span>
          <span className="text-xs bg-white/15 text-white/80 rounded-full px-2.5 py-1 font-medium">{tipProblema}</span>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-7">

          {/* 1. Sredstvo */}
          <div className="flex flex-col gap-2">
            <label className="text-base font-bold text-slate-800" htmlFor="sredstvo">Sredstvo</label>

            {/* No products loaded at all */}
            {svaAktivna.length === 0 ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-700 mb-0.5">
                    Proizvodi nisu učitani iz baze.
                  </p>
                  <p className="text-xs text-slate-500">
                    Provjeriti povezivanje s bazom proizvoda ili dodati sredstvo u Bazu proizvoda.
                  </p>
                </div>
                <button
                  type="button"
                  className="self-start text-sm font-medium text-teal-700 underline underline-offset-2"
                  onClick={() => {
                    setSelectedProductId("manual");
                    setConcentrationPctStr("");
                    setManualAmount("");
                    setIsManual(false);
                  }}
                >
                  Unesi naziv sredstva ručno
                </button>
              </div>
            ) : (
              <>
                {/* Fallback notice when no confirmed products match system type */}
                {needsFallback && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    Nema potvrđenih sredstava za ovaj tip sustava. Prikazana su ostala aktivna sredstva — potrebna provjera tehničkog lista prije primjene.
                  </div>
                )}

                <select
                  id="sredstvo"
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setConcentrationPctStr("");
                    setManualAmount("");
                    setIsManual(false);
                    setIncompatibilityConfirmed(false);
                  }}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 bg-white text-slate-900 focus:outline-none focus:border-teal-500 transition-colors font-medium"
                  style={{ height: 52, fontSize: 15 }}
                >
                  {primaryProducts.length > 0 && (
                    <>
                      {primaryProducts.map((p) => {
                        const oblikLabel = OBLIK_PROIZVODA_LABELS[p.form] ?? p.form;
                        const primjenaLabel = APPLICATION_CATEGORY_LABELS[p.applicationCategory] ?? p.applicationCategory;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.brand ? ` — ${p.brand}` : ""} — {oblikLabel} — {primjenaLabel}
                          </option>
                        );
                      })}
                    </>
                  )}
                  {fallbackProducts.length > 0 && (
                    <optgroup label="Ostala sredstva — potrebna provjera">
                      {fallbackProducts.map((p) => {
                        const oblikLabel = OBLIK_PROIZVODA_LABELS[p.form] ?? p.form;
                        const primjenaLabel = APPLICATION_CATEGORY_LABELS[p.applicationCategory] ?? p.applicationCategory;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.brand ? ` — ${p.brand}` : ""} — {oblikLabel} — {primjenaLabel}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
              </>
            )}

            {touched && !selectedProduct && svaAktivna.length > 0 && (
              <p className="text-xs text-red-600 font-medium">Odaberi kemijsko sredstvo.</p>
            )}

            {/* Sigurnosne informacije — safeFor / notFor */}
            {selectedProduct && (
              <div className="flex flex-col gap-2">
                {/* safeFor list */}
                {selectedProduct.safeFor && selectedProduct.safeFor.length > 0 && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                    <p className="text-xs font-bold text-green-800 mb-1.5">Sigurno za:</p>
                    <ul className="flex flex-col gap-0.5">
                      {selectedProduct.safeFor.map((item) => (
                        <li key={item} className="flex items-center gap-1.5 text-xs text-green-800">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 text-green-600">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* notFor list */}
                {selectedProduct.notFor && selectedProduct.notFor.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                    <p className="text-xs font-bold text-red-800 mb-1.5">Nije za uporabu na:</p>
                    <ul className="flex flex-col gap-0.5">
                      {selectedProduct.notFor.map((item) => (
                        <li key={item} className="flex items-center gap-1.5 text-xs text-red-800">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 text-red-500">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* No compatibility data at all */}
                {(!selectedProduct.safeFor || selectedProduct.safeFor.length === 0) &&
                  (!selectedProduct.notFor || selectedProduct.notFor.length === 0) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs text-slate-500">Podaci o kompatibilnosti nisu uneseni.</p>
                  </div>
                )}

                {/* Incompatibility warning — requires confirmation */}
                {produktUpozorenje?.level === "incompatible" && (
                  <div className="flex flex-col gap-2.5 rounded-xl border-2 border-destructive/40 bg-destructive/5 px-3 py-3">
                    <div className="flex items-start gap-2">
                      <svg className="shrink-0 mt-0.5 text-red-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <p className="text-xs font-medium text-red-700">
                        Nije prikladno za ovaj sustav.
                      </p>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={incompatibilityConfirmed}
                        onChange={(e) => setIncompatibilityConfirmed(e.target.checked)}
                        className="w-4 h-4 rounded border-destructive/40 accent-destructive"
                      />
                      <span className="text-xs font-medium text-red-700">
                        Razumijem i potvrđujem odabir
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Unknown form warning — manual unit selector */}
            {selectedProduct && !formKnown && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <svg className="shrink-0 mt-0.5 text-amber-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-amber-800">Oblik sredstva nije potvrđen. Odaberi jedinicu:</p>
                  <div className="flex gap-2">
                    {(["L", "kg"] as JedinicaKemikalije[]).map((u) => (
                      <button key={u} type="button" onClick={() => setManualUnit(u)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors ${manualUnit === u ? "border-amber-500 bg-amber-100 text-amber-900" : "border-amber-200 text-amber-700"}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Voda */}
          <div className="flex flex-col gap-2">
            <label className="text-base font-bold text-slate-800" htmlFor="voda">Voda (L)</label>
            <input
              id="voda"
              type="number"
              inputMode="decimal"
              min={1}
              step={0.5}
              value={waterL}
              onChange={(e) => {
                setWaterL(e.target.value);
                // recalculate manual if active
                if (!isManual) {
                  setManualAmount("");
                }
              }}
                className="w-full border-2 border-slate-200 rounded-xl px-4 bg-white text-slate-900 focus:outline-none focus:border-teal-500 transition-colors font-semibold tabular-nums"
              style={{ height: 56, fontSize: 22 }}
            />
            {waterPrefilled && (
              <p className="text-xs text-slate-500 px-1">
                Volumen vode preuzet je iz postavljanja uređaja. Možete ga promijeniti za ovaj ciklus.
              </p>
            )}
            {touched && waterNum <= 0 && (
              <p className="text-xs text-red-600 font-medium">Unesite količinu vode.</p>
            )}
          </div>

          {/* 3. Odaberi koncentraciju */}
          <div className="flex flex-col gap-3">
            <p className="text-base font-bold text-slate-800">Odaberi koncentraciju</p>

            {/* Preset buttons */}
            <div className="grid grid-cols-5 gap-2">
              {CONCENTRATION_PRESETS.map((pct) => {
                const active = concentrationPctStr === String(pct);
                return (
                  <button
                    key={pct}
                    type="button"
                    disabled={!selectedProduct || waterNum <= 0}
                    onClick={() => {
                      setConcentrationPctStr(String(pct));
                      setIsManual(false);
                      setManualAmount("");
                    }}
                    className={`rounded-xl border-2 py-3 font-bold text-sm transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                      active
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50"
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
              {/* Free input button */}
              <button
                type="button"
                disabled={!selectedProduct || waterNum <= 0}
                onClick={() => {
                  setConcentrationPctStr("free");
                  setIsManual(false);
                  setManualAmount("");
                }}
                className={`rounded-xl border-2 py-3 font-bold text-xs transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${
                  concentrationPctStr === "free"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50"
                }`}
              >
                Slobodan unos
              </button>
            </div>

            {/* Free input field */}
            {concentrationPctStr === "free" && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600" htmlFor="free-pct">
                  Unesi koncentraciju (%)
                </label>
                <input
                  id="free-pct"
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  max={50}
                  step={0.5}
                  value={freeInputStr}
                  onChange={(e) => {
                    setFreeInputStr(e.target.value);
                    setIsManual(false);
                    setManualAmount("");
                  }}
                  placeholder="npr. 7.5"
              className="w-full border-2 border-slate-200 rounded-xl px-4 bg-white text-slate-900 focus:outline-none focus:border-teal-500 transition-colors font-semibold tabular-nums"
                  style={{ height: 52, fontSize: 20 }}
                  autoFocus
                />
              </div>
            )}

            {touched && selectedPct === null && (
              <p className="text-xs text-red-600 font-medium">Odaberi ili unesi koncentraciju.</p>
            )}
          </div>

          {/* 4. Result card — Potrebno dodati sredstva */}
          <div className={`rounded-2xl border-2 px-5 py-5 transition-colors ${
            calculatedAmount !== null
              ? "border-teal-500 bg-teal-50"
              : "border-slate-200 bg-slate-50"
            }
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">

              Potrebno dodati sredstva
            </p>
            <p className={`font-black tabular-nums leading-none ${
              calculatedAmount !== null ? "text-teal-700" : "text-slate-400"
            }`} style={{ fontSize: 48, lineHeight: 1 }}>
              {calculatedAmount !== null
                ? `${calculatedAmount.toLocaleString("hr", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${unit}`
                : `— ${unit}`}
            </p>
            {calculatedAmount !== null && selectedPct !== null && (
              <p className="text-xs text-slate-500 mt-2">
                Za {waterNum} L vode pri koncentraciji {selectedPct} %.
              </p>
            )}
          </div>

          {/* 5. Ručno prilagođavanje */}
          {calculatedAmount !== null && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-800" htmlFor="manual-kolicina">
                Količina sredstva za ovaj ciklus ({unit})
              </label>
              <input
                id="manual-kolicina"
                type="number"
                inputMode="decimal"
                min={0.01}
                step={isMass ? 0.01 : 0.1}
                value={isManual ? manualAmount : (calculatedAmount > 0 ? String(calculatedAmount) : "")}
                onChange={(e) => {
                  setManualAmount(e.target.value);
                  setIsManual(true);
                }}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 bg-white text-slate-900 focus:outline-none focus:border-teal-500 transition-colors font-semibold tabular-nums"
                style={{ height: 52, fontSize: 20 }}
              />

              {/* Actual concentration when manually changed */}
              {wasManuallyAdjusted && actualConcentrationPct !== null && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-slate-500 px-1">
                    Stvarna koncentracija:{" "}
                    <strong className="text-slate-800">
                      {Math.round(actualConcentrationPct * 10) / 10} %
                    </strong>
                  </p>
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <svg className="shrink-0 mt-0.5 text-amber-600" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-xs text-amber-800">
                      Količina je ručno promijenjena. Stvarna koncentracija se razlikuje od odabrane.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product dosage guidance */}
          {selectedProduct?.dosageMin != null && selectedProduct?.dosageMax != null && (
            <p className="text-xs text-slate-500 -mt-3 px-1">
              Preporučeni raspon: <strong className="text-slate-800">{selectedProduct.dosageMin}–{selectedProduct.dosageMax} {selectedProduct.dosageUnit ?? "%"}</strong>
            </p>
          )}

          <div className="h-24" />
        </div>
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 max-w-lg mx-auto w-full">
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full bg-teal-700 text-white rounded-xl font-black tracking-wide hover:bg-teal-800 active:scale-[0.98] transition-all uppercase shadow-sm"
          style={{ height: 60, fontSize: 18, letterSpacing: "0.04em" }}
        >
          Pokreni ciklus
        </button>
        <p className="text-xs text-center text-slate-500 mt-2">
          Nakon pokretanja: Pokreni cirkulaciju i unesi referentno mjerenje za ~3 min
        </p>
      </div>
    </div>
  );
}
