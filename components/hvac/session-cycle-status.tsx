"use client";

/**
 * Session / Cycle / Subsession status cards.
 *
 * Rules:
 * - UI displays engine output only.
 * - No cycle state, session state, rinse/neutralization logic calculated here.
 * - All state comes from: mozeLiZavrsitiPodsesiju, mozeLiZavrsitiSesiju,
 *   getCompletionBlockers, and raw data fields from Sesija / Podsesija / Ciklus types.
 */

import type { Sesija, Podsesija, Ciklus, StatusCiklusa, StatusPodsesije } from "@/lib/types";
import { aktivniCiklus, pocetnoMjerenjeCiklusa } from "@/lib/types";
import {
  mozeLiZavrsitiPodsesiju,
  mozeLiZavrsitiSesiju,
  type ZavrsetakEligibilnost,
} from "@/lib/preporuka";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Session status visual mapping ────────────────────────────────────────────

type SessionVisualState =
  | "active"
  | "waiting_for_rinse"
  | "waiting_for_neutralization"
  | "ready_to_finish"
  | "finished"
  | "finished_with_warning";

function deriveSessionVisualState(sesija: Sesija): SessionVisualState {
  const status = sesija.status as string;
  if (status === "zavrsena") return "finished";
  if (status === "uz_upozorenje") return "finished_with_warning";
  if (status === "ciklus_zavrsen") {
    const allCycles =
      sesija.workMode === "no_subsessions"
        ? (sesija.ciklusi ?? [])
        : sesija.podsesije.flatMap((p) => p.ciklusi);
    const last = [...allCycles].reverse().find((c) => c.status === "zavrsen" || c.status === "prekinut");
    const phases = last?.completionPhases;
    if (!phases?.ispiranje?.systemRinsedWithCleanWater) return "waiting_for_rinse";
    if (phases?.ispiranje?.neutralizationRequired !== false && !phases?.neutralizacija?.neutralizerProductName) {
      return "waiting_for_neutralization";
    }
    return "ready_to_finish";
  }
  return "active";
}

const SESSION_STATE_LABELS: Record<SessionVisualState, string> = {
  active: "Sesija aktivna",
  waiting_for_rinse: "Čeka ispiranje",
  waiting_for_neutralization: "Čeka neutralizaciju",
  ready_to_finish: "Spreman za završetak",
  finished: "Sesija završena",
  finished_with_warning: "Završena s upozorenjem",
};

const SESSION_CARD_BG: Record<SessionVisualState, string> = {
  active: "bg-teal-50 border-teal-200",
  waiting_for_rinse: "bg-amber-50 border-amber-200",
  waiting_for_neutralization: "bg-red-50 border-red-200",
  ready_to_finish: "bg-emerald-50 border-emerald-200",
  finished: "bg-slate-50 border-slate-200",
  finished_with_warning: "bg-amber-50 border-amber-200",
};

const SESSION_LABEL_COLOR: Record<SessionVisualState, string> = {
  active: "text-teal-700",
  waiting_for_rinse: "text-amber-700",
  waiting_for_neutralization: "text-red-700",
  ready_to_finish: "text-emerald-700",
  finished: "text-slate-600",
  finished_with_warning: "text-amber-700",
};

const SESSION_DOT: Record<SessionVisualState, string> = {
  active: "bg-teal-500",
  waiting_for_rinse: "bg-amber-500",
  waiting_for_neutralization: "bg-red-500",
  ready_to_finish: "bg-emerald-500",
  finished: "bg-slate-400",
  finished_with_warning: "bg-amber-500",
};

// ─── Cycle status visual mapping ──────────────────────────────────────────────

const CYCLE_STATE_LABELS: Record<StatusCiklusa, string> = {
  priprema: "Priprema",
  aktivan: "Aktivan",
  ceka_pocetno_mjerenje: "Čeka ref. mjerenje",
  ceka_redovno_mjerenje: "Čeka mjerenje",
  ceka_nadopunu: "Čeka nadopunu",
  preporucen_novi_ciklus: "Preporučen novi ciklus",
  zavrsen: "Završen",
  prekinut: "Prekinut",
};

