"use client";

/**
 * MjerenjeSekvencija
 *
 * Shows per the spec:
 * 1. pH and flow sequence strips (1.5 → 2.1 → 2.8 ...)
 * 2. Dual-line chart (pH + protok over time)
 * 3. Stabilisation banner
 * 4. Measurement history card list
 * 5. Cycle summary (start vs last, % improvement)
 */

import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { Mjerenje, ReactionStabilityResult } from "@/lib/types";
import { getMjerenjePH, getMjerenjeTimestamp } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fTime(iso: string) {
  return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
}

function trend(delta: number, threshold: number): "↑" | "↓" | "→" {
  if (delta > threshold) return "↑";
  if (delta < -threshold) return "↓";
  return "→";
}

function trendColor(arrow: "↑" | "↓" | "→", metric: "ph" | "flow"): string {
  // pH: rising is bad (red), falling is good (green)
  // flow: rising is good (green), falling is bad (red)
  if (arrow === "→") return "text-muted-foreground";
  if (metric === "ph") return arrow === "↑" ? "text-red-500" : "text-green-500";
  return arrow === "↑" ? "text-green-500" : "text-red-500";
}

function phStatusLabel(ph: number): string {
  if (ph < 2.0) return "Vrlo jaka reakcija";
  if (ph < 3.0) return "Aktivna reakcija";
  if (ph < 4.0) return "Sredstvo slabi";
  return "Sredstvo iscrpljeno";
}

