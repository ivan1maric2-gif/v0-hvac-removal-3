"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { JedinicaKemikalije } from "@/lib/types";
import { useProducts } from "@/lib/product-state";
import type { Product } from "@/lib/product-types";
import {
  OBLIK_PROIZVODA_LABELS,
  APPLICATION_CATEGORY_LABELS,
  allowedUnitsForForm,
  defaultUnitForForm,
  isMassBasedForm,
} from "@/lib/product-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChemicalFillingData {
  productName: string;
  productId?: string;
  waterVolumeL: number;
  chemicalAmount: number;
  chemicalUnit: JedinicaKemikalije;
  chemicalDensityKgL?: number;
  chemicalVolumeL?: number;
  concentrationPercent?: number;
  addedAt: string;
  note?: string;
}

interface Props {
  cycleNumber: number;
  cycleName?: string;
  waterVolumeL: number;
  isFirst?: boolean;
  defaultVolumeL?: number;
  suggestedProduct?: { id: string; name: string; defaultConcentration?: number };
  onContinue: (data: ChemicalFillingData) => void;
  onBack: () => void;
}

const CONCENTRATION_PRESETS = [5, 10, 15, 20, 25, 30];

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  const formLabel = OBLIK_PROIZVODA_LABELS[product.form] ?? product.form;
  const appLabel = APPLICATION_CATEGORY_LABELS[product.applicationCategory] ?? "";
  const units = allowedUnitsForForm(product.form);

  const compatWarning = product.potableWaterWarning || product.technicalWaterWarning;
  const hasWarning = product.applicationCategory === "unverified" || !!compatWarning;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/8"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground leading-tight">{product.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{product.brand}</p>
        </div>
        {selected && (
          <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center mt-0.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground uppercase tracking-wide">
          {formLabel}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
          {units.join(" / ")}
        </span>
        {appLabel && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300">
            {appLabel}
          </span>
        )}
      </div>

      {hasWarning && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 leading-relaxed">
          {compatWarning || "Primjena nije potvrđena prema TDS-u."}
        </p>
      )}

      {product.dosageNote && (
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
          {product.dosageNote}
        </p>
      )}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DodavanjeKemije({
  cycleNumber,
  cycleName,
  waterVolumeL,
  isFirst,
  defaultVolumeL,
  suggestedProduct,
  onContinue,
  onBack,
}: Props) {
  const { getAktivniProizvodi } = useProducts();

  // ── Product selection state ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // "other" mode — free text input za nepoznate/custom proizvode
  const [isOtherMode, setIsOtherMode] = useState(false);
  const [otherProductName, setOtherProductName] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Chemistry amount state ────────────────────────────────────────────────
  const [chemicalAmount, setChemicalAmount] = useState("");
  const [chemicalUnit, setChemicalUnit] = useState<JedinicaKemikalije>("L");
  const [chemicalDensityKgL, setChemicalDensityKgL] = useState("");
  const [concentrationMode, setConcentrationMode] = useState<"manual" | "preset">("preset");
  const [selectedConcentration, setSelectedConcentration] = useState<number | null>(10);
  const [manualConcentration, setManualConcentration] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // ── Volume correction (ciklus #1 only) ───────────────────────────────────
  const [volumeCorrection, setVolumeCorrection] = useState("");
  const effectiveWaterVolumeL = isFirst
    ? (volumeCorrection ? parseFloat(volumeCorrection) : waterVolumeL)
    : waterVolumeL;

  // ── Product list ──────────────────────────────────────────────────────────
  const sviProizvodi = useMemo(() => getAktivniProizvodi(), [getAktivniProizvodi]);

  // Filter samo sredstva za uklanjanje kamenca (opisacling mode)
  const relevantProducts = useMemo(
    () => sviProizvodi.filter((p) => p.productType === "sredstvo_uklanjanje_kamenca"),
    [sviProizvodi]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return relevantProducts;
    return relevantProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.purpose.toLowerCase().includes(q)
    );
  }, [relevantProducts, searchQuery]);

  // ── When product selected, auto-set unit from product form ────────────────
  useEffect(() => {
    if (selectedProduct) {
      const defaultUnit = defaultUnitForForm(selectedProduct.form) as JedinicaKemikalije;
      setChemicalUnit(defaultUnit);
    }
  }, [selectedProduct]);

  // ── Derive productName for output ────────────────────────────────────────
  const productName = isOtherMode
    ? otherProductName
    : (selectedProduct?.name ?? "");

  // ── Calculations ──────────────────────────────────────────────────────────
  const amountNum = parseFloat(chemicalAmount);
  const densityNum = parseFloat(chemicalDensityKgL) || selectedProduct?.densityKgL || 0;

  const effectiveConcentration =
    concentrationMode === "preset"
      ? selectedConcentration
      : parseFloat(manualConcentration) || null;

  const calculatedAmount = useMemo(() => {
    if (!effectiveConcentration || effectiveWaterVolumeL <= 0) return null;
    return (effectiveConcentration / 100) * effectiveWaterVolumeL;
  }, [effectiveConcentration, effectiveWaterVolumeL]);

  const chemicalVolumeL = useMemo(() => {
    if (!amountNum || amountNum <= 0) return null;
    if (chemicalUnit === "L") return amountNum;
    if (chemicalUnit === "ml") return amountNum / 1000;
    if ((chemicalUnit === "kg" || chemicalUnit === "g") && densityNum > 0) {
      const kgAmount = chemicalUnit === "kg" ? amountNum : amountNum / 1000;
      return kgAmount / densityNum;
    }
    return null;
  }, [amountNum, chemicalUnit, densityNum]);

  const actualConcentration = useMemo(() => {
    if (!chemicalVolumeL || effectiveWaterVolumeL <= 0) return null;
    const totalVolume = effectiveWaterVolumeL + chemicalVolumeL;
    return (chemicalVolumeL / totalVolume) * 100;
  }, [chemicalVolumeL, effectiveWaterVolumeL]);

  // ── Validation ────────────────────────────────────────────────────────────
  const hasProduct = productName.trim().length > 0;
  const hasAmount = !isNaN(amountNum) && amountNum > 0;
  const needsDensity =
    (chemicalUnit === "kg" || chemicalUnit === "g") &&
    !selectedProduct?.densityKgL;
  const hasDensity = !needsDensity || densityNum > 0;
  const canContinue = hasProduct && hasAmount && hasDensity;

  // ── Allowed units for selected product ───────────────────────────────────
  const allowedUnits = useMemo<JedinicaKemikalije[]>(() => {
    if (isOtherMode || !selectedProduct) return ["L", "ml", "kg", "g"];
    const units = allowedUnitsForForm(selectedProduct.form) as JedinicaKemikalije[];
    return units;
  }, [selectedProduct, isOtherMode]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setIsOtherMode(false);
    setSearchQuery("");
    // Auto-set concentration from product recommendation
    if (p.defaultStartingDose && p.dosageUnit === "percent") {
      setSelectedConcentration(p.defaultStartingDose);
    }
  };

  const handleSelectOther = () => {
    setSelectedProduct(null);
    setIsOtherMode(true);
    setSearchQuery("");
    setChemicalUnit("L");
  };

  const applyCalculatedAmount = () => {
    if (!calculatedAmount) return;
    setChemicalAmount(calculatedAmount.toFixed(2));
    setChemicalUnit("L");
  };

  const handleContinue = () => {
    setTouched(true);
    if (!canContinue) return;

    onContinue({
      productName: productName.trim(),
      productId: selectedProduct?.id,
      waterVolumeL: effectiveWaterVolumeL,
      chemicalAmount: amountNum,
      chemicalUnit,
      chemicalDensityKgL: needsDensity ? densityNum : undefined,
      chemicalVolumeL: chemicalVolumeL || undefined,
      concentrationPercent: actualConcentration || undefined,
      addedAt: new Date().toISOString(),
      note: note || undefined,
    });
  };

  const isProductSelected = selectedProduct !== null || isOtherMode;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="shrink-0 bg-primary text-primary-foreground px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Natrag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-wider">
              {isFirst ? "Korak 1 od 2" : "Korak 2 od 3"}
            </p>
            <h1 className="text-xl font-bold">
              {isFirst ? "Kemija — Ciklus #1" : "Dodavanje kemije"}
            </h1>
          </div>
        </div>
      </header>

      {/* Cycle + Water Summary */}
      <div className="shrink-0 bg-muted/50 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ciklus #{cycleNumber}
            </span>
            {cycleName && (
              <span className="text-xs text-muted-foreground ml-1">— {cycleName}</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isFirst ? "Volumen sustava" : "Količina vode"}
            </span>
            <p className="text-lg font-bold text-foreground">{effectiveWaterVolumeL} L</p>
            {isFirst && volumeCorrection && (
              <p className="text-[10px] text-muted-foreground">korigirano</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">

        {/* ── SECTION 1: Odabir proizvoda ─────────────────────────────── */}
        <div className="px-4 pt-5 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Odabir kemijskog sredstva <span className="text-destructive">*</span>
          </p>

          {/* Prikazujemo odabrani proizvod ili selector */}
          {isProductSelected ? (
            /* Odabrani proizvod — kompaktni prikaz */
            <div className="rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {isOtherMode ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-1">Drugi / prilagođeni proizvod</p>
                      <input
                        type="text"
                        value={otherProductName}
                        onChange={(e) => setOtherProductName(e.target.value)}
                        placeholder="Naziv proizvoda..."
                        autoFocus
                        className="w-full font-bold text-base bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none py-0.5 text-foreground"
                      />
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-base text-foreground leading-tight">
                        {selectedProduct!.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedProduct!.brand} &middot; {OBLIK_PROIZVODA_LABELS[selectedProduct!.form]}
                        &middot; {allowedUnitsForForm(selectedProduct!.form).join("/")}
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setIsOtherMode(false);
                    setSearchQuery("");
                  }}
                  className="shrink-0 text-xs font-semibold text-primary hover:opacity-70 transition-opacity px-2 py-1"
                >
                  Promijeni
                </button>
              </div>

              {/* Kratka info o kompatibilnosti */}
              {selectedProduct?.potableWaterWarning && (
                <div className="mt-2 flex items-start gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0 mt-0.5">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    {selectedProduct.potableWaterWarning}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Selector — pretraga + lista */
            <div>
              {/* Search */}
              <div className="relative mb-3">
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pretraži proizvode..."
                  className="w-full h-11 border border-input rounded-xl pl-9 pr-4 text-sm bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
                />
              </div>

              {/* Product list */}
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
                {filteredProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nema rezultata za &quot;{searchQuery}&quot;
                  </p>
                )}
                {filteredProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    selected={selectedProduct?.id === p.id}
                    onSelect={() => handleSelectProduct(p)}
                  />
                ))}

                {/* Drugi / custom proizvod */}
                <button
                  type="button"
                  onClick={handleSelectOther}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
                    isOtherMode
                      ? "border-primary bg-primary/8"
                      : "border-dashed border-border hover:border-primary/40"
                  }`}
                >
                  <p className="font-semibold text-sm text-foreground">Drugi / prilagođeni proizvod</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ručni unos naziva — nije u bazi
                  </p>
                </button>
              </div>

              {touched && !hasProduct && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
                  Odaberite kemijsko sredstvo.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 2: Korekcija volumena (samo ciklus #1) ──────────── */}
        {isFirst && (
          <div className="px-4 pb-4">
            <div className="p-4 bg-muted/50 border border-border rounded-xl">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Korekcija volumena
              </p>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Procjena iz sesije:{" "}
                <strong className="text-foreground">
                  {defaultVolumeL ? `${defaultVolumeL} L` : "nije unesena"}
                </strong>
                . Ako je stvarni volumen drugačiji, ispravite ga.
              </p>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={volumeCorrection}
                  onChange={(e) => setVolumeCorrection(e.target.value)}
                  placeholder={defaultVolumeL ? String(defaultVolumeL) : "npr. 62"}
                  className="w-full h-11 border border-input rounded-xl px-4 pr-10 text-base bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">L</span>
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION 3: Koncentracija kalkulator ─────────────────────── */}
        <div className="px-4 pb-4">
          <div className="p-4 bg-primary/5 border border-primary/15 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>
              <span className="text-sm font-semibold text-primary">
                Izračun doze po koncentraciji
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {CONCENTRATION_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setConcentrationMode("preset");
                    setSelectedConcentration(c);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    concentrationMode === "preset" && selectedConcentration === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {c}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => setConcentrationMode("manual")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  concentrationMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border hover:border-primary/50"
                }`}
              >
                Ručno
              </button>
            </div>

            {concentrationMode === "manual" && (
              <div className="mb-3">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={manualConcentration}
                  onChange={(e) => setManualConcentration(e.target.value)}
                  placeholder="Unesi %"
                  className="w-28 h-10 border border-input rounded-lg px-3 text-sm bg-background text-foreground"
                />
              </div>
            )}

            {calculatedAmount !== null && (
              <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Preporučena doza za {effectiveConcentration}% ({effectiveWaterVolumeL} L):
                  </p>
                  <p className="text-lg font-bold text-foreground">{calculatedAmount.toFixed(2)} L</p>
                </div>
                <button
                  type="button"
                  onClick={applyCalculatedAmount}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-colors"
                >
                  Primijeni
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 4: Količina kemije ───────────────────────────────── */}
        <div className="px-4 pb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Količina kemije <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={chemicalAmount}
                onChange={(e) => setChemicalAmount(e.target.value)}
                placeholder="0"
                className={`w-full h-14 border-2 rounded-xl px-4 text-xl font-bold bg-background text-foreground focus:ring-0 transition-colors ${
                  touched && !hasAmount
                    ? "border-amber-500"
                    : "border-primary/30 focus:border-primary"
                }`}
              />
            </div>
            <select
              value={chemicalUnit}
              onChange={(e) => setChemicalUnit(e.target.value as JedinicaKemikalije)}
              className="h-14 border-2 border-input rounded-xl px-3 text-base font-semibold bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
            >
              {allowedUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          {touched && !hasAmount && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Količina kemije je obavezna.
            </p>
          )}

          {/* Gustoća — samo za kg/g kad nije poznata iz baze */}
          {needsDensity && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Gustoća kemije <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={chemicalDensityKgL}
                  onChange={(e) => setChemicalDensityKgL(e.target.value)}
                  placeholder="1.05"
                  className={`w-full h-12 border rounded-xl px-4 pr-16 text-base bg-background text-foreground focus:ring-0 transition-colors ${
                    touched && !hasDensity ? "border-amber-500" : "border-input focus:border-primary"
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  kg/L
                </span>
              </div>
              {touched && !hasDensity && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1 font-medium">
                  Gustoća je potrebna za kg/g jedinice.
                </p>
              )}
            </div>
          )}

          {/* Stvarna koncentracija */}
          {actualConcentration !== null && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div>
                <p className="text-xs text-muted-foreground">Stvarna koncentracija:</p>
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  {actualConcentration.toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 5: Napomena ──────────────────────────────────────── */}
        <div className="px-4 pb-6">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Napomena <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Serija proizvoda, posebne napomene..."
            rows={2}
            className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background resize-none focus:border-primary focus:ring-0 transition-colors"
          />
        </div>
      </main>

      {/* Sticky Footer */}
      <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {touched && !canContinue && (
          <p className="text-xs text-muted-foreground text-center mb-2">
            {!hasProduct
              ? "Odaberite kemijsko sredstvo."
              : !hasAmount
              ? "Unesite količinu kemije."
              : "Unesite gustoću za kg/g jedinice."}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 h-14 border-2 border-border text-foreground rounded-xl font-semibold text-base hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            Natrag
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
            Nulto mjerenje
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