const CYCLE_CARD_BG: Record<StatusCiklusa, string> = {
  priprema: "bg-slate-50 border-slate-200",
  aktivan: "bg-teal-50 border-teal-200",
  ceka_pocetno_mjerenje: "bg-amber-50 border-amber-200",
  ceka_redovno_mjerenje: "bg-sky-50 border-sky-200",
  ceka_nadopunu: "bg-sky-50 border-sky-300",
  preporucen_novi_ciklus: "bg-amber-50 border-amber-300",
  zavrsen: "bg-emerald-50 border-emerald-200",
  prekinut: "bg-slate-50 border-slate-200",
};

const CYCLE_LABEL_COLOR: Record<StatusCiklusa, string> = {
  priprema: "text-slate-600",
  aktivan: "text-teal-700",
  ceka_pocetno_mjerenje: "text-amber-700",
  ceka_redovno_mjerenje: "text-sky-700",
  ceka_nadopunu: "text-sky-700",
  preporucen_novi_ciklus: "text-amber-700",
  zavrsen: "text-emerald-700",
  prekinut: "text-slate-500",
};

const CYCLE_DOT: Record<StatusCiklusa, string> = {
  priprema: "bg-slate-400",
  aktivan: "bg-teal-500",
  ceka_pocetno_mjerenje: "bg-amber-500",
  ceka_redovno_mjerenje: "bg-sky-500",
  ceka_nadopunu: "bg-sky-600",
  preporucen_novi_ciklus: "bg-amber-500",
  zavrsen: "bg-emerald-500",
  prekinut: "bg-slate-400",
};

// ─── Podsesija visual mapping ─────────────────────────────────────────────────

const PODSESIJA_STATE_LABELS: Record<StatusPodsesije, string> = {
  nije_zapoceto: "Nije započeto",
  u_radu: "U radu",
  ceka_mjerenje: "Čeka mjerenje",
  ceka_nadopunu: "Čeka nadopunu",
  ceka_novi_ciklus: "Čeka novi ciklus",
  zavrseno: "Završeno",
  prekinuto: "Prekinuto",
};

const PODSESIJA_CARD_BG: Record<StatusPodsesije, string> = {
  nije_zapoceto: "bg-slate-50 border-slate-200",
  u_radu: "bg-teal-50 border-teal-200",
  ceka_mjerenje: "bg-sky-50 border-sky-200",
  ceka_nadopunu: "bg-sky-50 border-sky-300",
  ceka_novi_ciklus: "bg-amber-50 border-amber-200",
  zavrseno: "bg-emerald-50 border-emerald-200",
  prekinuto: "bg-slate-50 border-slate-200",
};

const PODSESIJA_LABEL_COLOR: Record<StatusPodsesije, string> = {
  nije_zapoceto: "text-slate-500",
  u_radu: "text-teal-700",
  ceka_mjerenje: "text-sky-700",
  ceka_nadopunu: "text-sky-700",
  ceka_novi_ciklus: "text-amber-700",
  zavrseno: "text-emerald-700",
  prekinuto: "text-slate-500",
};

const PODSESIJA_DOT: Record<StatusPodsesije, string> = {
  nije_zapoceto: "bg-slate-300",
  u_radu: "bg-teal-500",
  ceka_mjerenje: "bg-sky-500",
  ceka_nadopunu: "bg-sky-600",
  ceka_novi_ciklus: "bg-amber-500",
  zavrseno: "bg-emerald-500",
  prekinuto: "bg-slate-400",
};

// ─── StatusDot ────────────────────────────────────────────────────────────────

