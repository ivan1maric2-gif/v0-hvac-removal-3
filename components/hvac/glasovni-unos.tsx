"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { FoamLevel, ColorIndicator } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GlasovniRezultat {
  ph?: number;
  flowSec?: number;       // seconds for 10L (vrijeme za 10 L)
  flowLMin?: number;      // L/min
  temperatureC?: number;  // °C
  kemija?: number;        // litres of chemical added
  foamLevel?: FoamLevel;
  colorIndicator?: ColorIndicator;
  napomena?: string;
  akcija?: "spremi" | "novo_mjerenje" | "otvori_sesiju" | "nastavi_rad";
}

// ─── Voice Command types (separate from measurement voice) ───────────────────

export type VoiceCommandType =
  | "dodaj_kemikaliju"
  | "pokreni_ciklus"
  | "zavrsi_ciklus"
  | "pocni_ispiranje"
  | "zavrsi_ispiranje"
  | "dodaj_napomenu"
  | "uzorak_uzet";

export interface VoiceCommandResult {
  command: VoiceCommandType;
  raw: string;
  // Parsed details
  kemikalijaKg?: number;
  kemikalijaL?: number;
  kemikalijaNaziv?: string;
  napomena?: string;
  uzorkovanje?: "pumpa" | "povrat";
}

export interface GlasovniUnosProps {
  onParsed: (rezultat: GlasovniRezultat) => void;
  /** Called when user says "spremi mjerenje" */
  onSpremi?: () => void;
  /** Called when user says "novo mjerenje" */
  onNovo?: () => void;
}

// ─── Speech synthesis helper ─────────────────────────────────────────────────

export function govori(tekst: string) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(tekst);
  utt.lang = "hr-HR";
  utt.rate = 0.95;
  synth.speak(utt);
}

// ─── Croatian number words ────────────────────────────────────────────────────

const BROJ_RIJECIMA: Record<string, number> = {
  nula: 0, jedan: 1, jedna: 1, jedne: 1, jednu: 1,
  dva: 2, dvije: 2, tri: 3, četiri: 4, cetiri: 4,
  pet: 5, šest: 6, sest: 6, sedam: 7, osam: 8, devet: 9, deset: 10,
  jedanaest: 11, dvanaest: 12, trinaest: 13,
  četrnaest: 14, cetrnaest: 14,
  petnaest: 15, šesnaest: 16, sesnaest: 16,
  sedamnaest: 17, osamnaest: 18, devetnaest: 19,
  dvadeset: 20, trideset: 30, četrdeset: 40, cetrdesit: 40,
  pedeset: 50, šezdeset: 60, sezdeset: 60,
  sedamdeset: 70, osamdeset: 80, devedeset: 90,
  sto: 100, stotinu: 100,
};

const DECIMAL_SEP = ["cijela", "cijelih", "i", "točka", "zarez"];

function parseHrvatskiBroj(tokens: string[]): number | null {
  const joined = tokens.join(" ");
  const direct = parseFloat(joined.replace(",", "."));
  if (!isNaN(direct)) return direct;

  const sepIdx = tokens.findIndex((t) => DECIMAL_SEP.includes(t));
  if (sepIdx >= 0) {
    const intVal = resolveWordNumber(tokens.slice(0, sepIdx));
    const decVal = resolveWordNumber(tokens.slice(sepIdx + 1));
    if (intVal !== null && decVal !== null) {
      return parseFloat(`${intVal}.${decVal}`);
    }
  }
  return resolveWordNumber(tokens);
}

