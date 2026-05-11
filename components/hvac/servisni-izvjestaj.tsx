"use client";

import React, { useRef, useState } from "react";
import type { Sesija, Ciklus, Mjerenje, NadopunaKemikalije } from "@/lib/types";
import { getMjerenjeTimestamp, RAZLOZI_NADOPUNE, pocetnoMjerenjeCiklusa, getMjerenjePH, nultoMjerenjeCiklusa, izracunajDeltaCiklusa } from "@/lib/types";
import { calcCleaningEffectiveness } from "@/lib/preporuka";
import { buildFinalReport, buildSummaryText } from "@/lib/report-engine";
import type { FinalReport, SubsessionReport, ResultBadge } from "@/lib/report-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
}

function fDateTime(iso?: string) {
  if (!iso) return "—";
  return `${fDate(iso)} ${fTime(iso)}`;
}

function fNum(val: number | null | undefined, decimals = 1) {
  if (val == null) return "—";
  return val.toFixed(decimals);
}

function fPct(val: number | null | undefined) {
  if (val == null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

// ─── Result badge ─────────────────────────────────────────────────────────────

const RESULT_BADGE_COLORS: Record<ResultBadge, string> = {
  "Uspješno očišćeno":         "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Djelomično očišćeno":       "bg-blue-100    text-blue-800   border-blue-300",
  "Potreban dodatni ciklus":   "bg-amber-100   text-amber-800  border-amber-300",
  "Potreban mehanički zahvat": "bg-red-100     text-red-800    border-red-300",
};

function ResultBadgeChip({ badge }: { badge: ResultBadge }) {
  return (
    <span className={`inline-block text-sm font-bold border-2 rounded-xl px-4 py-1.5 ${RESULT_BADGE_COLORS[badge]}`}>
      {badge}
    </span>
  );
}

// ─── Effectiveness badge ──────────────────────────────────────────────────────

function EffBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-[11px]">—</span>;
  const colors: Record<string, string> = {
    "Vrlo dobar učinak": "bg-emerald-100 text-emerald-800",
    "Dobar učinak":      "bg-blue-100    text-blue-800",
    "Umjeren učinak":    "bg-amber-100   text-amber-800",
    "Slab učinak":       "bg-red-100     text-red-800",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${colors[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 pb-2 mb-4 mt-8 first:mt-0">
      {children}
    </h2>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-1 bg-white shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}

// ─── Table helpers ─────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-500 px-3 py-2 border-b border-slate-200 whitespace-nowrap bg-slate-50">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-xs border-b border-slate-100 text-slate-700 ${mono ? "font-mono tabular-nums" : ""}`}>
      {children}
    </td>
  );
}

// ─── Measurements table ───────────────────────────────────────────────────────

function MjerenjaTable({ mjerenja }: { mjerenja: Mjerenje[] }) {
  if (mjerenja.length === 0) return <p className="text-xs text-slate-400 italic">Nema mjerenja.</p>;

  // Build sequential number only for non-initial measurements
  let nonInitialSeq = 0;
  const rows = mjerenja.map((m) => {
    const isInit = m.measurementType === "initial_cycle_measurement";
    if (!isInit) nonInitialSeq += 1;
    return { m, isInit, seq: isInit ? 0 : nonInitialSeq };
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <Th>#</Th>
            <Th>Tip</Th>
            <Th>Vrijeme</Th>
            <Th>pH</Th>
            <Th>Tlak (bar)</Th>
            <Th>Temp (°C)</Th>
            <Th>Protok (L/min)</Th>
            <Th>Učinak</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, isInit, seq }, i) => (
            <tr key={m.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
              <Td mono>{isInit ? "0" : seq}</Td>
              <Td>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isInit ? "bg-slate-100 text-slate-500" : "bg-teal-100 text-teal-700"}`}>
                  {isInit ? "Ref" : "Mjr"}
                </span>
              </Td>
              <Td mono>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" }) : "—"}</Td>
              <Td mono>{m.phValue != null ? m.phValue.toFixed(2) : "—"}</Td>
              <Td mono>{"—"}</Td>
              <Td mono>{(m.tempOutC ?? m.temperatureC) != null ? (m.tempOutC ?? m.temperatureC)!.toFixed(1) : "—"}</Td>
              <Td mono>{m.flowLMin != null ? m.flowLMin.toFixed(1) : "—"}</Td>
              <Td><EffBadge status={null} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Top-up table ───────────────────────────────────────────────�����─────────────

function NadopuneTable({ nadopune }: { nadopune: NadopunaKemikalije[] }) {
  if (nadopune.length === 0) return <p className="text-xs text-slate-400 italic">Nema nadopuna.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <Th>#</Th>
            <Th>Vrijeme</Th>
            <Th>Proizvod</Th>
            <Th>Dodana količina</Th>
            <Th>Razlog</Th>
          </tr>
        </thead>
        <tbody>
          {nadopune.map((n, i) => (
            <tr key={n.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
              <Td mono>{n.topUpNumber}</Td>
              <Td mono>{fTime(n.addedAt ?? n.timestamp)}</Td>
              <Td>{n.chemicalProductName ?? n.kemikalija ?? "—"}</Td>
              <Td mono>{n.amount} {n.unit}</Td>
              <Td>{n.reason ? (RAZLOZI_NADOPUNE[n.reason] ?? n.reason) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cycle block ──────────────────────────────────────────────────────────────

function CiklusBlok({ ciklus, idx }: { ciklus: Ciklus; idx: number }) {
  const eff = ciklus.cleaningEffectiveness ?? calcCleaningEffectiveness(ciklus.mjerenja);
  const lastDecision = ciklus.decisions && ciklus.decisions.length > 0
    ? ciklus.decisions[ciklus.decisions.length - 1]
    : null;
  const lastMjer = ciklus.mjerenja.length > 0 ? ciklus.mjerenja[ciklus.mjerenja.length - 1] : null;
  const finalPreporuka = lastMjer?.preporuka;
  
  // Delta kalkulacije od nultog mjerenja (točka 0 nakon kemije)
  const nultoMj = nultoMjerenjeCiklusa(ciklus);
  const delta = lastMjer ? izracunajDeltaCiklusa(ciklus, lastMjer) : null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 overflow-hidden">
        <h4 className="text-sm font-black text-slate-800 min-w-0 truncate">
          Ciklus #{ciklus.cycleNumber ?? ciklus.broj ?? idx + 1}
          {ciklus.name ? ` — ${ciklus.name}` : ""}
        </h4>
        <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${
          ciklus.status === "zavrsen" ? "bg-emerald-500/10 text-emerald-800" :
          ciklus.status === "prekinut" ? "bg-rose-500/10 text-rose-800" :
          "bg-amber-400/10 text-amber-800"
        }`}>
          {ciklus.status}
        </span>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="min-w-0 break-words">Proizvod: <strong className="text-slate-800">{ciklus.chemicalProductName ?? ciklus.kemikalija ?? "—"}</strong></span>
        <span className="min-w-0">Vol. otopine: <strong className="text-slate-800 tabular-nums">{fNum(ciklus.totalSolutionVolumeL ?? ciklus.waterVolumeL)} L</strong></span>
        <span className="min-w-0">Kemikalija: <strong className="text-slate-800 tabular-nums">{ciklus.chemicalAmount} {ciklus.chemicalUnit}</strong></span>
        {ciklus.chemicalPercent != null && (
          <span className="min-w-0">Postotak: <strong className="text-slate-800 tabular-nums">{ciklus.chemicalPercent.toFixed(2)} %</strong></span>
        )}
        <span className="min-w-0">Mjerenja: <strong className="text-slate-800 tabular-nums">{ciklus.mjerenja.length}</strong></span>
        <span className="min-w-0">Nadopune: <strong className="text-slate-800 tabular-nums">{ciklus.nadopune.length}</strong></span>
        {lastDecision && (
          <span className="col-span-2 min-w-0 break-words">Odluka: <strong className="text-slate-800">{lastDecision.decisionLabel}</strong></span>
        )}
        {eff.cleaningEffectivenessStatus && (
          <span className="col-span-2 min-w-0 break-words">Zaključak: <strong className="text-slate-800">
            {eff.cleaningEffectivenessStatus === "Vrlo dobar učinak" ? "Uspješno očišćeno — preporučuje se ispiranje i završetak servisa."
             : eff.cleaningEffectivenessStatus === "Dobar učinak" ? "Dobro čišćenje — protočnost poboljšana."
             : eff.cleaningEffectivenessStatus === "Umjeren učinak" ? "Umjereno čišćenje — razmotrite kontrolni servis."
             : eff.cleaningEffectivenessStatus === "Slab učinak" ? "Slabo čišćenje — preporučuje se ponovni servis."
             : "Nedovoljno podataka za ocjenu."}
          </strong></span>
        )}
      </div>

      {eff.cleaningEffectivenessStatus && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500">Učinkovitost:</span>
          <EffBadge status={eff.cleaningEffectivenessStatus} />
          {eff.flowImprovementPercent != null && (
            <span className="text-slate-400">({fPct(eff.flowImprovementPercent)})</span>
          )}
        </div>
      )}

      {/* Delta od nultog mjerenja */}
      {delta && (nultoMj || ciklus.zeroMeasurementPh != null) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Promjena od nultog mjerenja
          </p>
          <div className="grid grid-cols-3 gap-2">
            {delta.deltaPhFromZero != null && (
              <div>
                <span className="text-slate-500">pH: </span>
                <strong className={delta.deltaPhFromZero > 0 ? "text-amber-600" : delta.deltaPhFromZero < -0.1 ? "text-green-600" : "text-slate-800"}>
                  {delta.deltaPhFromZero > 0 ? "+" : ""}{delta.deltaPhFromZero.toFixed(2)}
                </strong>
              </div>
            )}
            {delta.deltaFlowFromZero != null && (
              <div>
                <span className="text-slate-500">Protok: </span>
                <strong className={delta.deltaFlowFromZero > 0 ? "text-green-600" : delta.deltaFlowFromZero < 0 ? "text-amber-600" : "text-slate-800"}>
                  {delta.deltaFlowFromZero > 0 ? "+" : ""}{delta.deltaFlowFromZero.toFixed(1)} L/min
                </strong>
              </div>
            )}
            {delta.flowImprovementPercent != null && (
              <div>
                <span className="text-slate-500">Poboljšanje: </span>
                <strong className={delta.flowImprovementPercent > 0 ? "text-green-600" : "text-slate-800"}>
                  {fPct(delta.flowImprovementPercent)}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Mjerenja</p>
        <MjerenjaTable mjerenja={ciklus.mjerenja} />
      </div>

      {ciklus.nadopune.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Nadopune kemikalije</p>
          <NadopuneTable nadopune={ciklus.nadopune} />
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Measurement stats section ────────────────────────────────────────────────

function MeasurementStatsGrid({ stats }: { stats: FinalReport["measurement_stats"] }) {
  const rows: [string, string][] = [
    ["Poc. mj. pH (baza)",  stats.initial_pH  != null ? stats.initial_pH.toFixed(2)  : "—"],
    ["Završni pH",  stats.final_pH    != null ? stats.final_pH.toFixed(2)    : "—"],
    ["Min pH",      stats.min_pH      != null ? stats.min_pH.toFixed(2)      : "—"],
    ["Maks pH",     stats.max_pH      != null ? stats.max_pH.toFixed(2)      : "—"],
    ["Prosjek pH",  stats.average_pH  != null ? stats.average_pH.toFixed(3)  : "—"],
    ["Maks rate/min", stats.max_rate_ph_per_min  != null ? stats.max_rate_ph_per_min.toFixed(4)  : "���"],
    ["Avg rate/min",  stats.average_rate_ph_per_min != null ? stats.average_rate_ph_per_min.toFixed(4) : "—"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="border border-slate-200 rounded-xl px-3 py-2 flex flex-col gap-0.5 overflow-hidden min-w-0 bg-white shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</p>
          <p className="text-sm font-bold font-mono tabular-nums text-slate-800 break-all">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Subsession row in summary table ─────────────────────────────────────────

function SubsessionRow({ ps, idx }: { ps: SubsessionReport; idx: number }) {
  return (
    <tr className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
      <Td>{ps.name}</Td>
      <Td>{ps.chemical_product ?? "—"}</Td>
      <Td mono>{ps.work_time_minutes != null ? `${ps.work_time_minutes} min` : "—"}</Td>
      <Td mono>{ps.measurement_stats.initial_pH != null ? ps.measurement_stats.initial_pH.toFixed(2) : "—"}</Td>
      <Td mono>{ps.measurement_stats.final_pH != null ? ps.measurement_stats.final_pH.toFixed(2) : "—"}</Td>
      <Td mono>{ps.flow.flow_before_l_min != null ? `${ps.flow.flow_before_l_min.toFixed(1)} L/m` : "—"}</Td>
      <Td mono>{ps.flow.flow_after_l_min != null ? `${ps.flow.flow_after_l_min.toFixed(1)} L/m` : "—"}</Td>
      <Td>
        <ResultBadgeChip badge={ps.result_badge} />
      </Td>
    </tr>
  );
}

// ─── Customer Summary Card ────────────────────────────────────────────────────

function CustomerSummaryCard({ report }: { report: FinalReport }) {
  const flowOk = report.flow.flow_improvement_percent != null && report.flow.flow_improvement_percent > 3;
  const flowBad = report.flow.flow_improvement_percent != null && report.flow.flow_improvement_percent < 0;

  const badgeColors: Record<ResultBadge, { bg: string; text: string; dot: string }> = {
    "Uspješno očišćeno":         { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500" },
    "Djelomično očišćeno":       { bg: "bg-sky-50 border-sky-200",         text: "text-sky-800",     dot: "bg-sky-500" },
    "Potreban dodatni ciklus":   { bg: "bg-amber-50 border-amber-200",     text: "text-amber-800",   dot: "bg-amber-500" },
    "Potreban mehanički zahvat": { bg: "bg-red-50 border-red-200",         text: "text-red-800",     dot: "bg-red-500" },
  };
  const bc = badgeColors[report.result_badge];

  const customerText =
    report.result_badge === "Uspješno očišćeno"
      ? "Vaš sustav je uspješno očišćen. Protočnost je poboljšana i sustav je spreman za normalnu upotrebu."
      : report.result_badge === "Djelomično očišćeno"
      ? "Čišćenje je djelomično završeno. Preporučujemo praćenje sustava i ponovni servis po potrebi."
      : report.result_badge === "Potreban dodatni ciklus"
      ? "Za potpuno čišćenje preporučujemo još jedan servisni ciklus."
      : "Naslage su značajne. Preporučujemo mehanički zahvat uz kemijsko čišćenje.";

  return (
    <div className={`rounded-2xl border px-5 py-4 ${bc.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${bc.dot}`} aria-hidden="true" />
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sažetak za klijenta</p>
      </div>
      <h3 className={`text-lg font-black leading-tight mb-2 ${bc.text}`}>{report.result_badge}</h3>
      <p className="text-sm text-slate-700 leading-relaxed mb-3">{customerText}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {report.total_work_time_minutes != null && (
          <div className="bg-white/60 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Trajanje servisa</p>
            <p className="font-bold text-slate-800">{report.total_work_time_minutes} min</p>
          </div>
        )}
        {report.number_of_cycles > 0 && (
          <div className="bg-white/60 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Broj ciklusa</p>
            <p className="font-bold text-slate-800">{report.number_of_cycles}</p>
          </div>
        )}
        {report.flow.flow_improvement_percent != null && (
          <div className="bg-white/60 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Poboljšanje protoka</p>
            <p className={`font-black tabular-nums ${flowOk ? "text-emerald-700" : flowBad ? "text-red-700" : "text-slate-700"}`}>
              {fPct(report.flow.flow_improvement_percent)}
            </p>
          </div>
        )}
        {report.chemical_products.length > 0 && (
          <div className="bg-white/60 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Kemijsko sredstvo</p>
            <p className="font-bold text-slate-800 truncate">{report.chemical_products[0]}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analytics Dashboard ──────────────────────────────────────────────────────

function EffectivenessScore({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-400 font-mono">—</span>;
  const color =
    pct >= 15 ? "text-emerald-600" :
    pct >= 5  ? "text-teal-600" :
    pct >= 0  ? "text-amber-600" :
    "text-red-600";
  const label =
    pct >= 15 ? "Odlično" :
    pct >= 5  ? "Dobro" :
    pct >= 0  ? "Umjereno" :
    "Slabo";
  const labelColor =
    pct >= 15 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    pct >= 5  ? "bg-teal-100 text-teal-700 border-teal-200" :
    pct >= 0  ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-red-100 text-red-700 border-red-200";
  const barW =
    pct >= 30 ? "w-full" :
    pct >= 20 ? "w-3/4" :
    pct >= 10 ? "w-1/2" :
    pct >= 5  ? "w-1/3" :
    pct >= 0  ? "w-1/5" :
    "w-0";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <p className={`text-3xl font-black tabular-nums ${color}`}>
          {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
        </p>
        <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-0.5 mb-1 ${labelColor}`}>
          {label}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${
          pct >= 15 ? "bg-emerald-500" :
          pct >= 5  ? "bg-teal-500" :
          pct >= 0  ? "bg-amber-400" :
          "bg-red-500"
        } ${barW}`} />
      </div>
    </div>
  );
}

function AnalyticsDashboard({ report, allCiklusi }: { report: FinalReport; allCiklusi: Ciklus[] }) {
  // Effectiveness — iz engine funkcije calcCleaningEffectiveness, ne računati u UI
  const allMjer = allCiklusi.flatMap((c) => c.mjerenja);
  const eff = calcCleaningEffectiveness(allMjer);

  // Maintenance recommendation — na temelju result_badge iz enginea
  const maintenanceLabel =
    report.result_badge === "Uspješno očišćeno"         ? "Preporučeno godišnje održavanje" :
    report.result_badge === "Djelomično očišćeno"       ? "Preporučena skorija kontrola" :
    report.result_badge === "Potreban dodatni ciklus"   ? "Potreban skoriji povratni servis" :
    "Potreban hitni mehanički zahvat";

  const maintenanceColor =
    report.result_badge === "Uspješno očišćeno"         ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
    report.result_badge === "Djelomično očišćeno"       ? "bg-sky-50 border-sky-200 text-sky-800" :
    report.result_badge === "Potreban dodatni ciklus"   ? "bg-amber-50 border-amber-200 text-amber-800" :
    "bg-red-50 border-red-200 text-red-800";

  // Chemistry efficiency — omjer kemikalije i poboljšanja
  const chemEff = report.flow.flow_improvement_percent != null && report.total_chemical_added_liters > 0
    ? (report.flow.flow_improvement_percent / report.total_chemical_added_liters)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 col-span-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Ukupno poboljšanje protoka</p>
          <EffectivenessScore pct={report.flow.flow_improvement_percent} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Ciklusi</p>
          <p className="text-2xl font-black text-slate-800">{report.number_of_cycles}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Kemikalija (L)</p>
          <p className="text-2xl font-black text-slate-800">{report.total_chemical_added_liters.toFixed(1)}</p>
        </div>
        {report.total_work_time_minutes != null && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Trajanje (min)</p>
            <p className="text-2xl font-black text-slate-800">{report.total_work_time_minutes}</p>
          </div>
        )}
      </div>

      {/* Effectiveness status */}
      {eff.cleaningEffectivenessStatus && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Učinkovitost čišćenja</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-700">{eff.cleaningEffectivenessStatus}</p>
            <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${
              eff.cleaningEffectivenessStatus === "Vrlo dobar učinak" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
              eff.cleaningEffectivenessStatus === "Dobar učinak"      ? "bg-teal-100 text-teal-700 border-teal-200" :
              eff.cleaningEffectivenessStatus === "Umjeren učinak"    ? "bg-amber-100 text-amber-700 border-amber-200" :
              "bg-red-100 text-red-700 border-red-200"
            }`}>
              {eff.cleaningEffectivenessStatus === "Vrlo dobar učinak" ? "Odlicno" :
               eff.cleaningEffectivenessStatus === "Dobar učinak"      ? "Dobro" :
               eff.cleaningEffectivenessStatus === "Umjeren učinak"    ? "Umjereno" : "Slabo"}
            </span>
          </div>
        </div>
      )}

      {/* Chemistry efficiency */}
      {chemEff != null && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Efikasnost kemije</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            {chemEff > 5 ? "Visoka efikasnost — kemija je postigla značajan učinak uz minimalnu potrošnju." :
             chemEff > 1 ? "Dobra efikasnost — kemija je djelovala prema očekivanjima." :
             "Niska efikasnost — naslage su bile zahtjevne, možda je potreban ponavljajući tretman."}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {chemEff.toFixed(2)}% poboljšanja / L kemikalije
          </p>
        </div>
      )}

      {/* Maintenance recommendation */}
      <div className={`rounded-2xl border px-4 py-3 ${maintenanceColor}`}>
        <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Preporuka za održavanje</p>
        <p className="text-sm font-bold">{maintenanceLabel}</p>
      </div>
    </div>
  );
}

// ─── History Timeline ─────────────────────────────────────────────────────────

type TimelineEvent =
  | { type: "measurement"; time: string; label: string; ph?: number | null; flow?: number | null; isRef?: boolean }
  | { type: "topup";       time: string; label: string; amount?: number; unit?: string; reason?: string }
  | { type: "cycle_start"; time: string; label: string; cycleNum?: number }
  | { type: "cycle_end";   time: string; label: string; cycleNum?: number; status?: string }
  | { type: "warning";     time: string; label: string; severity?: string }
  | { type: "subsession";  time: string; label: string };

function buildTimeline(sesija: Sesija, allCiklusi: Ciklus[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const isModeB = sesija.workMode !== "no_subsessions" && sesija.podsesije.length > 0;

  if (isModeB) {
    sesija.podsesije.forEach((ps) => {
      events.push({
        type: "subsession",
        time: ps.createdAt ?? "",
        label: `Podsesija: ${ps.naziv ?? ps.opis_dijela ?? ps.id.slice(0, 6)}`,
      });
      ps.ciklusi.forEach((c) => buildCycleEvents(events, c));
    });
  } else {
    allCiklusi.forEach((c) => buildCycleEvents(events, c));
  }

  return events.filter((e) => e.time).sort((a, b) => a.time.localeCompare(b.time));
}

function buildCycleEvents(events: TimelineEvent[], c: Ciklus) {
  const cycleNum = c.cycleNumber ?? c.broj;
  const startTime = c.startDateTime ?? c.timestamp_pocetka ?? c.createdAt;
  const endTime = c.endDateTime ?? c.timestamp_zavrsetka ?? c.updatedAt;

  if (startTime) events.push({ type: "cycle_start", time: startTime, label: `Ciklus #${cycleNum} — start`, cycleNum });

  c.mjerenja.forEach((m) => {
    const t = m.timestamp ?? m.createdAt;
    if (!t) return;
    const isRef = m.measurementType === "initial_cycle_measurement";
    events.push({
      type: "measurement",
      time: t,
      label: isRef ? `Referentno mjerenje — pH ${m.phValue?.toFixed(2) ?? "—"}` : `Mjerenje — pH ${m.phValue?.toFixed(2) ?? "—"}`,
      ph: m.phValue,
      flow: m.flowLMin,
      isRef,
    });
  });

  c.nadopune.forEach((n) => {
    const t = n.addedAt ?? n.timestamp ?? n.createdAt;
    if (!t) return;
    events.push({
      type: "topup",
      time: t,
      label: `Nadopuna: ${n.amount} ${n.unit} (${n.chemicalProductName ?? n.kemikalija ?? "—"})`,
      amount: n.amount,
      unit: n.unit,
      reason: n.reason ? (RAZLOZI_NADOPUNE[n.reason] ?? n.reason) : undefined,
    });
  });

  if (endTime && c.status !== "aktivan") {
    events.push({ type: "cycle_end", time: endTime, label: `Ciklus #${cycleNum} — ${c.status}`, cycleNum, status: c.status });
  }
}

const TIMELINE_STYLES: Record<string, { dot: string; line: string; bg: string; text: string; label: string }> = {
  measurement: { dot: "bg-teal-500", line: "bg-teal-200", bg: "bg-teal-50 border-teal-200", text: "text-teal-800", label: "Mjerenje" },
  topup:       { dot: "bg-sky-500",  line: "bg-sky-200",  bg: "bg-sky-50 border-sky-200",   text: "text-sky-800",   label: "Nadopuna" },
  cycle_start: { dot: "bg-slate-600",line: "bg-slate-200",bg: "bg-slate-50 border-slate-200",text: "text-slate-700", label: "Ciklus" },
  cycle_end:   { dot: "bg-emerald-500", line: "bg-emerald-200", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", label: "Završetak" },
  warning:     { dot: "bg-amber-500",line: "bg-amber-200",bg: "bg-amber-50 border-amber-200",text: "text-amber-800", label: "Upozorenje" },
  subsession:  { dot: "bg-slate-400",line: "bg-slate-100",bg: "bg-slate-50 border-slate-200",text: "text-slate-600", label: "Podsesija" },
};

function HistoryTimeline({ sesija, allCiklusi }: { sesija: Sesija; allCiklusi: Ciklus[] }) {
  const [expanded, setExpanded] = useState(false);
  const events = buildTimeline(sesija, allCiklusi);
  const displayed = expanded ? events : events.slice(0, 8);

  if (events.length === 0) {
    return <p className="text-xs text-slate-400 italic">Nema zabilježenih događaja.</p>;
  }

  return (
    <div className="flex flex-col gap-0">
      {displayed.map((ev, i) => {
        const st = TIMELINE_STYLES[ev.type] ?? TIMELINE_STYLES.measurement;
        const isLast = i === displayed.length - 1;
        return (
          <div key={i} className="flex gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-3 ${st.dot}`} aria-hidden="true" />
              {!isLast && <div className={`w-0.5 flex-1 my-0.5 ${st.line}`} aria-hidden="true" />}
            </div>
            {/* Card */}
            <div className={`flex-1 mb-1.5 rounded-xl border px-3 py-2 ${st.bg}`}>
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs font-bold leading-snug ${st.text}`}>{ev.label}</p>
                <p className="text-[10px] text-slate-400 tabular-nums shrink-0 mt-0.5">{fTime(ev.time)}</p>
              </div>
              {ev.type === "measurement" && (ev.flow != null) && (
                <p className="text-[10px] text-slate-500 mt-0.5">Protok: {ev.flow.toFixed(1)} L/min</p>
              )}
              {ev.type === "topup" && ev.reason && (
                <p className="text-[10px] text-slate-500 mt-0.5">Razlog: {ev.reason}</p>
              )}
            </div>
          </div>
        );
      })}
      {events.length > 8 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors text-left pl-5"
        >
          {expanded ? "Prikaži manje" : `Prikaži sve (${events.length} događaja)`}
        </button>
      )}
    </div>
  );
}

// ─── Warning + Contradiction History ─────────────────────────────────────────

function WarningHistorySection({ allCiklusi }: { allCiklusi: Ciklus[] }) {
  const [expanded, setExpanded] = useState(false);

  // Skupi sve warnings iz mjerenja i ciklus decisions
  const warnings: Array<{ time: string; message: string; severity: string; source: string }> = [];

  allCiklusi.forEach((c) => {
    c.mjerenja.forEach((m) => {
      const t = m.timestamp ?? m.createdAt ?? "";
      const mAny = m as unknown as Record<string, unknown>;
      if (mAny.warnings && Array.isArray(mAny.warnings)) {
        (mAny.warnings as Array<{ message?: string; level?: string; text?: string; severity?: string }>).forEach((w) => {
          warnings.push({
            time: t,
            message: w.message ?? w.text ?? String(w),
            severity: w.level ?? w.severity ?? "warning",
            source: `Ciklus #${c.cycleNumber ?? c.broj}`,
          });
        });
      }
    });
    // Decisions s warningsom
    if (c.decisions) {
      c.decisions.forEach((d: { timestamp?: string; createdAt?: string; warning?: string; warningMessage?: string }) => {
        if (d.warning ?? d.warningMessage) {
          warnings.push({
            time: d.timestamp ?? d.createdAt ?? "",
            message: d.warningMessage ?? d.warning ?? "",
            severity: "warning",
            source: `Ciklus #${c.cycleNumber ?? c.broj}`,
          });
        }
      });
    }
  });

  if (warnings.length === 0) {
    return <p className="text-xs text-slate-400 italic">Nema zabilježenih upozorenja.</p>;
  }

  const displayed = expanded ? warnings : warnings.slice(0, 4);

  return (
    <div className="flex flex-col gap-2">
      {displayed.map((w, i) => {
        const isCritical = w.severity === "critical" || w.severity === "error";
        return (
          <div key={i} className={`rounded-xl border px-3 py-2.5 ${isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-xs font-bold ${isCritical ? "text-red-800" : "text-amber-800"}`}>{w.message}</p>
              <p className="text-[10px] text-slate-400 tabular-nums shrink-0">{fTime(w.time)}</p>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{w.source}</p>
          </div>
        );
      })}
      {warnings.length > 4 && (
        <button onClick={() => setExpanded((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors text-left">
          {expanded ? "Prikaži manje" : `Prikaži sve (${warnings.length})`}
        </button>
      )}
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ report }: { report: FinalReport }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildSummaryText(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: show alert
      alert(text);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-semibold border border-white/30 text-white rounded-xl px-3 py-2.5 hover:bg-white/10 transition-colors"
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Kopirano
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Kopiraj sažetak
        </>
      )}
    </button>
  );
}

// ─── Main report component ────────────────────────────────────────────────────

interface ServisniIzvjestajProps {
  sesija: Sesija;
  onClose: () => void;
}

export function ServisniIzvjestaj({ sesija, onClose }: ServisniIzvjestajProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const report = buildFinalReport(sesija);

  const isModeA =
    sesija.workMode === "no_subsessions" ||
    (sesija.podsesije.length === 0 && (sesija.ciklusi ?? []).length > 0);

  const allCiklusi: Ciklus[] = isModeA
    ? (sesija.ciklusi ?? [])
    : sesija.podsesije.flatMap((ps) => ps.ciklusi);

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3.5 bg-teal-700 text-white gap-2 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Servisni izvještaj</p>
          <h1 className="text-base font-black text-white leading-tight truncate">{sesija.naziv_objekta}</h1>
          <p className="text-xs text-white/70">{fDate(sesija.datum)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <CopyButton report={report} />
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-semibold border border-white/30 text-white rounded-xl px-3 py-2.5 hover:bg-white/10 transition-colors"
            style={{ minHeight: 40 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            </svg>
            Ispis / PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold border border-white/30 text-white rounded-xl px-3 py-2.5 hover:bg-white/10 transition-colors"
            style={{ minHeight: 40 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Zatvori
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div ref={printRef} className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-0 print:px-0 print:py-0">

          {/* ── 1. Header ── */}
          <div className="border-2 border-teal-200 rounded-xl overflow-hidden bg-white mb-6 shadow-sm">
            <div className="bg-teal-700 px-5 py-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">Servisni izvještaj</p>
              <h2 className="text-2xl font-black text-white leading-tight text-balance">{sesija.naziv_objekta}</h2>
              {sesija.lokacija && <p className="text-sm text-white/70 mt-1">{sesija.lokacija}</p>}
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Datum servisa</p>
                <p className="font-semibold text-slate-800">{fDate(sesija.datum)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Operater</p>
                <p className="font-semibold text-slate-800">{sesija.serviser}</p>
              </div>
              {sesija.kontakt_osoba && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Kontakt osoba</p>
                  <p className="font-semibold text-slate-800">{sesija.kontakt_osoba}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Vrsta čišćenja</p>
                <p className="font-semibold text-slate-800">Uklanjanje kamenca</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Broj sesije</p>
                <p className="font-mono font-bold text-slate-800">{sesija.id.slice(0, 8).toUpperCase()}</p>
              </div>
              {report.chemical_products.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Kemijsko sredstvo</p>
                  <p className="font-semibold text-slate-800">{report.chemical_products.join(", ")}</p>
                </div>
              )}
            </div>
            {sesija.opis_problema && (
              <div className="px-5 pb-4 pt-0 border-t border-slate-200">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 mt-3">Opis problema</p>
                <p className="text-xs text-slate-700 leading-relaxed">{sesija.opis_problema}</p>
              </div>
            )}
          </div>

          {/* ── 2. Result badge ── */}
          <SectionHeading>Rezultat čišćenja</SectionHeading>
          <div className="border border-slate-200 rounded-xl bg-white mb-4 overflow-hidden shadow-sm">
            <div className="px-5 py-4 flex flex-col gap-3">
              <ResultBadgeChip badge={report.result_badge} />
              {report.result_notes.length > 0 && (
                <ul className="flex flex-col gap-2 mt-1">
                  {report.result_notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {report.final_scale_status && (
              <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Stanje kamenca</p>
                <p className="text-sm font-bold text-slate-800">{report.final_scale_status}</p>
                {report.final_recommendation && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{report.final_recommendation}</p>
                )}
              </div>
            )}
          </div>

          {/* ── 2b. Customer Summary ── */}
          <SectionHeading>Sažetak za klijenta</SectionHeading>
          <div className="mb-4">
            <CustomerSummaryCard report={report} />
          </div>

          {/* ── 2c. Analytics Dashboard ── */}
          <SectionHeading>Analitika i učinkovitost</SectionHeading>
          <div className="mb-4">
            <AnalyticsDashboard report={report} allCiklusi={allCiklusi} />
          </div>

          {/* ── 2d. Warning History ── */}
          <SectionHeading>Upozorenja</SectionHeading>
          <div className="mb-4">
            <WarningHistorySection allCiklusi={allCiklusi} />
          </div>

          {/* ── 3. Session summary ── */}
          <SectionHeading>Sažetak sesije</SectionHeading>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {!isModeA && (
              <StatCard label="Podsesije" value={String(sesija.podsesije.length)} />
            )}
            <StatCard label="Ciklusi" value={String(report.number_of_cycles)} />
            <StatCard label="Mjerenja" value={String(allCiklusi.flatMap((c) => c.mjerenja).length)} />
            <StatCard
              label="Kemikalije (L)"
              value={report.total_chemical_added_liters.toFixed(1)}
              color="text-teal-700"
            />
            {report.total_work_time_minutes != null && (
              <StatCard label="Trajanje (min)" value={String(report.total_work_time_minutes)} />
            )}
            {report.final_concentration_percent != null && (
              <StatCard label="Završna konc. %" value={report.final_concentration_percent.toFixed(2)} />
            )}
            {report.flow.flow_improvement_percent != null && (
              <StatCard
                label="Poboljš. protoka"
                value={fPct(report.flow.flow_improvement_percent)}
                color={report.flow.flow_improvement_percent > 0 ? "text-green-700" : "text-red-700"}
              />
            )}
          </div>

          {/* ── 4. Measurements (pH stats) ── */}
          <SectionHeading>Mjerenja — statistika pH</SectionHeading>
          <div className="mb-4">
            <MeasurementStatsGrid stats={report.measurement_stats} />
          </div>

          {/* ── 5. Flow stats ── */}
          {(report.flow.flow_before_l_min != null || report.flow.flow_after_l_min != null) && (
            <>
              <SectionHeading>Protok</SectionHeading>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {report.flow.flow_before_l_min != null && (
                  <StatCard label="Protok prije" value={`${report.flow.flow_before_l_min.toFixed(1)} L/min`} />
                )}
                {report.flow.flow_after_l_min != null && (
                  <StatCard label="Protok poslije" value={`${report.flow.flow_after_l_min.toFixed(1)} L/min`} />
                )}
                {report.flow.flow_improvement_percent != null && (
                  <StatCard
                    label="Poboljšanje"
                    value={fPct(report.flow.flow_improvement_percent)}
                    color={report.flow.flow_improvement_percent > 0 ? "text-emerald-700" : "text-rose-700"}
                  />
                )}
              </div>
            </>
          )}

          {/* ── 6. Subsession breakdown (Mode B only) ── */}
          {!isModeA && report.subsession_reports.length > 0 && (
            <>
              <SectionHeading>Podsesije — pregled</SectionHeading>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-left border-collapse">
                  <thead>
          <tr className="bg-slate-50">
                      <Th>Naziv</Th>
                      <Th>Sredstvo</Th>
                      <Th>Trajanje</Th>
                      <Th>Poc. pH</Th>
                      <Th>Zav. pH</Th>
                      <Th>Protok prije</Th>
                      <Th>Protok poslije</Th>
                      <Th>Rezultat</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subsession_reports.map((ps, i) => (
                      <SubsessionRow key={ps.id} ps={ps} idx={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── 6b. History Timeline ── */}
          <SectionHeading>Vremenski slijed događaja</SectionHeading>
          <div className="mb-4">
            <HistoryTimeline sesija={sesija} allCiklusi={allCiklusi} />
          </div>

          {/* ── 7. Detailed cycle blocks ── */}
          {!isModeA
            ? sesija.podsesije.map((ps, pi) => (
                <React.Fragment key={ps.id}>
                  <SectionHeading>
                    {ps.naziv ?? ps.opis_dijela ?? `Podsesija ${pi + 1}`} — Ciklusi
                  </SectionHeading>
                  <div className="flex flex-col gap-4 mb-4">
                    {ps.ciklusi.map((c, ci) => (
                      <CiklusBlok key={c.id} ciklus={c} idx={ci} />
                    ))}
                  </div>
                </React.Fragment>
              ))
            : (
              <>
                <SectionHeading>Ciklusi</SectionHeading>
                <div className="flex flex-col gap-4 mb-4">
                  {allCiklusi.map((c, ci) => (
                    <CiklusBlok key={c.id} ciklus={c} idx={ci} />
                  ))}
                </div>
              </>
            )
          }

          {/* ── 8. Final conclusion ── */}
          <SectionHeading>Zaključak</SectionHeading>
          <div className="border border-slate-200 rounded-xl p-5 bg-white mb-6 shadow-sm">
            <p className="text-sm text-slate-700 leading-relaxed">
              {report.result_notes.length > 0
                ? report.result_notes.join(" ")
                : report.flow.flow_improvement_percent != null
                  ? report.flow.flow_improvement_percent > 5
                    ? `Protok je poboljšan za ${report.flow.flow_improvement_percent.toFixed(1)}%, što ukazuje na uspješno uklanjanje naslaga. Sustav je spreman za normalnu upotrebu.`
                    : `Zabilježeno je umjereno poboljšanje protoka od ${report.flow.flow_improvement_percent.toFixed(1)}%. Preporučuje se praćenje sustava i ponavljanje tretmana po potrebi.`
                  : "Nema dovoljno podataka o protoku za automatski zaključak. Provjeri mjerenja i procijeni stanje sustava na licu mjesta."
              }
            </p>
          </div>

          {/* Signature row */}
          <div className="grid grid-cols-2 gap-8 mt-8 mb-4">
            <div className="flex flex-col gap-1">
              <div className="h-10 border-b border-slate-300" />
              <p className="text-[10px] text-slate-500">Potpis operatera</p>
              <p className="text-[11px] font-semibold text-slate-800">{sesija.serviser}</p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="h-10 border-b border-slate-300" />
              <p className="text-[10px] text-slate-500">Potpis naručitelja</p>
            </div>
          </div>

          <p className="text-[9px] text-slate-400 text-center mt-2">
            Generirao HVAC Servis · {fDateTime(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}
