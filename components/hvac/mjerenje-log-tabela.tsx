"use client";

import { useState } from "react";
import type { Mjerenje, Ciklus } from "@/lib/types";
import { getMjerenjePH, getMjerenjeTimestamp } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtElapsed(minutes: number | undefined): string {
  if (minutes === undefined || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function phColor(ph: number): string {
  if (ph < 2.0) return "text-red-700 font-bold";
  if (ph < 3.0) return "text-orange-600 font-bold";
  if (ph < 4.5) return "text-amber-600 font-semibold";
  if (ph < 6.5) return "text-green-700 font-semibold";
  return "text-muted-foreground font-medium";
}

function phRowBg(ph: number): string {
  if (ph < 2.0) return "bg-red-950/30";
  if (ph < 3.0) return "bg-orange-950/25";
  if (ph < 4.5) return "bg-amber-950/20";
  return "";
}

function deltaColor(delta: number | undefined): string {
  if (delta === undefined) return "text-muted-foreground";
  if (delta > 0.1) return "text-orange-600 font-semibold";
  if (delta < -0.05) return "text-green-700 font-semibold";
  return "text-muted-foreground";
}

function rateColor(rate: number | undefined): string {
  if (rate === undefined) return "text-muted-foreground";
  if (rate > 0.05) return "text-green-700 font-semibold";
  if (rate > 0.02) return "text-amber-600";
  if (rate < 0) return "text-muted-foreground";
  return "text-orange-600";
}

const TYPE_LABEL: Record<string, string> = {
  initial_cycle_measurement: "Poc.",
  regular: "Mj.",
  after_top_up: "Nad.",
  final_cycle: "Zav.",
  final_subsession: "Zav.",
  final_session: "Zav.",
};

const FOAM_LABELS: Record<string, string> = {
  nema: "Nema",
  slaba: "Slaba",
  srednja: "Srednja",
  jaka: "Jaka",
  vrlo_jaka: "Vrlo jaka",
};

const REACTION_LABELS: Record<string, string> = {
  nema: "Nema",
  slaba: "Slaba",
  normalna: "Normalna",
  jaka: "Jaka",
  vrlo_jaka: "Vrlo jaka",
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function MjerenjeRedak({
  mjerenje,
  index,
  zeroPh,
  zeroFlow,
}: {
  mjerenje: Mjerenje;
  index: number;
  zeroPh: number | null;
  zeroFlow: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const ph = getMjerenjePH(mjerenje);
  const ts = getMjerenjeTimestamp(mjerenje);
  const typeLabel = TYPE_LABEL[mjerenje.measurementType] ?? "Mj.";
  const deltaVsZero = zeroPh !== null ? ph - zeroPh : undefined;
  const flowDeltaVsPrev = mjerenje.flowChangeFromPrevious;
  const isInitial = mjerenje.measurementType === "initial_cycle_measurement";

  // Conclusion: prefer saved interpretation, then preporuka statusLabel
  const conclusion =
    mjerenje.interpretation ??
    mjerenje.preporuka?.statusLabel ??
    null;

  const recommendedAction =
    mjerenje.preporuka?.recommendedActionLabel ??
    mjerenje.preporuka?.cycleDecision ??
    null;

  // Temp delta za ovo mjerenje (vs. pocetno)
  const tempDelta = mjerenje.tempOutC !== undefined && zeroPh !== null
    ? mjerenje.tempOutC
    : null;

  return (
    <div className={`border border-border rounded-xl overflow-hidden ${phRowBg(ph)}`}>
      {/* Main row — kartica format per spec §5 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="px-4 py-3 flex flex-col gap-1.5">
          {/* Red 1: # + vrijeme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isInitial ? (
                <span className="text-xs font-bold text-violet-400 uppercase tracking-wide">Poc.</span>
              ) : (
                <span className="text-base font-black text-foreground">#{index}</span>
              )}
              <span className="text-base font-bold text-foreground tabular-nums">{fmtTime(ts)}</span>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`text-muted-foreground/40 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {/* Red 2: pH, Protok, Temp */}
          <div className="flex items-baseline gap-4">
            <span className={`text-lg font-black tabular-nums ${phColor(ph)}`}>
              pH: {ph.toFixed(2)}
              {deltaVsZero !== undefined && !isInitial && (
                <span className={`text-sm font-semibold ml-1 ${deltaColor(deltaVsZero)}`}>
                  ({deltaVsZero > 0 ? "+" : ""}{deltaVsZero.toFixed(2)})
                </span>
              )}
            </span>
            {mjerenje.flowLMin !== undefined && (
              <span className="text-lg font-black text-foreground tabular-nums">
                Protok: {mjerenje.flowLMin.toFixed(0)}
                {flowDeltaVsPrev !== undefined && !isInitial && (
                  <span className={`text-sm font-semibold ml-1 ${flowDeltaVsPrev >= 0 ? "text-green-400" : "text-orange-400"}`}>
                    ({flowDeltaVsPrev >= 0 ? "+" : ""}{flowDeltaVsPrev.toFixed(1)})
                  </span>
                )}
              </span>
            )}
            {mjerenje.tempOutC !== undefined && (
              <span className="text-sm font-bold text-orange-300 tabular-nums">
                Temp: {mjerenje.tempOutC.toFixed(1)} °C
              </span>
            )}
          </div>

          {/* Red 3: Status */}
          {conclusion && (
            <span className="text-sm text-muted-foreground leading-snug">{conclusion}</span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-background/60 px-3 py-3 flex flex-col gap-2.5">
          {/* Status tada + Preporuka tada — spec §8 */}
          {mjerenje.preporuka && (
            <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-24 shrink-0">Status tada</span>
                <span className="text-xs font-bold text-foreground">
                  {mjerenje.preporuka.statusLabel ?? (() => {
                    const ph = getMjerenjePH(mjerenje);
                    const action = mjerenje.preporuka.recommendedAction;
                    if (action === "add_top_up") return "Potrebna nadopuna";
                    if (action === "finish_cycle") return "Reakcija pri kraju";
                    // For monitor/continue actions use phZone boundaries matching preporuka.ts
                    if (action === "monitor_next_measurement" || action === "continue_circulation") {
                      if (ph >= 4.0) return "Otopina nije aktivna";
                      if (ph >= 3.0) return "Reakcija slabi";
                      if (ph >= 2.0) return "Aktivna reakcija";
                      if (ph >= 1.5) return "Jaka aktivnost";
                      return "Vrlo agresivna zona";
                    }
                    return "—";
                  })()}
                </span>
              </div>
              {mjerenje.preporuka.explanation && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-24 shrink-0 pt-0.5">Preporuka</span>
                  <p className="text-xs text-primary font-semibold leading-snug">{mjerenje.preporuka.explanation}</p>
                </div>
              )}
            </div>
          )}

          {/* Recommended action */}
          {recommendedAction && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24 shrink-0">Sljedeci korak</span>
              <span className="text-xs font-bold text-primary">{recommendedAction}</span>
            </div>
          )}

          {/* Foam / reaction */}
          {(mjerenje.foamLevel || mjerenje.visibleReaction) && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-20 shrink-0">Vizualno</span>
              <span className="text-xs text-foreground">
                {mjerenje.foamLevel && mjerenje.foamLevel !== "nema" && `Pjena: ${FOAM_LABELS[mjerenje.foamLevel] ?? mjerenje.foamLevel}`}
                {mjerenje.foamLevel && mjerenje.foamLevel !== "nema" && mjerenje.visibleReaction && mjerenje.visibleReaction !== "nema" && " · "}
                {mjerenje.visibleReaction && mjerenje.visibleReaction !== "nema" && `Reakcija: ${REACTION_LABELS[mjerenje.visibleReaction] ?? mjerenje.visibleReaction}`}
              </span>
            </div>
          )}

          {/* Note */}
          {(mjerenje.note ?? mjerenje.napomena) && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-20 shrink-0 pt-0.5">Napomena</span>
              <p className="text-xs text-muted-foreground italic leading-relaxed">{mjerenje.note ?? mjerenje.napomena}</p>
            </div>
          )}

          {/* Warnings */}
          {mjerenje.preporuka?.warnings && mjerenje.preporuka.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {mjerenje.preporuka.warnings.map((w, wi) => (
                  <div key={wi} className="flex items-start gap-1.5 bg-red-950/50 border border-red-700/50 rounded-lg px-2 py-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5 text-red-400">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-[10px] text-red-300 leading-tight">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* ΔpH vs initial row */}
          {deltaVsZero !== undefined && !isInitial && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-20 shrink-0">ΔpH vs. poc.</span>
              <span className={`text-xs font-semibold tabular-nums ${deltaColor(deltaVsZero)}`}>
                {deltaVsZero > 0 ? "+" : ""}{deltaVsZero.toFixed(3)}
              </span>
            </div>
          )}

          {/* Flow vs initial */}
          {mjerenje.flowChangeFromInitial !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-20 shrink-0">Protok vs. poc.</span>
              <span className={`text-xs font-semibold tabular-nums ${mjerenje.flowChangeFromInitial >= 0 ? "text-green-700" : "text-orange-600"}`}>
                {mjerenje.flowChangeFromInitial >= 0 ? "+" : ""}{mjerenje.flowChangeFromInitial.toFixed(1)} L/min
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Column header ─────────────────────────────────────────────────────────────

function ColHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{label}</span>
      {sub && <span className="text-[8px] text-muted-foreground/50 leading-none">{sub}</span>}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface MjerenjeLogTabelaProps {
  ciklus: Ciklus;
}

export function MjerenjeLogTabela({ ciklus }: MjerenjeLogTabelaProps) {
  const mjerenja = [...ciklus.mjerenja].sort(
    (a, b) =>
      new Date(getMjerenjeTimestamp(a)).getTime() -
      new Date(getMjerenjeTimestamp(b)).getTime()
  );

  if (mjerenja.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">Nema mjerenja u ovom ciklusu.</p>
      </div>
    );
  }

  // Zero measurement for delta vs. initial calculation
  const zeroPh = mjerenja[0] ? getMjerenjePH(mjerenja[0]) : null;
  const zeroFlow = mjerenja[0]?.flowLMin ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Zero-measurement summary bar */}
      {mjerenja[0] && (
        <div className="bg-violet-950/50 border border-violet-700/50 rounded-xl px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Poc. mjer.</span>
          <span className="font-bold text-violet-200">pH {zeroPh?.toFixed(2)}</span>
          {zeroFlow !== null && (
            <span className="text-violet-300">{zeroFlow.toFixed(1)} L/min</span>
          )}
          <span className="text-violet-400">{fmtTime(getMjerenjeTimestamp(mjerenja[0]))}</span>
          {ciklus.chemicalPercent != null && (
            <span className="text-violet-300 font-medium">{ciklus.chemicalPercent.toFixed(2)}% kemije</span>
          )}
        </div>
      )}

      {/* All measurement rows newest-first */}
      {(() => {
        // Build a sequential counter for non-initial measurements (ascending)
        let nonInitialCounter = 0;
        const withIndex = mjerenja.map((m) => {
          if (m.measurementType === "initial_cycle_measurement") {
            return { m, idx: 0 };
          }
          nonInitialCounter += 1;
          return { m, idx: nonInitialCounter };
        });
        return [...withIndex].reverse().map(({ m, idx }) => (
          <MjerenjeRedak
            key={m.id}
            mjerenje={m}
            index={idx}
            zeroPh={zeroPh}
            zeroFlow={zeroFlow}
          />
        ));
      })()}

      <p className="text-[10px] text-muted-foreground/40 text-center pt-1">
        {mjerenja.length} {mjerenja.length === 1 ? "mjerenje" : "mjerenja"} · prikazano od najnovijeg
      </p>
    </div>
  );
}