function resolveWordNumber(tokens: string[]): number | null {
  let total = 0;
  for (const t of tokens) {
    const n = BROJ_RIJECIMA[t.toLowerCase()];
    if (n !== undefined) total += n;
    else {
      const d = parseFloat(t);
      if (!isNaN(d)) total += d;
    }
  }
  return tokens.length > 0 ? total : null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

function parseGlas(tekst: string): GlasovniRezultat {
  const result: GlasovniRezultat = {};
  const t = tekst.toLowerCase().trim();
  const tokens = t.split(/\s+/);

  // ── Akcije ───────────────────────────────────────────────────────────────
  if (/spremi (mjerenje|rezultat|podatke)/.test(t)) { result.akcija = "spremi"; return result; }
  if (/novo mjerenje/.test(t)) { result.akcija = "novo_mjerenje"; return result; }
  if (/otvori sesij/.test(t)) { result.akcija = "otvori_sesiju"; return result; }
  if (/nastavi rad/.test(t)) { result.akcija = "nastavi_rad"; return result; }

  // ── pH ───────────────────────────────────────────────────────────────────
  const phIdx = tokens.findIndex((tok) =>
    tok === "ph" || tok === "pe" || tok === "peh" || tok === "p.h."
  );
  if (phIdx >= 0) {
    const after = tokens.slice(phIdx + 1, phIdx + 7)
      .filter((w) => !["protok", "litara", "pjena", "boja", "talog", "sekunda", "dodano"].includes(w));
    const v = parseHrvatskiBroj(after);
    if (v !== null && v > 0 && v <= 14) result.ph = Math.round(v * 100) / 100;
  }

  // ── Protok / vrijeme za 10 L ──────────────────────────────────────────────
  // "protok dvadeset jedna sekunda" | "vrijeme dvadeset sekundi" | "protok 19.5 L/min"
  const protokIdx = tokens.findIndex((tok) =>
    ["protok", "flow", "vrijeme", "trajanje"].includes(tok)
  );
  if (protokIdx >= 0) {
    const after = tokens.slice(protokIdx + 1, protokIdx + 8);
    const isSekundie = after.some((w) => ["sekunda", "sekundi", "sekunde", "sek"].includes(w));
    const numTokens = after.filter((w) =>
      !["sekunda", "sekundi", "sekunde", "sek", "litara", "litar", "l/min", "minuta", "min"].includes(w)
    );
    const v = parseHrvatskiBroj(numTokens);
    if (v !== null && v > 0) {
      if (isSekundie) result.flowSec = Math.round(v);
      else if (v < 200) result.flowLMin = Math.round(v * 10) / 10;
    }
  }

  // Fallback: "19 sekundi" bez ključne riječi "protok"
  if (!result.flowSec && !result.flowLMin) {
    const sekIdx = tokens.findIndex((w) => ["sekunda", "sekundi", "sekunde", "sek"].includes(w));
    if (sekIdx > 0) {
      const before = tokens.slice(Math.max(0, sekIdx - 4), sekIdx)
        .filter((w) => !["ph", "pjena", "boja", "talog", "dodano", "kemija"].includes(w));
      const v = parseHrvatskiBroj(before);
      if (v !== null && v > 0 && v < 300) result.flowSec = Math.round(v);
    }
  }

  // ── Temperatura: "temperatura četrdeset pet" | "temp 42.5" | "45 stupnjeva" ─
  const tempIdx = tokens.findIndex((tok) =>
    ["temperatura", "temp", "temperature"].includes(tok)
  );
  if (tempIdx >= 0) {
    const after = tokens.slice(tempIdx + 1, tempIdx + 7).filter((w) =>
      !["stupanj", "stupnjeva", "stupnjevi", "celsius", "°c", "celzijusa"].includes(w)
    );
    const v = parseHrvatskiBroj(after);
    if (v !== null && v >= 0 && v <= 120) result.temperatureC = Math.round(v * 10) / 10;
  }
  // Fallback: "četrdeset pet stupnjeva" — bez ključne riječi "temperatura"
  if (result.temperatureC === undefined) {
    const stupIdx = tokens.findIndex((w) =>
      ["stupanj", "stupnjeva", "stupnjevi", "celsius", "celzijusa"].includes(w)
    );
    if (stupIdx > 0) {
      const before = tokens.slice(Math.max(0, stupIdx - 5), stupIdx)
        .filter((w) => !["ph", "pjena", "boja", "protok", "dodano"].includes(w));
      const v = parseHrvatskiBroj(before);
      if (v !== null && v >= 0 && v <= 120) result.temperatureC = Math.round(v * 10) / 10;
    }
  }

  // ── Kemija dodana: "dodano dva litra" | "dodao jednu litru" ───────────────
  const kemIdx = tokens.findIndex((tok) =>
    ["dodano", "dodao", "dodala", "dodaj", "kemija", "litra", "litara", "litru", "kemije"].includes(tok)
  );
  if (kemIdx >= 0) {
    const around = tokens.slice(Math.max(0, kemIdx - 3), kemIdx + 5)
      .filter((w) => !["dodano", "dodao", "dodala", "dodaj", "litra", "litara", "litru", "kemija", "kemije"].includes(w));
    const v = parseHrvatskiBroj(around);
    if (v !== null && v > 0 && v <= 50) result.kemija = Math.round(v * 10) / 10;
  }

  // ── Napomena: "napomena ..." | "bilješka ..." ─────────────────────────────
  const napIdx = tokens.findIndex((tok) => ["napomena", "bilješka", "biljeska", "komentar"].includes(tok));
  if (napIdx >= 0) {
    const rest = tokens.slice(napIdx + 1).join(" ").trim();
    if (rest.length > 2) result.napomena = rest;
  }

  // ── Pjena ────────────────────────────────────────────────────────────────
  const pjenaIdx = tokens.findIndex((tok) => tok === "pjena" || tok === "pjene" || tok === "pjenu");
  if (pjenaIdx >= 0) {
    const ctx = tokens.slice(Math.max(0, pjenaIdx - 2), pjenaIdx + 3).join(" ");
    if (/nema|nula|bez/.test(ctx)) result.foamLevel = "nema";
    else if (/slaba|slabe|mala|malo/.test(ctx)) result.foamLevel = "slaba";
    else if (/srednja|srednje|umjerena|umjereno/.test(ctx)) result.foamLevel = "srednja";
    else if (/jaka|jako|dosta/.test(ctx)) result.foamLevel = "jaka";
    else if (/vrlo|puno/.test(ctx)) result.foamLevel = "vrlo_jaka";
  }

  // ── Boja ─────────────────────────────────────────────────────────────────
  const bojaIdx = tokens.findIndex((tok) => tok === "boja" || tok === "boje" || tok === "boju");
  if (bojaIdx >= 0) {
    const ctx = tokens.slice(Math.max(0, bojaIdx - 1), bojaIdx + 4).join(" ");
    if (/plavo.zelena|plavo zelena/.test(ctx)) result.colorIndicator = "plavo_zelena";
    else if (/plava|plavo|modra/.test(ctx)) result.colorIndicator = "plava";
    else if (/zelena|zeleno/.test(ctx)) result.colorIndicator = "zelena";
    else if (/žuta|žuto|zuta|zuto/.test(ctx)) result.colorIndicator = "zuta";
    else if (/smeđa|smeda|smedja|braon/.test(ctx)) result.colorIndicator = "smeda";
    else if (/bez|prozirna|bistra/.test(ctx)) result.colorIndicator = "bez_boje";
  }

  return result;
}

// ─── parseGlasJednoPol — extract single value from speech ────────────────────

type FieldTarget = "ph" | "flow" | "temperature" | "note";

export function parseGlasJednoPolje(tekst: string, field: FieldTarget): string | null {
  const t = tekst.toLowerCase().trim().replace(",", ".");

  if (field === "ph") {
    // Try to extract a number like "2.8", "3 2", "tri zarez dva"
    const tokens = t.split(/\s+/).filter((w) =>
      !["ph", "p", "h", "pe", "ha", "izmjereno", "je", "iznosi"].includes(w)
    );
    const v = parseHrvatskiBroj(tokens);
    if (v !== null && v >= 0 && v <= 14) return v.toFixed(2);
    // fallback: grab first float in string
    const m = t.match(/\d+[.,]\d+|\d+/);
    if (m) {
      const f = parseFloat(m[0].replace(",", "."));
      if (f >= 0 && f <= 14) return f.toFixed(2);
    }
  }

  if (field === "flow") {
    // Extract L/min value
    const tokens = t.split(/\s+/).filter((w) =>
      !["protok", "flow", "litar", "litara", "litru", "l", "min", "minuta", "l/min"].includes(w)
    );
    const v = parseHrvatskiBroj(tokens);
    if (v !== null && v > 0 && v < 200) return v.toFixed(1);
    const m = t.match(/\d+[.,]\d+|\d+/);
    if (m) {
      const f = parseFloat(m[0].replace(",", "."));
      if (f > 0 && f < 200) return f.toFixed(1);
    }
  }

  if (field === "temperature") {
    const tokens = t.split(/\s+/).filter((w) =>
      !["temperatura", "temp", "stupnjeva", "stupanj", "celsius", "°c", "je", "iznosi"].includes(w)
    );
    const v = parseHrvatskiBroj(tokens);
    if (v !== null && v >= 0 && v <= 120) return v.toFixed(1);
    const m = t.match(/\d+[.,]\d+|\d+/);
    if (m) {
      const f = parseFloat(m[0].replace(",", "."));
      if (f >= 0 && f <= 120) return f.toFixed(1);
    }
  }

  if (field === "note") {
    return tekst.trim() || null;
  }

  return null;
}

// ─── MicButton — small inline microphone for individual fields ────────────────

interface MicButtonProps {
  field: FieldTarget;
  onValue: (value: string) => void;
  label?: string;
}

export function MicButton({ field, onValue, label }: MicButtonProps) {
  const [state, setState] = useState<"idle" | "listening" | "done" | "error" | "unsupported">("idle");
  const recRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef<string>("");

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { setState("unsupported"); return; }

    setState("listening");
    lastTranscriptRef.current = "";
    const rec: SpeechRecognition = new SR();
    rec.lang = "hr-HR";
    rec.continuous = true;      // Keep listening
    rec.interimResults = true;  // Show real-time feedback

    // Auto-stop after 8 seconds
    timeoutRef.current = setTimeout(() => {
      rec.stop();
    }, 8000);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Get latest transcript (combine all results)
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      lastTranscriptRef.current = transcript;

      // Check if final result
      const lastResult = e.results[e.results.length - 1];
      if (lastResult.isFinal) {
        const parsed = parseGlasJednoPolje(transcript, field);
        if (parsed !== null) {
          setState("done");
          onValue(parsed);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          rec.stop();
          setTimeout(() => setState("idle"), 1800);
        }
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setState(e.error === "not-allowed" ? "unsupported" : "error");
      setTimeout(() => setState("idle"), 1800);
    };

    rec.onend = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Try to parse whatever we got
      if (state === "listening" && lastTranscriptRef.current) {
        const parsed = parseGlasJednoPolje(lastTranscriptRef.current, field);
        if (parsed !== null) {
          setState("done");
          onValue(parsed);
          setTimeout(() => setState("idle"), 1800);
          return;
        }
      }
      setState((prev) => (prev === "listening" ? "error" : prev));
      setTimeout(() => setState("idle"), 1800);
    };

    recRef.current = rec;
    rec.start();
  }, [field, onValue, state]);

  if (state === "unsupported") return null;

  const colorCls =
    state === "listening" ? "text-red-500 border-red-400 bg-red-50 dark:bg-red-950/30" :
    state === "done"      ? "text-green-600 border-green-400 bg-green-50 dark:bg-green-950/30" :
    state === "error"     ? "text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/30" :
    "text-muted-foreground border-input bg-background hover:border-primary/50 hover:text-primary";

  return (
    <button
      type="button"
      aria-label={label ?? `Glasovni unos za ${field}`}
      onClick={state === "listening" ? () => { recRef.current?.stop(); setState("idle"); } : start}
      className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-all active:scale-95 ${colorCls}`}
    >
      {state === "listening" ? (
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      ) : state === "done" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : state === "error" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}

// ─── SpeechRecognition types ────────────────────────────��─────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
declare class SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// ─── Status indicator dot ─────────────────────────────────────────────────────

function StatusDot({ listening }: { listening: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {listening && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${listening ? "bg-red-500" : "bg-muted-foreground/30"}`} />
    </span>
  );
}

