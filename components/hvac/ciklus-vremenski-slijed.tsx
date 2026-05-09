"use client";

import { ScaleRemovalKartica } from "@/components/hvac/scale-removal-kartica";

/**
 * CiklusVremenskiSlijed
 *
 * Prikazuje mjerenja ciklusa grupirana po doziranju kemikalije:
 *
 * GRUPA 1 — Mjerenja prije dodavanja sredstva
 *   Referentno mjerenje (initial_cycle_measurement)
 *   Mjerenje 1, 2, 3...
 *
 * DOZIRANJE (nadopuna)
 *
 * GRUPA 2 — Mjerenja nakon dodavanja sredstva
 *   Novo referentno mjerenje (after_top_up)
 *   Mjerenje 1, 2, 3...
 *
 * Delta u svakoj grupi: od grupne reference
 * Prikazuje se i delta od pocetne reference ciklusa
 */

import React, { useMemo } from "react";
import type { Ciklus, Mjerenje, NadopunaKemikalije } from "@/lib/types";
import { getMjerenjePH, getMjerenjeTimestamp } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function phBg(ph: number): string {
  if (ph < 1.5) return "bg-green-600";
  if (ph < 2.0) return "bg-green-500";
  if (ph < 3.0) return "bg-green-400";
  if (ph < 4.0) return "bg-amber-500";
  if (ph < 4.5) return "bg-rose-500";
  return "bg-slate-500";
}

function phStatusLabel(ph: number): string {
  if (ph < 1.5) return "Aktivna kisela zona — intenzivna";
  if (ph < 2.0) return "Aktivna kisela zona — jaka";
  if (ph < 3.0) return "Aktivna kisela zona";
  if (ph < 4.0) return "Sredstvo slabi";
  if (ph < 4.5) return "Sredstvo pri kraju";
  return "Sredstvo iscrpljeno";
}

function deltaPhClass(d: number): string {
  if (d > 0.05) return "text-rose-500 font-bold";
  if (d < -0.05) return "text-green-500 font-bold";
  return "text-muted-foreground";
}

function deltaFlowClass(d: number): string {
  if (d > 0.2) return "text-green-500 font-bold";
  if (d < -0.2) return "text-rose-500 font-bold";
  return "text-muted-foreground";
}

function sign(n: number): string {
  return n > 0 ? "+" : "";
}

const FOAM_LABEL: Record<string, string> = {
  nema: "Nema", slaba: "Slaba", srednja: "Srednja",
  jaka: "Jaka", vrlo_jaka: "Vrlo jaka",
};

// ─── TEMP OUT helpers ─────────────────────────────────────────────────────────

