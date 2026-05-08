// ─── Final Report Engine ──────────────────────────────────────────────────────
// Computes all spec-required report fields for both session and subsession reports.

import type { Sesija, Podsesija, Ciklus, Mjerenje } from "./types";
import { getMjerenjePH } from "./types";
import { calcCleaningEffectiveness } from "./preporuka";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResultBadge =
  | "Uspješno očišćeno"
  | "Djelomično očišćeno"
  | "Potreban dodatni ciklus"
  | "Potreban mehanički zahvat";

export interface MeasurementStats {
  initial_pH: number | null;
  final_pH: number | null;
  min_pH: number | null;
  max_pH: number | null;
  average_pH: number | null;
  max_rate_ph_per_min: number | null;
  average_rate_ph_per_min: number | null;
}

export interface FlowStats {
  flow_before_l_min: number | null;
  flow_after_l_min: number | null;
  flow_improvement_percent: number | null;
}

export interface SubsessionReport {
  id: string;
  name: string;
  chemical_product: string | null;
  material_type: string;
  work_time_minutes: number | null;
  number_of_cycles: number;
  total_chemical_added_liters: number;
  measurement_stats: MeasurementStats;
  flow: FlowStats;
  result_badge: ResultBadge;
  result_notes: string[];
}

export interface FinalReport {
  // GENERAL
  client_name: string;
  object_name: string;
  session_date: string;
  technician_name: string;
  location: string;
  chemical_products: string[];
  material_types: string[];

  // PROCESS
  total_work_time_minutes: number | null;
  number_of_cycles: number;
  total_solution_volume_liters: number;
  total_chemical_added_liters: number;
  final_concentration_percent: number | null;

  // MEASUREMENTS
  measurement_stats: MeasurementStats;

  // FLOW
  flow: FlowStats;

  // DECISION
  final_scale_status: string | null;
  final_recommendation: string | null;
  result_badge: ResultBadge;
  result_notes: string[];

  // Subsession breakdown (Mode B only)
  subsession_reports: SubsessionReport[];

