"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimerInterval = "bez" | number;
type TimerState = "idle" | "running" | "paused" | "alarming" | "reset-feedback";

interface MjerenjeTimerProps {
  /** ISO timestamp of the last measurement — used to compute "time since last" */
  lastMjerenjeAt: string | null;
  /** Called when the alarm fires (time expired) — parent should open measurement modal */
  onAlarm: () => void;
  /** Whether the timer should be paused (cycle finished, rinsing, session closed) */
  paused?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMM_SS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


// ─── Glasovna obavijest (Web Speech API) ─────────────────────────────────────

function speakAlarm() {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance("Vrijeme je za novo mjerenje.");
    utt.lang = "hr-HR";
    utt.rate = 0.95;
    utt.volume = 1;
    // Pokusaj odabrati hrvatski glas ako postoji
    const voices = window.speechSynthesis.getVoices();
    const hrVoice = voices.find((v) => v.lang.startsWith("hr"));
    if (hrVoice) utt.voice = hrVoice;
    window.speechSynthesis.speak(utt);
  } catch {
    // Speech synthesis nije dostupan — tihi fallback
  }
}

// ─── Alarm sound (Web Audio API — no external assets) ────────────────────────

function playAlarm() {
  try {
    const ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
    [0, 0.3, 0.6].forEach((t) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      osc.frequency.setValueAtTime(660, ctx.currentTime + t + 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.29);
    });
  } catch {
    // Web Audio nije dostupan — tihi fallback
  }
}

// ─── Glasovni unos — parsira "8 minuta", "postavi timer 10 minuta" itd. ───────

function parseVoiceMinutes(text: string): number | null {
  // Normalizacija
  const t = text.toLowerCase()
    .replace(/jedanaest/g, "11").replace(/dvanaest/g, "12")
    .replace(/trinaest/g, "13").replace(/četrnaest/g, "14").replace(/petnaest/g, "15")
    .replace(/šesnaest/g, "16").replace(/sedamnaest/g, "17").replace(/osamnaest/g, "18")
    .replace(/devetnaest/g, "19").replace(/dvadeset/g, "20").replace(/trideset/g, "30")
    .replace(/deset/g, "10").replace(/devet/g, "9").replace(/osam/g, "8")
    .replace(/sedam/g, "7").replace(/šest/g, "6").replace(/pet/g, "5")
    .replace(/četiri/g, "4").replace(/tri/g, "3").replace(/dva|dvije/g, "2").replace(/jedan/g, "1");
  const m = t.match(/(\d+)\s*(min|minut)/);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 1 && v <= 999) return v;
  }
  return null;
}



// ─── Component ────────────────────────────────────────────────────────────────