function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${color}`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-slate-400 font-medium">{label}</span>
      <span className="text-[11px] text-slate-700 font-semibold text-right">{value}</span>
    </div>
  );
}

// ─── BlockerList ──────────────────────────────────────────────────────────────

function BlockerList({ blockers }: { blockers: string[] }) {
  if (blockers.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 mt-1.5">
      {blockers.map((b, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-red-700">
          <svg className="shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {b}
        </li>
      ))}
    </ul>
  );
}

// ─── SESSION STATUS CARD ──────────────────────────────────────────────────────

interface SessionStatusKarticaProps {
  sesija: Sesija;
  onZavrsiSesiju?: () => void;
  onIspiranje?: () => void;
  onNeutralizacija?: () => void;
}

export function SessionStatusKartica({
  sesija,
  onZavrsiSesiju,
  onIspiranje,
  onNeutralizacija,
}: SessionStatusKarticaProps) {
  // Engine output — mozeLiZavrsitiSesiju is the engine function
  const eligibilnost: ZavrsetakEligibilnost = mozeLiZavrsitiSesiju({
    workMode: sesija.workMode,
    podsesije: sesija.podsesije ?? [],
    ciklusi: sesija.ciklusi,
  });

  const vizualnoStanje = deriveSessionVisualState(sesija);
  const cardBg = SESSION_CARD_BG[vizualnoStanje];
  const labelColor = SESSION_LABEL_COLOR[vizualnoStanje];
  const dotColor = SESSION_DOT[vizualnoStanje];
  const isActive = vizualnoStanje === "active";
  const canFinish = eligibilnost.canFinish;

  const allCycles =
    sesija.workMode === "no_subsessions"
      ? (sesija.ciklusi ?? [])
      : sesija.podsesije.flatMap((p) => p.ciklusi);
  const activeCycleCount = allCycles.filter(
    (c) => c.status !== "zavrsen" && c.status !== "prekinut"
  ).length;
  const completedCycleCount = allCycles.filter(
    (c) => c.status === "zavrsen" || c.status === "prekinut"
  ).length;
  const activeSubsessionCount =
    sesija.workMode === "with_subsessions"
      ? sesija.podsesije.filter((p) => p.status !== "zavrseno" && p.status !== "prekinuto").length
      : 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <StatusDot color={dotColor} pulse={isActive} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Sesija</p>
          <p className={`text-base font-black leading-tight ${labelColor}`}>
            {SESSION_STATE_LABELS[vizualnoStanje]}
          </p>
        </div>
        <div className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${
          canFinish ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {canFinish ? "Može završiti" : "Ne može završiti"}
        </div>
      </div>

      {/* Info grid */}
      <div className="px-4 pb-3 flex flex-col gap-1.5 border-t border-black/5 pt-2.5">
        <InfoRow label="Datum" value={fmtDate(sesija.createdAt)} />
        <InfoRow label="Aktivnih ciklusa" value={activeCycleCount > 0 ? activeCycleCount : null} />
        <InfoRow label="Završenih ciklusa" value={completedCycleCount} />
        {sesija.workMode === "with_subsessions" && (
          <InfoRow label="Aktivnih podsesija" value={activeSubsessionCount > 0 ? activeSubsessionCount : null} />
        )}
        {eligibilnost.recommendation && (
          <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{eligibilnost.recommendation}</p>
        )}
        {!eligibilnost.canFinish && eligibilnost.blockers.length > 0 && (
          <BlockerList blockers={eligibilnost.blockers} />
        )}
      </div>

      {/* Actions */}
      {(vizualnoStanje === "waiting_for_rinse" && onIspiranje) && (
        <div className="px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={onIspiranje}
            className="w-full min-h-[48px] bg-amber-500 text-white rounded-xl py-3 font-bold text-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
          >
            Pokreni ispiranje
          </button>
        </div>
      )}
      {(vizualnoStanje === "waiting_for_neutralization" && onNeutralizacija) && (
        <div className="px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={onNeutralizacija}
            className="w-full min-h-[48px] bg-red-500 text-white rounded-xl py-3 font-bold text-sm hover:bg-red-600 active:scale-[0.98] transition-all"
          >
            Evidentiraj neutralizaciju
          </button>
        </div>
      )}
      {(vizualnoStanje === "ready_to_finish" && canFinish && onZavrsiSesiju) && (
        <div className="px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={onZavrsiSesiju}
            className="w-full min-h-[48px] bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all"
          >
            Završi sesiju
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BLOCKED NEW CYCLE BANNER ─────────────────────────────────────────────────

interface BlockedNewCycleBannerProps {
  /** Engine-provided message why new cycle is blocked */
  message: string;
}

export function BlockedNewCycleBanner({ message }: BlockedNewCycleBannerProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-red-100 border border-red-300 flex items-center justify-center mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-700" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-0.5">Novi ciklus blokiran</p>
        <p className="text-sm font-medium text-red-800 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

// ─── CYCLE STATUS CARD ────────────────────────────────────────────────────────

interface CycleStatusKarticaProps {
  ciklus: Ciklus;
  isActive?: boolean;
  cycleNumber?: number;
}

export function CycleStatusKartica({ ciklus, isActive, cycleNumber }: CycleStatusKarticaProps) {
  const cardBg = CYCLE_CARD_BG[ciklus.status];
  const labelColor = CYCLE_LABEL_COLOR[ciklus.status];
  const dotColor = CYCLE_DOT[ciklus.status];
  const stateLabel = CYCLE_STATE_LABELS[ciklus.status];
  const pulsing = ciklus.status === "aktivan" || ciklus.status === "ceka_redovno_mjerenje";

  const hasInitialM = pocetnoMjerenjeCiklusa(ciklus) != null;
  const requiresReferenceMeasurement =
    ciklus.status === "ceka_pocetno_mjerenje" && !hasInitialM;

  // requiresRinse — direktno iz completionPhases engine data
  const requiresRinse =
    (ciklus.status === "zavrsen" || ciklus.status === "prekinut") &&
    !ciklus.completionPhases?.ispiranje?.systemRinsedWithCleanWater;

  // canFinishCycle — nema aktivnog ciklusa koji čeka zatvaranje
  const canFinishCycle =
    ciklus.status !== "zavrsen" &&
    ciklus.status !== "prekinut" &&
    ciklus.mjerenja.length > 0;

  const topUpCount = ciklus.nadopune?.length ?? 0;
  const liveMeasurementCount = ciklus.mjerenja.filter(
    (m) => m.measurementType === "regular_measurement" || m.measurementType === "post_top_up_measurement"
  ).length;

  const phases = ciklus.completionPhases;
  const isRinsed =
    phases?.ispiranje?.systemRinsedWithCleanWater === true;

  return (
    <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
        <StatusDot color={dotColor} pulse={pulsing} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
            Ciklus {cycleNumber ?? ciklus.cycleNumber}
          </p>
          <p className={`text-sm font-black leading-tight ${labelColor}`}>{stateLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isRinsed && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
              Isprano
            </span>
          )}
          {requiresRinse && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              Čeka ispiranje
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pb-3 pt-1.5 border-t border-black/5 flex flex-col gap-1.5">
        <InfoRow label="Kemija" value={ciklus.chemicalProductName || ciklus.kemikalija} />
        <InfoRow label="Mjerenja" value={liveMeasurementCount > 0 ? `${liveMeasurementCount} unosa` : null} />
        <InfoRow label="Nadopune" value={topUpCount > 0 ? `${topUpCount}×` : null} />
        <InfoRow label="Počelo" value={fmtTime(ciklus.startDateTime)} />
        {ciklus.endDateTime && (
          <InfoRow label="Završilo" value={fmtTime(ciklus.endDateTime)} />
        )}
        {requiresReferenceMeasurement && (
          <p className="text-xs text-amber-700 font-medium mt-0.5">Referentno mjerenje nije uneseno.</p>
        )}
        {canFinishCycle && isActive && (
          <p className="text-xs text-teal-700 font-medium mt-0.5">Ciklus se može završiti.</p>
        )}
      </div>
    </div>
  );
}

// ─── SUBSESSION (PODSESIJA) CARD ──────────────────────────────────────────────

interface SubsessionStatusKarticaProps {
  podsesija: Podsesija;
  isActive?: boolean;
  onNavigate?: () => void;
}

export function SubsessionStatusKartica({
  podsesija,
  isActive,
  onNavigate,
}: SubsessionStatusKarticaProps) {
  // Engine output
  const eligibilnost: ZavrsetakEligibilnost = mozeLiZavrsitiPodsesiju({
    ciklusi: podsesija.ciklusi,
    status: podsesija.status,
  });

  const status = podsesija.status as StatusPodsesije;
  const cardBg = PODSESIJA_CARD_BG[status] ?? "bg-slate-50 border-slate-200";
  const labelColor = PODSESIJA_LABEL_COLOR[status] ?? "text-slate-600";
  const dotColor = PODSESIJA_DOT[status] ?? "bg-slate-400";
  const stateLabel = PODSESIJA_STATE_LABELS[status] ?? status;
  const pulsing = status === "u_radu" || status === "ceka_mjerenje";

  const akt = aktivniCiklus(podsesija);
  const activeCycleCount = akt ? 1 : 0;
  const completedCycleCount = podsesija.ciklusi.filter(
    (c) => c.status === "zavrsen" || c.status === "prekinut"
  ).length;

  // subsessionWarnings — iz engine blockers
  const warnings = eligibilnost.canFinish ? [] : eligibilnost.blockers;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${cardBg} ${
        isActive ? "ring-2 ring-teal-400 ring-offset-1" : ""
      }`}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
        <StatusDot color={dotColor} pulse={pulsing} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Podsesija</p>
          <p className={`text-sm font-black leading-tight truncate ${labelColor}`}>{podsesija.naziv}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 shrink-0 ${
          status === "zavrseno"
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : status === "u_radu"
            ? "bg-teal-100 text-teal-700 border-teal-200"
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {stateLabel}
        </span>
      </div>

      {/* Info */}
      <div className="px-4 pb-3 pt-1.5 border-t border-black/5 flex flex-col gap-1.5">
        <InfoRow label="Dio sustava" value={podsesija.dio_sustava} />
        <InfoRow label="Materijal" value={podsesija.materijal} />
        <InfoRow label="Aktivnih ciklusa" value={activeCycleCount > 0 ? activeCycleCount : null} />
        <InfoRow label="Završenih ciklusa" value={completedCycleCount > 0 ? `${completedCycleCount}` : null} />
        <InfoRow label="Volumen" value={podsesija.procijenjeni_volumen ? `~${podsesija.procijenjeni_volumen} L` : null} />
        {/* subsessionSummary — iz eligibilnost.recommendation */}
        {eligibilnost.recommendation && (
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{eligibilnost.recommendation}</p>
        )}
        {/* subsessionWarnings — iz engine blockers */}
        {warnings.length > 0 && status !== "zavrseno" && (
          <BlockerList blockers={warnings} />
        )}
      </div>

      {/* Active cycle preview */}
      {akt && (
        <div className="px-4 pb-3 border-t border-black/5 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" aria-hidden="true" />
            <p className="text-xs font-bold text-teal-700">
              Ciklus #{akt.cycleNumber} — {CYCLE_STATE_LABELS[akt.status]}
            </p>
          </div>
        </div>
      )}

      {/* Navigate action */}
      {onNavigate && status !== "zavrseno" && (
        <div className="px-4 pb-3 pt-0">
          <button
            type="button"
            onClick={onNavigate}
            className="w-full min-h-[44px] bg-teal-600 text-white rounded-xl py-2.5 font-bold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all"
          >
            Otvori podsesiju
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SESSION / CYCLE HIERARCHY VIEW ──────────────────────────────────────────

interface SessionHierarchyViewProps {
  sesija: Sesija;
  activePodsesijaId?: string;
  onNavigateToPodsesija?: (id: string) => void;
}

/**
 * Full hierarchy: SESSION → SUBSESSIONS → CYCLES
 * Shows which cycle belongs to which subsession and which subsession to session.
 */
export function SessionHierarchyView({
  sesija,
  activePodsesijaId,
  onNavigateToPodsesija,
}: SessionHierarchyViewProps) {
  if (sesija.workMode === "no_subsessions") {
    const ciklusi = sesija.ciklusi ?? [];
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-0.5">
          Ciklusi sesije ({ciklusi.length})
        </p>
        {ciklusi.length === 0 && (
          <p className="text-xs text-slate-400 px-0.5">Nema ciklusa.</p>
        )}
        {ciklusi.map((c) => (
          <div key={c.id} className="pl-3 border-l-2 border-slate-200">
            <CycleStatusKartica
              ciklus={c}
              isActive={c.status !== "zavrsen" && c.status !== "prekinut"}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-0.5">
        Podsesije ({sesija.podsesije.length})
      </p>
      {sesija.podsesije.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          {/* Podsesija */}
          <SubsessionStatusKartica
            podsesija={p}
            isActive={p.id === activePodsesijaId}
            onNavigate={
              onNavigateToPodsesija && p.status !== "zavrseno"
                ? () => onNavigateToPodsesija(p.id)
                : undefined
            }
          />

          {/* Cycles within subsession */}
          {p.ciklusi.length > 0 && (
            <div className="pl-4 border-l-2 border-slate-100 flex flex-col gap-2 ml-3">
              {p.ciklusi.map((c) => (
                <CycleStatusKartica
                  key={c.id}
                  ciklus={c}
                  cycleNumber={c.cycleNumber}
                  isActive={c.status !== "zavrsen" && c.status !== "prekinut"}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
