"use client";

import { useState, useMemo } from "react";
import type { JedinicaKemikalije } from "@/lib/types";

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
  suggestedProduct?: { id: string; name: string; defaultConcentration?: number };
  onContinue: (data: ChemicalFillingData) => void;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_OPTIONS: { value: JedinicaKemikalije; label: string }[] = [
  { value: "L", label: "Litara (L)" },
  { value: "kg", label: "Kilograma (kg)" },
  { value: "ml", label: "Mililitara (ml)" },
  { value: "g", label: "Grama (g)" },
];

const CONCENTRATION_PRESETS = [5, 10, 15, 20, 25, 30];

// ─── Component ────────────────────────────────────────────────────────────────

export function DodavanjeKemije({
  cycleNumber,
  cycleName,
  waterVolumeL,
  suggestedProduct,
  onContinue,
  onBack,
}: Props) {
  const [productName, setProductName] = useState(suggestedProduct?.name || "");
  const [chemicalAmount, setChemicalAmount] = useState("");
  const [chemicalUnit, setChemicalUnit] = useState<JedinicaKemikalije>("L");
  const [chemicalDensityKgL, setChemicalDensityKgL] = useState("");
  const [concentrationMode, setConcentrationMode] = useState<"manual" | "preset">("preset");
  const [selectedConcentration, setSelectedConcentration] = useState<number | null>(10);
  const [manualConcentration, setManualConcentration] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // Izračuni
  const amountNum = parseFloat(chemicalAmount);
  const densityNum = parseFloat(chemicalDensityKgL);
  
  const effectiveConcentration = concentrationMode === "preset" 
    ? selectedConcentration 
    : parseFloat(manualConcentration) || null;

  // Izračunaj količinu kemije iz koncentracije
  const calculatedAmount = useMemo(() => {
    if (!effectiveConcentration || waterVolumeL <= 0) return null;
    // concentration = (chemicalVolume / totalVolume) * 100
    // chemicalVolume = (concentration / 100) * totalVolume
    // Pretpostavljamo da je totalVolume ≈ waterVolumeL (kemija je mali dio)
    return (effectiveConcentration / 100) * waterVolumeL;
  }, [effectiveConcentration, waterVolumeL]);

  // Volumen kemije u litrama (za kg/g potrebna gustoća)
  const chemicalVolumeL = useMemo(() => {
    if (!amountNum || amountNum <= 0) return null;
    
    if (chemicalUnit === "L") return amountNum;
    if (chemicalUnit === "ml") return amountNum / 1000;
    
    // Za kg/g trebamo gustoću
    if ((chemicalUnit === "kg" || chemicalUnit === "g") && densityNum > 0) {
      const kgAmount = chemicalUnit === "kg" ? amountNum : amountNum / 1000;
      return kgAmount / densityNum;
    }
    
    return null;
  }, [amountNum, chemicalUnit, densityNum]);

  // Izračunaj stvarnu koncentraciju
  const actualConcentration = useMemo(() => {
    if (!chemicalVolumeL || waterVolumeL <= 0) return null;
    const totalVolume = waterVolumeL + chemicalVolumeL;
    return (chemicalVolumeL / totalVolume) * 100;
  }, [chemicalVolumeL, waterVolumeL]);

  // Validacija
  const hasProduct = productName.trim().length > 0;
  const hasAmount = !isNaN(amountNum) && amountNum > 0;
  const needsDensity = (chemicalUnit === "kg" || chemicalUnit === "g");
  const hasDensity = !needsDensity || (densityNum > 0);
  const canContinue = hasProduct && hasAmount && hasDensity;

  const handleContinue = () => {
    setTouched(true);
    if (!canContinue) return;

    onContinue({
      productName: productName.trim(),
      productId: suggestedProduct?.id,
      waterVolumeL,
      chemicalAmount: amountNum,
      chemicalUnit,
      chemicalDensityKgL: needsDensity ? densityNum : undefined,
      chemicalVolumeL: chemicalVolumeL || undefined,
      concentrationPercent: actualConcentration || undefined,
      addedAt: new Date().toISOString(),
      note: note || undefined,
    });
  };

  // Primijeni izračunatu količinu
  const applyCalculatedAmount = () => {
    if (calculatedAmount) {
      setChemicalAmount(calculatedAmount.toFixed(2));
      setChemicalUnit("L");
    }
  };

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
              Korak 2 od 3
            </p>
            <h1 className="text-xl font-bold">Dodavanje kemije</h1>
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
              Količina vode
            </span>
            <p className="text-lg font-bold text-foreground">{waterVolumeL} L</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-5">
        <p className="text-sm text-muted-foreground mb-5">
          Unesite proizvod i količinu kemije koju dodajete u sustav.
        </p>

        {/* Proizvod - OBAVEZNO */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Proizvod <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="npr. DS-40, Kamflex..."
            className={`w-full h-14 border-2 rounded-xl px-4 text-base font-semibold bg-background text-foreground focus:ring-0 transition-colors ${
              touched && !hasProduct
                ? "border-amber-500 focus:border-amber-500"
                : "border-input focus:border-primary"
            }`}
          />
          {touched && !hasProduct && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Naziv proizvoda je obavezan.
            </p>
          )}
        </div>

        {/* Koncentracija - pomoćni kalkulator */}
        <div className="mb-6 p-4 bg-primary/8 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-sm font-semibold text-primary">
              Pomoć: Izračun količine kemije
            </span>
          </div>

          {/* Preset koncentracije */}
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-2">Odaberi željenu koncentraciju:</p>
            <div className="flex flex-wrap gap-2">
              {CONCENTRATION_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setConcentrationMode("preset");
                    setSelectedConcentration(c);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
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
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  concentrationMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border hover:border-primary/50"
                }`}
              >
                Ručno
              </button>
            </div>
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
                className="w-24 h-10 border border-input rounded-lg px-3 text-sm bg-background text-foreground"
              />
            </div>
          )}

          {calculatedAmount && (
            <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
              <div>
                <p className="text-xs text-muted-foreground">Preporučena količina za {effectiveConcentration}%:</p>
                <p className="text-lg font-bold text-foreground">{calculatedAmount.toFixed(2)} L</p>
              </div>
              <button
                type="button"
                onClick={applyCalculatedAmount}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-colors"
              >
                Primijeni
              </button>
            </div>
          )}
        </div>

        {/* Količina kemije - OBAVEZNO */}
        <div className="mb-5">
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
                    ? "border-amber-500 focus:border-amber-500"
                    : "border-primary/30 focus:border-primary"
                }`}
              />
            </div>
            <select
              value={chemicalUnit}
              onChange={(e) => setChemicalUnit(e.target.value as JedinicaKemikalije)}
              className="h-14 border-2 border-input rounded-xl px-3 text-base font-semibold bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          {touched && !hasAmount && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Količina kemije je obavezna.
            </p>
          )}
        </div>

        {/* Gustoća - potrebna samo za kg/g */}
        {needsDensity && (
          <div className="mb-5">
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
                  touched && !hasDensity
                    ? "border-amber-500 focus:border-amber-500"
                    : "border-input focus:border-primary"
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                kg/L
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Potrebna za izračun volumena iz mase.
            </p>
            {touched && !hasDensity && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
                Gustoća je potrebna za kg/g jedinice.
              </p>
            )}
          </div>
        )}

        {/* Prikaz izračunate koncentracije */}
        {actualConcentration && (
          <div className="mb-5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div>
                <p className="text-xs text-muted-foreground">Stvarna koncentracija:</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {actualConcentration.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Napomena - opcionalno */}
        <div>
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
      <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {!canContinue && (
          <p className="text-xs text-muted-foreground text-center mb-2">
            Obavezna polja: proizvod, količina kemije
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
