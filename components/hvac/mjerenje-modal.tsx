"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";

// ── Parse transcript and extract values ─────────────────────────────────────
interface ParsedVoiceValues {
  ph?: string;
  protok?: string;
  temperatura?: string;
}

function parseVoiceTranscript(transcript: string): ParsedVoiceValues {
  const result: ParsedVoiceValues = {};
  const text = transcript.toLowerCase();
  
  // Helper: normalize decimal (2,8 -> 2.8)
  const normalizeDecimal = (val: string) => val.replace(",", ".");
  
  // pH patterns: "ph 2.8", "ph 2,8", "peh 2.8", "pe ha 2,8"
  const phMatch = text.match(/(?:ph|peh|pe\s*ha?)\s*(\d+[.,]?\d*)/i);
  if (phMatch) {
    result.ph = normalizeDecimal(phMatch[1]);
  }
  
  // Protok patterns: "protok 18", "protok 18,5", "protok 18.5 litara"
  const protokMatch = text.match(/protok\s*(\d+[.,]?\d*)/i);
  if (protokMatch) {
    result.protok = normalizeDecimal(protokMatch[1]);
  }
  
  // Temperatura patterns: "temperatura 45", "temp 45,5", "temperatura 45 stupnjeva"
  const tempMatch = text.match(/(?:temperatura?|temp)\s*(\d+[.,]?\d*)/i);
  if (tempMatch) {
    result.temperatura = normalizeDecimal(tempMatch[1]);
  }
  
  return result;
}

// ── Web Speech API hook ─────────────────────────────────────────────────────
type VoiceCallback = (values: ParsedVoiceValues, fieldName?: string) => void;

function useSpeechRecognition(onResult?: VoiceCallback) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const callbackRef = useRef(onResult);
  callbackRef.current = onResult;

  const startListening = useCallback((fieldName?: string) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SpeechRecognition();
    recognition.lang = "hr-HR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      const parsed = parseVoiceTranscript(transcript);
      if (callbackRef.current) callbackRef.current(parsed, fieldName);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return { isListening, startListening, stopListening };
}

// ── Type declarations for Web Speech API ────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
import { GlasovniUnos, MicButton } from "./glasovni-unos";
import type { GlasovniRezultat } from "./glasovni-unos";
import type {
  Mjerenje,
  MeasurementType,
  FoamLevel,
  ColorIndicator,
  VisibleReaction,
  Turbidity,
  Sediment,
  Smell,
  Ciklus,
  JedinicaProtoka,
  CleaningMode,
} from "@/lib/types";
import {
  interpretirajMjerenje,
  getMjerenjePH,
  getMjerenjeTimestamp,
  pocetnoMjerenjeCiklusa,
  izracunajProtokLMin,
  materijalUpozorenje,
} from "@/lib/types";
import { generirajPreporuku } from "@/lib/preporuka";
import { PreporukaKartica } from "./preporuka-kartica";
import { ProcjenaBojePanel } from "./procjena-boje-panel";

import { genId, nowISO } from "@/lib/utils";

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  initial_cycle_measurement: "Referentno mjerenje (nakon ~3 min cirkulacije)",
  regular: "Redovno mjerenje",
  after_top_up: "Mjerenje nakon nadopune",
  final_cycle: "Završno mjerenje ciklusa",
  final_subsession: "Završno mjerenje podsesije",
  final_session: "Završno mjerenje sesije",
};

const FOAM_LABELS: Record<FoamLevel, string> = {
  nema: "Nema",
  slaba: "Slaba",
  srednja: "Srednja",
  jaka: "Jaka",
  vrlo_jaka: "Vrlo jaka",
};

const COLOR_LABELS: Record<ColorIndicator, string> = {
  plava: "Plava",
  plavo_zelena: "Plavo-zelena",
  zelena: "Zelena",
  zuta: "Žuta",
  smeda: "Smeđa",
  bez_boje: "Bez boje",
  nije_primjenjivo: "Nije primjenjivo",
};

const REACTION_LABELS: Record<VisibleReaction, string> = {
  nema: "Nema",
  slaba: "Slaba",
  normalna: "Normalna",
  jaka: "Jaka",
  vrlo_jaka: "Vrlo jaka",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border pb-1.5">
      {children}
    </h2>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
    >
      {children}
    </label>
  );
}

const FOAM_HELPER_ITEMS = [
  { label: "Nema",      desc: "nema reakcije ili malo kamenca" },
  { label: "Slaba",     desc: "reakcija pri kraju ili mala količina kamenca" },
  { label: "Srednja",   desc: "normalna aktivna reakcija" },
  { label: "Jaka",      desc: "aktivno otapanje kamenca" },
  { label: "Vrlo jaka", desc: "jaka reakcija / puno aktivnog kamenca / svježa kemija" },
] as const;

function FoamHelper() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
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

      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40 opacity-100 mt-1.5" : "max-h-0 opacity-0"}`}
      >
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

function TextInput({
  name, value, onChange, placeholder, type = "text", step, min, max, readOnly, id, className,
}: {
  name: string; value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; step?: string; min?: string; max?: string;
  readOnly?: boolean; id?: string; className?: string;
}) {
  return (
    <input
      id={id ?? name} name={name} type={type} value={value} step={step}
      min={min} max={max} readOnly={readOnly} onChange={onChange}
      placeholder={placeholder}
      className={`w-full border border-input rounded-2xl px-4 py-3.5 text-base font-semibold bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/30 ${readOnly ? "opacity-50 cursor-default" : ""} ${className ?? ""}`}
    />
  );
}

function SelectField<T extends string>({
  name, value, onChange, options, labels, id,
}: {
  name: string; value: T | ""; onChange: (v: T | "") => void;
  options: T[]; labels: Record<T, string>; id?: string;
}) {
  return (
    <select
      id={id ?? name} name={name} value={value}
      onChange={(e) => onChange(e.target.value as T | "")}
      className="w-full border border-input rounded-2xl px-4 py-3.5 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
    >
      <option value="">— Odaberi —</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{labels[opt]}</option>
      ))}
    </select>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Shared data panel ────────────────────────────────────────────────────────

type DataSource = "uneseno" | "izracunato" | "procijenjeno" | "rucni_unos";

interface SharedDataRow {
  label: string;
  value: string;
  source: DataSource;
}

const SOURCE_LABELS: Record<DataSource, string> = {
  uneseno: "uneseno",
  izracunato: "izračunato",
  procijenjeno: "procijenjeno",
  rucni_unos: "ručni unos",
};

const SOURCE_COLORS: Record<DataSource, string> = {
  uneseno: "bg-blue-50 text-blue-700 border-blue-200",
  izracunato: "bg-green-50 text-green-700 border-green-200",
  procijenjeno: "bg-amber-50 text-amber-700 border-amber-200",
  rucni_unos: "bg-slate-50 text-slate-700 border-slate-200",
};

