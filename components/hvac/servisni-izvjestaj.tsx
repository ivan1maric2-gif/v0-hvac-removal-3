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
  "Uspješno očišćeno":         "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
  "Djelomično očišćeno":       "bg-blue-500/10   text-blue-800    dark:text-blue-200    border-blue-500/30",
  "Potreban dodatni ciklus":   "bg-amber-400/10  text-amber-800   dark:text-amber-200   border-amber-400/30",
  "Potreban mehanički zahvat": "bg-rose-500/10   text-rose-800    dark:text-rose-200    border-rose-500/30",
};

function ResultBadgeChip({ badge }: { badge: ResultBadge }) {
  return (
    <span className={`inline-block text-sm font-bold border-2 rounded-2xl px-4 py-1.5 ${RESULT_BADGE_COLORS[badge]}`}>
      {badge}
    </span>
  );
}

// ─── Effectiveness badge ──────────────────────────────────────────────────────

function EffBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const colors: Record<string, string> = {
    "Vrlo dobar učinak": "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    "Dobar učinak":      "bg-blue-500/10   text-blue-800    dark:text-blue-200",
    "Umjeren učinak":    "bg-amber-400/10  text-amber-800   dark:text-amber-200",
    "Slab učinak":       "bg-rose-500/10   text-rose-800    dark:text-rose-200",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${colors[status] ?? "bg-muted text-foreground"}`}>
      {status}
    </span>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border pb-2 mb-4 mt-8 first:mt-0">
      {children}
    </h2>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-border rounded-2xl p-4 flex flex-col gap-1 bg-card">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

// ─── Table helpers ─────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 px-3 py-2 border-b border-border whitespace-nowrap bg-muted/30">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-xs border-b border-border/40 ${mono ? "font-mono tabular-nums" : ""}`}>
      {children}
    </td>
  );
}

// ─── Measurements table ───────────────────────────────────────────────────────