// ─── Parsed value chips ───────────────────────────────────────────────────────

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
      <span className="font-black text-base text-foreground leading-tight">{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Phase = "idle" | "listening" | "done" | "error" | "unsupported";

export function GlasovniUnos({ onParsed, onSpremi, onNovo }: GlasovniUnosProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<GlasovniRezultat | null>(null);
  const [lastCmd, setLastCmd] = useState<string>("");
  const recognizerRef = useRef<SpeechRecognition | null>(null);

  // Check browser support on mount
  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) setPhase("unsupported");
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { setPhase("unsupported"); return; }

    setTranscript("");
    setParsed(null);
    setPhase("listening");

    const rec: SpeechRecognition = new SR();
    rec.lang = "hr-HR";
    rec.continuous = true;       // Keep listening longer
    rec.interimResults = true;    // Show real-time feedback

    // Auto-stop after 10 seconds of listening
    const autoStopTimeout = setTimeout(() => {
      rec.stop();
    }, 10000);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Get latest transcript (combine all results)
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);

      // Only process final results
      const lastResult = e.results[e.results.length - 1];
      if (!lastResult.isFinal) return;

      setLastCmd(text);
      const result = parseGlas(text);
      const hasData = Object.keys(result).length > 0;

      if (!hasData) {
        setPhase("error");
        govori("Nisam razumio, ponovi");
        clearTimeout(autoStopTimeout);
        rec.stop();
        return;
      }

      setParsed(result);
      setPhase("done");
      clearTimeout(autoStopTimeout);
      rec.stop();

      // Handle action commands
      if (result.akcija === "spremi") {
        govori("Mjerenje spremljeno");
        onSpremi?.();
        return;
      }
      if (result.akcija === "novo_mjerenje") {
        govori("Novo mjerenje");
        onNovo?.();
        return;
      }
      if (result.akcija === "nastavi_rad" || result.akcija === "otvori_sesiju") {
        govori("U redu");
        onParsed(result);
        return;
      }

      // Announce what was parsed
      const parts: string[] = [];
      if (result.ph !== undefined) parts.push(`pH ${result.ph}`);
      if (result.flowSec !== undefined) parts.push(`protok ${result.flowSec} sekundi`);
      if (result.flowLMin !== undefined) parts.push(`protok ${result.flowLMin} litara po minuti`);
      if (result.kemija !== undefined) parts.push(`dodano ${result.kemija} litara kemije`);
      if (result.napomena) parts.push("napomena zapisana");
      if (parts.length > 0) govori(`Prepoznato: ${parts.join(", ")}`);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      clearTimeout(autoStopTimeout);
      if (e.error === "no-speech") {
        setPhase("error");
        govori("Nisam razumio, ponovi");
      } else if (e.error === "not-allowed") {
        setPhase("unsupported");
      } else {
        setPhase("error");
      }
    };

    rec.onend = () => {
      clearTimeout(autoStopTimeout);
      setPhase((prev) => prev === "listening" ? "idle" : prev);
    };

    recognizerRef.current = rec;
    rec.start();
  }, [onParsed, onSpremi, onNovo]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setParsed(null);
    setPhase("idle");
  }, []);

  const apply = useCallback(() => {
    if (parsed) {
      onParsed(parsed);
      reset();
    }
  }, [parsed, onParsed, reset]);

  // ── Unsupported ─────────────────────────────────────────────────────────────
  if (phase === "unsupported") {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Glasovne funkcije nisu podrzane na ovom uredaju
        </p>
      </div>
    );
  }

  const hasParsed = parsed && Object.keys(parsed).filter(k => k !== "akcija").length > 0;
  const isAction = parsed?.akcija != null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <StatusDot listening={phase === "listening"} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {phase === "listening" ? "Slušam…" : "Glasovni unos"}
          </span>
        </div>
        {(transcript || phase === "error") && (
          <button type="button" onClick={reset}
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            Obriši
          </button>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Mic button */}
        <button
          type="button"
          onClick={phase === "listening" ? stopListening : startListening}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
            phase === "listening"
              ? "bg-red-950/60 border-2 border-red-600/60 text-red-200 dark:text-red-200 text-red-800"
              : "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {phase === "listening" ? "Zaustavi slušanje" : "Pokreni glasovni unos"}
        </button>

        {/* Transcript */}
        {transcript && (
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-1">
              Prepoznato
            </span>
            <p className="text-sm text-foreground italic">&ldquo;{transcript}&rdquo;</p>
          </div>
        )}

        {/* Error: not understood */}
        {phase === "error" && (
          <div className="bg-red-950/30 border border-red-700/40 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-red-400 font-semibold">Nisam razumio, ponovi</p>
            {transcript && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Primjeri: &ldquo;pH tri zarez četiri&rdquo;, &ldquo;protok dvadeset jedna sekunda&rdquo;, &ldquo;dodano dva litra&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Action confirmed */}
        {isAction && (
          <div className="bg-green-950/30 border border-green-700/40 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-green-400 font-semibold capitalize">
              Naredba: {parsed!.akcija!.replace(/_/g, " ")}
            </p>
          </div>
        )}

        {/* Parsed measurement values */}
        {hasParsed && !isAction && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Pronađene vrijednosti
            </span>
            <div className="grid grid-cols-2 gap-2">
              {parsed!.ph !== undefined && (
                <ValueChip label="pH" value={parsed!.ph.toFixed(2)} />
              )}
              {parsed!.flowSec !== undefined && (
                <ValueChip label="Protok (10 L)" value={`${parsed!.flowSec} sek`} />
              )}
              {parsed!.flowLMin !== undefined && (
                <ValueChip label="Protok" value={`${parsed!.flowLMin.toFixed(1)} L/min`} />
              )}
              {parsed!.kemija !== undefined && (
                <ValueChip label="Kemija dodana" value={`${parsed!.kemija} L`} />
              )}
              {parsed!.foamLevel !== undefined && (
                <ValueChip label="Pjena" value={parsed!.foamLevel.replace("_", " ")} />
              )}
              {parsed!.colorIndicator !== undefined && (
                <ValueChip label="Boja" value={parsed!.colorIndicator.replace(/_/g, " ")} />
              )}
              {parsed!.napomena && (
                <div className="col-span-2 bg-card border border-border rounded-lg px-3 py-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-0.5">Napomena</span>
                  <span className="text-sm text-foreground">{parsed!.napomena}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={apply}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.98] transition-all"
            >
              Primijeni na mjerenje
            </button>
          </div>
        )}

        {/* Idle hint */}
        {phase === "idle" && !transcript && (
          <div className="text-[11px] text-muted-foreground/60 text-center leading-relaxed space-y-0.5">
            <p>Reci npr. &ldquo;pH dva cijela četiri, protok dvadeset jedna sekunda&rdquo;</p>
            <p>ili &ldquo;dodano dva litra&rdquo;, &ldquo;spremi mjerenje&rdquo;</p>
          </div>
        )}

        {/* Last command indicator */}
        {lastCmd && phase !== "listening" && (
          <p className="text-[10px] text-muted-foreground/40 text-center truncate">
            Zadnja naredba: {lastCmd}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Voice Command Parser ─────────────────────────────────────────────────────

export function parseVoiceCommand(tekst: string): VoiceCommandResult | null {
  const t = tekst.toLowerCase().trim();
  const tokens = t.split(/\s+/);

  // ── Dodano kemikalije: "Dodano 2 kg DS3", "Dodano 1.5 litara FX" ─────────
  if (/dodano|dodao|dodala|dodaj/.test(t)) {
    const kgMatch = t.match(/(\d+[.,]?\d*)\s*(kg|kilo|kilograma)/i);
    const lMatch = t.match(/(\d+[.,]?\d*)\s*(l|litar|litara|litre)/i);
    
    // Try to find chemical name (last word or after number+unit)
    const kemikalijaNaziv = tokens
      .filter(w => !["dodano", "dodao", "dodala", "dodaj", "kg", "kilo", "kilograma", "l", "litar", "litara", "litre"].includes(w))
      .filter(w => isNaN(parseFloat(w.replace(",", "."))))
      .pop()?.toUpperCase() || undefined;

    if (kgMatch || lMatch) {
      return {
        command: "dodaj_kemikaliju",
        raw: tekst,
        kemikalijaKg: kgMatch ? parseFloat(kgMatch[1].replace(",", ".")) : undefined,
        kemikalijaL: lMatch ? parseFloat(lMatch[1].replace(",", ".")) : undefined,
        kemikalijaNaziv,
      };
    }
  }

  // ── Ciklus komande ──────────────────────────────────────────────────────────
  if (/pokreni.*ciklus|novi ciklus|zapocni ciklus|kreni.*ciklus/.test(t)) {
    return { command: "pokreni_ciklus", raw: tekst };
  }
  if (/završi.*ciklus|zavrsi.*ciklus|prekini.*ciklus|gotov.*ciklus/.test(t)) {
    return { command: "zavrsi_ciklus", raw: tekst };
  }

  // ── Ispiranje komande ───────────────────────────────────────────────────────
  if (/počni.*ispiranje|pocni.*ispiranje|pokreni.*ispiranje|kreni.*ispirati/.test(t)) {
    return { command: "pocni_ispiranje", raw: tekst };
  }
  if (/završi.*ispiranje|zavrsi.*ispiranje|gotovo.*ispiranje|ispiranje.*gotovo/.test(t)) {
    return { command: "zavrsi_ispiranje", raw: tekst };
  }

  // ── Napomena ────────────────────────────────────────────────────────────────
  if (/dodaj.*napomenu|napomena|bilješka|biljeska|komentar/.test(t)) {
    const napomenaMatch = t.match(/(?:napomenu|napomena|bilješka|biljeska|komentar)[:\s]+(.+)/i);
    return {
      command: "dodaj_napomenu",
      raw: tekst,
      napomena: napomenaMatch ? napomenaMatch[1].trim() : tekst,
    };
  }

  // ── Uzorak uzet ─────────────────────────────────────────────────────────────
  if (/uzorak.*uzet|uzeo.*uzorak|uzela.*uzorak/.test(t)) {
    const uzorkovanje = /pumpe|pumpa/.test(t) ? "pumpa" as const :
                        /povrat|povrata/.test(t) ? "povrat" as const : undefined;
    return {
      command: "uzorak_uzet",
      raw: tekst,
      uzorkovanje,
    };
  }

  return null;
}

// ─── Voice Command Button ─────────────────────────────────────────────────────

interface VoiceCommandButtonProps {
  onCommand: (result: VoiceCommandResult) => void;
}

export function VoiceCommandButton({ onCommand }: VoiceCommandButtonProps) {
  const [state, setState] = useState<"idle" | "listening" | "confirm" | "error">("idle");
  const [result, setResult] = useState<VoiceCommandResult | null>(null);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setState("listening");
    setResult(null);
    setTranscript("");

    const rec: SpeechRecognition = new SR();
    rec.lang = "hr-HR";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      
      const parsed = parseVoiceCommand(text);
      if (parsed) {
        setResult(parsed);
        setState("confirm");
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 2000);
      }
    };

    rec.onerror = () => {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    };

    rec.onend = () => {
      if (state === "listening") setState("idle");
    };

    recRef.current = rec;
    rec.start();
  }, [state]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setState("idle");
  }, []);

  const confirm = useCallback(() => {
    if (result) {
      onCommand(result);
      setState("idle");
      setResult(null);
      setTranscript("");
    }
  }, [result, onCommand]);

  const cancel = useCallback(() => {
    setState("idle");
    setResult(null);
    setTranscript("");
  }, []);

  // Format command for display
  const formatCommand = (cmd: VoiceCommandResult): string => {
    switch (cmd.command) {
      case "dodaj_kemikaliju":
        const amt = cmd.kemikalijaKg ? `${cmd.kemikalijaKg} kg` : cmd.kemikalijaL ? `${cmd.kemikalijaL} L` : "";
        return `Dodano ${amt}${cmd.kemikalijaNaziv ? ` ${cmd.kemikalijaNaziv}` : ""}`;
      case "pokreni_ciklus": return "Pokreni novi ciklus";
      case "zavrsi_ciklus": return "Završi ciklus";
      case "pocni_ispiranje": return "Počni ispiranje";
      case "zavrsi_ispiranje": return "Završi ispiranje";
      case "dodaj_napomenu": return `Napomena: ${cmd.napomena || ""}`;
      case "uzorak_uzet": return `Uzorak uzet${cmd.uzorkovanje ? ` iz ${cmd.uzorkovanje === "pumpa" ? "pumpe" : "povrata"}` : ""}`;
      default: return cmd.raw;
    }
  };

  // Confirmation panel
  if (state === "confirm" && result) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <svg className="text-emerald-500 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span className="text-xs font-semibold text-emerald-400">{formatCommand(result)}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirm}
            className="flex-1 bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-semibold active:scale-[0.98] transition-all"
          >
            Potvrdi
          </button>
          <button
            type="button"
            onClick={cancel}
            className="flex-1 bg-muted border border-border text-foreground rounded-lg py-1.5 text-xs font-medium active:scale-[0.98] transition-all"
          >
            Odustani
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <button
        type="button"
        disabled
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Nisam razumio
      </button>
    );
  }

  // Idle / Listening button
  return (
    <button
      type="button"
      onClick={state === "listening" ? stop : start}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${
        state === "listening"
          ? "bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse"
          : "bg-muted/50 border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      {state === "listening" ? "Slušam..." : "Komanda"}
    </button>
  );
}