/** Parsira EC string u broj µS/cm */
function parseEc(ec: string | undefined): number | null {
  if (!ec) return null;
  const n = parseFloat(ec.replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Boja za delta TEMP OUT: rast = zelena (bolja izmjena), pad = narančasta */
function deltaTempOutClass(d: number): string {
  if (d >= 2) return "text-green-500 font-bold";
  if (d > 0.5) return "text-green-400 font-bold";
  if (d < -2) return "text-rose-500 font-bold";
  if (d < -0.5) return "text-amber-400 font-bold";
  return "text-muted-foreground";
}

/** Boja za delta EC: rast = zelena (kamenac se otapa → raste EC), pad = siva */
function deltaEcClass(d: number): string {
  if (d >= 100) return "text-green-500 font-bold";
  if (d > 30) return "text-green-400 font-bold";
  if (d < -50) return "text-rose-500 font-bold";
  return "text-muted-foreground";
}

/**
 * Komentar provodljivosti — interpretacija rasta EC kao rezultata otapanja kamenca.
 * Kamenac (CaCO3) povećava provodljivost vode kad se otopi.
 */
function ecComment(deltaEc: number | null, ec: number | null): string | null {
  if (deltaEc === null || ec === null) return null;
  if (deltaEc >= 200) return "Znatan rast provodljivosti — intenzivno otapanje kamenca.";
  if (deltaEc >= 100) return "Povecanje provodljivosti — kamenac reagira s kiselinom.";
  if (deltaEc >= 30)  return "Blago povecanje provodljivosti — reakcija u tijeku.";
  if (deltaEc > -30 && deltaEc < 30) return "Provodljivost stabilna.";
  if (deltaEc < -30)  return "Provodljivost pada — pratiti sustav.";
  return null;
}

/** Komentar kretanja TEMP OUT */
function tempOutComment(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta >= 3)   return "Znacajan rast TEMP OUT — poboljsava se prijenos topline.";
  if (delta >= 1)   return "TEMP OUT raste — kamenac reagira.";
  if (delta > -1)   return "TEMP OUT stabilan.";
  if (delta >= -3)  return "TEMP OUT blago pada — pratiti.";
  return "TEMP OUT pada — provjeri protok i izvor topline.";
}

// ─── Group types ──────────────────────────────────────────────────────────────

type MjerenjeGroup = {
  groupIndex: number;        // 0 = prva grupa, 1+ = nakon nadopune
  groupRef: Mjerenje | null; // referentno mjerenje za ovu grupu
  mjerenja: Mjerenje[];      // sva non-ref mjerenja u grupi
  nadopunaBefore: NadopunaKemikalije | null; // nadopuna koja je pokrenula ovu grupu
};

// ─── Group builder ────────────────────────────────────────────────────────────

function buildGroups(
  mjerenja: Mjerenje[],
  nadopune: NadopunaKemikalije[]
): MjerenjeGroup[] {
  if (mjerenja.length === 0) return [];

  const sorted = [...mjerenja].sort(
    (a, b) =>
      new Date(getMjerenjeTimestamp(a)).getTime() -
      new Date(getMjerenjeTimestamp(b)).getTime()
  );

  const sortedNadopune = [...nadopune].sort((a, b) => {
    const ta = a.addedAt ?? (a as any).timestamp ?? "";
    const tb = b.addedAt ?? (b as any).timestamp ?? "";
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  // Build cut points at each nadopuna timestamp
  const cutpoints = sortedNadopune.map((n) => ({
    ts: new Date((n.addedAt ?? (n as any).timestamp ?? "")).getTime(),
    nadopuna: n,
  }));

  // Slice mjerenja into groups separated by nadopuna events
  const groups: MjerenjeGroup[] = [];
  let currentGroupMjerenja: Mjerenje[] = [];
  let groupIndex = 0;
  let cutIdx = 0;

  for (const m of sorted) {
    const mTs = new Date(getMjerenjeTimestamp(m)).getTime();

    // Check if we need to close current group and start a new one
    while (cutIdx < cutpoints.length && mTs >= cutpoints[cutIdx].ts) {
      // Close current group
      const ref = currentGroupMjerenja.find(
        (x) =>
          x.measurementType === "initial_cycle_measurement" ||
          (groupIndex > 0 && x.measurementType === "after_top_up")
      ) ?? currentGroupMjerenja[0] ?? null;

      const nonRef = currentGroupMjerenja.filter(
        (x) => x !== ref
      );

      groups.push({
        groupIndex,
        groupRef: ref,
        mjerenja: nonRef,
        nadopunaBefore: null,
      });

      // Store nadopuna ref for next group header
      const nad = cutpoints[cutIdx].nadopuna;
      cutIdx++;
      groupIndex++;
      currentGroupMjerenja = [];

      // Mark what nadopuna starts this group
      if (groups.length > 0) {
        groups[groups.length - 1] = {
          ...groups[groups.length - 1],
          nadopunaBefore: nad,
        };
      }
    }

    currentGroupMjerenja.push(m);
  }

  // Final group
  if (currentGroupMjerenja.length > 0) {
    const isFirst = groupIndex === 0;
    const ref = currentGroupMjerenja.find(
      (x) =>
        x.measurementType === "initial_cycle_measurement" ||
        (!isFirst && x.measurementType === "after_top_up")
    ) ?? currentGroupMjerenja[0] ?? null;

    const nonRef = currentGroupMjerenja.filter((x) => x !== ref);

    groups.push({
      groupIndex,
      groupRef: ref,
      mjerenja: nonRef,
      nadopunaBefore: null,
    });
  }

  return groups;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  ciklus: Ciklus;
  /** Sesija — potrebna za ukupnu procjenu kamenca */
  sesija?: import("@/lib/types").Sesija;
  showTitle?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CiklusVremenskiSlijed({ ciklus, sesija, showTitle = true }: Props) {
  const mjerenja: Mjerenje[] = ciklus.mjerenja ?? [];
  const nadopune: NadopunaKemikalije[] = ciklus.nadopune ?? [];

  const groups = useMemo(
    () => buildGroups(mjerenja, nadopune),
    [mjerenja, nadopune]
  );

  // Original cycle reference (first group's ref)
  const cycleRef = groups[0]?.groupRef ?? null;
  const cycleRefPh = cycleRef ? getMjerenjePH(cycleRef) : null;
  const cycleRefFlow = cycleRef?.flowLMin ?? null;

  // Summary: last measurement across all groups
  const allNonRef = groups.flatMap((g) => g.mjerenja);
  const allMjerenja = groups.flatMap((g) => [g.groupRef, ...g.mjerenja].filter(Boolean) as Mjerenje[]);
  const lastMj = allNonRef.length > 0 ? allNonRef[allNonRef.length - 1] : null;
  const lastPh = lastMj ? getMjerenjePH(lastMj) : null;
  const lastFlow = lastMj?.flowLMin ?? null;
  const phDeltaTotal = cycleRefPh !== null && lastPh !== null ? lastPh - cycleRefPh : null;
  const flowDeltaTotal = cycleRefFlow !== null && lastFlow !== null ? lastFlow - cycleRefFlow : null;

  // TEMP OUT summary
  // Referentna Temp OUT = nulto/referentno mjerenje ciklusa.
  // Fallback: ako nulto mjerenje nema tempOutC, uzimamo najstarije mjerenje koje ga ima (osim lastMj).
  const cycleRefTempOut: number | null = (() => {
    if (cycleRef?.tempOutC != null) return cycleRef.tempOutC;
    const fallback = allMjerenja.find(m => m.id !== lastMj?.id && m.tempOutC != null);
    return fallback?.tempOutC ?? null;
  })();
  const lastTempOut = lastMj?.tempOutC ?? null;
  const tempOutDeltaTotal = cycleRefTempOut !== null && lastTempOut !== null
    ? lastTempOut - cycleRefTempOut : null;

  // EC (provodljivost) summary — komentar rasta EC = rezultat otapanja kamenca
  const cycleRefEc = parseEc(cycleRef?.ec);
  const lastEc = parseEc(lastMj?.ec);
  const ecDeltaTotal = cycleRefEc !== null && lastEc !== null ? lastEc - cycleRefEc : null;

  // Fallback: scan all mjerenja for ec/tempOutC if lastMj doesn't have it
  const anyTempOut = allMjerenja.find((m) => m.tempOutC != null);
  const anyEc = allMjerenja.find((m) => m.ec != null);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <p className="text-xs text-muted-foreground">Nema mjerenja u ovom ciklusu.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showTitle && (
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
          Mjerenja ciklusa #{ciklus.cycleNumber ?? (ciklus as any).broj}
        </p>
      )}

      {/* ── Summary strip — 2×2 grid za mobitel ───────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Red 1: pH summary */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <SummaryCell
            label="Poc. pH"
            value={cycleRefPh !== null ? cycleRefPh.toFixed(2) : "—"}
          />
          <SummaryCell
            label="Zad. pH"
            value={lastPh !== null ? lastPh.toFixed(2) : "—"}
            delta={phDeltaTotal !== null ? `${sign(phDeltaTotal)}${phDeltaTotal.toFixed(2)}` : undefined}
            deltaClass={phDeltaTotal !== null ? (phDeltaTotal > 0 ? "text-rose-500" : "text-green-500") : undefined}
          />
        </div>
        {/* Red 2: Protok summary */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <SummaryCell
            label="Poc. protok"
            value={cycleRefFlow !== null ? cycleRefFlow.toFixed(1) : "—"}
            unit="L/min"
          />
          <SummaryCell
            label="Zad. protok"
            value={lastFlow !== null ? lastFlow.toFixed(1) : "—"}
            unit="L/min"
            delta={flowDeltaTotal !== null ? `${sign(flowDeltaTotal)}${flowDeltaTotal.toFixed(1)}` : undefined}
            deltaClass={flowDeltaTotal !== null ? (flowDeltaTotal > 0 ? "text-green-500" : "text-rose-500") : undefined}
          />
        </div>

        {/* Red 3: TEMP OUT summary — prikaz samo ako postoje podaci */}
        {(cycleRefTempOut !== null || lastTempOut !== null || anyTempOut) && (
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
            <SummaryCell
              label="Poc. TEMP OUT"
              value={cycleRefTempOut !== null ? `${cycleRefTempOut.toFixed(1)} °C` : "—"}
            />
            <SummaryCell
              label="Zad. TEMP OUT"
              value={lastTempOut !== null ? `${lastTempOut.toFixed(1)} °C` : "—"}
              delta={tempOutDeltaTotal !== null
                ? `${sign(tempOutDeltaTotal)}${tempOutDeltaTotal.toFixed(1)} °C`
                : undefined}
              deltaClass={tempOutDeltaTotal !== null
                ? (tempOutDeltaTotal >= 1 ? "text-green-500" : tempOutDeltaTotal <= -1 ? "text-rose-500" : "text-muted-foreground")
                : undefined}
            />
          </div>
        )}

        {/* Red 4: EC (provodljivost) summary + komentar */}
        {(cycleRefEc !== null || lastEc !== null || anyEc) && (
          <div className="flex flex-col border-b border-border">
            <div className="grid grid-cols-2 divide-x divide-border">
              <SummaryCell
                label="Poc. EC"
                value={cycleRefEc !== null ? `${cycleRefEc.toFixed(0)} µS` : "—"}
              />
              <SummaryCell
                label="Zad. EC"
                value={lastEc !== null ? `${lastEc.toFixed(0)} µS` : "—"}
                delta={ecDeltaTotal !== null
                  ? `${sign(ecDeltaTotal)}${ecDeltaTotal.toFixed(0)} µS`
                  : undefined}
                deltaClass={ecDeltaTotal !== null
                  ? (ecDeltaTotal >= 30 ? "text-green-500" : ecDeltaTotal <= -50 ? "text-rose-500" : "text-muted-foreground")
                  : undefined}
              />
            </div>
            {/* Komentar provodljivosti — povećanje EC = rezultat smanjenja kamenca */}
            {ecDeltaTotal !== null && (
              <div className="px-4 py-1.5">
                <p className={`text-[9px] leading-relaxed ${ecDeltaTotal >= 30 ? "text-green-400" : "text-muted-foreground/70"}`}>
                  {ecComment(ecDeltaTotal, lastEc)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border flex items-center justify-between px-4 py-2">
          <span className="text-[10px] text-muted-foreground">
            {mjerenja.length} {mjerenja.length === 1 ? "mjerenje" : "mjerenja"}
            {nadopune.length > 0 && `, ${nadopune.length} nadopun${nadopune.length === 1 ? "a" : "e"}`}
          </span>
          {phDeltaTotal !== null && (
            <span className={`text-[10px] font-bold ${phDeltaTotal > 0 ? "text-rose-500" : phDeltaTotal < 0 ? "text-green-500" : "text-muted-foreground"}`}>
              ΔpH ukupno: {sign(phDeltaTotal)}{phDeltaTotal.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* ── Servisni zaključak ciklusa — prikazati samo ako ima barem 1 redovno mjerenje */}
      {lastMj && allNonRef.length >= 1 && (() => {
        const flowPct = cycleRefFlow && lastFlow
          ? Math.round(((lastFlow - cycleRefFlow) / cycleRefFlow) * 100)
          : null;
        const dTemp = tempOutDeltaTotal;

        // Ocjena rezultata
        const ocjena = (() => {
          if (flowPct !== null && flowPct >= 30 && dTemp !== null && dTemp >= 3) return "Vrlo dobar rezultat";
          if (flowPct !== null && flowPct >= 20) return "Dobar rezultat";
          if (flowPct !== null && flowPct >= 5)  return "Umjeren rezultat";
          if (flowPct !== null && flowPct > 0)   return "Blago poboljšanje";
          if (flowPct !== null && flowPct <= 0)  return "Bez vidljivog poboljšanja protoka";
          return "Rezultat nije moguće procijeniti";
        })();

        // Rečenice opisa
        const dijelovi: string[] = [];
        if (flowPct !== null && flowPct >= 5)
          dijelovi.push(`Protok je porastao za ${flowPct}%`);
        else if (flowPct !== null && flowPct > 0)
          dijelovi.push(`Protok je blago porastao za ${flowPct}%`);
        else if (flowPct !== null && flowPct === 0)
          dijelovi.push("Protok se nije promijenio");

        if (dTemp !== null && dTemp >= 0.5)
          dijelovi.push(`Temp OUT je porasla za ${dTemp.toFixed(1)} °C`);
        else if (dTemp !== null && dTemp <= -0.5)
          dijelovi.push(`Temp OUT je pala za ${Math.abs(dTemp).toFixed(1)} °C`);

        if (phDeltaTotal !== null && phDeltaTotal > 1.5)
          dijelovi.push("pH je značajno porastao — sredstvo iscrpljeno");
        else if (phDeltaTotal !== null && phDeltaTotal > 0.5)
          dijelovi.push("pH je porastao — reakcija pri kraju");

        const opisRezultata = dijelovi.join(". ") + (dijelovi.length > 0 ? "." : "");

        // Preporuka
        const preporuka = (() => {
          if (flowPct !== null && flowPct >= 20 && (dTemp === null || dTemp >= 1))
            return "Ako je rezultat zadovoljavajući, završiti ciklus i isprati sustav. Ako još postoji sumnja na kamenac, pokrenuti novi ciklus.";
          if (flowPct !== null && flowPct >= 5)
            return "Razmotrite novi ciklus za daljnje poboljšanje. Ako je rezultat dovoljan, završite čišćenje i isperite sustav.";
          if (flowPct !== null && flowPct <= 0)
            return "Provjerite cirkulaciju i ispravnost spoja. Razmotrite novi ciklus s drugačijim pristupom.";
          return "Nastavite pratiti reakciju. Dodajte novo mjerenje ili razmotrite nadopunu sredstva.";
        })();

        const ocjenaColor =
          ocjena.startsWith("Vrlo") ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
          : ocjena.startsWith("Dobar") ? "text-blue-400 border-blue-500/30 bg-blue-500/5"
          : ocjena.startsWith("Umjeren") ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
          : "text-muted-foreground border-border bg-muted/30";

        return (
          <div className={`rounded-2xl border px-4 py-4 flex flex-col gap-2 ${ocjenaColor}`}>
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Zaključak ciklusa</span>
            <p className="text-base font-black leading-snug text-foreground">{ocjena}</p>
            {opisRezultata && (
              <p className="text-sm text-foreground/80 leading-relaxed">{opisRezultata}</p>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-white/10 pt-2 mt-0.5">
              {preporuka}
            </p>
          </div>
        );
      })()}

      {/* ── Groups ───────────────────────────────��─────────────────────────── */}
      {groups.map((group, gIdx) => (
        <div key={gIdx} className="flex flex-col gap-1.5">

          <GroupHeader
            group={group}
            totalGroups={groups.length}
            cycleRefPh={cycleRefPh}
            cycleRefFlow={cycleRefFlow}
          />

          {/* Mjerenja — kartica format, bez kolone-headera */}
          <div className="flex flex-col gap-1.5">
            {group.groupRef && (
              <RefRow
                m={group.groupRef}
                isGroupRef={group.groupIndex > 0}
                cycleRefPh={cycleRefPh}
                cycleRefFlow={cycleRefFlow}
              />
            )}

            {group.mjerenja.map((m, mIdx) => {
              const prevInGroup =
                mIdx === 0
                  ? group.groupRef
                  : group.mjerenja[mIdx - 1];

              return (
                <MjerenjeRow
                  key={m.id}
                  m={m}
                  num={mIdx + 1}
                  prevM={prevInGroup ?? null}
                  groupRef={group.groupRef}
                  cycleRef={cycleRef}
                  showCycleDelta={group.groupIndex > 0}
                />
              );
            })}

            {group.mjerenja.length === 0 && !group.groupRef && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground text-center">
                Nema mjerenja u ovoj grupi.
              </div>
            )}
          </div>

          {group.nadopunaBefore && gIdx < groups.length - 1 && (
            <NadopunaSeparator nadopuna={groups[gIdx + 1]?.nadopunaBefore ?? group.nadopunaBefore} />
          )}
        </div>
      ))}

      {/* Procjena skinutog kamenca — prikazati samo ako postoji sesija kontekst i ima mjerenja */}
      {sesija && mjerenja.length >= 1 && (
        <ScaleRemovalKartica ciklus={ciklus} sesija={sesija} compact />
      )}
    </div>
  );
}



// ─── Group header ─────────────────────────────────────────────────────────────

function GroupHeader({
  group,
  totalGroups,
  cycleRefPh,
  cycleRefFlow,
}: {
  group: MjerenjeGroup;
  totalGroups: number;
  cycleRefPh: number | null;
  cycleRefFlow: number | null;
}) {
  const isFirst = group.groupIndex === 0;
  const label = isFirst
    ? totalGroups > 1
      ? "Mjerenja prije dodavanja sredstva"
      : "Mjerenja ciklusa"
    : `Mjerenja nakon dodavanja sredstva (Grupo ${group.groupIndex + 1})`;

  // Group-level summary: first vs last in group
  const allInGroup = [group.groupRef, ...group.mjerenja].filter(Boolean) as Mjerenje[];
  const firstPh = allInGroup[0] ? getMjerenjePH(allInGroup[0]) : null;
  const lastInGroup = allInGroup[allInGroup.length - 1];
  const lastPh = lastInGroup ? getMjerenjePH(lastInGroup) : null;
  const phDelta = firstPh !== null && lastPh !== null && allInGroup.length > 1 ? lastPh - firstPh : null;

  return (
    <div className={`flex items-center justify-between px-1 py-1.5 ${isFirst ? "" : "mt-1"}`}>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      {phDelta !== null && (
        <span className={`text-[9px] font-bold tabular-nums px-2 py-0.5 rounded-full ${phDelta > 0.05 ? "text-rose-600 bg-rose-500/10" : phDelta < -0.05 ? "text-emerald-600 bg-emerald-500/10" : "text-muted-foreground bg-muted"}`}>
          ΔpH: {sign(phDelta)}{phDelta.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ─── Nadopuna separator ───────────────────────────────────────────────────────

function NadopunaSeparator({ nadopuna }: { nadopuna: NadopunaKemikalije }) {
  const ts = nadopuna.addedAt ?? (nadopuna as any).timestamp ?? "";
  return (
    <div className="relative flex items-center gap-2 my-2">
      <div className="flex-1 border-t-2 border-dashed border-amber-400/40" />
      <div className="shrink-0 rounded-2xl bg-amber-400/10 border-2 border-amber-400/30 px-4 py-2.5 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
            Naknadno dodano
          </span>
          {ts && (
            <span className="text-[9px] text-muted-foreground tabular-nums">{fTime(ts)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-medium">{nadopuna.chemicalProductName ?? (nadopuna as any).kemikalija ?? "—"}</span>
          {(nadopuna.amount ?? (nadopuna as any).kolicina) && (
            <span className="font-black text-foreground">
              {nadopuna.amount ?? (nadopuna as any).kolicina} {nadopuna.unit ?? "L"}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 border-t-2 border-dashed border-amber-400/40" />
    </div>
  );
}

// ─── Reference measurement row ────────────────────────────────────────────────

function RefRow({
  m,
  isGroupRef,
  cycleRefPh,
  cycleRefFlow,
}: {
  m: Mjerenje;
  isGroupRef: boolean;
  cycleRefPh: number | null;
  cycleRefFlow: number | null;
}) {
  const ph = getMjerenjePH(m);
  const ts = getMjerenjeTimestamp(m);
  const label = isGroupRef ? "Novo ref." : "Ref.";
  const dotColor = phBg(ph);

  // For group refs (after top-up), show delta from cycle start
  const phFromCycle = isGroupRef && cycleRefPh !== null ? ph - cycleRefPh : null;
  const flowFromCycle = isGroupRef && cycleRefFlow !== null && m.flowLMin != null
    ? m.flowLMin - cycleRefFlow
    : null;

  return (
    <div className="rounded-2xl border border-violet-500/40 bg-violet-500/5 overflow-hidden">
      {/* Header red */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-[11px] font-black text-violet-400 uppercase tracking-wide">{label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{fTime(ts)}</span>
      </div>

      {/* Data: 2×2 kartica grid */}
      <div className="grid grid-cols-2 divide-x divide-violet-500/10">
        {/* pH */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">pH</span>
          <span className="text-xl font-black tabular-nums text-foreground leading-none">{ph.toFixed(2)}</span>
          <span className="text-[9px] text-muted-foreground leading-tight">{phStatusLabel(ph)}</span>
        </div>

        {/* Δ pH od ciklusa */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Δ pH {phFromCycle !== null ? "od poc." : ""}
          </span>
          {phFromCycle !== null ? (
            <span className={`text-xl font-black tabular-nums leading-none ${deltaPhClass(phFromCycle)}`}>
              {sign(phFromCycle)}{phFromCycle.toFixed(2)}
            </span>
          ) : (
            <span className="text-xl font-black tabular-nums leading-none text-muted-foreground/30">—</span>
          )}
        </div>
      </div>

      {/* Protok red */}
      <div className="grid grid-cols-2 divide-x divide-violet-500/10 border-t border-violet-500/10">
        {/* Protok */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Protok</span>
          {m.flowLMin != null ? (
            <>
              <span className="text-xl font-black tabular-nums text-foreground leading-none">{m.flowLMin.toFixed(1)}</span>
              <span className="text-[9px] text-muted-foreground">L/min</span>
            </>
          ) : (
            <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
          )}
        </div>

        {/* Δ Protok od ciklusa */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Δ Protok {flowFromCycle !== null ? "od poc." : ""}
          </span>
          {flowFromCycle !== null ? (
            <>
              <span className={`text-xl font-black tabular-nums leading-none ${deltaFlowClass(flowFromCycle)}`}>
                {sign(flowFromCycle)}{flowFromCycle.toFixed(1)}
              </span>
              <span className="text-[9px] text-muted-foreground">L/min</span>
            </>
          ) : (
            <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
          )}
        </div>
      </div>

      {/* TEMP OUT + EC red — samo ako postoje podaci */}
      {(m.tempOutC != null || m.ec != null) && (
        <div className="grid grid-cols-2 divide-x divide-violet-500/10 border-t border-violet-500/10">
          {/* TEMP OUT */}
          <div className="px-3 py-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">TEMP OUT</span>
            {m.tempOutC != null ? (
              <>
                <span className="text-xl font-black tabular-nums text-foreground leading-none">
                  {m.tempOutC.toFixed(1)}
                </span>
                <span className="text-[9px] text-muted-foreground">°C izlaz</span>
              </>
            ) : (
              <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
            )}
          </div>

          {/* EC provodljivost */}
          <div className="px-3 py-2.5 flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">EC provodljivost</span>
            {m.ec != null ? (
              <>
                <span className="text-xl font-black tabular-nums text-foreground leading-none">
                  {parseEc(m.ec)?.toFixed(0) ?? m.ec}
                </span>
                <span className="text-[9px] text-muted-foreground">µS/cm</span>
              </>
            ) : (
              <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
            )}
          </div>
        </div>
      )}

      {/* Foam + napomena */}
      {((m.foamLevel && m.foamLevel !== "nema") || m.note || (m as any).napomena) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-violet-500/10">
          {m.foamLevel && m.foamLevel !== "nema" && (
            <span className="text-[9px] text-muted-foreground">
              Pjena: {FOAM_LABEL[m.foamLevel] ?? m.foamLevel}
            </span>
          )}
          {(m.note ?? (m as any).napomena) && (
            <span className="text-[9px] italic text-muted-foreground truncate">
              {m.note ?? (m as any).napomena}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Measurement row ──────────────────────────────────────────────────────────

function MjerenjeRow({
  m,
  num,
  prevM,
  groupRef,
  cycleRef,
  showCycleDelta,
}: {
  m: Mjerenje;
  num: number;
  prevM: Mjerenje | null;
  groupRef: Mjerenje | null;
  cycleRef: Mjerenje | null;
  showCycleDelta: boolean;
}) {
  const ph = getMjerenjePH(m);
  const ts = getMjerenjeTimestamp(m);
  const dotColor = phBg(ph);

  // Delta from previous measurement in group
  const prevPh = prevM ? getMjerenjePH(prevM) : null;
  const deltaPh = prevPh !== null ? ph - prevPh : null;
  const prevFlow = prevM?.flowLMin ?? null;
  const deltaFlow = m.flowLMin != null && prevFlow != null ? m.flowLMin - prevFlow : null;

  // Delta from group reference
  const groupRefPh = groupRef ? getMjerenjePH(groupRef) : null;
  const deltaPhFromGroupRef = groupRefPh !== null ? ph - groupRefPh : null;
  const groupRefFlow = groupRef?.flowLMin ?? null;
  const deltaFlowFromGroupRef = m.flowLMin != null && groupRefFlow != null ? m.flowLMin - groupRefFlow : null;

  // Delta from cycle start reference (shown as secondary info in group 2+)
  const cycleRefPh = cycleRef ? getMjerenjePH(cycleRef) : null;
  const deltaPhFromCycle = showCycleDelta && cycleRefPh !== null ? ph - cycleRefPh : null;
  const cycleRefFlow = cycleRef?.flowLMin ?? null;
  const deltaFlowFromCycle = showCycleDelta && m.flowLMin != null && cycleRefFlow != null
    ? m.flowLMin - cycleRefFlow
    : null;

  const deltaPhLabel = showCycleDelta ? "Δ pH od poc." : "Δ pH od ref.";
  const deltaFlowLabel = showCycleDelta ? "Δ Protok od poc." : "Δ Protok od ref.";
  // Primary delta: from group ref (most relevant)
  const displayDeltaPh = deltaPhFromGroupRef;
  const displayDeltaFlow = deltaFlowFromGroupRef;

  // TEMP OUT delta od group ref i od cycle ref
  const groupRefTempOut = groupRef?.tempOutC ?? null;
  const deltaTempOutFromGroupRef = m.tempOutC != null && groupRefTempOut != null
    ? m.tempOutC - groupRefTempOut : null;
  const cycleRefTempOut: number | null = cycleRef?.tempOutC ?? null;
  const deltaTempOutFromCycle = showCycleDelta && m.tempOutC != null && cycleRefTempOut != null
    ? m.tempOutC - cycleRefTempOut : null;

  // EC (provodljivost) delta od group ref
  const mEc = parseEc(m.ec);
  const groupRefEcVal = parseEc(groupRef?.ec);
  const cycleRefEcVal = parseEc(cycleRef?.ec);
  const deltaEcFromGroupRef = mEc !== null && groupRefEcVal !== null ? mEc - groupRefEcVal : null;
  const deltaEcFromCycle = showCycleDelta && mEc !== null && cycleRefEcVal !== null
    ? mEc - cycleRefEcVal : null;
  // Komentar EC za ovo mjerenje
  const ecKomentar = ecComment(deltaEcFromGroupRef ?? deltaEcFromCycle, mEc);
  const tempOutKom = tempOutComment(deltaTempOutFromGroupRef ?? deltaTempOutFromCycle);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header red: broj + status + vrijeme */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs font-black text-foreground">Mjerenje {num}</span>
          <span className="text-[9px] text-muted-foreground/70 leading-tight">{phStatusLabel(ph)}</span>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{fTime(ts)}</span>
      </div>

      {/* Data: 2×2 kartica grid */}
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* pH */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">pH</span>
          <span className="text-xl font-black tabular-nums text-foreground leading-none">{ph.toFixed(2)}</span>
        </div>

        {/* Δ pH */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">{deltaPhLabel}</span>
          {displayDeltaPh !== null ? (
            <>
              <span className={`text-xl font-black tabular-nums leading-none ${deltaPhClass(displayDeltaPh)}`}>
                {sign(displayDeltaPh)}{displayDeltaPh.toFixed(2)}
              </span>
              {/* Sekundarno: delta od poc. ciklusa (samo u grupi 2+) */}
              {deltaPhFromCycle !== null && (
                <span className={`text-[9px] tabular-nums ${deltaPhClass(deltaPhFromCycle)}`}>
                  {sign(deltaPhFromCycle)}{deltaPhFromCycle.toFixed(2)}{" "}
                  <span className="text-muted-foreground/50 font-normal">poc. cikl.</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
          )}
        </div>
      </div>

      {/* Protok red */}
      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        {/* Protok */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Protok</span>
          {m.flowLMin != null ? (
            <>
              <span className="text-xl font-black tabular-nums text-foreground leading-none">{m.flowLMin.toFixed(1)}</span>
              <span className="text-[9px] text-muted-foreground">L/min</span>
            </>
          ) : (
            <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
          )}
        </div>

        {/* Δ Protok */}
        <div className="px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">{deltaFlowLabel}</span>
          {displayDeltaFlow !== null ? (
            <>
              <span className={`text-xl font-black tabular-nums leading-none ${deltaFlowClass(displayDeltaFlow)}`}>
                {sign(displayDeltaFlow)}{displayDeltaFlow.toFixed(1)}
              </span>
              <span className="text-[9px] text-muted-foreground">L/min</span>
              {deltaFlowFromCycle !== null && (
                <span className={`text-[9px] tabular-nums ${deltaFlowClass(deltaFlowFromCycle)}`}>
                  {sign(deltaFlowFromCycle)}{deltaFlowFromCycle.toFixed(1)}{" "}
                  <span className="text-muted-foreground/50 font-normal">poc. cikl.</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
          )}
        </div>
      </div>

      {/* TEMP OUT + EC red — samo ako postoje podaci */}
      {(m.tempOutC != null || m.ec != null) && (
        <div className="border-t border-border">
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* TEMP OUT */}
            <div className="px-3 py-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">TEMP OUT</span>
              {m.tempOutC != null ? (
                <>
                  <span className={`text-xl font-black tabular-nums leading-none ${deltaTempOutFromGroupRef !== null ? deltaTempOutClass(deltaTempOutFromGroupRef) : "text-foreground"}`}>
                    {m.tempOutC.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">°C izlaz</span>
                  {deltaTempOutFromGroupRef !== null && (
                    <span className={`text-[9px] tabular-nums ${deltaTempOutClass(deltaTempOutFromGroupRef)}`}>
                      {sign(deltaTempOutFromGroupRef)}{deltaTempOutFromGroupRef.toFixed(1)} °C{" "}
                      <span className="text-muted-foreground/50 font-normal">od ref.</span>
                    </span>
                  )}
                  {deltaTempOutFromCycle !== null && (
                    <span className={`text-[9px] tabular-nums ${deltaTempOutClass(deltaTempOutFromCycle)}`}>
                      {sign(deltaTempOutFromCycle)}{deltaTempOutFromCycle.toFixed(1)} °C{" "}
                      <span className="text-muted-foreground/50 font-normal">poc. cikl.</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
              )}
            </div>

            {/* EC provodljivost */}
            <div className="px-3 py-2.5 flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">EC provodljivost</span>
              {mEc != null ? (
                <>
                  <span className={`text-xl font-black tabular-nums leading-none ${deltaEcFromGroupRef !== null ? deltaEcClass(deltaEcFromGroupRef) : "text-foreground"}`}>
                    {mEc.toFixed(0)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">µS/cm</span>
                  {deltaEcFromGroupRef !== null && (
                    <span className={`text-[9px] tabular-nums ${deltaEcClass(deltaEcFromGroupRef)}`}>
                      {sign(deltaEcFromGroupRef)}{deltaEcFromGroupRef.toFixed(0)} µS{" "}
                      <span className="text-muted-foreground/50 font-normal">od ref.</span>
                    </span>
                  )}
                  {deltaEcFromCycle !== null && (
                    <span className={`text-[9px] tabular-nums ${deltaEcClass(deltaEcFromCycle)}`}>
                      {sign(deltaEcFromCycle)}{deltaEcFromCycle.toFixed(0)} µS{" "}
                      <span className="text-muted-foreground/50 font-normal">poc. cikl.</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xl font-black text-muted-foreground/30 leading-none">—</span>
              )}
            </div>
          </div>

          {/* Komentari — kretanje TEMP OUT i EC interpretacija */}
          {(ecKomentar || tempOutKom) && (
            <div className="px-3 py-1.5 flex flex-col gap-0.5 border-t border-border/50">
              {tempOutKom && (
                <p className={`text-[9px] leading-relaxed ${deltaTempOutFromGroupRef !== null && deltaTempOutFromGroupRef >= 1 ? "text-green-400" : "text-muted-foreground/70"}`}>
                  {tempOutKom}
                </p>
              )}
              {ecKomentar && (
                <p className={`text-[9px] leading-relaxed ${deltaEcFromGroupRef !== null && deltaEcFromGroupRef >= 30 ? "text-green-400" : "text-muted-foreground/70"}`}>
                  {ecKomentar}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Foam + napomena */}
      {((m.foamLevel && m.foamLevel !== "nema") || m.note || (m as any).napomena) && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border">
          {m.foamLevel && m.foamLevel !== "nema" && (
            <span className="text-[9px] text-muted-foreground">
              Pjena: {FOAM_LABEL[m.foamLevel] ?? m.foamLevel}
            </span>
          )}
          {(m.note ?? (m as any).napomena) && (
            <span className="text-[9px] italic text-muted-foreground truncate">
              {m.note ?? (m as any).napomena}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary cell ─────────────────────────────────────────────────────────────

function SummaryCell({
  label, value, unit, delta, deltaClass,
}: {
  label: string; value: string; unit?: string; delta?: string; deltaClass?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-1 py-2.5 gap-0.5">
      <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground text-center leading-tight">
        {label}
      </span>
      <div className="flex items-baseline gap-0.5">
        <span className="text-sm font-black tabular-nums text-foreground leading-none">{value}</span>
        {unit && <span className="text-[8px] text-muted-foreground">{unit}</span>}
      </div>
      {delta && (
        <span className={`text-[9px] tabular-nums leading-none ${deltaClass ?? "text-muted-foreground"}`}>
          {delta}
        </span>
      )}
    </div>
  );
}