function phStatusBadge(ph: number): string {
  if (ph < 2.0) return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  if (ph < 3.0) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (ph < 4.0) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** All measurements of the current cycle, sorted ascending by time */
  mjerenja: Mjerenje[];
  /** Baseline flow — from pre-chemical measurement or session setup */
  baselineFlowLMin?: number;
  stability?: ReactionStabilityResult | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MjerenjeSekvencija({ mjerenja, baselineFlowLMin, stability }: Props) {
  if (mjerenja.length === 0) return null;

  const sorted = useMemo(
    () => [...mjerenja].sort((a, b) =>
      new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
    ),
    [mjerenja]
  );

  const baseline = sorted.find((m) => m.measurementType === "initial_cycle_measurement") ?? sorted[0];
  const regularMj = sorted.filter((m) => m.measurementType !== "initial_cycle_measurement");

  const baselinePh = getMjerenjePH(baseline);
  const baselineFlow = baseline?.flowLMin ?? baselineFlowLMin ?? null;

  const lastMj = regularMj.length > 0 ? regularMj[regularMj.length - 1] : sorted[sorted.length - 1];
  const lastPh = getMjerenjePH(lastMj);
  const lastFlow = lastMj.flowLMin ?? null;

  // ── Per-measurement derived data ─────────────────────────────────────────
  const items = useMemo(() =>
    sorted.map((m, i) => {
      const ph = getMjerenjePH(m);
      const prevM = i > 0 ? sorted[i - 1] : null;
      const prevPh = prevM ? getMjerenjePH(prevM) : null;
      const deltaPh = prevPh !== null ? ph - prevPh : null;
      const deltaFlow = (m.flowLMin != null && prevM?.flowLMin != null)
        ? m.flowLMin - prevM.flowLMin : null;
      const deltaPhFromStart = i > 0 ? ph - baselinePh : null;
      const deltaFlowFromStart = (m.flowLMin != null && baselineFlow != null)
        ? m.flowLMin - baselineFlow : null;
      const ts = getMjerenjeTimestamp(m);
      const prevTs = prevM ? getMjerenjeTimestamp(prevM) : null;
      const deltaMin = prevTs
        ? Math.round((new Date(ts).getTime() - new Date(prevTs).getTime()) / 60000)
        : null;
      const phRate = (deltaPh !== null && deltaMin && deltaMin > 0)
        ? deltaPh / deltaMin : null;
      const flowPct = (baselineFlow && baselineFlow > 0 && m.flowLMin != null)
        ? ((m.flowLMin - baselineFlow) / baselineFlow) * 100 : null;
      const isInitial = m.measurementType === "initial_cycle_measurement";
      const num = isInitial ? 0 : regularMj.indexOf(m) + 1;
      return {
        m, ph, deltaPh, deltaFlow, deltaPhFromStart, deltaFlowFromStart,
        deltaMin, phRate, flowPct, isInitial, num,
        phArrow: deltaPh !== null ? trend(deltaPh, 0.05) : null,
        flowArrow: deltaFlow !== null ? trend(deltaFlow, 0.2) : null,
      };
    }),
    [sorted, baselinePh, baselineFlow, regularMj]
  );

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    sorted.map((m) => ({
      t: fTime(getMjerenjeTimestamp(m)),
      pH: parseFloat(getMjerenjePH(m).toFixed(2)),
      Protok: m.flowLMin != null ? parseFloat(m.flowLMin.toFixed(1)) : null,
    })),
    [sorted]
  );

  const hasFlow = sorted.some((m) => m.flowLMin != null);

  // ── Stabilisation check (spec §8) ────────────────────────────────────────
  const stableFromSpec = useMemo(() => {
    const last3 = sorted.slice(-3);
    if (last3.length < 2) return false;
    const phs = last3.map((m) => getMjerenjePH(m));
    const maxDelta = Math.max(...phs) - Math.min(...phs);
    const avgRate = items.slice(-3).reduce((acc, d) => acc + Math.abs(d.phRate ?? 0), 0) / 3;
    const flowStable = last3.every((m) => m.flowLMin == null ||
      last3[0].flowLMin == null ||
      Math.abs((m.flowLMin ?? 0) - (last3[0].flowLMin ?? 0)) <= 1);
    const foamWeak = last3.every((m) => !m.foamLevel || m.foamLevel === "nema" || m.foamLevel === "slaba");
    return maxDelta < 0.2 && avgRate < 0.01 && flowStable && foamWeak;
  }, [sorted, items]);

  const isStable = stability?.status === "stable" || stableFromSpec;

  // ── Sequence strips ───────────────────────────────────────────────────────
  const phValues = sorted.map((m) => getMjerenjePH(m).toFixed(2));
  const flowValues = sorted.filter((m) => m.flowLMin != null).map((m) => m.flowLMin!.toFixed(1));

  return (
    <div className="flex flex-col gap-5">

      {/* 1. Stabilisation banner */}
      {isStable && (
        <div className="rounded-2xl border-2 border-green-400/60 bg-green-950/40 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-green-400/70 mb-1">Status reakcije</p>
          <p className="text-xl font-black text-green-300 mb-1">REAKCIJA STABILNA</p>
          <p className="text-sm text-green-300/80 mb-2">Kemijsko ciscenje je vjerojatno zavrseno.</p>
          <p className="text-xs font-bold text-green-400 uppercase tracking-widest">Sljedeci korak: ISPIRANJE + NEUTRALIZACIJA</p>
        </div>
      )}

      {/* 2. Sequence strips */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tijek mjerenja</p>

        {/* pH sequence */}
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">pH</p>
          <div className="flex items-center flex-wrap gap-1">
            {phValues.map((v, i) => (
              <React.Fragment key={i}>
                <span className="text-sm font-black tabular-nums text-foreground">{v}</span>
                {i < phValues.length - 1 && (
                  <span className="text-muted-foreground/50 font-bold text-xs">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Flow sequence */}
        {hasFlow && (
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Protok (L/min)</p>
            <div className="flex items-center flex-wrap gap-1">
              {flowValues.map((v, i) => (
                <React.Fragment key={i}>
                  <span className="text-sm font-black tabular-nums text-foreground">{v}</span>
                  {i < flowValues.length - 1 && (
                    <span className="text-muted-foreground/50 font-bold text-xs">→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Line chart */}
      {chartData.length >= 2 && (
        <div className="rounded-2xl border border-border bg-card px-3 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">Graf mjerenja</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="ph"
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              {hasFlow && (
                <YAxis
                  yAxisId="flow"
                  orientation="right"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
              )}
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                }}
                labelStyle={{ fontWeight: 700 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              />
              <Line
                yAxisId="ph"
                type="monotone"
                dataKey="pH"
                stroke="#f87171"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#f87171" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              {hasFlow && (
                <Line
                  yAxisId="flow"
                  type="monotone"
                  dataKey="Protok"
                  stroke="#60a5fa"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#60a5fa" }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 4. Measurement card history */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Povijest mjerenja</p>
        {[...items].reverse().map((item) => {
          const { m, ph, deltaPh, deltaFlow, deltaPhFromStart, deltaFlowFromStart, isInitial, num, phArrow, flowArrow } = item;
          const ts = getMjerenjeTimestamp(m);
          const statusLabel = phStatusLabel(ph);
          const statusBadge = phStatusBadge(ph);

          return (
            <div
              key={m.id}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-xs font-black text-foreground">
                  {isInitial ? "Referentno mjerenje" : `Mjerenje #${num}`}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">{fTime(ts)}</p>
              </div>

              {/* Card body — vertical stack, one concept per row */}
              <div className="flex flex-col divide-y divide-border text-xs">

                {/* 1. pH */}
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">pH</span>
                  <div className="flex items-baseline gap-1.5 ml-auto">
                    <span className="text-xl font-black tabular-nums text-foreground leading-none">{ph.toFixed(2)}</span>
                    {phArrow && (
                      <span className={`text-base font-black ${trendColor(phArrow, "ph")}`}>{phArrow}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {deltaPh !== null && (
                      <span className={`text-[10px] tabular-nums font-semibold ${deltaPh > 0 ? "text-red-500" : deltaPh < 0 ? "text-green-500" : "text-muted-foreground"}`}>
                        {deltaPh > 0 ? "+" : ""}{deltaPh.toFixed(2)} od preth.
                      </span>
                    )}
                    {deltaPhFromStart !== null && (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {deltaPhFromStart > 0 ? "+" : ""}{deltaPhFromStart.toFixed(2)} od ref.
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Protok */}
                {m.flowLMin != null && (
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">Protok</span>
                    <div className="flex items-baseline gap-1 ml-auto">
                      <span className="text-xl font-black tabular-nums text-foreground leading-none">{m.flowLMin.toFixed(1)}</span>
                      <span className="text-[10px] text-muted-foreground">L/min</span>
                      {flowArrow && (
                        <span className={`text-base font-black ${trendColor(flowArrow, "flow")}`}>{flowArrow}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {deltaFlow !== null && (
                        <span className={`text-[10px] tabular-nums font-semibold ${deltaFlow > 0 ? "text-green-500" : deltaFlow < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {deltaFlow > 0 ? "+" : ""}{deltaFlow.toFixed(1)} od preth.
                        </span>
                      )}
                      {deltaFlowFromStart !== null && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {deltaFlowFromStart > 0 ? "+" : ""}{deltaFlowFromStart.toFixed(1)} L/min od ref.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Status / badges */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusBadge}`}>
                    {statusLabel}
                  </span>
                  {m.foamLevel && m.foamLevel !== "nema" && (
                    <span className="text-[10px] text-muted-foreground">Pjena: {m.foamLevel}</span>
                  )}
                  {m.colorIndicator && m.colorIndicator !== "nije_primjenjivo" && (
                    <span className="text-[10px] text-muted-foreground">Boja: {m.colorIndicator}</span>
                  )}
                  {isInitial && (
                    <span className="text-[10px] text-primary/70 font-semibold">Referentno (baseline)</span>
                  )}
                </div>

                {/* 4. Note */}
                {(m.note ?? m.napomena) && (
                  <div className="px-4 py-2.5">
                    <span className="text-[10px] italic text-muted-foreground">
                      &ldquo;{m.note ?? m.napomena}&rdquo;
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Cycle summary */}
      {regularMj.length >= 1 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sazetak ciklusa (referentno → zadnje)</p>
          </div>
          <div className="flex flex-col divide-y divide-border text-xs">
            {/* pH summary row */}
            <div className="px-4 py-3 flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">pH</p>
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground">Referentni</span>
                <span className="font-black tabular-nums text-foreground">{baselinePh.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground">Zadnji</span>
                <span className="font-black tabular-nums text-foreground">{lastPh.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-border pt-1 mt-1">
                <span className="text-muted-foreground">Ukupna promjena</span>
                <span className={`font-black tabular-nums ${lastPh - baselinePh > 0 ? "text-red-500" : "text-green-500"}`}>
                  {lastPh - baselinePh > 0 ? "+" : ""}{(lastPh - baselinePh).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Protok summary row */}
            {hasFlow && baselineFlow !== null && lastFlow !== null && (
              <div className="px-4 py-3 flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Protok</p>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">Referentni</span>
                  <span className="font-black tabular-nums text-foreground">{baselineFlow.toFixed(1)} L/min</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">Zadnji</span>
                  <span className="font-black tabular-nums text-foreground">{lastFlow.toFixed(1)} L/min</span>
                </div>
                <div className="flex justify-between items-baseline border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">Poboljsanje</span>
                  <span className={`font-black tabular-nums ${lastFlow - baselineFlow >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {lastFlow - baselineFlow >= 0 ? "+" : ""}
                    {baselineFlow > 0
                      ? `${(((lastFlow - baselineFlow) / baselineFlow) * 100).toFixed(0)}%`
                      : `${(lastFlow - baselineFlow).toFixed(1)} L/min`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
