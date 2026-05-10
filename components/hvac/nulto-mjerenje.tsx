"use client";

import { useState } from "react";
import type { JedinicaProtoka, FoamLevel, ColorIndicator, VisibleReaction } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZeroMeasurementData {
  // Obavezna mjerenja
  ph: number;
  flowInputValue: number;
  flowInputUnit: JedinicaProtoka;
  flowLMin: number;
  // Temperatura
  tempInC?: number;
  tempOutC?: number;
  deltaTempC?: number;        // tempOut - tempIn (automatski)
  temperatureC?: number;      // alias za tempInC, za kompatibilnost
  // Reakcija indikatori
  foamLevel?: FoamLevel;
  colorIndicator?: ColorIndicator;
  visibleReaction?: VisibleReaction;
  // Meta
  measuredAt: string;
  note?: string;
}

interface Props {
  cycleNumber: number;
  cycleName?: string;
  waterVolumeL: number;
  chemicalProductName: string;
  concentrationPercent?: number;
  onComplete: (data: ZeroMeasurementData) => void;
  onBack: () => void;
}

// ─── Foam helper ──────────────────────────────────────────────────────────────

const FOAM_HELPER_ITEMS = [
  { label: "Nema",      desc: "nema reakcije ili malo kamenca" },
  { label: "Slaba",     desc: "reakcija pri kraju ili mala količina kamenca" },
  { label: "Srednja",   desc: "normalna aktivna reakcija" },
  { label: "Jaka",      desc: "aktivno otapanje kamenca" },
  { label: "Vrlo jaka", desc: "jaka reakcija / puno aktivnog kamenca / svježa kemija" },
] as const;