function SharedDataPanel({
  ciklus,
  previousPh,
  previousFlowLMin,
}: {
  ciklus: Ciklus;
  previousPh: number | undefined;
  previousFlowLMin: number | undefined;
}) {
  const rows: SharedDataRow[] = [];

  // Product / chemical
  if (ciklus.chemicalProductName) {
    rows.push({ label: "Sredstvo", value: ciklus.chemicalProductName, source: "uneseno" });
  }

  // Solution volume
  const solutionVol = ciklus.currentTotalSolutionVolumeL ?? ciklus.totalSolutionVolumeL;
  if (solutionVol) {
    rows.push({ label: "Volumen otopine", value: `${solutionVol.toFixed(1)} L`, source: "izracunato" });
  } else if (ciklus.waterVolumeL) {
    rows.push({ label: "Volumen vode", value: `${ciklus.waterVolumeL} L`, source: "uneseno" });
  }

  // Chemical concentration
  const concPercent = ciklus.currentChemicalPercent ?? ciklus.chemicalPercent;
  if (concPercent != null) {
    rows.push({ label: "Koncentracija", value: `${concPercent.toFixed(2)} %`, source: "izracunato" });
  }

  // Total chemical added
  if (ciklus.totalChemicalAddedL != null && ciklus.totalChemicalAddedL > 0) {
    rows.push({
      label: "Ukupno dodano kemijskog",
      value: `${ciklus.totalChemicalAddedL.toFixed(2)} L`,
      source: "izracunato",
    });
  }

  // Previous pH
  if (previousPh !== undefined) {
    rows.push({ label: "Prethodni pH", value: previousPh.toFixed(2), source: "izracunato" });
  }

  // Initial pH (from first measurement)
  const initialMj = pocetnoMjerenjeCiklusa(ciklus);
  const initialPh = initialMj ? getMjerenjePH(initialMj) : null;
  if (initialPh !== null && initialPh !== previousPh) {
    rows.push({ label: "Početni pH", value: initialPh.toFixed(2), source: "uneseno" });
  }

  // Previous flow
  if (previousFlowLMin !== undefined) {
    rows.push({ label: "Prethodni protok", value: `${previousFlowLMin} L/min`, source: "izracunato" });
  }

  // Top-up count
  if ((ciklus.totalTopUps ?? ciklus.nadopune?.length ?? 0) > 0) {
    rows.push({
      label: "Broj nadopuna",
      value: `${ciklus.totalTopUps ?? ciklus.nadopune?.length}`,
      source: "izracunato",
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
          Kontekst sesije
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5 gap-3">
            <span className="text-xs text-muted-foreground min-w-0">{row.label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm font-bold text-foreground">{row.value}</span>
              <span className={`text-[9px] font-bold border rounded-full px-1.5 py-0.5 leading-none ${SOURCE_COLORS[row.source]}`}>
                {SOURCE_LABELS[row.source]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Interpretation card ──────────────────────────────────────────────────────

function InterpretacijaKartica({ ph, phRate, foam }: {
  ph: number | null;
  phRate: number | undefined;
  foam: FoamLevel | undefined;
}) {
  if (ph === null) return null;
  const res = interpretirajMjerenje(ph, phRate, foam);

  const colorMap = {
    green: "border-emerald-500/30 bg-emerald-500/8 text-emerald-800 dark:text-emerald-200",
    yellow: "border-amber-400/30 bg-amber-400/8 text-amber-800 dark:text-amber-200",
    orange: "border-orange-500/30 bg-orange-500/8 text-orange-800 dark:text-orange-200",
    red: "border-rose-500/30 bg-rose-500/8 text-rose-800 dark:text-rose-200",
  };
  const badgeMap = {
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    yellow: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    red: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  };

  return (
    <div className={`border rounded-2xl p-4 flex flex-col gap-2.5 ${colorMap[res.zonaColor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Interpretacija</span>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${badgeMap[res.zonaColor]}`}>
          {res.zona}
        </span>
      </div>
      <p className="text-sm font-semibold leading-relaxed">{res.tekst}</p>
      {res.brzina && (
        <p className="text-xs opacity-70">Brzina: {res.brzina}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MjerenjeModalInitialValues {
  ph?: number;
  flowLMin?: number;
  foamLevel?: FoamLevel;
  colorIndicator?: ColorIndicator;
}

interface MjerenjeModalProps {
  ciklus: Ciklus;
  sessionId: string;
  subsessionId?: string;
  initialType: MeasurementType;
  /** initial flow L/min from subsession for comparison */
  initialFlowLMin?: number;
  /** material string for warning (e.g. "Bakar") */
  materijal?: string;
  /** Cleaning mode from the session — determines recommendation engine path. */
  cleaningMode?: CleaningMode;
  /** Pre-filled values from voice input */
  initialValues?: MjerenjeModalInitialValues;
  onSave: (m: Mjerenje) => void;
  onClose: () => void;
}

interface FormState {
  measurementType: MeasurementType;
  measuredAt: string;
  phStr: string;
  temperatureStr: string;
  foamLevel: FoamLevel | "";
  colorIndicator: ColorIndicator | "";
  visibleReaction: VisibleReaction | "";
  flowInputValue: string;
  flowInputUnit: JedinicaProtoka;
  tds: string;
  turbidity: Turbidity | "";
  sediment: Sediment | "";
  smell: Smell | "";
  note: string;
  servisnaOcjena: string;
  /** Manual override for "minutes since chemical added" — initial measurement only */
  minutesOverride: string;
}

export function MjerenjeModal({
  ciklus,
  sessionId,
  subsessionId,
  initialType,
  initialFlowLMin,
  materijal,
  cleaningMode,
  initialValues,
  onSave,
  onClose,
}: MjerenjeModalProps) {
  const now = nowISO();
  const pocetno = pocetnoMjerenjeCiklusa(ciklus);
  const prethodnoMjerenje = ciklus.mjerenja.length > 0
    ? [...ciklus.mjerenja].sort(
        (a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime()
      )[0]
    : undefined;
  const prethodniPH = prethodnoMjerenje ? getMjerenjePH(prethodnoMjerenje) : undefined;
  const measurementNumber = ciklus.mjerenja.length + 1;

  const [form, setForm] = useState<FormState>({
    measurementType: initialType,
    measuredAt: toLocalDatetimeValue(now),
    phStr: initialValues?.ph != null ? String(initialValues.ph) : "",
    temperatureStr: "",
    foamLevel: initialValues?.foamLevel ?? "",
    colorIndicator: initialValues?.colorIndicator ?? "",
    visibleReaction: "",
    flowInputValue: initialValues?.flowLMin != null ? String(initialValues.flowLMin) : "",
    flowInputUnit: "l_min",
    tds: "",
    turbidity: "",
    sediment: "",
    smell: "",
    note: "",
    servisnaOcjena: "",
    minutesOverride: "",
  });

  // ── Voice input state (new system) ─────────────────────────────────────────
  const [voiceConfirm, setVoiceConfirm] = useState<{
    show: boolean;
    values: ParsedVoiceValues;
    fieldName?: string;
    originalValues: ParsedVoiceValues; // Track original voice values for comparison
  }>({ show: false, values: {}, originalValues: {} });

  // Track which fields were filled by voice (for mixed detection)
  const [voiceFilledFields, setVoiceFilledFields] = useState<Set<"ph" | "protok" | "temperatura">>(new Set());

  // ── Validation state ──────────────────────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState<{
    ph?: string;
    flow?: string;
    temperature?: string;
  }>({});
  const [validationWarnings, setValidationWarnings] = useState<{
    flow?: string;
    ph?: string;
  }>({});

  // ── Voice input handler ───────────────────────────────────────────────────
  const handleVoiceResult = useCallback((values: ParsedVoiceValues, fieldName?: string) => {
    // Track which fields were filled by voice
    const filledFields = new Set<"ph" | "protok" | "temperatura">();
    
    // Fill fields
    setForm((prev) => {
      const updates: Partial<FormState> = {};
      
      if (fieldName) {
        if (fieldName === "pH" && values.ph) { updates.phStr = values.ph; filledFields.add("ph"); }
        else if (fieldName === "protok" && values.protok) { updates.flowInputValue = values.protok; filledFields.add("protok"); }
        else if (fieldName === "temperatura" && values.temperatura) { updates.temperatureStr = values.temperatura; filledFields.add("temperatura"); }
      } else {
        if (values.ph) { updates.phStr = values.ph; filledFields.add("ph"); }
        if (values.protok) { updates.flowInputValue = values.protok; filledFields.add("protok"); }
        if (values.temperatura) { updates.temperatureStr = values.temperatura; filledFields.add("temperatura"); }
      }
      
      return { ...prev, ...updates };
    });

    // Update voice filled fields tracking
    setVoiceFilledFields((prev) => new Set([...prev, ...filledFields]));

    // Show confirmation panel if any value detected
    if (values.ph || values.protok || values.temperatura) {
      setVoiceConfirm({ show: true, values, fieldName, originalValues: { ...values } });
      setInputMethod("voice"); // Tentatively set to voice
    }
  }, []);

  const { isListening, startListening, stopListening } = useSpeechRecognition(handleVoiceResult);

  // Voice confirmation actions
  const handleVoiceConfirm = () => {
    // Check if any voice-filled value was manually changed
    const wasEdited = 
      (voiceConfirm.originalValues.ph && form.phStr !== voiceConfirm.originalValues.ph) ||
      (voiceConfirm.originalValues.protok && form.flowInputValue !== voiceConfirm.originalValues.protok) ||
      (voiceConfirm.originalValues.temperatura && form.temperatureStr !== voiceConfirm.originalValues.temperatura);
    
    if (wasEdited) {
      setInputMethod("mixed");
    }
    setVoiceConfirm({ show: false, values: {}, originalValues: {} });
  };
  
  const handleVoiceEditManually = () => {
    setInputMethod("mixed"); // User chose to edit manually
    setVoiceConfirm({ show: false, values: {}, originalValues: {} });
  };
  
  const handleVoiceRetry = () => {
    setVoiceConfirm({ show: false, values: {}, originalValues: {} });
    startListening(voiceConfirm.fieldName);
  };

  // Track manual edits to voice-filled fields
  const trackManualEdit = useCallback((fieldName: "phStr" | "flowInputValue" | "temperatureStr") => {
    if (voiceFilledFields.size > 0) {
      const fieldMap: Record<string, "ph" | "protok" | "temperatura"> = {
        phStr: "ph",
        flowInputValue: "protok",
        temperatureStr: "temperatura"
      };
      if (voiceFilledFields.has(fieldMap[fieldName])) {
        setInputMethod("mixed");
      }
    }
  }, [voiceFilledFields]);

  // ── Derived calculations ─────────────────────────────────────────────────

  const phNum = form.phStr !== "" ? parseFloat(form.phStr) : null;
  const measuredAtISO = useMemo(() => {
    const d = new Date(form.measuredAt);
    return isNaN(d.getTime()) ? nowISO() : d.toISOString();
  }, [form.measuredAt]);

  const minutesFromCycleStart = useMemo(() => {
    // For initial measurement: prefer manual override if entered
    if (form.minutesOverride !== "") {
      const v = parseInt(form.minutesOverride, 10);
      if (!isNaN(v) && v >= 0 && v <= 180) return v;
    }
    if (!ciklus.startDateTime) return undefined;
    const mins = minutesBetween(ciklus.startDateTime, measuredAtISO);
    return mins >= 0 ? Math.round(mins) : undefined;
  }, [ciklus.startDateTime, measuredAtISO, form.minutesOverride]);

  const minutesFromPrevious = useMemo(() => {
    if (!prethodnoMjerenje) return undefined;
    const mins = minutesBetween(getMjerenjeTimestamp(prethodnoMjerenje), measuredAtISO);
    return mins >= 0 ? Math.round(mins) : undefined;
  }, [prethodnoMjerenje, measuredAtISO]);

  // Initial measurement: no comparison to previous — it IS the baseline
  const isInitialCalc = form.measurementType === "initial_cycle_measurement";

  const phChange = !isInitialCalc && phNum !== null && prethodniPH !== undefined
    ? parseFloat((phNum - prethodniPH).toFixed(3))
    : undefined;

  const phRate = !isInitialCalc && phChange !== undefined && minutesFromPrevious !== undefined && minutesFromPrevious > 0
    ? parseFloat((phChange / minutesFromPrevious).toFixed(4))
    : undefined;

  const flowLMin = useMemo(() => {
    const v = parseFloat(form.flowInputValue);
    if (isNaN(v) || v <= 0) return null;
    return parseFloat(izracunajProtokLMin(v, form.flowInputUnit).toFixed(2));
  }, [form.flowInputValue, form.flowInputUnit]);

  const flowChangeFromInitial = flowLMin !== null && initialFlowLMin !== undefined
    ? parseFloat((flowLMin - initialFlowLMin).toFixed(2))
    : undefined;

  const previousFlowLMin = useMemo(() => {
    if (!prethodnoMjerenje?.flowLMin) return undefined;
    return prethodnoMjerenje.flowLMin;
  }, [prethodnoMjerenje]);

  const flowChangeFromPrevious = !isInitialCalc && flowLMin !== null && previousFlowLMin !== undefined
    ? parseFloat((flowLMin - previousFlowLMin).toFixed(2))
    : undefined;

  // Live interpretation (for inline pH card)
  const interpretacija = useMemo(() => {
    if (phNum === null) return null;
    return interpretirajMjerenje(
      phNum,
      phRate,
      form.foamLevel || undefined
    );
  }, [phNum, phRate, form.foamLevel]);

  // Live full recommendation card
  const livePreporuka = useMemo(() => {
    if (phNum === null) return null;
    const matWarning = materijal ? materijalUpozorenje(materijal) : null;
    const draftMjerenje: Mjerenje = {
      id: "draft",
      measurementType: form.measurementType,
      measuredAt: measuredAtISO,
      ph: phNum,
      minutesFromCycleStart,
      minutesFromPreviousMeasurement: minutesFromPrevious,
      previousPh: prethodniPH,
      phChange,
      phRatePerMinute: phRate,
      foamLevel: form.foamLevel || undefined,
      colorIndicator: form.colorIndicator || undefined,
      visibleReaction: form.visibleReaction || undefined,
      flowLMin: flowLMin ?? undefined,
      flowChangeFromInitial,
      flowChangeFromPrevious,
      turbidity: form.turbidity || undefined,
      sediment: form.sediment || undefined,
    };
    return generirajPreporuku({
      mjerenje: draftMjerenje,
      ciklus,
      previousMjerenje: prethodnoMjerenje,
      sessionId,
      subsessionId,
      materialWarning: matWarning,
      product: ciklus.productSnapshot ?? null,
      materialName: materijal ?? null,
      cleaningMode,
    });
  }, [
    phNum, form.measurementType, measuredAtISO, minutesFromCycleStart,
    minutesFromPrevious, prethodniPH, phChange, phRate, form.foamLevel,
    form.colorIndicator, form.visibleReaction, flowLMin, flowChangeFromInitial,
    flowChangeFromPrevious, form.turbidity, form.sediment,
    ciklus, prethodnoMjerenje, sessionId, subsessionId, materijal,
  ]);

  // ── Glasovni unos ─────────────────────────────────────────────────────────
  const [showVoice, setShowVoice] = useState(false);
  const [inputMethod, setInputMethod] = useState<"manual" | "voice" | "mixed">("manual");

  // Voice confirmation state — parsed but not yet applied
  type VoiceDraft = {
    phStr: string;
    flowStr: string;
    flowUnit: "l_min" | "sec_10l";
    tempStr: string;
    // track which fields were manually edited after voice
    edited: Set<"ph" | "flow" | "temp">;
    // sanity warnings
    warnings: string[];
  };
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);

  // Build warnings for a voice draft
  const buildWarnings = useCallback((
    ph: number | null,
    flow: number | null,
  ): string[] => {
    const warns: string[] = [];
    if (flow !== null && flow > 50) {
      warns.push(`Protok ${flow.toFixed(1)} L/min je neobično visok — moguća greška prepoznavanja.`);
    }
    if (ph !== null && prethodniPH != null && Math.abs(ph - prethodniPH) > 2.0) {
      warns.push(`pH razlika od prethodnog mjerenja je ${Math.abs(ph - prethodniPH).toFixed(2)} — vrijednost se značajno razlikuje.`);
    }
    if (previousFlowLMin != null && flow !== null && Math.abs(flow - previousFlowLMin) > previousFlowLMin * 0.5) {
      warns.push(`Protok se razlikuje za više od 50% od prethodnog mjerenja — provjeri vrijednost.`);
    }
    return warns;
  }, [prethodniPH, previousFlowLMin]);

  const handleGlasovni = useCallback((rezultat: GlasovniRezultat) => {
    const phStr = rezultat.ph !== undefined ? String(rezultat.ph) : "";
    const flowStr = rezultat.flowLMin !== undefined
      ? String(rezultat.flowLMin)
      : rezultat.flowSec !== undefined
        ? String(rezultat.flowSec)
        : "";
    const flowUnit: "l_min" | "sec_10l" = rezultat.flowSec !== undefined ? "sec_10l" : "l_min";
    const tempStr = rezultat.temperatureC !== undefined ? String(rezultat.temperatureC) : "";

    const phNum = phStr ? parseFloat(phStr) : null;
    const flowNum = flowStr ? parseFloat(flowStr) : null;
    const warns = buildWarnings(phNum, flowUnit === "l_min" ? flowNum : null);

    // Show confirmation UI — do NOT apply to form yet
    setVoiceDraft({ phStr, flowStr, flowUnit, tempStr, edited: new Set(), warnings: warns });
    setShowVoice(false);

    // Also prefill foam/color/note immediately (no sanity check needed)
    setForm((prev) => ({
      ...prev,
      ...(rezultat.foamLevel !== undefined ? { foamLevel: rezultat.foamLevel } : {}),
      ...(rezultat.colorIndicator !== undefined ? { colorIndicator: rezultat.colorIndicator } : {}),
      ...(rezultat.napomena ? { note: rezultat.napomena } : {}),
    }));
  }, [buildWarnings]);

  // Apply confirmed voice draft to form
  const handleConfirmVoice = useCallback(() => {
    if (!voiceDraft) return;
    const method = voiceDraft.edited.size > 0 ? "mixed" : "voice";
    setInputMethod(method);
    setForm((prev) => ({
      ...prev,
      ...(voiceDraft.phStr ? { phStr: voiceDraft.phStr } : {}),
      ...(voiceDraft.flowStr
        ? { flowInputValue: voiceDraft.flowStr, flowInputUnit: voiceDraft.flowUnit }
        : {}),
      ...(voiceDraft.tempStr ? { temperatureStr: voiceDraft.tempStr } : {}),
    }));
    setVoiceDraft(null);
  }, [voiceDraft]);

  // Edit a field in draft — marks as mixed
  const handleDraftChange = useCallback((
    field: "ph" | "flow" | "temp",
    value: string
  ) => {
    setVoiceDraft((prev) => {
      if (!prev) return prev;
      const newEdited = new Set(prev.edited);
      newEdited.add(field);
      const updated = {
        ...prev,
        ...(field === "ph" ? { phStr: value } : {}),
        ...(field === "flow" ? { flowStr: value } : {}),
        ...(field === "temp" ? { tempStr: value } : {}),
        edited: newEdited,
      };
      // Recalculate warnings on edit
      const phNum = updated.phStr ? parseFloat(updated.phStr) : null;
      const flowNum = updated.flowStr ? parseFloat(updated.flowStr) : null;
      updated.warnings = buildWarnings(phNum, updated.flowUnit === "l_min" ? flowNum : null);
      return updated;
    });
  }, [buildWarnings]);

  // Discard voice draft — go back to manual
  const handleDiscardVoice = useCallback(() => {
    setVoiceDraft(null);
    setInputMethod("manual");
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const fieldName = e.target.name as keyof FormState;
    setField(fieldName, e.target.value as FormState[keyof FormState]);
    
    // Clear validation errors when user edits field
    if (fieldName === "phStr") {
      setValidationErrors((prev) => ({ ...prev, ph: undefined }));
      setValidationWarnings((prev) => ({ ...prev, ph: undefined }));
    } else if (fieldName === "flowInputValue") {
      setValidationErrors((prev) => ({ ...prev, flow: undefined }));
      setValidationWarnings((prev) => ({ ...prev, flow: undefined }));
    } else if (fieldName === "temperatureStr") {
      setValidationErrors((prev) => ({ ...prev, temperature: undefined }));
    }
    
    // Track manual edits to voice-filled fields
    if (fieldName === "phStr" || fieldName === "flowInputValue" || fieldName === "temperatureStr") {
      trackManualEdit(fieldName);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // ── Validation ────────────────────────────────────────────────────────
    const errors: typeof validationErrors = {};
    const warnings: typeof validationWarnings = {};
    
    // pH validation (0-14)
    if (phNum === null || isNaN(phNum)) {
      errors.ph = "Provjerite vrijednost";
    } else if (phNum < 0 || phNum > 14) {
      errors.ph = "Provjerite vrijednost";
    }
    
    // Flow validation (> 0)
    const flowValue = form.flowInputValue ? parseFloat(form.flowInputValue) : null;
    if (flowValue !== null && flowValue <= 0) {
      errors.flow = "Provjerite vrijednost";
    }
    
    // Temperature validation (0-100)
    const tempValue = form.temperatureStr ? parseFloat(form.temperatureStr) : null;
    if (tempValue !== null && (tempValue < 0 || tempValue > 100)) {
      errors.temperature = "Provjerite vrijednost";
    }
    
    // If errors, stop and highlight
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    // ── Warnings (don't block, just inform) ───────────────────────────────
    // Flow > 50 warning
    if (flowValue !== null && flowValue > 50) {
      warnings.flow = "Provjerite vrijednost protoka – moguca greska glasovnog prepoznavanja";
    }
    
    // pH change > 2.0 warning
    if (phNum !== null && prethodniPH != null && Math.abs(phNum - prethodniPH) > 2.0) {
      warnings.ph = "Provjerite pH vrijednost – velika promjena";
    }
    
    // Show warnings but allow save
    setValidationWarnings(warnings);
    setValidationErrors({});
    
    // Existing validation
    if (phNum === null || isNaN(phNum)) return;

    const mjerenje: Mjerenje = {
      id: genId("mj"),
      sessionId,
      subsessionId,
      cycleId: ciklus.id,
      measurementNumber,
      measurementType: form.measurementType,
      measuredAt: measuredAtISO,
      timestamp: measuredAtISO, // legacy
      minutesFromCycleStart,
      minutesFromPreviousMeasurement: minutesFromPrevious,
      ph: phNum,
      pH: phNum, // legacy alias
      previousPh: isInitialCalc ? undefined : prethodniPH,
      phChange: isInitialCalc ? undefined : phChange,
      phRatePerMinute: isInitialCalc ? undefined : phRate,
      temperatureC: form.temperatureStr ? parseFloat(form.temperatureStr) : undefined,
      temperatura: form.temperatureStr ? parseFloat(form.temperatureStr) : undefined, // legacy
      foamLevel: form.foamLevel || undefined,
      colorIndicator: form.colorIndicator || undefined,
      visibleReaction: form.visibleReaction || undefined,
      flowInputValue: form.flowInputValue ? parseFloat(form.flowInputValue) : undefined,
      flowInputUnit: form.flowInputUnit,
      flowLMin: flowLMin ?? undefined,
      flowChangeFromInitial,
      flowChangeFromPrevious,
      tds: form.tds || undefined,
      turbidity: form.turbidity || undefined,
      sediment: form.sediment || undefined,
      smell: form.smell || undefined,
      note: form.note || undefined,
      napomena: form.note || undefined, // legacy
      inputMethod,
      interpretation: interpretacija?.tekst,
      preporuka: livePreporuka ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    onSave(mjerenje);
  }

  const isInitial = form.measurementType === "initial_cycle_measurement";

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Unesi mjerenje"
    >
      {/* Fixed header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-border bg-background shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-1.5 rounded-xl hover:bg-muted transition-colors"
          aria-label="Zatvori"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest mb-0.5">
            Ciklus #{ciklus.cycleNumber ?? ciklus.broj}
            {isInitial ? " — Referentno" : ` — Mjerenje #${ciklus.mjerenja.filter(m => m.measurementType !== "initial_cycle_measurement").length + 1}`}
          </p>
          <h1 className="text-xl font-black leading-tight tracking-tight text-foreground text-balance">
            {isInitial
              ? "Referentno mjerenje"
              : form.measurementType === "after_top_up"
                ? "Mjerenje nakon nadopune"
                : (form.measurementType === "final_cycle" || form.measurementType === "final_subsession" || form.measurementType === "final_session")
                  ? "Završno mjerenje"
                  : "Unesi mjerenje"}
          </h1>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <form
          id="mjerenje-form"
          onSubmit={handleSubmit}
          className="max-w-lg mx-auto w-full px-4 py-5 flex flex-col gap-6"
        >
          {/* ── 0. Shared data panel ─────────��───────────────────── */}
          <SharedDataPanel
            ciklus={ciklus}
            previousPh={prethodniPH}
            previousFlowLMin={previousFlowLMin}
          />

          {/* ── Glasovni unos ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2">

            {/* Trigger button */}
            {!voiceDraft && (
              <>
                <button
                  type="button"
                  onClick={() => setShowVoice((v) => !v)}
                  className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm border-2 transition-all active:scale-[0.98] ${
                    showVoice
                      ? "bg-primary/10 border-primary/50 text-primary"
                      : "bg-card border-border text-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                  style={{ minHeight: 52 }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  {showVoice ? "Zatvori glasovni unos" : "Glasovni unos"}
                </button>
                {!showVoice && (
                  <p className="text-[10px] text-muted-foreground/50 text-center">
                    Unesite vrijednosti glasom ili ručno u polja ispod.
                  </p>
                )}
                {showVoice && (
                  <GlasovniUnos
                    onParsed={handleGlasovni}
                    onSpremi={() => setShowVoice(false)}
                  />
                )}
              </>
            )}

            {/* ── Voice Confirm Panel — obavezna provjera prije primjene ──── */}
            {voiceDraft && (
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" className="text-primary shrink-0">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <span className="text-sm font-black text-primary">Prepoznate vrijednosti — provjeri i ispravi</span>
                  {voiceDraft.edited.size > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      Ručno ispravljeno
                    </span>
                  )}
                </div>

                {/* Warnings */}
                {voiceDraft.warnings.length > 0 && (
                  <div className="px-4 py-2.5 flex flex-col gap-1.5 border-b border-primary/20">
                    {voiceDraft.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 mt-0.5">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <p className="text-xs leading-snug">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Editable fields */}
                <div className="px-4 py-3 flex flex-col gap-3">
                  {/* pH */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      pH
                      {voiceDraft.edited.has("ph") && <span className="ml-1 text-amber-500">*</span>}
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" step="0.01" min="0" max="14"
                        value={voiceDraft.phStr}
                        onChange={(e) => handleDraftChange("ph", e.target.value)}
                        placeholder="0.00 – 14.00"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                          voiceDraft.phStr && (parseFloat(voiceDraft.phStr) < 0 || parseFloat(voiceDraft.phStr) > 14)
                            ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                            : voiceDraft.edited.has("ph")
                              ? "border-amber-400"
                              : "border-input"
                        }`}
                      />
                      <MicButton field="ph" label="Glasovni unos pH" onValue={(v) => handleDraftChange("ph", v)} />
                    </div>
                    {voiceDraft.phStr && (parseFloat(voiceDraft.phStr) < 0 || parseFloat(voiceDraft.phStr) > 14) && (
                      <p className="text-xs text-red-500">Provjeri unesenu vrijednost (0 – 14)</p>
                    )}
                  </div>

                  {/* Protok */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Protok ({voiceDraft.flowUnit === "sec_10l" ? "s / 10 L" : "L/min"})
                      {voiceDraft.edited.has("flow") && <span className="ml-1 text-amber-500">*</span>}
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" step="0.1" min="0"
                        value={voiceDraft.flowStr}
                        onChange={(e) => handleDraftChange("flow", e.target.value)}
                        placeholder="npr. 15.5"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                          voiceDraft.flowStr && parseFloat(voiceDraft.flowStr) <= 0
                            ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                            : voiceDraft.edited.has("flow")
                              ? "border-amber-400"
                              : "border-input"
                        }`}
                      />
                      <MicButton field="flow" label="Glasovni unos protoka" onValue={(v) => handleDraftChange("flow", v)} />
                    </div>
                    {voiceDraft.flowStr && parseFloat(voiceDraft.flowStr) <= 0 && (
                      <p className="text-xs text-red-500">Provjeri unesenu vrijednost (mora biti &gt; 0)</p>
                    )}
                  </div>

                  {/* Temperatura */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Temperatura (°C)
                      {voiceDraft.edited.has("temp") && <span className="ml-1 text-amber-500">*</span>}
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" step="0.5" min="0" max="100"
                        value={voiceDraft.tempStr}
                        onChange={(e) => handleDraftChange("temp", e.target.value)}
                        placeholder="npr. 45"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                          voiceDraft.tempStr && (parseFloat(voiceDraft.tempStr) < 0 || parseFloat(voiceDraft.tempStr) > 100)
                            ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                            : voiceDraft.edited.has("temp")
                              ? "border-amber-400"
                              : "border-input"
                        }`}
                      />
                      <MicButton field="temperature" label="Glasovni unos temperature" onValue={(v) => handleDraftChange("temp", v)} />
                    </div>
                    {voiceDraft.tempStr && (parseFloat(voiceDraft.tempStr) < 0 || parseFloat(voiceDraft.tempStr) > 100) && (
                      <p className="text-xs text-red-500">Provjeri unesenu vrijednost (0 – 100 °C)</p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="px-4 pb-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmVoice}
                    disabled={
                      !!(voiceDraft.phStr && (parseFloat(voiceDraft.phStr) < 0 || parseFloat(voiceDraft.phStr) > 14)) ||
                      !!(voiceDraft.flowStr && parseFloat(voiceDraft.flowStr) <= 0) ||
                      !!(voiceDraft.tempStr && (parseFloat(voiceDraft.tempStr) < 0 || parseFloat(voiceDraft.tempStr) > 100))
                    }
                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prihvati mjerenje
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setVoiceDraft(null); setShowVoice(true); }}
                      className="py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:border-primary/50 transition-all active:scale-[0.98]"
                    >
                      Ponovi glasovni
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardVoice}
                      className="py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"
                    >
                      Unesi ručno
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 1. Osnovni podaci ─────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Osnovni podaci</SectionTitle>

            {/* Vrsta mjerenja */}
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="measurementType">Vrsta mjerenja</FieldLabel>
              <select
                id="measurementType"
                value={form.measurementType}
                onChange={(e) => setField("measurementType", e.target.value as MeasurementType)}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.entries(MEASUREMENT_TYPE_LABELS) as [MeasurementType, string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  )
                )}
              </select>
            </div>

            {/* Datum i vrijeme — auto vs. manual toggle */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="measuredAt">Vrijeme uzimanja uzorka</FieldLabel>
                <div className="flex items-center rounded-lg border border-input overflow-hidden text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setField("measuredAt", toLocalDatetimeValue(new Date().toISOString()));
                    }}
                    className="px-2.5 py-1 bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                  >
                    Sad
                  </button>
                  <span className="px-2.5 py-1 text-muted-foreground bg-background">
                    Ručno
                  </span>
                </div>
              </div>
              <TextInput
                id="measuredAt" name="measuredAt" type="datetime-local"
                value={form.measuredAt} onChange={handleTextChange}
              />
              <p className="text-[10px] text-muted-foreground/70 leading-tight">
                Pritisnite &quot;Sad&quot; za automatski trenutni timestamp, ili uredite polje za ručni unos.
              </p>
            </div>

            {/* Auto-calculated time fields */}
            <div className="bg-muted/40 rounded-xl px-4 py-3 flex flex-col gap-2">
              <ReadOnlyRow
                label="Broj mjerenja"
                value={isInitial ? "Referentno mjerenje" : `#${ciklus.mjerenja.filter(m => m.measurementType !== "initial_cycle_measurement").length + 1}`}
              />

              {/* Initial measurement: editable time field */}
              {isInitial ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor="minutesOverride" className="text-[11px] font-semibold text-muted-foreground">
                    Vrijeme nakon ulijevanja sredstva (min)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="minutesOverride"
                      type="number"
                      min={0}
                      max={180}
                      step={1}
                      value={form.minutesOverride}
                      onChange={(e) => setField("minutesOverride", e.target.value)}
                      placeholder={minutesFromCycleStart !== undefined ? String(minutesFromCycleStart) : "npr. 3"}
                      className="w-24 border border-input rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">
                      {form.minutesOverride !== ""
                        ? `Uneseno: ${form.minutesOverride} min`
                        : minutesFromCycleStart !== undefined
                          ? `Auto: ${minutesFromCycleStart} min`
                          : "0–180 min"}
                    </span>
                  </div>
                </div>
              ) : (
                <ReadOnlyRow
                  label="Vrijeme od početka ciklusa"
                  value={minutesFromCycleStart !== undefined ? `${minutesFromCycleStart} min` : "—"}
                />
              )}

              {!isInitial && (
                <ReadOnlyRow
                  label="Vrijeme od prethodnog mjerenja"
                  value={minutesFromPrevious !== undefined ? `${minutesFromPrevious} min` : prethodnoMjerenje ? "—" : "Nema prethodnog mjerenja"}
                />
              )}
            </div>

            {/* Timing warnings for initial measurement */}
            {isInitial && ciklus.chemicalAddedAt && minutesFromCycleStart !== undefined && (
              minutesFromCycleStart < 1 ? (
                <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5 text-amber-600">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <p className="text-xs text-amber-800 leading-snug">
                    Mjerenje je možda prerano. Preporuka je pričekati približno 3 minute cirkulacije.
                  </p>
                </div>
              ) : minutesFromCycleStart > 15 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5 text-blue-600">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                  </svg>
                  <p className="text-xs text-blue-800 leading-snug">
                    Provjerite vrijeme. Referentno mjerenje se obično unosi nakon približno 3 minute cirkulacije.
                  </p>
                </div>
              ) : null
            )}
          </div>

          {/* ── 2. pH podaci ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>pH podaci</SectionTitle>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="phStr">
                {form.measurementType === "initial_cycle_measurement"
                  ? "pH otopine nakon ulijevanja sredstva *"
                  : form.measurementType === "after_top_up"
                    ? "pH otopine nakon nadopune *"
                    : form.measurementType === "final_cycle" || form.measurementType === "final_subsession" || form.measurementType === "final_session"
                      ? "pH vode nakon ispiranja *"
                      : "Trenutni pH otopine *"}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <TextInput
                    id="phStr" name="phStr" type="number" step="0.01" min="0"
                    value={form.phStr} onChange={handleTextChange} placeholder="npr. 2.8"
                    className={validationErrors.ph ? "border-red-500 focus:ring-red-500" : ""}
                  />
                  {validationErrors.ph && (
                    <span className="text-xs text-red-500 font-medium">{validationErrors.ph}</span>
                  )}
                  {validationWarnings.ph && !validationErrors.ph && (
                    <span className="text-xs text-amber-500 font-medium">{validationWarnings.ph}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => isListening ? stopListening() : startListening("pH")}
                  className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${
                    isListening ? "border-red-500 bg-red-500/20 text-red-500 animate-pulse" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="Glasovni unos pH"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {form.measurementType === "initial_cycle_measurement"
                  ? "Mjeri se nakon približno 3 minute cirkulacije/miješanja. Ovo je početna vrijednost za praćenje ciklusa."
                  : form.measurementType === "after_top_up"
                    ? "Unijeti nakon kratke cirkulacije nakon dodavanja sredstva u postojeću otopinu."
                    : form.measurementType === "final_cycle" || form.measurementType === "final_subsession" || form.measurementType === "final_session"
                      ? "Unijeti pH izlazne vode nakon ispiranja. Usporediti s pH ulazne/mrežne vode."
                      : "Unijeti pH uzorka tijekom cirkulacije. Aplikacija ga uspoređuje s prethodnim mjerenjem."}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl px-4 py-3 flex flex-col gap-1.5">
              <ReadOnlyRow
                label="pH prethodnog mjerenja"
                value={prethodniPH !== undefined ? prethodniPH.toFixed(2) : "Nema prethodnog mjerenja"}
              />
              <ReadOnlyRow
                label="Promjena pH"
                value={phChange !== undefined
                  ? `${phChange > 0 ? "+" : ""}${phChange.toFixed(3)}`
                  : "—"}
              />
              <ReadOnlyRow
                label="Brzina promjene pH/min"
                value={phRate !== undefined
                  ? `${phRate > 0 ? "+" : ""}${phRate.toFixed(4)} pH/min`
                  : "—"}
              />
            </div>

            {/* Live interpretation while typing */}
            {interpretacija && phNum !== null && (
              <InterpretacijaKartica
                ph={phNum}
                phRate={phRate}
                foam={form.foamLevel || undefined}
              />
            )}

            {/* Procjena boje i snage po pH — product-specific */}
            <ProcjenaBojePanel
              ph={phNum}
              indicatorZones={ciklus.productSnapshot?.indicatorZones ?? []}
              colorIndicators={ciklus.productSnapshot?.colorIndicators ?? []}
              selectedColor={form.colorIndicator}
              onColorChange={(name) =>
                setForm((prev) => ({ ...prev, colorIndicator: name as typeof prev.colorIndicator }))
              }
            />
          </div>

          {/* ── 3. Temperatura ───────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Temperatura</SectionTitle>
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="temperatureStr">Temperatura otopine (°C)</FieldLabel>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <TextInput
                    id="temperatureStr" name="temperatureStr" type="number" step="0.5"
                    value={form.temperatureStr} onChange={handleTextChange} placeholder="npr. 45"
                    className={validationErrors.temperature ? "border-red-500 focus:ring-red-500" : ""}
                  />
                  {validationErrors.temperature && (
                    <span className="text-xs text-red-500 font-medium">{validationErrors.temperature}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => isListening ? stopListening() : startListening("temperatura")}
                  className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${
                    isListening ? "border-red-500 bg-red-500/20 text-red-500 animate-pulse" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="Glasovni unos temperature"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── 4. Indikatori reakcije ────��───────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Indikatori reakcije</SectionTitle>

            <div className="flex flex-col gap-1">
              <FieldLabel>Pjena</FieldLabel>
              <SelectField<FoamLevel>
                name="foamLevel"
                value={form.foamLevel}
                onChange={(v) => setField("foamLevel", v)}
                options={["nema", "slaba", "srednja", "jaka", "vrlo_jaka"]}
                labels={FOAM_LABELS}
              />
              <FoamHelper />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Boja sredstva</FieldLabel>
              <SelectField<ColorIndicator>
                name="colorIndicator"
                value={form.colorIndicator}
                onChange={(v) => setField("colorIndicator", v)}
                options={["plava", "plavo_zelena", "zelena", "zuta", "smeda", "bez_boje", "nije_primjenjivo"]}
                labels={COLOR_LABELS}
              />
              {/* Colour stage reference guide — shown only when product has colour indicator */}
              {ciklus.productSnapshot?.hasColorIndicator && ciklus.productSnapshot.colorIndicators?.length > 0 && (
                <div className="bg-muted/40 border border-border rounded-xl px-3 py-2 flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Faze boje — {ciklus.productSnapshot.name}
                  </p>
                  {ciklus.productSnapshot.colorIndicators.map((ci) => (
                    <div key={ci.id} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 shrink-0 w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: ci.colorHex ?? "#888" }}
                      />
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-foreground">{ci.colorName}</span>
                        <span className="text-[11px] text-muted-foreground"> — {ci.meaning}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>Vidljiva reakcija</FieldLabel>
              <SelectField<VisibleReaction>
                name="visibleReaction"
                value={form.visibleReaction}
                onChange={(v) => setField("visibleReaction", v)}
                options={["nema", "slaba", "normalna", "jaka", "vrlo_jaka"]}
                labels={REACTION_LABELS}
              />
            </div>
          </div>

          {/* ── 5. Mjerenje protoka ────────────��─────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>
              {isInitial ? "Protok nakon ulijevanja sredstva" : "Mjerenje protoka"}
            </SectionTitle>

            {isInitial && (
              <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
                Unijeti ako je protok izmjeren nakon početne cirkulacije.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="flowInputValue">
                  {isInitial ? "Protok" : "Vrijednost protoka"}
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <TextInput
                      id="flowInputValue" name="flowInputValue" type="number" step="0.1" min="0"
                      value={form.flowInputValue} onChange={handleTextChange} placeholder="npr. 15"
                      className={validationErrors.flow ? "border-red-500 focus:ring-red-500" : ""}
                    />
                    {validationErrors.flow && (
                      <span className="text-xs text-red-500 font-medium">{validationErrors.flow}</span>
                    )}
                    {validationWarnings.flow && !validationErrors.flow && (
                      <span className="text-xs text-amber-500 font-medium">{validationWarnings.flow}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => isListening ? stopListening() : startListening("protok")}
                    className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${
                      isListening ? "border-red-500 bg-red-500/20 text-red-500 animate-pulse" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    aria-label="Glasovni unos protoka"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="flowInputUnit">Jedinica</FieldLabel>
                <select
                  id="flowInputUnit"
                  value={form.flowInputUnit}
                  onChange={(e) => setField("flowInputUnit", e.target.value as JedinicaProtoka)}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="l_min">L/min</option>
                  <option value="sec_10l">sek za 10 L</option>
                </select>
              </div>
            </div>

            {flowLMin !== null && (
              <div className="bg-muted/40 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                <ReadOnlyRow
                  label="Izračunati protok"
                  value={`${flowLMin} L/min`}
                />
                {flowChangeFromInitial !== undefined && (
                  <ReadOnlyRow
                    label="Promjena vs. početni protok"
                    value={`${flowChangeFromInitial > 0 ? "+" : ""}${flowChangeFromInitial} L/min`}
                  />
                )}
                {flowChangeFromPrevious !== undefined && (
                  <ReadOnlyRow
                    label="Promjena vs. prethodno mjerenje"
                    value={`${flowChangeFromPrevious > 0 ? "+" : ""}${flowChangeFromPrevious} L/min`}
                  />
                )}
              </div>
            )}
          </div>

          {/* ── 6. Kvaliteta otopine ─────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Kvaliteta vode / otopine</SectionTitle>

            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="tds">TDS / Provodljivost</FieldLabel>
              <TextInput
                id="tds" name="tds" value={form.tds}
                onChange={handleTextChange} placeholder="npr. 850 µS/cm"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <FieldLabel>Zamućenost</FieldLabel>
                <SelectField<Turbidity>
                  name="turbidity"
                  value={form.turbidity}
                  onChange={(v) => setField("turbidity", v)}
                  options={["nema", "slaba", "srednja", "jaka"]}
                  labels={{ nema: "Nema", slaba: "Slaba", srednja: "Srednja", jaka: "Jaka" }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel>Talog</FieldLabel>
                <SelectField<Sediment>
                  name="sediment"
                  value={form.sediment}
                  onChange={(v) => setField("sediment", v)}
                  options={["nema", "malo", "srednje", "puno"]}
                  labels={{ nema: "Nema", malo: "Malo", srednje: "Srednje", puno: "Puno" }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel>Miris</FieldLabel>
                <SelectField<Smell>
                  name="smell"
                  value={form.smell}
                  onChange={(v) => setField("smell", v)}
                  options={["nema", "slab", "jak"]}
                  labels={{ nema: "Nema", slab: "Slab", jak: "Jak" }}
                />
              </div>
            </div>
          </div>

          {/* ── 7. Napomene ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Napomene</SectionTitle>

            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="note">Napomena mjerenja</FieldLabel>
              <textarea
                id="note" name="note" value={form.note} onChange={handleTextChange}
                rows={2} placeholder="Opažanja, vidljiva reakcija, posebnosti..."
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
              />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="servisnaOcjena">Servisna procjena</FieldLabel>
              <textarea
                id="servisnaOcjena" name="servisnaOcjena" value={form.servisnaOcjena}
                onChange={handleTextChange} rows={2}
                placeholder="Procjena stanja sustava, preporuka..."
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 border-t border-border bg-background px-4 pt-4 pb-5 flex flex-col gap-3 max-w-lg mx-auto w-full">
        {/* Live recommendation card — shown as soon as pH is entered */}
        {/* Warning when cycle has no product defined */}
        {!ciklus.productSnapshot && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <svg className="shrink-0 mt-0.5 text-amber-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              Ciklus nema definirano sredstvo. Preporuke ce biti genericki izracunate bez podataka o proizvodu.
            </p>
          </div>
        )}
        {livePreporuka && (
          <PreporukaKartica preporuka={livePreporuka} />
        )}

        {/* Voice confirmation panel */}
        {voiceConfirm.show && (
          <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="text-emerald-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              <span className="text-sm font-semibold text-emerald-400">Glasovni unos detektiran</span>
            </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {voiceConfirm.values.ph && (
                <span className="text-foreground">pH: <strong>{voiceConfirm.values.ph}</strong></span>
              )}
              {voiceConfirm.values.protok && (
                <span className="text-foreground">Protok: <strong>{voiceConfirm.values.protok}</strong> L/min</span>
              )}
              {voiceConfirm.values.temperatura && (
                <span className="text-foreground">Temp: <strong>{voiceConfirm.values.temperatura}</strong> °C</span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleVoiceConfirm}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-xs font-semibold hover:bg-emerald-600 active:scale-[0.98] transition-all"
              >
                Potvrdi
              </button>
              <button
                type="button"
                onClick={handleVoiceEditManually}
                className="flex-1 bg-muted border border-border text-foreground rounded-lg py-2 text-xs font-medium hover:bg-muted/80 active:scale-[0.98] transition-all"
              >
                Uredi rucno
              </button>
              <button
                type="button"
                onClick={handleVoiceRetry}
                className="flex-1 bg-muted border border-border text-foreground rounded-lg py-2 text-xs font-medium hover:bg-muted/80 active:scale-[0.98] transition-all"
              >
                Ponovi
              </button>
            </div>
          </div>
        )}

        {/* Global voice input button */}
        {!voiceConfirm.show && (
          <button
            type="button"
            onClick={() => isListening ? stopListening() : startListening()}
            className={`w-full flex items-center justify-center gap-2 border rounded-xl py-3 font-medium text-sm active:scale-[0.98] transition-all ${
              isListening
                ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse"
                : "bg-muted border-border text-foreground hover:bg-muted/80"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {isListening ? "Slusam..." : "Glasovni unos"}
          </button>
        )}

        <button
          type="submit"
          form="mjerenje-form"
          className="w-full bg-primary text-primary-foreground rounded-2xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
          style={{ minHeight: 56 }}
        >
          {isInitial ? "Spremi referentno mjerenje" : "Spremi mjerenje"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full border border-border text-muted-foreground rounded-2xl py-3.5 font-semibold text-sm hover:bg-muted/50 active:scale-[0.98] transition-all"
          style={{ minHeight: 48 }}
        >
          Odustani
        </button>
      </div>
    </div>
  );
}
