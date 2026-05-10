"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CycleReferenceData {
  cycleNumber: number;
  cycleName?: string;
  timestamp: string;
}

export interface WaterFillingData {
  waterVolumeL: number;
  waterTempC?: number;
  waterPh?: number;
  waterTds?: string;
  waterNote?: string;
  filledAt: string;
}

interface DefaultValues {
  waterVolumeL?: string;
  waterTempC?: string;
  waterPh?: string;
  waterTds?: string;
}

interface Props {
  referenceData: CycleReferenceData;
  /** Ako je true, podaci dolaze iz session setup-a — prikaži info banner */
  isFirst?: boolean;
  /** Default vrijednosti iz session setup-a za auto-prefill */
  defaultValues?: DefaultValues;
  onContinue: (data: WaterFillingData) => void;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PunjenjeVodom({ referenceData, isFirst, defaultValues, onContinue, onBack }: Props) {
  const [waterVolumeL, setWaterVolumeL] = useState(defaultValues?.waterVolumeL ?? "");
  const [waterTempC, setWaterTempC] = useState(defaultValues?.waterTempC ?? "");
  const [waterPh, setWaterPh] = useState(defaultValues?.waterPh ?? "");
  const [waterTds, setWaterTds] = useState(defaultValues?.waterTds ?? "");
  const [waterNote, setWaterNote] = useState("");
  const [touched, setTouched] = useState(false);

  // Validacija
  const volumeNum = parseFloat(waterVolumeL);
  const hasVolume = !isNaN(volumeNum) && volumeNum > 0;
  const canContinue = hasVolume;

  const handleContinue = () => {
    setTouched(true);
    if (!canContinue) return;

    onContinue({
      waterVolumeL: volumeNum,
      waterTempC: waterTempC ? parseFloat(waterTempC) : undefined,
      waterPh: waterPh ? parseFloat(waterPh) : undefined,
      waterTds: waterTds || undefined,
      waterNote: waterNote || undefined,
      filledAt: new Date().toISOString(),
    });
  };

  const screenTitle = isFirst ? "Priprema otopine" : "Punjenje vodom";
  const helperText = isFirst
    ? "Podaci su preuzeti iz sesije i mogu se po potrebi korigirati."
    : "Unesite količinu vode kojom punite sustav. Ovi podaci su potrebni za izračun koncentracije kemije.";
  const buttonLabel = isFirst ? "Potvrdi otopinu" : "Nastavi na kemiju";

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
              Korak 1 od 3
            </p>
            <h1 className="text-xl font-bold">{screenTitle}</h1>
          </div>
        </div>
      </header>

      {/* Ciklus info */}
      <div className="shrink-0 bg-muted/50 border-b border-border px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aktivni ciklus</span>
        <span className="text-sm font-bold text-foreground">
          #{referenceData.cycleNumber}
          {referenceData.cycleName && (
            <span className="font-normal text-muted-foreground ml-1">— {referenceData.cycleName}</span>
          )}
        </span>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-5">

        {/* Info banner — samo za Ciklus #1 */}
        {isFirst ? (
          <div className="flex items-start gap-3 bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 mb-5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-primary leading-relaxed">{helperText}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-5">{helperText}</p>
        )}

        {/* Količina vode - OBAVEZNO, PRIMARY */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            {isFirst ? "Volumen sustava (korekcija)" : "Količina vode"}{" "}
            <span className="text-destructive">*</span>
          </label>
          {isFirst && defaultValues?.waterVolumeL && (
            <p className="text-xs text-muted-foreground mb-2">
              Procjena iz sesije: <strong className="text-foreground">{defaultValues.waterVolumeL} L</strong>
            </p>
          )}
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={waterVolumeL}
              onChange={(e) => setWaterVolumeL(e.target.value)}
              placeholder={defaultValues?.waterVolumeL || "0"}
              className={`w-full h-16 border-2 rounded-xl px-4 pr-12 text-2xl font-bold bg-background text-foreground focus:ring-0 transition-colors ${
                touched && !hasVolume
                  ? "border-amber-500 focus:border-amber-500"
                  : "border-primary/30 focus:border-primary"
              }`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground">
              L
            </span>
          </div>
          {touched && !hasVolume && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Volumen je obavezan za izračun koncentracije kemije.
            </p>
          )}
        </div>

        {/* Temperatura vode */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Temperatura vode <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={waterTempC}
              onChange={(e) => setWaterTempC(e.target.value)}
              placeholder={defaultValues?.waterTempC || "20"}
              className="w-full h-12 border border-input rounded-xl px-4 pr-12 text-base bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              °C
            </span>
          </div>
        </div>

        {/* pH mrežne vode */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            pH mrežne vode <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="14"
            value={waterPh}
            onChange={(e) => setWaterPh(e.target.value)}
            placeholder={defaultValues?.waterPh || "7.0"}
            className="w-full h-12 border border-input rounded-xl px-4 text-base bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
          />
        </div>

        {/* TDS */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            TDS / Provodljivost <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="1"
              min="0"
              value={waterTds}
              onChange={(e) => setWaterTds(e.target.value)}
              placeholder={defaultValues?.waterTds || "0"}
              className="w-full h-12 border border-input rounded-xl px-4 pr-16 text-base bg-background text-foreground focus:border-primary focus:ring-0 transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              ppm
            </span>
          </div>
        </div>

        {/* Napomena */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Napomena <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <textarea
            value={waterNote}
            onChange={(e) => setWaterNote(e.target.value)}
            placeholder="Bilješke o kvaliteti vode, izvoru..."
            rows={2}
            className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background resize-none focus:border-primary focus:ring-0 transition-colors"
          />
        </div>
      </main>

      {/* Sticky Footer */}
      <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {!canContinue && (
          <p className="text-xs text-muted-foreground text-center mb-2">
            Unesite volumen za nastavak
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
            {buttonLabel}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