function NultoFoamHelper() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 py-1 text-[11px] font-semibold text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors select-none"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="uppercase tracking-widest">Tumačenje pjene</span>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40 opacity-100 mt-1" : "max-h-0 opacity-0"}`}>
        <ul className="flex flex-col gap-1.5 pl-4">
          {FOAM_HELPER_ITEMS.map((item) => (
            <li key={item.label} className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground/70 leading-snug">
              <span className="font-semibold shrink-0">{item.label}</span>
              <span className="text-muted-foreground/40">—</span>
              <span>{item.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FOAM_LEVELS: { value: FoamLevel; label: string }[] = [
  { value: "nema", label: "Nema" },
  { value: "slaba", label: "Slaba" },
  { value: "srednja", label: "Srednja" },
  { value: "jaka", label: "Jaka" },
  { value: "vrlo_jaka", label: "Vrlo jaka" },
];

const COLOR_INDICATORS: { value: ColorIndicator; label: string; color: string }[] = [
  { value: "plava", label: "Plava", color: "bg-blue-500" },
  { value: "plavo_zelena", label: "Plavo-zelena", color: "bg-teal-500" },
  { value: "zelena", label: "Zelena", color: "bg-green-500" },
  { value: "zuta", label: "Zuta", color: "bg-yellow-400" },
  { value: "smeda", label: "Smeda", color: "bg-amber-700" },
  { value: "bez_boje", label: "Bez boje", color: "bg-gray-300" },
];

const VISIBLE_REACTIONS: { value: VisibleReaction; label: string }[] = [
  { value: "nema", label: "Nema" },
  { value: "slaba", label: "Slaba" },
  { value: "normalna", label: "Normalna" },
  { value: "jaka", label: "Jaka" },
  { value: "vrlo_jaka", label: "Vrlo jaka" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function NultoMjerenje({
  cycleNumber,
  cycleName,
  waterVolumeL,
  chemicalProductName,
  concentrationPercent,
  onComplete,
  onBack,
}: Props) {
  // Obavezna polja
  const [flowUnit, setFlowUnit] = useState<JedinicaProtoka>("l_min");
  const [flowValue, setFlowValue] = useState("");
  const [ph, setPh] = useState("");

  // Temperatura
  const [tempIn, setTempIn] = useState("");
  const [tempOut, setTempOut] = useState("");

  // Reakcija indikatori
  const [foamLevel, setFoamLevel] = useState<FoamLevel | "">("");
  const [colorIndicator, setColorIndicator] = useState<ColorIndicator | "">("");
  const [visibleReaction, setVisibleReaction] = useState<VisibleReaction | "">("");

  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // ─── Derivirane vrijednosti ───────────────────────────────────────────────────
  const phNum = parseFloat(ph);
  const flowNum = parseFloat(flowValue);
  const tempInNum = tempIn ? parseFloat(tempIn) : undefined;
  const tempOutNum = tempOut ? parseFloat(tempOut) : undefined;

  // Delta T automatski
  const deltaTempC =
    tempInNum !== undefined && tempOutNum !== undefined
      ? parseFloat((tempOutNum - tempInNum).toFixed(1))
      : undefined;

  // Protok u L/min
  const flowLMin =
    flowUnit === "l_min"
      ? flowNum
      : flowNum > 0
      ? parseFloat((10 / (flowNum / 60)).toFixed(2))
      : 0;

  // Validacije — Temp OUT je preporučena ali neobavezna
  const hasPh = !isNaN(phNum) && phNum >= 0 && phNum <= 14;
  const hasFlow = !isNaN(flowNum) && flowNum > 0;
  const hasTempOut = tempOutNum !== undefined && !isNaN(tempOutNum) && tempOutNum > 0;
  const phError = ph !== "" && !isNaN(phNum) && (phNum < 0 || phNum > 14);
  const canComplete = hasPh && hasFlow;

  const handleComplete = () => {
    setTouched(true);
    if (!canComplete) return;

    onComplete({
      ph: phNum,
      flowInputValue: flowNum,
      flowInputUnit: flowUnit,
      flowLMin,
      tempInC: tempInNum,
      tempOutC: tempOutNum,
      deltaTempC,
      temperatureC: tempInNum,
      foamLevel: foamLevel || undefined,
      colorIndicator: colorIndicator || undefined,
      visibleReaction: visibleReaction || undefined,
      measuredAt: new Date().toISOString(),
      note: note || undefined,
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-emerald-600 text-white px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
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
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Korak 3 od 3</p>
            <h1 className="text-xl font-bold leading-tight">Referentno mjerenje</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">Ciklus</p>
            <p className="text-lg font-black">#{cycleNumber}</p>
          </div>
        </div>

        {/* Kemija summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] font-semibold text-white/60 uppercase">Voda</p>
            <p className="text-sm font-bold">{waterVolumeL} L</p>
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] font-semibold text-white/60 uppercase">Kemija</p>
            <p className="text-sm font-bold truncate">{chemicalProductName || "—"}</p>
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] font-semibold text-white/60 uppercase">Konc.</p>
            <p className="text-sm font-bold">
              {concentrationPercent ? `${concentrationPercent.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      </header>

      {/* Workflow Guidance */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Referentno mjerenje postavlja nultu točku — sva kasnija mjerenja računaju delta u odnosu na ove vrijednosti.
        </p>
        <p className="text-sm font-semibold text-foreground mt-1.5">
          Unesite početni pH i protok odmah nakon dodavanja kemije.
        </p>
      </div>

      {/* ─── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

        {/* pH — OBAVEZNO */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            pH odmah nakon kemije <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="14"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              placeholder="1.5"
              className={`w-full h-16 border-2 rounded-xl px-4 pr-14 text-2xl font-bold bg-background text-foreground focus:ring-0 transition-colors ${
                phError
                  ? "border-destructive focus:border-destructive"
                  : touched && !hasPh
                  ? "border-amber-500 focus:border-amber-500"
                  : "border-emerald-500/40 focus:border-emerald-600"
              }`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground">
              pH
            </span>
          </div>
          {phError && (
            <p className="text-sm text-destructive mt-1.5 font-medium">pH mora biti 0 – 14.</p>
          )}
          {touched && !hasPh && !phError && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1.5 font-medium">pH je obavezan.</p>
          )}
        </div>

        {/* Protok — OBAVEZNO */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Protok <span className="text-destructive">*</span>
          </label>

          {/* Jedinica segmented control */}
          <div className="grid grid-cols-2 gap-0 p-1 bg-muted/50 rounded-xl mb-3">
            {(["l_min", "sec_10l"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setFlowUnit(unit)}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                  flowUnit === unit
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {unit === "l_min" ? "L/min" : "Sekunde / 10 L"}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={flowValue}
              onChange={(e) => setFlowValue(e.target.value)}
              placeholder="0.0"
              className={`w-full h-16 border-2 rounded-xl px-4 pr-20 text-2xl font-bold bg-background text-foreground focus:ring-0 transition-colors ${
                touched && !hasFlow
                  ? "border-amber-500 focus:border-amber-500"
                  : "border-emerald-500/40 focus:border-emerald-600"
              }`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              {flowUnit === "l_min" ? "L/min" : "sek"}
            </span>
          </div>
          {touched && !hasFlow && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1.5 font-medium">Protok je obavezan.</p>
          )}
          {/* Konverzija */}
          {flowUnit === "sec_10l" && flowNum > 0 && !isNaN(flowLMin) && (
            <p className="text-xs text-muted-foreground mt-1.5">
              = {flowLMin} L/min
            </p>
          )}
        </div>

        {/* Temperatura */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
            Temperatura
          </label>

          {/* Temp OUT — preporučeno, neobavezno */}
          <div className="mb-2">
            <p className="text-xs font-semibold text-foreground mb-1.5">
              Temp OUT <span className="font-normal text-muted-foreground">(izlaz — preporučeno)</span>
            </p>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={tempOut}
                onChange={(e) => setTempOut(e.target.value)}
                placeholder="42"
                className="w-full h-16 border-2 border-emerald-500/40 focus:border-emerald-600 rounded-xl px-4 pr-12 text-2xl font-bold bg-background text-foreground focus:ring-0 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground">°C</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              Ako je dostupno — prati prijenos topline i stanje protočnosti. Bez unosa, delta Temp OUT neće biti dostupna.
            </p>
          </div>



          {/* Temp IN — sekundarni, manji */}
          <div className="pl-0.5">
            <p className="text-xs text-muted-foreground mb-1.5">
              Temp IN <span className="opacity-70">(ulaz, sekundarno)</span>
            </p>
            <div className="relative w-1/2">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={tempIn}
                onChange={(e) => setTempIn(e.target.value)}
                placeholder="20"
                className="w-full h-11 border border-input rounded-xl px-3 pr-10 text-sm font-medium bg-background text-foreground focus:border-emerald-500 focus:ring-0 transition-colors text-muted-foreground"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">°C</span>
            </div>
          </div>
        </div>

        {/* Indikatori reakcije */}
        <div className="p-4 bg-muted/30 rounded-xl border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Indikatori reakcije <span className="font-normal text-muted-foreground">(neobavezno)</span>
          </h3>

          {/* Pjena */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Pjena</label>
            <div className="flex flex-wrap gap-2">
              {FOAM_LEVELS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFoamLevel(foamLevel === f.value ? "" : f.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    foamLevel === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Tumačenje pjene — collapsible */}
            <NultoFoamHelper />
          </div>

          {/* Boja otopine */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Boja otopine</label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_INDICATORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColorIndicator(colorIndicator === c.value ? "" : c.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all ${
                    colorIndicator === c.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${c.color}`} />
                  <span className={`text-xs font-medium ${colorIndicator === c.value ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Vidljiva reakcija */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Vidljiva reakcija</label>
            <div className="flex flex-wrap gap-2">
              {VISIBLE_REACTIONS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVisibleReaction(visibleReaction === v.value ? "" : v.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    visibleReaction === v.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Napomena */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Napomena <span className="font-normal opacity-60">(neobavezno)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Posebna zapazanja o pocetnoj reakciji kemije..."
            rows={2}
            className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background resize-none focus:border-emerald-500 focus:ring-0 transition-colors"
          />
        </div>

        <div className="h-2" />
      </main>

      {/* ─── Sticky Footer ──────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {touched && !canComplete && (
          <p className="text-xs text-muted-foreground text-center mb-2">Obavezna polja: pH i protok</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 h-14 border-2 border-border text-foreground rounded-xl font-semibold text-base hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            Natrag
          </button>
          <button
            onClick={handleComplete}
            disabled={!canComplete}
            className={`flex-[2] h-14 rounded-xl font-bold text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
              canComplete
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            Pokreni pracenje
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
