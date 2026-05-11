"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { DRAFT_KEYS, readDraft, writeDraft, clearDraft } from "@/lib/draft-state";
import type {
  Mjerenje,
  MeasurementType,
  FoamLevel,
  ColorIndicator,
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
} from "@/lib/types";
import { generirajPreporuku } from "@/lib/preporuka";
import { nadjiIndikatorZonu, SNAGA_SREDSTVA_LABELS } from "@/lib/product-types";
import type { SnagaSredstva } from "@/lib/product-types";
import { resolveChemicalStrength } from "@/lib/chemical-strength-matrix";
import { MjerenjeTimer } from "./mjerenje-timer";
import { PreporukaKartica } from "./preporuka-kartica";

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { genId, nowISO } from "@/lib/utils";

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

function formatDuration(startIso: string): string {
  const mins = Math.round(minutesBetween(startIso, new Date().toISOString()));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ─── Mic Button for voice input ───────────────────────────────────────────────

// Convert Croatian words to numbers
function parseHrVoiceNumber(text: string): string | null {
  const t = text.toLowerCase().trim();
  
  // Direct number match first (e.g., "2.5", "20", "1,3")
  const directMatch = t.match(/(\d+)[.,](\d+)/);
  if (directMatch) {
    return directMatch[1] + "." + directMatch[2];
  }
  
  // Single number (e.g., "20", "5")
  const singleMatch = t.match(/(\d+)/);
  if (singleMatch) {
    return singleMatch[1];
  }
  
  // Croatian word numbers
  const words: Record<string, number> = {
    "nula": 0, "jedan": 1, "jedna": 1, "dva": 2, "dvije": 2, "tri": 3, 
    "četiri": 4, "cetiri": 4, "pet": 5, "šest": 6, "sest": 6, 
    "sedam": 7, "osam": 8, "devet": 9, "deset": 10,
    "jedanaest": 11, "dvanaest": 12, "trinaest": 13, "četrnaest": 14, "cetrnaest": 14,
    "petnaest": 15, "šesnaest": 16, "sesnaest": 16, "sedamnaest": 17, 
    "osamnaest": 18, "devetnaest": 19, "dvadeset": 20,
    "trideset": 30, "četrdeset": 40, "cetrdeset": 40, "pedeset": 50,
    "šezdeset": 60, "sezdeset": 60, "sedamdeset": 70, "osamdeset": 80, "devedeset": 90,
    "sto": 100
  };
  
  // Check for "X zarez Y" pattern (e.g., "jedan zarez tri" = 1.3)
  const zarezMatch = t.match(/(.+?)\s*(?:zarez|točka|tocka|zapeta)\s*(.+)/);
  if (zarezMatch) {
    const beforeZarez = zarezMatch[1];
    const afterZarez = zarezMatch[2];
    
    let mainNum = 0;
    let decimalNum = 0;
    
    // Parse number before zarez
    for (const [word, num] of Object.entries(words)) {
      if (beforeZarez.includes(word)) {
        mainNum = num;
        break;
      }
    }
    
    // Parse number after zarez
    for (const [word, num] of Object.entries(words)) {
      if (afterZarez.includes(word) && num < 10) {
        decimalNum = num;
        break;
      }
    }
    
    if (mainNum > 0 || decimalNum > 0) {
      return mainNum + "." + decimalNum;
    }
  }
  
  // Simple word number (no decimal)
  let result = 0;
  let found = false;
  
  // Check for "i pol" = .5
  const hasHalf = t.includes("pol") || t.includes("pola");
  
  // Parse main number - check longer words first
  const sortedWords = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sortedWords) {
    if (t.includes(word)) {
      if (num >= 20 && num <= 90 && num % 10 === 0) {
        result += num;
        found = true;
      } else if (found && num < 10) {
        result += num;
      } else {
        result = num;
        found = true;
      }
    }
  }
  
  if (found) {
    if (hasHalf) {
      return result + ".5";
    }
    return String(result);
  }
  
  return null;
}

function MicButton({ 
  onResult, 
  fieldName,
  className = ""
}: { 
  onResult: (value: string) => void; 
  fieldName: string;
  className?: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultRef = useRef(false);

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setIsListening(true);
    setTranscript("");
    hasResultRef.current = false;
    
    const rec: SpeechRecognition = new SR();
    rec.lang = "hr-HR";
    rec.continuous = true;
    rec.interimResults = true; // Show real-time transcript

    // Auto-stop after 30 seconds
    timeoutRef.current = setTimeout(() => {
      rec.stop();
    }, 30000);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Collect all text
      let fullText = "";
      for (let i = 0; i < e.results.length; i++) {
        fullText += e.results[i][0].transcript + " ";
      }
      setTranscript(fullText.trim());
      
      if (hasResultRef.current) return;
      
      // Process when we have a final result
      const lastResult = e.results[e.results.length - 1];
      if (lastResult.isFinal) {
        const parsed = parseHrVoiceNumber(fullText);
        if (parsed) {
          hasResultRef.current = true;
          onResult(parsed);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setTimeout(() => rec.stop(), 200);
        }
      }
    };

    rec.onerror = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsListening(false);
      setTranscript("");
    };

    rec.onend = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsListening(false);
      setTranscript("");
    };

    recRef.current = rec;
    rec.start();
  }, [onResult]);

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    recRef.current?.stop();
    setIsListening(false);
    setTranscript("");
  }, []);

  // Determine icon size based on className
  const isSmall = className?.includes("w-8") || className?.includes("w-9");
  const isMedium = className?.includes("w-12") || className?.includes("w-14");
  const isLarge = className?.includes("w-16");
  const iconSize = isSmall ? 14 : isMedium ? 20 : isLarge ? 26 : 22;

  return (
    <div className="shrink-0 flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={isListening ? stop : start}
        aria-label={`Glasovni unos za ${fieldName}`}
        className={`flex items-center justify-center border transition-all active:scale-95 ${
          isListening 
            ? "border-red-500 bg-red-500/20 text-red-500 animate-pulse" 
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
        } ${className || "w-14 h-14 rounded-2xl border-2"}`}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
      {isListening && transcript && (
        <span className="text-[10px] text-red-400 max-w-[80px] truncate text-center">
          {transcript}
        </span>
      )}
    </div>
  );
}