export function MjerenjeTimer({ lastMjerenjeAt, onAlarm, paused = false }: MjerenjeTimerProps) {
  const [interval, setInterval_]   = useState<TimerInterval>("bez");
  const [minutesInput, setMinutesInput] = useState("10");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback]   = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const soundEnabledRef = useRef(true);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const [remaining, setRemaining]   = useState<number | null>(null);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [confirmStop, setConfirmStop] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsedMinutes = Math.max(1, Math.min(999, parseInt(minutesInput, 10) || 1));
  const intervalSeconds = interval === "bez" ? 0 : parsedMinutes * 60;

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Pauziraj ako je vanjski paused
  useEffect(() => {
    if (paused && timerState === "running") {
      clearTick();
      setTimerState("paused");
    }
  }, [paused, timerState, clearTick]);

  // Novo mjerenje — resetiraj na idle
  useEffect(() => {
    clearTick();
    setTimerState("idle");
    setRemaining(null);
    setConfirmStop(false);
  }, [lastMjerenjeAt, clearTick]);

  // Cleanup pri unmount
  useEffect(() => () => clearTick(), [clearTick]);

  const startTick = useCallback((startFrom: number) => {
    clearTick();
    setRemaining(startFrom);
    setTimerState("running");
    tickRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearTick();
          setTimerState("alarming");
          if (soundEnabledRef.current) { playAlarm(); speakAlarm(); }
          onAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTick, onAlarm]);

  // ── Glasovni unos ──────────────────────────────────────────────────────────
  const handleVoiceInput = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceFeedback("Glasovni unos nije podrzan u ovom pregledniku.");
      setTimeout(() => setVoiceFeedback(null), 3000);
      return;
    }
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "hr-HR";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    recognitionRef.current = rec;
    setVoiceListening(true);
    setVoiceFeedback("Slusam...");
    rec.onresult = (e: any) => {
      for (let i = 0; i < e.results[0].length; i++) {
        const transcript = e.results[0][i].transcript;
        const mins = parseVoiceMinutes(transcript);
        if (mins !== null) {
          setMinutesInput(String(mins));
          setInterval_(mins);
          setVoiceFeedback(`Timer: ${mins} min`);
          setTimeout(() => setVoiceFeedback(null), 2000);
          return;
        }
      }
      setVoiceFeedback("Nisam razumio. Recite npr. \"10 minuta\".");
      setTimeout(() => setVoiceFeedback(null), 3000);
    };
    rec.onerror = () => {
      setVoiceFeedback("Greska pri prepoznavanju glasa.");
      setTimeout(() => setVoiceFeedback(null), 2500);
    };
    rec.onend = () => setVoiceListening(false);
    rec.start();
  }, [voiceListening]);

  const handleStart         = useCallback(() => { if (!paused) startTick(intervalSeconds); }, [paused, intervalSeconds, startTick]);
  const handlePauziraj      = () => { clearTick(); setTimerState("paused"); };
  const handleNastavi       = () => { if (remaining !== null && !paused) startTick(remaining); };
  const handleZaustaviConfirm = () => { clearTick(); setRemaining(null); setTimerState("idle"); setConfirmStop(false); };
  const handlePonisti       = () => { clearTick(); setRemaining(intervalSeconds); setTimerState("reset-feedback"); };
  const handleDismissAlarm  = () => { setTimerState("idle"); setRemaining(null); };

  const rem        = remaining ?? intervalSeconds;
  const pct        = intervalSeconds > 0 ? Math.max(0, Math.min(1, rem / intervalSeconds)) : 0;
  const almostDone = timerState === "running" && rem <= 60;

  // ── Alarm ─────────────────────────────────────────────────────────────────
  if (timerState === "alarming") {
    return (
      <div className="rounded-2xl overflow-hidden border-2 border-red-700/60 bg-red-950/70 shadow-lg">
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-300">Podsjetnik</span>
          </div>
          <p className="text-lg font-black text-red-100 leading-tight">
            Vrijeme je isteklo — potrebno je izvrsiti novo mjerenje.
          </p>
          <button
            type="button"
            onClick={() => { handleDismissAlarm(); onAlarm(); }}
            className="w-full py-3 rounded-xl bg-red-800/60 border border-red-600/50 text-red-100 font-bold text-sm active:scale-[0.98] transition-all"
          >
            Unesi mjerenje
          </button>
          <button
            type="button"
            onClick={handleDismissAlarm}
            className="w-full py-2 rounded-xl text-red-300/70 text-xs font-medium"
          >
            Odbaci
          </button>
        </div>
      </div>
    );
  }

  // ── Aktivan / pauziran ────────────────────────────────────────────────────
  if (timerState === "running" || timerState === "paused") {
    return (
      <div className={`rounded-2xl overflow-hidden border-2 transition-colors ${
        almostDone
          ? "border-amber-700/60 bg-amber-950/60"
          : timerState === "paused"
          ? "border-border/60 bg-muted/30"
          : "border-border bg-card"
      }`}>
        <div className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {timerState === "paused" ? "Timer je pauziran" : "Sljedece mjerenje za"}
            </span>
            {timerState === "paused" && (
              <span className="text-[10px] font-semibold text-amber-400">Pauza</span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-mono font-black tabular-nums leading-none ${
              almostDone ? "text-amber-200" : timerState === "paused" ? "text-muted-foreground" : "text-foreground"
            }`}>
              {fmtMM_SS(rem)}
            </span>
            {almostDone && (
              <span className="text-xs font-bold text-amber-400 animate-pulse">Uskoro!</span>
            )}
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                almostDone ? "bg-amber-400" : timerState === "paused" ? "bg-muted-foreground/40" : "bg-primary"
              }`}
              style={{ width: `${pct * 100}%` }}
            />
          </div>

          {confirmStop ? (
            <div className="mt-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 flex flex-col gap-2">
              <p className="text-xs font-semibold text-foreground">Zaustaviti timer?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmStop(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="button"
                  onClick={handleZaustaviConfirm}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-destructive/80 text-destructive-foreground hover:bg-destructive transition-colors"
                >
                  Zaustavi timer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 mt-1">
              {timerState === "running" ? (
                <button
                  type="button"
                  onClick={handlePauziraj}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pauziraj
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNastavi}
                  disabled={paused}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                >
                  Nastavi
                </button>
              )}
              <button
                type="button"
                onClick={handlePonisti}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                Ponisti
              </button>
              <button
                type="button"
                onClick={() => setConfirmStop(true)}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-muted text-muted-foreground hover:text-destructive transition-colors"
              >
                Zaustavi
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Reset feedback ────────────────────────────────────────────────────────
  if (timerState === "reset-feedback") {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Podsjetnik za mjerenje
          </span>
        </div>
        <div className="px-4 pb-3 flex flex-col gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Timer je ponisten.</p>
          <span className="text-2xl font-mono font-black tabular-nums text-foreground">
            {fmtMM_SS(intervalSeconds)}
          </span>
          <button
            type="button"
            onClick={handleStart}
            disabled={paused}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Pokreni timer
          </button>
        </div>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Kada zelite sljedece mjerenje?
        </span>
        <button
          type="button"
          onClick={() => setSoundEnabled((p) => !p)}
          className={`ml-auto shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
            soundEnabled
              ? "bg-primary/10 text-primary border border-primary/20"
              : "bg-muted text-muted-foreground border border-border"
          }`}
          title={soundEnabled ? "Zvuk ukljucen" : "Zvuk iskljucen"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {soundEnabled ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            )}
          </svg>
          Zvuk
        </button>
      </div>



      {/* Bez timera opcija */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setInterval_("bez")}
          className={`w-full px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
            interval === "bez"
              ? "bg-muted text-foreground border-border"
              : "bg-transparent text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          Bez timera
        </button>
      </div>

      {/* Rucni unos — label + input + mic */}
      <div className="px-3 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rucni unos</span>
      </div>
      <div className="px-3 pb-3 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={999}
          value={minutesInput}
          onChange={(e) => {
            setMinutesInput(e.target.value);
            setInterval_(parseInt(e.target.value, 10) || 1);
          }}
          placeholder="min"
          className="flex-1 rounded-xl border-2 border-border bg-background px-3 py-2.5 text-xl font-black tabular-nums text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        <span className="text-xs font-semibold text-muted-foreground shrink-0">min</span>
        {/* Mic gumb za glasovni unos */}
        <button
          type="button"
          onClick={handleVoiceInput}
          className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border-2 transition-colors ${
            voiceListening
              ? "bg-red-500/20 border-red-400 text-red-400 animate-pulse"
              : "bg-muted border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Glasovni unos"
          aria-label="Glasovni unos minuta"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
      </div>

      {/* Voice feedback */}
      {voiceFeedback && (
        <div className="px-3 pb-2">
          <p className="text-xs font-semibold text-primary/80 text-center">{voiceFeedback}</p>
        </div>
      )}

      {/* Gumb za pokretanje — ne prikazuje se kad je odabrano "Bez" */}
      {interval !== "bez" && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={paused}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Pokreni timer
          </button>
        </div>
      )}
    </div>
  );
}
