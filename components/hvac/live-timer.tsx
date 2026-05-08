"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveTimerHandle {
  /** Returns current elapsed seconds */
  getElapsedSeconds: () => number;
}

interface LiveTimerProps {
  /** Called when elapsed seconds changes (every second while running) */
  onTick?: (elapsedSeconds: number) => void;
  /** Initial elapsed seconds (e.g. to restore after remount) */
  initialSeconds?: number;
  /** If true the timer starts automatically */
  autoStart?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveTimer({ onTick, initialSeconds = 0, autoStart = false }: LiveTimerProps) {
  const [elapsed, setElapsed] = useState(initialSeconds);
  const [running, setRunning] = useState(autoStart);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return; // already running
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        onTick?.(next);
        return next;
      });
    }, 1000);
  }, [onTick]);

  useEffect(() => {
    if (running) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [running, start, stop]);

  const handleStartPause = () => setRunning((r) => !r);

  const handleReset = () => {
    setRunning(false);
    setElapsed(0);
    onTick?.(0);
  };

  const isActive = running && elapsed > 0;
  const hasTime = elapsed > 0;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Timer display */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Trajanje čišćenja
          </span>
          <span
            className={`text-3xl font-mono font-bold leading-none tabular-nums transition-colors ${
              running ? "text-primary" : hasTime ? "text-foreground" : "text-muted-foreground/40"
            }`}
          >
            {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          {running && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </span>
          )}
          {!running && hasTime && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              Pauzirano
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center divide-x divide-border">
        <button
          type="button"
          onClick={handleStartPause}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
            running
              ? "text-amber-700 hover:bg-amber-50"
              : "text-primary hover:bg-primary/5"
          }`}
        >
          {running ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pauza
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              {hasTime ? "Nastavi" : "Start"}
            </>
          )}
        </button>

        {hasTime && (
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