// ─── Foam helper ──────────────────────────────────────────────────────────────

const FOAM_HELPER_ITEMS = [
  { label: "Nema",      desc: "nema reakcije ili malo kamenca" },
  { label: "Slaba",     desc: "reakcija pri kraju ili mala količina kamenca" },
  { label: "Srednja",   desc: "normalna aktivna reakcija" },
  { label: "Jaka",      desc: "aktivno otapanje kamenca" },
  { label: "Vrlo jaka", desc: "jaka reakcija / puno aktivnog kamenca / svježa kemija" },
] as const;

function FoamHelperCollapsible() {
  const [open, setOpen] = React.useState(false);
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

// ─── Chip button ──────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
  size = "md",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "px-5 py-3 text-base font-bold"
      : size === "sm"
      ? "px-3 py-2 text-xs font-semibold"
      : "px-4 py-2.5 text-sm font-semibold";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${sizeClass} rounded-xl border transition-all active:scale-95 ${
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SekcijaHeader({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {required && (
        <span className="text-[10px] font-bold text-destructive uppercase tracking-widest">
          *
        </span>
      )}
    </div>
  );
}

// ─── pH quick presets ─────────────────────────────────────────────────────────

const PH_PRESETS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0];

// ─── Foam options ─────────────────────────────────────────────────────────────

const FOAM_OPTIONS: { value: FoamLevel; label: string }[] = [
  { value: "nema", label: "Nema" },
  { value: "slaba", label: "Slaba" },
  { value: "srednja", label: "Srednja" },
  { value: "jaka", label: "Jaka" },
  { value: "vrlo_jaka", label: "Vrlo jaka" },
];

// ─── Color options ────────────────────────────────────────────────────────────

const COLOR_OPTIONS: { value: ColorIndicator; label: string }[] = [
  { value: "bez_boje", label: "Prozirna" },
  { value: "plava", label: "Blaga" },
  { value: "plavo_zelena", label: "Aktivna" },
  { value: "zelena", label: "Slabi" },
  { value: "zuta", label: "Iscrpljena" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BrziUnosMjerenjaProps {
  ciklus: Ciklus;
  sessionId: string;
  subsessionId?: string;
  initialType: MeasurementType;
  /** baseline flow from subsession */
  initialFlowLMin?: number;
  materijal?: string;
  cleaningMode?: CleaningMode;
  /** Naziv objekta — shown in context strip */
  nazivObjekta?: string;
  /** Dio sustava — shown in context strip */
  dioSustava?: string;
  onSave: (m: Mjerenje) => void;
  onClose: () => void;
}

// ─── Draft type ───────────────────────────────────────────────────────────────

interface MjerenjeDraft {
  phStr: string;
  foamLevel: FoamLevel | "";
  colorIndicator: ColorIndicator | "";
  bubblesPresent?: boolean;
  magnetFilterActive?: boolean;
  flowValue: string;
  flowUnit: JedinicaProtoka;
  tds: string;
  ec: string;
  tempStr: string;
  tempInStr: string;
  tempOutStr: string;
  note: string;
  timeStr: string;
  dateStr: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BrziUnosMjerenja({
  ciklus,
  sessionId,
  subsessionId,
  initialType,
  initialFlowLMin,
  materijal,
  cleaningMode,
  nazivObjekta,
  dioSustava,
  onSave,
  onClose,
}: BrziUnosMjerenjaProps) {
  const isInitial = initialType === "initial_cycle_measurement";

  // Sorted previous measurements
  const sortedMjerenja = useMemo(
    () =>
      [...ciklus.mjerenja].sort(
        (a, b) =>
          new Date(getMjerenjeTimestamp(b)).getTime() -
          new Date(getMjerenjeTimestamp(a)).getTime()
      ),
    [ciklus.mjerenja]
  );
  const prethodno = sortedMjerenja[0];
  const prethodniPH = prethodno ? getMjerenjePH(prethodno) : undefined;
  const pocetnoMj = pocetnoMjerenjeCiklusa(ciklus);
  const pocetniPH = pocetnoMj ? getMjerenjePH(pocetnoMj) : undefined;
  const measurementNumber = ciklus.mjerenja.length + 1;

  // ── Draft key — per cycle so each cycle's draft is independent ─────────────
  const draftKey = DRAFT_KEYS.mjerenje(ciklus.id);
  const savedDraft = readDraft<MjerenjeDraft>(draftKey);

  // ── Form state — initialised from draft ────────────────────────────────────
  const [phStr, setPhStr] = useState(savedDraft?.phStr ?? "");
  const [foamLevel, setFoamLevel] = useState<FoamLevel | "">(savedDraft?.foamLevel ?? "");
  const [colorIndicator, setColorIndicator] = useState<string>(savedDraft?.colorIndicator ?? "");
  const [bubblesPresent, setBubblesPresent] = useState<boolean | undefined>(savedDraft?.bubblesPresent);
  const [magnetFilterActive, setMagnetFilterActive] = useState<boolean | undefined>(savedDraft?.magnetFilterActive);
  const [flowValue, setFlowValue] = useState(savedDraft?.flowValue ?? "");
  const [flowUnit, setFlowUnit] = useState<JedinicaProtoka>(savedDraft?.flowUnit ?? "l_min");
  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tds, setTds] = useState(savedDraft?.tds ?? "");
  const [ec, setEc] = useState(savedDraft?.ec ?? "");
  const [tempStr, setTempStr] = useState(savedDraft?.tempStr ?? "");
  const [note, setNote] = useState(savedDraft?.note ?? "");
  // Temperature inlet/outlet (optional, collapsed by default)
  const [showTemp, setShowTemp] = useState(false);
  const [tempInStr, setTempInStr] = useState(savedDraft?.tempInStr ?? "");
  const [tempOutStr, setTempOutStr] = useState(savedDraft?.tempOutStr ?? "");
  // Slobodan unos vremena i datuma mjerenja — inicijalizirano na trenutni datum/vrijeme
  const [timeStr, setTimeStr] = useState(() => {
    if (savedDraft?.timeStr) return savedDraft.timeStr;
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [dateStr, setDateStr] = useState(() => {
    if (savedDraft?.dateStr) return savedDraft.dateStr;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // Validation
  const [touched, setTouched] = useState(false);

  // ── Persist draft on every change ──────────────────────────────────────────
  useEffect(() => {
    writeDraft<MjerenjeDraft>(draftKey, {
      phStr, foamLevel, colorIndicator: colorIndicator as ColorIndicator | "", bubblesPresent, magnetFilterActive, flowValue, flowUnit, tds, ec, tempStr, tempInStr, tempOutStr, note, timeStr, dateStr,
    });
  }, [draftKey, phStr, foamLevel, colorIndicator, bubblesPresent, magnetFilterActive, flowValue, flowUnit, tds, ec, tempStr, tempInStr, tempOutStr, note, timeStr, dateStr]);

  // ── Reset function ──────────────────────────────────────────────────────────
  const handleReset = () => {
    setPhStr("");
    setFoamLevel("");
    setColorIndicator("");
    setBubblesPresent(undefined);
    setMagnetFilterActive(undefined);
    setFlowValue("");
    setFlowUnit("l_min");
    setTds("");
    setEc("");
    setTempStr("");
    setTempInStr("");
    setTempOutStr("");
    setNote("");
    setTouched(false);
    // Reset time to current
    const d = new Date();
    setTimeStr(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setDateStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    // Clear draft
    clearDraft(draftKey);
  };

  // ── Derived values ────────────────────────���────────────────────────────────
  const phNum = phStr !== "" ? parseFloat(phStr) : null;
  const now = nowISO();

  // Prilagodeno vrijeme mjerenja — kombinira datum i HH:MM unos tehničara
  const customTimestamp = useMemo(() => {
    if (
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) &&
      timeStr && /^\d{2}:\d{2}$/.test(timeStr)
    ) {
      const iso = `${dateStr}T${timeStr}:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
      const base = new Date();
      const [hh, mm] = timeStr.split(":").map(Number);
      base.setHours(hh, mm, 0, 0);
      return base.toISOString();
    }
    return now;
  }, [dateStr, timeStr, now]);

  // Minute izračuni — koriste customTimestamp (unos tehničara), ne automatski now
  const minutesFromCycleStart = useMemo(() => {
    if (!ciklus.startDateTime) return undefined;
    const mins = minutesBetween(ciklus.startDateTime, customTimestamp);
    return mins >= 0 ? Math.round(mins) : undefined;
  }, [ciklus.startDateTime, customTimestamp]);

  const minutesFromPrevious = useMemo(() => {
    if (!prethodno) return undefined;
    const mins = minutesBetween(getMjerenjeTimestamp(prethodno), customTimestamp);
    return mins >= 0 ? Math.round(mins) : undefined;
  }, [prethodno, customTimestamp]);

  const phChange =
    !isInitial && phNum !== null && prethodniPH !== undefined
      ? parseFloat((phNum - prethodniPH).toFixed(3))
      : undefined;

  const phRate =
    phChange !== undefined &&
    minutesFromPrevious !== undefined &&
    minutesFromPrevious > 0
      ? parseFloat((phChange / minutesFromPrevious).toFixed(4))
      : undefined;

  const flowLMin = useMemo(() => {
    const v = parseFloat(flowValue);
    if (isNaN(v) || v <= 0) return null;
    return parseFloat(izracunajProtokLMin(v, flowUnit).toFixed(2));
  }, [flowValue, flowUnit]);

  const flowConvertedDisplay = useMemo(() => {
    if (flowUnit !== "sec_10l" || flowLMin === null) return null;
    return flowLMin;
  }, [flowUnit, flowLMin]);

  const flowChangeFromInitial =
    flowLMin !== null && initialFlowLMin !== undefined
      ? parseFloat((flowLMin - initialFlowLMin).toFixed(2))
      : undefined;

  const previousFlowLMin = prethodno?.flowLMin;

  const flowChangeFromPrevious =
    !isInitial && flowLMin !== null && previousFlowLMin !== undefined
      ? parseFloat((flowLMin - previousFlowLMin).toFixed(2))
      : undefined;

  // Live interpretation (DS-3 style - pH based)
  const interpretacija = useMemo(() => {
    if (phNum === null) return null;
    return interpretirajMjerenje(phNum, phRate, foamLevel || undefined);
  }, [phNum, phRate, foamLevel]);

  // ScaleBreaker FX interpretation (color + bubbles)
  const isScaleBreakerProduct = ciklus.productSnapshot?.indicatorType === "color+bubbles" ||
    ciklus.productSnapshot?.name?.toLowerCase().includes("scalebreaker");

  // Fernox DS-40 detekcija (color + foam + sludge)
  const isDS40Product = ciklus.productSnapshot?.indicatorType === "color+foam+sludge" ||
    ciklus.productSnapshot?.name?.toLowerCase().includes("ds-40") ||
    ciklus.productSnapshot?.name?.toLowerCase().includes("ds40");

  // Rector / Miloc BCP detekcija (color + bubbles + pH) — koristi bubblesPresent + visibleReaction, isto kao FX
  const isRectorBCPProduct = ciklus.productSnapshot?.indicatorType === "color+bubbles+pH" ||
    ciklus.productSnapshot?.name?.toLowerCase().includes("rector") ||
    (ciklus.productSnapshot?.brand as string | undefined)?.toLowerCase().includes("rector");

  const scaleBreakerInterpretacija = useMemo(() => {
    if (!isScaleBreakerProduct) return null;
    if (!colorIndicator) return null;
    
    const color = colorIndicator.toLowerCase();
    const isRoze = color.includes("roze") || color.includes("rose") || color.includes("pink") || color.includes("blijedo");
    const isZuckasta = color.includes("žućkasta") || color.includes("zuckasta") || color.includes("žuta") || color.includes("zuta");
    
    // Roze + mjehurići DA
    if (isRoze && bubblesPresent === true) {
      return {
        status: "reakcija_aktivna" as const,
        message: "Aktivno otapanje kamenca (CO₂ reakcija).",
        action: "NASTAVITI ČIŠĆENJE",
        actionColor: "bg-green-900/50 text-green-300 border-green-700",
      };
    }
    
    // Roze + mjehurići NE
    if (isRoze && bubblesPresent === false) {
      return {
        status: "reakcija_zavrsena" as const,
        message: "Nema više mjehurića, a otopina je i dalje roze — čišćenje završeno.",
        action: "ZAVRŠITI CIKLUS",
        actionColor: "bg-blue-900/50 text-blue-300 border-blue-700",
      };
    }
    
    // Žućkasta (neovisno o mjehurićima)
    if (isZuckasta) {
      return {
        status: "sredstvo_potroseno" as const,
        message: "Otopina je promijenila boju u žućkastu — sredstvo je potrošeno.",
        action: "DODATI KEMIJU ILI PONOVITI CIKLUS",
        actionColor: "bg-amber-900/50 text-amber-300 border-amber-700",
      };
    }
    
    return null;
  }, [isScaleBreakerProduct, colorIndicator, bubblesPresent]);

  // ── pH → indicator zone auto-calculation ──────────────────────────────────
  const indicatorZones = ciklus.productSnapshot?.indicatorZones ?? [];
  const phBasedZona = useMemo(
    () => (phNum !== null && indicatorZones.length > 0 ? nadjiIndikatorZonu(phNum, indicatorZones) : null),
    [phNum, indicatorZones]
  );
  // Strength from manual color selection — direct colorName match in indicatorZones
  const colorBasedStrength: SnagaSredstva | null = useMemo(() => {
    if (!colorIndicator || indicatorZones.length === 0) return null;
    const match = indicatorZones.find(
      (z) => z.colorName && z.colorName.toLowerCase() === colorIndicator.toLowerCase()
    ) ?? indicatorZones.find(
      (z) => z.colorName && (
        z.colorName.toLowerCase().includes(colorIndicator.toLowerCase()) ||
        colorIndicator.toLowerCase().includes(z.colorName.toLowerCase())
      )
    );
    return match?.strength ?? null;
  }, [colorIndicator, indicatorZones]);

  // ── Chemical Strength Matrix (spec: document-HmyH6) ─────────────────────────
  const strengthMatrix = useMemo(
    () => resolveChemicalStrength(phBasedZona?.strength ?? null, colorBasedStrength),
    [phBasedZona, colorBasedStrength]
  );

  const finalStrength   = strengthMatrix.finalStrength;
  const colorMismatch   = strengthMatrix.warning;
  const mismatchMessage = strengthMatrix.warningMessage;

  // Live recommendation (for post-save)
  const livePreporuka = useMemo(() => {
    if (phNum === null) return null;
    const draftMjerenje: Mjerenje = {
      id: "draft",
      measurementType: initialType,
      measuredAt: customTimestamp,
      ph: phNum,
      minutesFromCycleStart,
      minutesFromPreviousMeasurement: minutesFromPrevious,
      previousPh: prethodniPH,
      phChange: isInitial ? undefined : phChange,
      phRatePerMinute: isInitial ? undefined : phRate,
      foamLevel: foamLevel || undefined,
      colorIndicator: (colorIndicator || undefined) as ColorIndicator | undefined,
      flowLMin: flowLMin ?? undefined,
      flowChangeFromInitial,
      flowChangeFromPrevious,
    };
    return generirajPreporuku({
      mjerenje: draftMjerenje,
      ciklus,
      previousMjerenje: prethodno,
      sessionId,
      subsessionId,
      materialWarning: null,
      product: ciklus.productSnapshot ?? null,
      materialName: materijal ?? null,
      cleaningMode,
    });
  }, [
    phNum, initialType, customTimestamp, minutesFromCycleStart, minutesFromPrevious,
    prethodniPH, isInitial, phChange, phRate, foamLevel, colorIndicator,
    flowLMin, flowChangeFromInitial, flowChangeFromPrevious,
    ciklus, prethodno, sessionId, subsessionId, materijal, cleaningMode,
  ]);

  // Temperature inlet/outlet derived values
  const tempInNum = tempInStr !== "" ? parseFloat(tempInStr) : null;
  const tempOutNum = tempOutStr !== "" ? parseFloat(tempOutStr) : null;
  const deltaTCNum =
    tempInNum !== null && tempOutNum !== null && !isNaN(tempInNum) && !isNaN(tempOutNum)
      ? parseFloat((tempOutNum - tempInNum).toFixed(1))
      : null;

  const phValid = phNum !== null && !isNaN(phNum) && phNum >= 0 && phNum <= 14;
  const canSave = phValid;

  // ── Submit ───────────────────────────────────────────────────────────────���─
  function handleSave() {
    setTouched(true);
    if (!canSave) return;

    const mjerenje: Mjerenje = {
      id: genId("mj"),
      sessionId,
      subsessionId,
      cycleId: ciklus.id,
      measurementNumber,
      measurementType: initialType,
      measuredAt: customTimestamp,
      timestamp: customTimestamp,
      minutesFromCycleStart,
      minutesFromPreviousMeasurement: minutesFromPrevious,
      ph: phNum!,
      pH: phNum!, // legacy
      previousPh: isInitial ? undefined : prethodniPH,
      phChange: isInitial ? undefined : phChange,
      phRatePerMinute: isInitial ? undefined : phRate,
      foamLevel: foamLevel || undefined,
      colorIndicator: (colorIndicator || undefined) as ColorIndicator | undefined,
      bubblesPresent: bubblesPresent,
      magnetFilterActive: isDS40Product ? magnetFilterActive : undefined,
      flowInputValue: flowValue ? parseFloat(flowValue) : undefined,
      flowInputUnit: flowUnit,
      flowLMin: flowLMin ?? undefined,
      flowChangeFromInitial,
      flowChangeFromPrevious,
      tds: tds || undefined,
      ec: ec || undefined,
      temperatureC: tempStr ? parseFloat(tempStr) : undefined,
      temperatura: tempStr ? parseFloat(tempStr) : undefined,
      tempInC: tempInNum ?? undefined,
      tempOutC: tempOutNum ?? undefined,
      deltaTC: deltaTCNum ?? undefined,
      note: note || undefined,
      napomena: note || undefined,
      interpretation: interpretacija?.tekst,
      preporuka: livePreporuka ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    // Obriši draft ali zadrži datum/vrijeme koje je tehničar unio — sljedeće otvaranje forme počinje od istog vremena
    clearDraft(draftKey);
    writeDraft<Partial<MjerenjeDraft>>(draftKey, { timeStr, dateStr });
    onSave(mjerenje);
  }

  // ── pH zone color for live card ────────────────────────────────────────────
  const phZoneColor = interpretacija
    ? {
        green: "border-green-400 bg-green-50 text-green-900",
        yellow: "border-amber-400 bg-amber-50 text-amber-900",
        orange: "border-orange-400 bg-orange-50 text-orange-900",
        red: "border-red-400 bg-red-50 text-red-900",
      }[interpretacija.zonaColor]
    : "border-border bg-muted/30 text-foreground";

  const phZoneBadge = interpretacija
    ? {
        green: "bg-green-100 text-green-700",
        yellow: "bg-amber-100 text-amber-700",
        orange: "bg-orange-100 text-orange-700",
        red: "bg-red-100 text-red-700",
      }[interpretacija.zonaColor]
    : "bg-muted text-muted-foreground";

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Unesi mjerenje"
    >
      {/* ── Header ──────────────���─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border bg-background">
        <button
          type="button"
          onClick={onClose}
          className="p-1 -ml-1 hover:opacity-70 transition-opacity"
          aria-label="Natrag"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">
            {isInitial
              ? `Ciklus #${ciklus.cycleNumber} — Referentno mjerenje`
              : `Ciklus #${ciklus.cycleNumber} — Mjerenje #${ciklus.mjerenja.filter(m => m.measurementType !== "initial_cycle_measurement").length + 1}`}
          </p>
          <h1 className="text-lg font-black leading-tight text-foreground text-balance">
            {isInitial ? "Referentno mjerenje" : "Unesi mjerenje"}
          </h1>
        </div>
      </div>

      {/* ── Active Session banner ─────────────────────────────────────────── */}
      <div className="shrink-0 bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Status dot */}
            <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Aktivna sesija
              </p>
              <p className="text-sm font-semibold text-foreground truncate">
                {nazivObjekta || "Nepoznat objekt"}
                {dioSustava && <span className="text-muted-foreground font-normal"> — {dioSustava}</span>}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground">Pocetak</p>
            <p className="text-xs font-semibold tabular-nums text-foreground">
              {ciklus.startDateTime
                ? new Date(ciklus.startDateTime).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })
                : "--:--"}
            </p>
          </div>
        </div>
        {subsessionId && (
          <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            Podsesija: {dioSustava || subsessionId}
          </p>
        )}
      </div>

      {/* ── Context strip ────────────────────────────────────────────���────── */}
      <div className="shrink-0 bg-muted/40 border-b border-border px-4 py-2 flex items-center gap-4 overflow-x-auto">
        {ciklus.chemicalProductName && (
          <span className="text-xs font-semibold text-foreground shrink-0">{ciklus.chemicalProductName}</span>
        )}
        {ciklus.startDateTime && (
          <>
            {ciklus.chemicalProductName && <span className="text-muted-foreground/40 text-xs shrink-0">/</span>}
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatDuration(ciklus.startDateTime)} od pocetka
            </span>
          </>
        )}
        {prethodniPH !== undefined && (
          <>
            <span className="text-muted-foreground/40 text-xs shrink-0">/</span>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              Zadnji pH: <strong className="text-foreground">{prethodniPH.toFixed(2)}</strong>
            </span>
          </>
        )}
      </div>

      {/* ── Initial measurement info (collapsible) ─────────────────────────── */}
      {isInitial && (
        <details className="shrink-0 bg-primary/10 border-b border-primary/20 group">
          <summary className="px-4 py-2.5 cursor-pointer list-none flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">
              Sto je referentno mjerenje?
            </span>
            <svg 
              className="w-4 h-4 text-primary transition-transform group-open:rotate-180" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="px-4 pb-3">
            <p className="text-xs text-primary/80 leading-relaxed">
              Referentno mjerenje (nakon ~3 min cirkulacije). Ne racuna deltu od prethodnog — ovo je referentna tocka.
            </p>
          </div>
        </details>
      )}

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto w-full px-4 py-5 flex flex-col gap-7">

          {/* ── Timer podsjetnik — prikazuje se za sva mjerenja ─────────��─── */}
          <MjerenjeTimer
            lastMjerenjeAt={prethodno ? getMjerenjeTimestamp(prethodno) : ciklus.startDateTime}
            onAlarm={() => {/* alarm vec vizualno prikazan unutar timera */}}
            paused={false}
          />

          {/* ── Datum i vrijeme mjerenja ───────────────────��──────────────── */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Datum i vrijeme mjerenja
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground/70 font-medium">Datum</span>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full appearance-none border-2 border-border rounded-2xl px-3 py-3 text-base font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground/70 font-medium">Vrijeme</span>
                <input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full appearance-none border-2 border-border rounded-2xl px-3 py-3 text-base font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>
            {minutesFromPrevious !== undefined && (
              <p className="text-[10px] text-muted-foreground/60">
                {minutesFromPrevious} min od prethodnog mjerenja
              </p>
            )}
            {minutesFromCycleStart !== undefined && (
              <p className="text-[10px] text-muted-foreground/60">
                {minutesFromCycleStart} min od pocetka ciklusa
              </p>
            )}
            {/* Soft validation — nikad ne blokira unos */}
            {(() => {
              const beforeCycleStart =
                ciklus.startDateTime &&
                new Date(customTimestamp) < new Date(ciklus.startDateTime);
              const beforePrevious =
                prethodno &&
                new Date(customTimestamp) < new Date(getMjerenjeTimestamp(prethodno));
              if (beforeCycleStart || beforePrevious) {
                return (
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    Provjerite vrijeme mjerenja.
                  </p>
                );
              }
              return null;
            })()}
          </div>

          {/* ── A. pH ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <SekcijaHeader label="pH" required />

            {/* Numeric input with mic */}
            <div className="flex items-center gap-3">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="14"
                value={phStr}
                onChange={(e) => setPhStr(e.target.value)}
                placeholder="npr. 2.5"
                className={`min-w-0 flex-1 border-2 rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${
                  touched && !phValid ? "border-destructive" : "border-border"
                }`}
              />
              <MicButton onResult={(v) => setPhStr(v)} fieldName="pH" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
            </div>

            {/* Live interpretation (samo za DS-3 i slične, NE za ScaleBreaker) */}
            {interpretacija && !isScaleBreakerProduct && (
              <div className={`border rounded-lg px-3 py-2 flex flex-col gap-1 transition-all ${phZoneColor}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Zona</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phZoneBadge}`}>{interpretacija.zona}</span>
                </div>
                <p className="text-xs font-medium leading-snug">{interpretacija.tekst}</p>
                {phChange !== undefined && (
                  <p className="text-[10px] opacity-70 tabular-nums">
                    DeltapH: {phChange > 0 ? "+" : ""}{phChange.toFixed(2)}
                    {phRate !== undefined && ` (${phRate > 0 ? "+" : ""}${phRate.toFixed(3)}/min)`}
                  </p>
                )}
                {pocetniPH !== undefined && phNum !== null && !isInitial && (
                  <p className="text-[10px] opacity-70 tabular-nums">
                    Od pocetka: {(phNum - pocetniPH) > 0 ? "+" : ""}{(phNum - pocetniPH).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {touched && !phValid && (
              <p className="text-[10px] text-destructive font-semibold">pH je obavezan (0–14).</p>
            )}
          </div>

          {/* ── B. Protok ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <SekcijaHeader label="Protok" />

            {/* Unit toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFlowUnit("l_min")}
                className={`flex-1 py-1.5 transition-colors ${
                  flowUnit === "l_min"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                L/min
              </button>
              <button
                type="button"
                onClick={() => setFlowUnit("sec_10l")}
                className={`flex-1 py-1.5 transition-colors ${
                  flowUnit === "sec_10l"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                10 L u sek
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={flowValue}
                onChange={(e) => setFlowValue(e.target.value)}
                placeholder={flowUnit === "l_min" ? "npr. 20" : "npr. 30"}
                className="min-w-0 flex-1 border-2 border-border rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <MicButton onResult={(v) => setFlowValue(v)} fieldName="protok" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
            </div>

            {/* Conversion display */}
            {flowConvertedDisplay !== null && flowValue !== "" && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">Izracunato</span>
                <span className="text-sm font-bold text-foreground tabular-nums">= {flowConvertedDisplay} L/min</span>
              </div>
            )}

            {/* Flow change from initial */}
            {flowChangeFromInitial !== undefined && (
              <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">Od pocetka</span>
                <span className={`text-xs font-bold tabular-nums ${flowChangeFromInitial > 0 ? "text-green-600" : "text-destructive"}`}>
                  {flowChangeFromInitial > 0 ? "+" : ""}{flowChangeFromInitial} L/min
                </span>
              </div>
            )}
          </div>

          {/* ── C. Pjena ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <SekcijaHeader label="Pjena" required />
            <div className="flex flex-wrap gap-1.5">
              {FOAM_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={foamLevel === opt.value}
                  onClick={() => setFoamLevel(foamLevel === opt.value ? "" : opt.value)}
                  size="sm"
                />
              ))}
            </div>
            {/* Tumačenje pjene — collapsible */}
            <FoamHelperCollapsible />
          </div>

          {/* ── D. Boja indikatora + snaga sredstva ──────────────────────── */}
          <div className="flex flex-col gap-2">
            <SekcijaHeader label="Boja indikatora" />

            {/* Procjena po pH */}
            {phBasedZona && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Procjena po pH</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {phBasedZona.colorName && (
                    <span className="text-xs font-medium text-foreground">
                      Boja: <span className="text-primary">{phBasedZona.colorName}</span>
                    </span>
                  )}
                  <span className="text-xs font-medium text-foreground">
                    Snaga: <span className="text-primary">{SNAGA_SREDSTVA_LABELS[phBasedZona.strength]}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Rucna korekcija */}
            {(() => {
              const productColors = ciklus.productSnapshot?.colorIndicators ?? [];
              const hasProductColors = productColors.length > 0;
              const indicatorType = ciklus.productSnapshot?.indicatorType;
              const showBubbles = indicatorType === "color+bubbles" || indicatorType === "bubbles" || indicatorType === "color+bubbles+pH";
              
              return (
                <div className="flex flex-col gap-3">
                  {/* Boja indikatora */}
                  {indicatorType !== "bubbles" && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {phBasedZona ? "Stvarna boja:" : "Odaberi boju:"}
                      </span>
                      {hasProductColors ? (
                        <div className="flex flex-wrap gap-1.5">
                          {productColors.map((ci) => (
                            <button
                              key={ci.id}
                              type="button"
                              onClick={() => setColorIndicator(colorIndicator === ci.colorName ? "" : ci.colorName)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                                colorIndicator === ci.colorName
                                  ? "bg-primary/10 border-primary/40 text-primary"
                                  : "bg-muted border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {ci.colorHex && (
                                <span className="w-2.5 h-2.5 rounded-full border border-border shrink-0" style={{ backgroundColor: ci.colorHex }} />
                              )}
                              {ci.colorName}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {COLOR_OPTIONS.map((opt) => (
                            <Chip
                              key={opt.value}
                              label={opt.label}
                              selected={colorIndicator === opt.value}
                              onClick={() => setColorIndicator(colorIndicator === opt.value ? "" : opt.value)}
                              size="sm"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mjehurići toggle - za "color+bubbles" i "bubbles" proizvode */}
                  {showBubbles && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground">Mjehurići (reakcija s kamencem):</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setBubblesPresent(true)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            bubblesPresent === true
                              ? "bg-green-500/20 border-green-500/40 text-green-400"
                              : "bg-muted border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <circle cx="19" cy="7" r="2" />
                            <circle cx="5" cy="9" r="2" />
                            <circle cx="17" cy="17" r="1.5" />
                            <circle cx="7" cy="16" r="1.5" />
                          </svg>
                          DA
                        </button>
                        <button
                          type="button"
                          onClick={() => setBubblesPresent(false)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            bubblesPresent === false
                              ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                              : "bg-muted border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          NE
                        </button>
                      </div>
                      {bubblesPresent === true && (
                        <span className="text-[10px] text-green-400">Aktivna reakcija s kamencem</span>
                      )}
                      {bubblesPresent === false && (
                        <span className="text-[10px] text-rose-400">Nema mjehurića — reakcija završena ili nije započela</span>
                      )}
                    </div>
                  )}

                  {/* DS-40: Magnetski filter status */}
                  {isDS40Product && (
                    <div className="flex flex-col gap-1.5 border-t border-border pt-3 mt-1">
                      <span className="text-[10px] font-medium text-muted-foreground">Magnetski filter:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMagnetFilterActive(true)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            magnetFilterActive === true
                              ? "bg-stone-600/40 border-stone-500/60 text-stone-200"
                              : "bg-muted border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 3h12a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
                            <path d="M9 12v6M15 12v6M8 18h8" />
                          </svg>
                          SKUPLJA TALOG
                        </button>
                        <button
                          type="button"
                          onClick={() => setMagnetFilterActive(false)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            magnetFilterActive === false
                              ? "bg-green-900/40 border-green-600/50 text-green-300"
                              : "bg-muted border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          ČIST
                        </button>
                      </div>
                      {magnetFilterActive === true && (
                        <span className="text-[10px] text-stone-400">Magnetit se još uklanja iz sustava.</span>
                      )}
                      {magnetFilterActive === false && (
                        <span className="text-[10px] text-green-400">Black sludge reakcija završena.</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Stvarna vrijednost (po boji) */}
            {colorIndicator && colorBasedStrength && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70">Po boji</span>
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="text-xs font-medium text-foreground">
                    Boja: <span className="text-primary">{colorIndicator}</span>
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    Snaga: <span className="text-primary">{SNAGA_SREDSTVA_LABELS[colorBasedStrength]}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Finalna snaga sredstva */}
            {finalStrength && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Snaga</span>
                <span className="text-xs font-bold text-foreground">
                  {SNAGA_SREDSTVA_LABELS[finalStrength]} <span className="text-[9px] text-muted-foreground">({strengthMatrix.source === "boja" ? "boja" : "pH"})</span>
                </span>
              </div>
            )}

            {/* Upozorenje pri nesuglasju pH i boje */}
            {colorMismatch && mismatchMessage && (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                Upozorenje: {mismatchMessage}
              </p>
            )}

            {/* ScaleBreaker FX interpretacija (boja + mjehurići) */}
            {scaleBreakerInterpretacija && (
              <div className="bg-gradient-to-br from-orange-900/20 to-card border border-orange-500/30 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-orange-400">
                    Status reakcije
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scaleBreakerInterpretacija.actionColor}`}>
                    {scaleBreakerInterpretacija.action}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  {scaleBreakerInterpretacija.message}
                </p>
                <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Kamenac se otapa kemijskom reakcijom pri kojoj nastaje CO₂. Mjehurići su glavni indikator aktivnog otapanja.
                  </p>
                </div>
                {scaleBreakerInterpretacija.status === "reakcija_zavrsena" && (
                  <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-300">
                      <strong>Sljedeći korak:</strong> Dodati neutralizator i temeljito isprati sustav vodom.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── E. Temperatura (opcionalno, collapsed) ───────────────────── */}
          <div className="flex flex-col gap-0">
            <button
              type="button"
              onClick={() => setShowTemp((p) => !p)}
              className="flex items-center justify-between w-full py-2 px-3 rounded-lg border border-border bg-muted/30 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>
                Temperatura
                {(tempInNum !== null || tempOutNum !== null) && (
                  <span className="ml-1.5 text-[10px] font-medium text-primary">
                    {tempOutNum !== null ? `OUT ${tempOutNum}°` : ""}{tempInNum !== null ? ` IN ${tempInNum}°` : ""}
                  </span>
                )}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform shrink-0 ${showTemp ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showTemp && (
              <div className="mt-3 flex flex-col gap-4 px-1">
                {/* T ulaz */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Temperatura ulaza (°C)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={tempInStr}
                      onChange={(e) => setTempInStr(e.target.value)}
                      placeholder="npr. 45"
                      className="min-w-0 flex-1 border-2 border-border rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MicButton onResult={(v) => setTempInStr(v)} fieldName="temp ulaz" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
                  </div>
                </div>

                {/* T izlaz */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Temperatura izlaza (°C)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={tempOutStr}
                      onChange={(e) => setTempOutStr(e.target.value)}
                      placeholder="npr. 40"
                      className="min-w-0 flex-1 border-2 border-border rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MicButton onResult={(v) => setTempOutStr(v)} fieldName="temp izlaz" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
                  </div>
                </div>


              </div>
            )}
          </div>

          {/* ── Napredni podaci (collapsed) ───────────────────────────────── */}
          <div className="flex flex-col gap-0">
            <button
              type="button"
              onClick={() => setShowAdvanced((p) => !p)}
              className="flex items-center justify-between w-full py-2 px-3 rounded-lg border border-border bg-muted/30 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>Napredni podaci</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="mt-3 flex flex-col gap-4 px-1">
                {/* TDS */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">TDS (ppm)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={tds}
                      onChange={(e) => setTds(e.target.value)}
                      placeholder="npr. 450"
                      className="min-w-0 flex-1 border-2 border-border rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MicButton onResult={(v) => setTds(v)} fieldName="TDS" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
                  </div>
                </div>

                {/* EC */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">EC (mS/cm)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={ec}
                      onChange={(e) => setEc(e.target.value)}
                      placeholder="npr. 0.9"
                      className="min-w-0 flex-1 border-2 border-border rounded-xl px-4 py-4 text-2xl font-bold tabular-nums text-center bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MicButton onResult={(v) => setEc(v)} fieldName="EC" className="shrink-0 w-16 h-16 rounded-xl border-2 bg-primary/10" />
                  </div>
                </div>

                {/* Napomena */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Napomena</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Komentar ili biljeska..."
                    className="w-full border-2 border-border rounded-xl px-4 py-3 text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Spacer for sticky footer */}
          <div className="h-2" />
        </div>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-background px-3 py-3 flex flex-col gap-2 max-w-lg mx-auto w-full">
        {/* Live recommendation preview — appears as soon as pH is entered */}
        {livePreporuka && (
          <PreporukaKartica preporuka={livePreporuka} compact />
        )}

        {touched && !phValid && (
          <p className="text-[10px] text-center font-semibold text-destructive">Unesite pH vrijednost.</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm tracking-wide hover:opacity-90 active:scale-[0.98] transition-all"
        >
          SPREMI MJERENJE
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 border border-destructive/50 text-destructive rounded-lg py-2 font-medium text-xs hover:bg-destructive/10 active:scale-[0.98] transition-all"
          >
            Ponisti
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border text-foreground rounded-lg py-2 font-medium text-xs hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}