  // Meta
  generated_at: string;
  session_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allMjerenjaForCiklusi(ciklusi: Ciklus[]): Mjerenje[] {
  return ciklusi.flatMap((c) => c.mjerenja);
}

function calcMeasurementStats(mjerenja: Mjerenje[]): MeasurementStats {
  const withPH = mjerenja.filter((m) => getMjerenjePH(m) != null);
  if (withPH.length === 0) {
    return {
      initial_pH: null, final_pH: null, min_pH: null,
      max_pH: null, average_pH: null,
      max_rate_ph_per_min: null, average_rate_ph_per_min: null,
    };
  }

  const pHValues = withPH.map((m) => getMjerenjePH(m) as number);
  const initial_pH = pHValues[0];
  const final_pH = pHValues[pHValues.length - 1];
  const min_pH = Math.min(...pHValues);
  const max_pH = Math.max(...pHValues);
  const average_pH = pHValues.reduce((a, b) => a + b, 0) / pHValues.length;

  const withRate = mjerenja.filter((m) => m.phRatePerMinute != null);
  const rates = withRate.map((m) => m.phRatePerMinute as number);
  const max_rate = rates.length > 0 ? Math.max(...rates) : null;
  const avg_rate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  return {
    initial_pH: Math.round(initial_pH * 100) / 100,
    final_pH: Math.round(final_pH * 100) / 100,
    min_pH: Math.round(min_pH * 100) / 100,
    max_pH: Math.round(max_pH * 100) / 100,
    average_pH: Math.round(average_pH * 1000) / 1000,
    max_rate_ph_per_min: max_rate != null ? Math.round(max_rate * 10000) / 10000 : null,
    average_rate_ph_per_min: avg_rate != null ? Math.round(avg_rate * 10000) / 10000 : null,
  };
}

function calcFlowStats(mjerenja: Mjerenje[]): FlowStats {
  const withFlow = mjerenja.filter((m) => m.flowLMin != null && m.flowLMin > 0);
  if (withFlow.length === 0) {
    return { flow_before_l_min: null, flow_after_l_min: null, flow_improvement_percent: null };
  }
  const before = withFlow[0].flowLMin as number;
  const after = withFlow[withFlow.length - 1].flowLMin as number;
  const pct = before > 0 ? ((after - before) / before) * 100 : null;
  return {
    flow_before_l_min: Math.round(before * 10) / 10,
    flow_after_l_min: Math.round(after * 10) / 10,
    flow_improvement_percent: pct != null ? Math.round(pct * 10) / 10 : null,
  };
}

function calcWorkTimeMinutes(ciklusi: Ciklus[]): number | null {
  if (ciklusi.length === 0) return null;
  const first = ciklusi[0].startDateTime ?? ciklusi[0].timestamp_pocetka ?? ciklusi[0].createdAt;
  const lastC = ciklusi[ciklusi.length - 1];
  const last = lastC.endDateTime ?? lastC.timestamp_zavrsetka ?? lastC.updatedAt;
  if (!first || !last) return null;
  const diff = (new Date(last).getTime() - new Date(first).getTime()) / 60000;
  return diff > 0 ? Math.round(diff) : null;
}

function calcTotalChemical(ciklusi: Ciklus[]): number {
  return ciklusi.reduce((sum, c) => {
    const added = c.totalChemicalAddedL ?? c.chemicalVolumeL ?? 0;
    return sum + added;
  }, 0);
}

function calcTotalSolutionVolume(ciklusi: Ciklus[]): number {
  if (ciklusi.length === 0) return 0;
  const last = ciklusi[ciklusi.length - 1];
  return (
    last.currentTotalSolutionVolumeL ??
    last.totalSolutionVolumeL ??
    last.waterVolumeL ??
    0
  );
}

function calcFinalConcentration(ciklusi: Ciklus[]): number | null {
  if (ciklusi.length === 0) return null;
  const last = ciklusi[ciklusi.length - 1];
  return last.currentChemicalPercent ?? last.chemicalPercent ?? null;
}

/** Spec rule set for result badge and result notes. */
function calcResultBadgeAndNotes(
  flow: FlowStats,
  measurementStats: MeasurementStats,
  ciklusi: Ciklus[],
): { badge: ResultBadge; notes: string[] } {
  const notes: string[] = [];

  // Collect cleaning effectiveness across all cycles
  const allMjer = allMjerenjaForCiklusi(ciklusi);
  const eff = calcCleaningEffectiveness(allMjer);

  const finalPH = measurementStats.final_pH;
  const avgRate = measurementStats.average_rate_ph_per_min;
  const flowBefore = flow.flow_before_l_min;
  const flowAfter = flow.flow_after_l_min;
  const flowPct = flow.flow_improvement_percent;

  // Rule 1: flow improved
  if (flowBefore != null && flowAfter != null && flowAfter > flowBefore) {
    notes.push("Protok je poboljšan nakon čišćenja.");
  }

  // Rule 2: final solution exhausted
  if (finalPH != null && finalPH > 4.0) {
    notes.push("Završna otopina bila je iscrpljena i preporučeno je ispiranje.");
  }

  // Rule 3: chemistry still active but reaction slowed
  if (
    avgRate != null &&
    avgRate < 0.02 &&
    finalPH != null &&
    finalPH < 3.0
  ) {
    notes.push("Kemija je ostala aktivna, ali reakcija je značajno usporila.");
  }

  // Determine result badge
  let badge: ResultBadge;

  if (eff.cleaningEffectivenessStatus === "Vrlo dobar učinak" || eff.cleaningEffectivenessStatus === "Dobar učinak") {
    badge = "Uspješno očišćeno";
  } else if (eff.cleaningEffectivenessStatus === "Umjeren učinak") {
    badge = "Djelomično očišćeno";
  } else if (flowPct != null && flowPct <= 0 && finalPH != null && finalPH > 4.0) {
    badge = "Potreban mehanički zahvat";
  } else if (ciklusi.length >= 2 && (flowPct == null || flowPct < 3)) {
    badge = "Potreban dodatni ciklus";
  } else if (eff.cleaningEffectivenessStatus === "Slab učinak") {
    badge = "Potreban dodatni ciklus";
  } else {
    badge = "Djelomično očišćeno";
  }

  return { badge, notes };
}

function calcMaterialTypes(podsesije: Podsesija[]): string[] {
  return Array.from(
    new Set(podsesije.map((ps) => ps.materijal).filter(Boolean))
  ) as string[];
}

function calcChemicalProducts(ciklusi: Ciklus[]): string[] {
  return Array.from(
    new Set(
      ciklusi
        .map((c) => c.chemicalProductName ?? c.kemikalija)
        .filter(Boolean)
    )
  ) as string[];
}

// ─── Subsession report ────────────────────────────────────────────────────────

function buildSubsessionReport(ps: Podsesija): SubsessionReport {
  const allMjer = allMjerenjaForCiklusi(ps.ciklusi);
  const measurementStats = calcMeasurementStats(allMjer);
  const flow = calcFlowStats(allMjer);
  const { badge, notes } = calcResultBadgeAndNotes(flow, measurementStats, ps.ciklusi);

  const chemProducts = calcChemicalProducts(ps.ciklusi);

  return {
    id: ps.id,
    name: ps.naziv ?? ps.opis_dijela ?? "Neimenovana podsesija",
    chemical_product: chemProducts[0] ?? null,
    material_type: typeof ps.materijal === "string" ? ps.materijal : "",
    work_time_minutes: calcWorkTimeMinutes(ps.ciklusi),
    number_of_cycles: ps.ciklusi.length,
    total_chemical_added_liters: calcTotalChemical(ps.ciklusi),
    measurement_stats: measurementStats,
    flow,
    result_badge: badge,
    result_notes: notes,
  };
}

// ─── Session report ───────────────────────────────────────────────────────────

export function buildFinalReport(sesija: Sesija): FinalReport {
  const isModeA =
    sesija.workMode === "no_subsessions" ||
    (sesija.podsesije.length === 0 && (sesija.ciklusi ?? []).length > 0);

  const allCiklusi: Ciklus[] = isModeA
    ? (sesija.ciklusi ?? [])
    : sesija.podsesije.flatMap((ps) => ps.ciklusi);

  const allMjer = allMjerenjaForCiklusi(allCiklusi);
  const measurementStats = calcMeasurementStats(allMjer);
  const flow = calcFlowStats(allMjer);
  const { badge, notes } = calcResultBadgeAndNotes(flow, measurementStats, allCiklusi);

  // Final scale/recommendation from last measurement's saved preporuka
  const lastMjer = allMjer.length > 0 ? allMjer[allMjer.length - 1] : null;
  const finalScaleStatus = lastMjer?.preporuka?.scaleStatus ?? null;
  const finalRecommendation = lastMjer?.preporuka?.scaleRecommendation ?? null;

  const subsessionReports: SubsessionReport[] = isModeA
    ? []
    : sesija.podsesije.map(buildSubsessionReport);

  return {
    // GENERAL
    client_name: sesija.kontakt_osoba ?? "",
    object_name: sesija.naziv_objekta,
    session_date: sesija.datum,
    technician_name: sesija.serviser,
    location: sesija.lokacija,
    chemical_products: calcChemicalProducts(allCiklusi),
    material_types: isModeA ? [] : calcMaterialTypes(sesija.podsesije),

    // PROCESS
    total_work_time_minutes: calcWorkTimeMinutes(allCiklusi),
    number_of_cycles: allCiklusi.length,
    total_solution_volume_liters: calcTotalSolutionVolume(allCiklusi),
    total_chemical_added_liters: Math.round(calcTotalChemical(allCiklusi) * 100) / 100,
    final_concentration_percent: calcFinalConcentration(allCiklusi),

    // MEASUREMENTS
    measurement_stats: measurementStats,

    // FLOW
    flow,

    // DECISION
    final_scale_status: finalScaleStatus,
    final_recommendation: finalRecommendation,
    result_badge: badge,
    result_notes: notes,

    // Subsessions
    subsession_reports: subsessionReports,

    // Meta
    generated_at: new Date().toISOString(),
    session_id: sesija.id,
  };
}

// ─── Copy summary text ────────────────────────────────────────────────────────

export function buildSummaryText(report: FinalReport): string {
  const lines: string[] = [];

  lines.push(`SERVISNI IZVJEŠTAJ — ${report.object_name}`);
  lines.push(`Datum: ${new Date(report.session_date).toLocaleDateString("hr-HR")}`);
  lines.push(`Operater: ${report.technician_name}`);
  if (report.client_name) lines.push(`Kontakt: ${report.client_name}`);
  lines.push(`Lokacija: ${report.location}`);
  lines.push("");

  lines.push("REZULTAT:");
  lines.push(`  ${report.result_badge}`);
  if (report.result_notes.length > 0) {
    report.result_notes.forEach((n) => lines.push(`  • ${n}`));
  }
  lines.push("");

  lines.push("PROCES:");
  lines.push(`  Ciklusa: ${report.number_of_cycles}`);
  if (report.total_work_time_minutes != null) lines.push(`  Trajanje: ${report.total_work_time_minutes} min`);
  lines.push(`  Kemikalija ukupno: ${report.total_chemical_added_liters.toFixed(2)} L`);
  if (report.final_concentration_percent != null) lines.push(`  Završna konc.: ${report.final_concentration_percent.toFixed(2)} %`);
  lines.push("");

  const s = report.measurement_stats;
  if (s.initial_pH != null || s.final_pH != null) {
    lines.push("MJERENJA (pH):");
    if (s.initial_pH != null) lines.push(`  Početni: ${s.initial_pH.toFixed(2)}`);
    if (s.final_pH != null) lines.push(`  Završni: ${s.final_pH.toFixed(2)}`);
    if (s.min_pH != null) lines.push(`  Min: ${s.min_pH.toFixed(2)}`);
    if (s.max_pH != null) lines.push(`  Maks: ${s.max_pH.toFixed(2)}`);
    if (s.average_pH != null) lines.push(`  Prosjek: ${s.average_pH.toFixed(3)}`);
    lines.push("");
  }

  const f = report.flow;
  if (f.flow_before_l_min != null || f.flow_after_l_min != null) {
    lines.push("PROTOK:");
    if (f.flow_before_l_min != null) lines.push(`  Prije: ${f.flow_before_l_min.toFixed(1)} L/min`);
    if (f.flow_after_l_min != null) lines.push(`  Poslije: ${f.flow_after_l_min.toFixed(1)} L/min`);
    if (f.flow_improvement_percent != null) lines.push(`  Poboljšanje: ${f.flow_improvement_percent > 0 ? "+" : ""}${f.flow_improvement_percent.toFixed(1)}%`);
    lines.push("");
  }

  if (report.final_scale_status) {
    lines.push("STANJE KAMENCA:");
    lines.push(`  ${report.final_scale_status}`);
    if (report.final_recommendation) lines.push(`  ${report.final_recommendation}`);
    lines.push("");
  }

  if (report.subsession_reports.length > 0) {
    lines.push("PODSESIJE:");
    report.subsession_reports.forEach((ps, i) => {
      lines.push(`  ${i + 1}. ${ps.name}`);
      if (ps.chemical_product) lines.push(`     Sredstvo: ${ps.chemical_product}`);
      if (ps.work_time_minutes != null) lines.push(`     Trajanje: ${ps.work_time_minutes} min`);
      const pf = ps.measurement_stats;
      if (pf.initial_pH != null) lines.push(`     pH: ${pf.initial_pH.toFixed(2)} → ${pf.final_pH?.toFixed(2) ?? "—"}`);
      const fl = ps.flow;
      if (fl.flow_before_l_min != null) lines.push(`     Protok: ${fl.flow_before_l_min.toFixed(1)} → ${fl.flow_after_l_min?.toFixed(1) ?? "—"} L/min`);
      lines.push(`     Rezultat: ${ps.result_badge}`);
    });
    lines.push("");
  }

  lines.push(`Generirao HVAC Servis · ${new Date().toLocaleDateString("hr-HR")}`);

  return lines.join("\n");
}