function MjerenjaTable({ mjerenja }: { mjerenja: Mjerenje[] }) {
  if (mjerenja.length === 0) return <p className="text-xs text-muted-foreground italic">Nema mjerenja.</p>;

  // Build sequential number only for non-initial measurements
  let nonInitialSeq = 0;
  const rows = mjerenja.map((m) => {
    const isInit = m.measurementType === "initial_cycle_measurement";
    if (!isInit) nonInitialSeq += 1;
    return { m, isInit, seq: isInit ? 0 : nonInitialSeq };
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/30">
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
            <tr key={m.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              <Td mono>{isInit ? "0" : seq}</Td>
              <Td>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isInit ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                  {isInit ? "Ref" : "Mjr"}
                </span>
              </Td>
              <Td mono>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" }) : "—"}</Td>
              <Td mono>{m.ph_value != null ? m.ph_value.toFixed(2) : "—"}</Td>
              <Td mono>{m.pressure_bar != null ? m.pressure_bar.toFixed(2) : "—"}</Td>
              <Td mono>{m.temperature_c != null ? m.temperature_c.toFixed(1) : "—"}</Td>
              <Td mono>{m.flow_lpm != null ? m.flow_lpm.toFixed(1) : "—"}</Td>
              <Td><EffBadge status={m.effectiveness_status ?? null} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Top-up table ─────────────────────────────────────────────────────────────

function NadopuneTable({ nadopune }: { nadopune: NadopunaKemikalije[] }) {
  if (nadopune.length === 0) return <p className="text-xs text-muted-foreground italic">Nema nadopuna.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/40">
            <Th>#</Th>
            <Th>Vrijeme</Th>
            <Th>Proizvod</Th>
            <Th>Dodana količina</Th>
            <Th>Razlog</Th>
          </tr>
        </thead>
        <tbody>
          {nadopune.map((n, i) => (
            <tr key={n.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
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
    <div className="border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        <h4 className="text-sm font-black text-foreground">
          Ciklus #{ciklus.cycleNumber ?? ciklus.broj ?? idx + 1}
          {ciklus.name ? ` — ${ciklus.name}` : ""}
        </h4>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
          ciklus.status === "zavrsen" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" :
          ciklus.status === "prekinut" ? "bg-rose-500/10 text-rose-800 dark:text-rose-200" :
          "bg-amber-400/10 text-amber-800 dark:text-amber-200"
        }`}>
          {ciklus.status}
        </span>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Proizvod: <strong className="text-foreground">{ciklus.chemicalProductName ?? ciklus.kemikalija ?? "—"}</strong></span>
        <span>Vol. otopine: <strong className="text-foreground">{fNum(ciklus.totalSolutionVolumeL ?? ciklus.waterVolumeL)} L</strong></span>
        <span>Kemikalija: <strong className="text-foreground">{ciklus.chemicalAmount} {ciklus.chemicalUnit}</strong></span>
        {ciklus.chemicalPercent != null && (
          <span>Postotak: <strong className="text-foreground">{ciklus.chemicalPercent.toFixed(2)} %</strong></span>
        )}
        <span>Mjerenja: <strong className="text-foreground">{ciklus.mjerenja.length}</strong></span>
        <span>Nadopune: <strong className="text-foreground">{ciklus.nadopune.length}</strong></span>
        {lastDecision && (
          <span className="col-span-2">Odluka: <strong className="text-foreground">{lastDecision.decisionLabel}</strong></span>
        )}
        {eff.cleaningEffectivenessStatus && (
          <span className="col-span-2">Zaključak: <strong className="text-foreground">
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
          <span className="text-muted-foreground">Učinkovitost:</span>
          <EffBadge status={eff.cleaningEffectivenessStatus} />
          {eff.flowImprovementPercent != null && (
            <span className="text-muted-foreground">({fPct(eff.flowImprovementPercent)})</span>
          )}
        </div>
      )}

      {/* Delta od nultog mjerenja */}
      {delta && (nultoMj || ciklus.zeroMeasurementPh != null) && (
        <div className="bg-muted/30 rounded-lg p-2 text-[11px]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            Promjena od nultog mjerenja
          </p>
          <div className="grid grid-cols-3 gap-2">
            {delta.deltaPhFromZero != null && (
              <div>
                <span className="text-muted-foreground">pH: </span>
                <strong className={delta.deltaPhFromZero > 0 ? "text-amber-600" : delta.deltaPhFromZero < -0.1 ? "text-green-600" : "text-foreground"}>
                  {delta.deltaPhFromZero > 0 ? "+" : ""}{delta.deltaPhFromZero.toFixed(2)}
                </strong>
              </div>
            )}
            {delta.deltaFlowFromZero != null && (
              <div>
                <span className="text-muted-foreground">Protok: </span>
                <strong className={delta.deltaFlowFromZero > 0 ? "text-green-600" : delta.deltaFlowFromZero < 0 ? "text-amber-600" : "text-foreground"}>
                  {delta.deltaFlowFromZero > 0 ? "+" : ""}{delta.deltaFlowFromZero.toFixed(1)} L/min
                </strong>
              </div>
            )}
            {delta.flowImprovementPercent != null && (
              <div>
                <span className="text-muted-foreground">Poboljšanje: </span>
                <strong className={delta.flowImprovementPercent > 0 ? "text-green-600" : "text-foreground"}>
                  {fPct(delta.flowImprovementPercent)}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">Mjerenja</p>
        <MjerenjaTable mjerenja={ciklus.mjerenja} />
      </div>

      {ciklus.nadopune.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">Nadopune kemikalije</p>
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
        <div key={label} className="border border-border rounded-xl px-3 py-2 flex flex-col gap-0.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="text-sm font-bold font-mono text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Subsession row in summary table ─────────────────────────────────────────

function SubsessionRow({ ps, idx }: { ps: SubsessionReport; idx: number }) {
  return (
    <tr className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
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
      className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-border bg-card gap-2 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Servisni izvještaj</p>
          <h1 className="text-base font-black text-foreground leading-tight truncate">{sesija.naziv_objekta}</h1>
          <p className="text-xs text-muted-foreground">{fDate(sesija.datum)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <CopyButton report={report} />
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors"
            style={{ minHeight: 40 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            </svg>
            Ispis / PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors"
            style={{ minHeight: 40 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className="border-2 border-primary/20 rounded-2xl overflow-hidden bg-card mb-6">
            <div className="bg-primary/5 px-5 py-4 border-b border-primary/15">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1">Servisni izvještaj</p>
              <h2 className="text-2xl font-black text-foreground leading-tight text-balance">{sesija.naziv_objekta}</h2>
              {sesija.lokacija && <p className="text-sm text-muted-foreground mt-1">{sesija.lokacija}</p>}
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Datum servisa</p>
                <p className="font-semibold text-foreground">{fDate(sesija.datum)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Operater</p>
                <p className="font-semibold text-foreground">{sesija.serviser}</p>
              </div>
              {sesija.kontakt_osoba && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Kontakt osoba</p>
                  <p className="font-semibold text-foreground">{sesija.kontakt_osoba}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Vrsta čišćenja</p>
                <p className="font-semibold text-foreground">Uklanjanje kamenca</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Broj sesije</p>
                <p className="font-mono font-bold text-foreground">{sesija.id.slice(0, 8).toUpperCase()}</p>
              </div>
              {report.chemical_products.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Kemijsko sredstvo</p>
                  <p className="font-semibold text-foreground">{report.chemical_products.join(", ")}</p>
                </div>
              )}
            </div>
            {sesija.opis_problema && (
              <div className="px-5 pb-4 pt-0 border-t border-border">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1 mt-3">Opis problema</p>
                <p className="text-xs text-foreground leading-relaxed">{sesija.opis_problema}</p>
              </div>
            )}
          </div>

          {/* ── 2. Result badge ── */}
          <SectionHeading>Rezultat čišćenja</SectionHeading>
          <div className="border border-border rounded-2xl bg-card mb-4 overflow-hidden">
            <div className="px-5 py-4 flex flex-col gap-3">
              <ResultBadgeChip badge={report.result_badge} />
              {report.result_notes.length > 0 && (
                <ul className="flex flex-col gap-2 mt-1">
                  {report.result_notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary/50 inline-block" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {report.final_scale_status && (
              <div className="px-5 py-4 border-t border-border bg-muted/20">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">Stanje kamenca</p>
                <p className="text-sm font-bold text-foreground">{report.final_scale_status}</p>
                {report.final_recommendation && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{report.final_recommendation}</p>
                )}
              </div>
            )}
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
              color="text-primary"
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
                    color={report.flow.flow_improvement_percent > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}
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
                    <tr className="bg-muted/40">
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
          <div className="border border-border rounded-2xl p-5 bg-card mb-6">
            <p className="text-sm text-foreground leading-relaxed">
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
              <div className="h-10 border-b border-foreground/30" />
              <p className="text-[10px] text-muted-foreground">Potpis operatera</p>
              <p className="text-[11px] font-semibold text-foreground">{sesija.serviser}</p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="h-10 border-b border-foreground/30" />
              <p className="text-[10px] text-muted-foreground">Potpis naručitelja</p>
            </div>
          </div>

          <p className="text-[9px] text-muted-foreground text-center mt-2">
            Generirao HVAC Servis · {fDateTime(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}
