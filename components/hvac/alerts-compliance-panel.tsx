"use client";

import { useState } from "react";
import type { Sesija, Ciklus, Podsesija } from "@/lib/types";
import { izracunajStatusSesije, getUzUpozorenjeLabel } from "@/lib/types";
import {
  mozeLiZavrsitiPodsesiju,
  mozeLiZavrsitiSesiju,
  type ZavrsetakEligibilnost,
} from "@/lib/preporuka";

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "warn" | "info";
type AlertState = "active" | "acknowledged" | "resolved";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  state: AlertState;
  timestamp?: string;
  source?: string;
}

export interface ComplianceResult {
  complianceStatus: "compliant" | "partially_compliant" | "non_compliant";
  complianceScore: number; // 0–100
  auditTrailReady: boolean;
  completedRequirements: string[];
  missingRequirements: string[];
  complianceIssues: string[];
}

export interface AutomationEvent {
  id: string;
  message: string;
  type: "recommendation" | "block" | "warning";
  timestamp?: string;
  source?: string;
}

// ─── Engine → Alert mapping ───────────────────────────────────────────────────
// Maps real engine outputs (blockers, statusSesije, completionPhases) to AlertItem[]
// UI does NOT generate alerts — it only reads engine outputs.

export function buildAlertsFromEngine(
  sesija: Sesija,
  allCiklusi: Ciklus[],
  podsesija?: Podsesija | null
): AlertItem[] {
  const alerts: AlertItem[] = [];
  let idx = 0;

  // 1. Session-level status warnings — iz izracunajStatusSesije (engine)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusSesije = izracunajStatusSesije(sesija as any);
  if (statusSesije === "uz_upozorenje") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uzUpozorenjeLabel = getUzUpozorenjeLabel(sesija as any);
    alerts.push({
      id: `session-warn-${idx++}`,
      severity: "warn",
      message: uzUpozorenjeLabel,
      state: "active",
      source: "Status sesije",
    });
  }

  // 2. Session completion blockers — iz mozeLiZavrsitiSesiju (engine)
  const sessionElig = mozeLiZavrsitiSesiju(sesija);
  if (!sessionElig.canFinish) {
    sessionElig.blockers.forEach((b) => {
      alerts.push({
        id: `session-blocker-${idx++}`,
        severity: "critical",
        message: b,
        state: "active",
        source: "Završetak sesije",
      });
    });
  }

  // 3. Podsesija blockers — iz mozeLiZavrsitiPodsesiju (engine)
  if (podsesija) {
    const psElig = mozeLiZavrsitiPodsesiju(podsesija);
    if (!psElig.canFinish) {
      psElig.blockers.forEach((b) => {
        alerts.push({
          id: `ps-blocker-${idx++}`,
          severity: "warn",
          message: b,
          state: "active",
          source: `Podsesija: ${podsesija.naziv ?? podsesija.id.slice(0, 6)}`,
        });
      });
    }
  }

  // 4. Cycle-level measurement warnings — iz mjerenja.warnings (engine output)
  allCiklusi.forEach((c) => {
    const cycleLabel = `Ciklus #${c.cycleNumber ?? c.broj}`;
    c.mjerenja.forEach((m) => {
      const t = m.timestamp ?? m.createdAt;
      const mAny = m as unknown as Record<string, unknown>;
      if (!mAny.warnings) return;
      const warns = Array.isArray(mAny.warnings) ? mAny.warnings : [];
      warns.forEach((w: { message?: string; text?: string; level?: string; severity?: string } | string) => {
        const msg = typeof w === "string" ? w : (w.message ?? w.text ?? "");
        const sev: AlertSeverity =
          typeof w !== "string" && (w.level === "critical" || w.severity === "critical")
            ? "critical"
            : typeof w !== "string" && (w.level === "warn" || w.severity === "warn")
            ? "warn"
            : "info";
        if (!msg) return;
        alerts.push({
          id: `mj-warn-${idx++}`,
          severity: sev,
          message: msg,
          state: "active",
          timestamp: t,
          source: cycleLabel,
        });
      });
    });

    // 5. Color mismatch warning from cleaning-decision-engine
    if (c.decisions) {
      (c.decisions as Array<{
        colorMismatch?: boolean;
        colorMismatchMessage?: string | null;
        timestamp?: string;
        createdAt?: string;
        severity?: string;
      }>).forEach((d) => {
        if (d.colorMismatch && d.colorMismatchMessage) {
          alerts.push({
            id: `mismatch-${idx++}`,
            severity: "warn",
            message: d.colorMismatchMessage,
            state: "active",
            timestamp: d.timestamp ?? d.createdAt,
            source: cycleLabel,
          });
        }
      });
    }
  });

  return alerts;
}

// ─── Engine → Compliance mapping ─────────────────────────────────────────────
// Maps mozeLiZavrsitiPodsesiju/Sesiju and completionPhases to ComplianceResult
// UI does NOT infer compliance — reads engine blockers directly.

export function buildComplianceFromEngine(
  sesija: Sesija,
  allCiklusi: Ciklus[],
  podsesija?: Podsesija | null
): ComplianceResult {
  const elig: ZavrsetakEligibilnost = podsesija
    ? mozeLiZavrsitiPodsesiju(podsesija)
    : mozeLiZavrsitiSesiju(sesija);

  const completedRequirements: string[] = [];
  const missingRequirements: string[] = [];

  // Check each completion phase from engine
  const lastCiklus = podsesija
    ? [...podsesija.ciklusi].reverse().find((c) => c.status === "zavrsen" || c.status === "prekinut")
    : [...allCiklusi].reverse().find((c) => c.status === "zavrsen" || c.status === "prekinut");

  const phases = lastCiklus?.completionPhases;

  // Ispiranje
  if (phases?.ispiranje?.systemRinsedWithCleanWater) {
    completedRequirements.push("Ispiranje potvrđeno");
  } else {
    missingRequirements.push("Ispiranje nije potvrđeno");
  }

  // Neutralizacija
  const needsNeutralization = phases?.ispiranje?.neutralizationRequired !== false;
  if (!needsNeutralization) {
    completedRequirements.push("Neutralizacija nije potrebna");
  } else if (phases?.neutralizacija?.neutralizerProductName) {
    completedRequirements.push("Neutralizacija evidentirana");
  } else {
    missingRequirements.push("Neutralizacija nije dokumentirana");
  }

  // Završni pH
  if (phases?.zavrsniPH?.technicianConfirmed) {
    completedRequirements.push("Završni pH potvrđen od servisera");
  } else if (phases?.zavrsniPH) {
    missingRequirements.push("Završni pH nije potvrđen od servisera");
  } else {
    missingRequirements.push("Nedostaje referentno mjerenje završnog pH");
  }

  // At least one cycle
  const hasCycles = allCiklusi.length > 0;
  if (hasCycles) {
    completedRequirements.push("Evidentirani ciklusi čišćenja");
  } else {
    missingRequirements.push("Nema evidentiranih ciklusa");
  }

  const total = completedRequirements.length + missingRequirements.length;
  const score = total > 0 ? Math.round((completedRequirements.length / total) * 100) : 0;

  const complianceStatus: ComplianceResult["complianceStatus"] =
    elig.canFinish ? "compliant" :
    missingRequirements.length <= 1 ? "partially_compliant" :
    "non_compliant";

  const auditTrailReady = elig.canFinish;

  return {
    complianceStatus,
    complianceScore: score,
    auditTrailReady,
    completedRequirements,
    missingRequirements,
    complianceIssues: elig.blockers,
  };
}

// ─── Engine → Automation mapping ─────────────────────────────────────────────
// Maps CleaningDecision.glavnaUputa and decisions[] to AutomationEvent[]
// UI does NOT create automation rules — reads engine decisions.

export function buildAutomationFromEngine(allCiklusi: Ciklus[]): AutomationEvent[] {
  const events: AutomationEvent[] = [];
  let idx = 0;

  allCiklusi.forEach((c) => {
    const cycleLabel = `Ciklus #${c.cycleNumber ?? c.broj}`;
    if (!c.decisions) return;

    (c.decisions as Array<{
      glavnaUputa?: string;
      glavnaUputaLabel?: string;
      stanjeCiscenja?: string;
      zasto?: string;
      confidence?: string;
      severity?: string;
      topUpWarning?: string;
      timestamp?: string;
      createdAt?: string;
    }>).forEach((d) => {
      // Automation recommendation — iz CleaningDecision.glavnaUputa
      if (d.glavnaUputaLabel) {
        const type: AutomationEvent["type"] =
          d.severity === "critical" ? "block" :
          d.severity === "warn" ? "warning" :
          "recommendation";
        events.push({
          id: `auto-${idx++}`,
          message: d.glavnaUputaLabel + (d.zasto ? ` — ${d.zasto}` : ""),
          type,
          timestamp: d.timestamp ?? d.createdAt,
          source: cycleLabel,
        });
      }

      // Top-up warning from engine
      if (d.topUpWarning) {
        events.push({
          id: `topup-warn-${idx++}`,
          message: d.topUpWarning,
          type: "warning",
          timestamp: d.timestamp ?? d.createdAt,
          source: cycleLabel,
        });
      }
    });
  });

  return events;
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; dot: string; text: string; badge: string; badgeText: string }> = {
  critical: {
    bg:        "bg-red-50",
    border:    "border-red-200",
    dot:       "bg-red-500",
    text:      "text-red-800",
    badge:     "bg-red-100 border-red-300",
    badgeText: "text-red-700",
  },
  warn: {
    bg:        "bg-amber-50",
    border:    "border-amber-200",
    dot:       "bg-amber-500",
    text:      "text-amber-800",
    badge:     "bg-amber-100 border-amber-300",
    badgeText: "text-amber-700",
  },
  info: {
    bg:        "bg-sky-50",
    border:    "border-sky-200",
    dot:       "bg-sky-400",
    text:      "text-sky-800",
    badge:     "bg-sky-100 border-sky-300",
    badgeText: "text-sky-700",
  },
};

const STATE_LABELS: Record<AlertState, string> = {
  active:       "Aktivno",
  acknowledged: "Primljeno",
  resolved:     "Riješeno",
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "Kritično",
  warn:     "Upozorenje",
  info:     "Info",
};

function formatTime(iso?: string) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("hr-HR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));
  } catch {
    return null;
  }
}

interface AlertCardProps {
  alert: AlertItem;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}

function AlertCard({ alert, onAcknowledge, onResolve }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false);
  const st = SEVERITY_STYLES[alert.severity];
  const isMuted = alert.state === "acknowledged" || alert.state === "resolved";

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-all ${st.bg} ${st.border} ${isMuted ? "opacity-50" : ""}`}
      role="alert"
      aria-live={alert.severity === "critical" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        {/* Dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${st.dot}`} aria-hidden="true" />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[9px] font-black uppercase tracking-widest border rounded-full px-2 py-0.5 ${st.badge} ${st.badgeText}`}>
                {SEVERITY_LABELS[alert.severity]}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 bg-white">
                {STATE_LABELS[alert.state]}
              </span>
              {alert.source && (
                <span className="text-[9px] text-slate-400">{alert.source}</span>
              )}
            </div>
            {formatTime(alert.timestamp) && (
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{formatTime(alert.timestamp)}</span>
            )}
          </div>

          {/* Message */}
          <p className={`text-sm font-bold mt-1.5 leading-snug ${st.text}`}>{alert.message}</p>

          {/* Actions */}
          {alert.state === "active" && (onAcknowledge || onResolve) && (
            <div className="flex gap-2 mt-2">
              {onAcknowledge && (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="min-h-[36px] text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Potvrdi primitak
                </button>
              )}
              {onResolve && (
                <button
                  onClick={() => onResolve(alert.id)}
                  className="min-h-[36px] text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Označi riješeno
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Alert Center ─────────────────────────────────────────────────────────────

interface AlertCenterProps {
  alerts: AlertItem[];
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}

export function AlertCenter({ alerts, onAcknowledge, onResolve }: AlertCenterProps) {
  const [showResolved, setShowResolved] = useState(false);

  // Priority: critical pinned first, then warn, then info
  const critical    = alerts.filter((a) => a.severity === "critical" && a.state === "active");
  const warnings    = alerts.filter((a) => a.severity === "warn"     && a.state === "active");
  const infos       = alerts.filter((a) => a.severity === "info"     && a.state === "active");
  const acknowledged = alerts.filter((a) => a.state === "acknowledged");
  const resolved    = alerts.filter((a) => a.state === "resolved");

  const activeCount = critical.length + warnings.length + infos.length;

  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-700" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Alert centar</p>
          <p className="text-sm font-bold text-emerald-800">Nema aktivnih upozorenja</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Alert centar
        </p>
        {activeCount > 0 && (
          <span className={`text-[10px] font-black uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${
            critical.length > 0
              ? "bg-red-100 text-red-700 border-red-200"
              : "bg-amber-100 text-amber-700 border-amber-200"
          }`}>
            {activeCount} {activeCount === 1 ? "aktivno" : "aktivnih"}
          </span>
        )}
      </div>

      {/* Critical alerts — pinned to top */}
      {critical.map((a) => (
        <AlertCard key={a.id} alert={a} onAcknowledge={onAcknowledge} onResolve={onResolve} />
      ))}

      {/* Warn alerts */}
      {warnings.map((a) => (
        <AlertCard key={a.id} alert={a} onAcknowledge={onAcknowledge} onResolve={onResolve} />
      ))}

      {/* Info alerts */}
      {infos.map((a) => (
        <AlertCard key={a.id} alert={a} onAcknowledge={onAcknowledge} onResolve={onResolve} />
      ))}

      {/* Acknowledged — muted */}
      {acknowledged.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Primljeno</p>
          {acknowledged.map((a) => (
            <AlertCard key={a.id} alert={a} onResolve={onResolve} />
          ))}
        </div>
      )}

      {/* Resolved — collapsible */}
      {resolved.length > 0 && (
        <div>
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showResolved ? "Sakrij riješena" : `Prikaži riješena (${resolved.length})`}
          </button>
          {showResolved && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {resolved.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Automation Panel ─────────────────────────────────────────────────────────

interface AutomationPanelProps {
  events: AutomationEvent[];
}

const AUTOMATION_STYLES: Record<AutomationEvent["type"], { bg: string; border: string; dot: string; text: string; label: string }> = {
  recommendation: { bg: "bg-sky-50",   border: "border-sky-200",   dot: "bg-sky-400",   text: "text-sky-800",   label: "Automatska preporuka" },
  block:          { bg: "bg-red-50",   border: "border-red-200",   dot: "bg-red-500",   text: "text-red-800",   label: "Automatska blokada" },
  warning:        { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", text: "text-amber-800", label: "Automatsko upozorenje" },
};

export function AutomationPanel({ events }: AutomationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Automatizacija</p>
        <p className="text-xs text-slate-400 italic">Nema automatiziranih odluka u ovoj sesiji.</p>
      </div>
    );
  }

  const warnings  = events.filter((e) => e.type === "warning");
  const blocks    = events.filter((e) => e.type === "block");
  const recs      = events.filter((e) => e.type === "recommendation");

  const prioritised = [...blocks, ...warnings, ...recs];
  const displayed   = expanded ? prioritised : prioritised.slice(0, 4);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Automatizacija</p>
        <span className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded-full px-2 py-0.5 bg-white">
          {events.length} {events.length === 1 ? "događaj" : "događaja"}
        </span>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-sky-500 shrink-0" aria-hidden="true">
          <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <p className="text-[10px] font-bold text-sky-700">Automatske odluke — engine generiran. UI samo prikazuje.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {displayed.map((ev) => {
          const st = AUTOMATION_STYLES[ev.type];
          return (
            <div key={ev.id} className={`rounded-xl border px-3 py-2.5 ${st.bg} ${st.border}`}>
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${st.dot}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{st.label}</p>
                    {formatTime(ev.timestamp) && (
                      <p className="text-[10px] text-slate-400 tabular-nums shrink-0">{formatTime(ev.timestamp)}</p>
                    )}
                  </div>
                  <p className={`text-xs font-bold mt-0.5 leading-snug ${st.text}`}>{ev.message}</p>
                  {ev.source && <p className="text-[10px] text-slate-400 mt-0.5">{ev.source}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {prioritised.length > 4 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors text-left"
        >
          {expanded ? "Prikaži manje" : `Prikaži sve (${prioritised.length})`}
        </button>
      )}
    </div>
  );
}

// ─── Compliance Card ──────────────────────────────────────────────────────────

interface ComplianceCardProps {
  compliance: ComplianceResult;
}

const COMPLIANCE_STYLES = {
  compliant:           { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Usklađeno" },
  partially_compliant: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   badge: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-500",   label: "Djelomično usklađeno" },
  non_compliant:       { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-800",     badge: "bg-red-100 text-red-700 border-red-200",     dot: "bg-red-500",     label: "Nije usklađeno" },
};

export function ComplianceCard({ compliance }: ComplianceCardProps) {
  const st = COMPLIANCE_STYLES[compliance.complianceStatus];
  const barW =
    compliance.complianceScore >= 100 ? "w-full" :
    compliance.complianceScore >= 75  ? "w-3/4" :
    compliance.complianceScore >= 50  ? "w-1/2" :
    compliance.complianceScore >= 25  ? "w-1/4" :
    "w-0";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${st.bg} ${st.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usklađenost (Compliance)</p>
        <span className={`text-[10px] font-black uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${st.badge}`}>
          {st.label}
        </span>
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <p className={`text-2xl font-black tabular-nums ${st.text}`}>{compliance.complianceScore}%</p>
          <p className="text-[10px] text-slate-400 mb-1">Indeks usklađenosti</p>
        </div>
        <div className="h-2 rounded-full bg-white/60 overflow-hidden border border-black/5">
          <div className={`h-full rounded-full transition-all ${st.dot} ${barW}`} />
        </div>
      </div>

      {/* Audit trail badge */}
      <div className={`rounded-xl px-3 py-2 mb-3 flex items-center gap-2 ${
        compliance.auditTrailReady
          ? "bg-emerald-100 border border-emerald-200"
          : "bg-amber-100 border border-amber-200"
      }`}>
        {compliance.auditTrailReady ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-700 shrink-0" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-xs font-bold text-emerald-800">Audit trail spreman — dokumentacija kompletna</p>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-700 shrink-0" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-xs font-bold text-amber-800">Audit trail nije spreman — nedostaje dokumentacija</p>
          </>
        )}
      </div>

      {/* Completed requirements */}
      {compliance.completedRequirements.length > 0 && (
        <div className="mb-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Ispunjeno</p>
          <div className="flex flex-col gap-1">
            {compliance.completedRequirements.map((req, i) => (
              <div key={i} className="flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500 shrink-0" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-xs text-slate-700">{req}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing requirements */}
      {compliance.missingRequirements.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Nedostaje</p>
          <div className="flex flex-col gap-1">
            {compliance.missingRequirements.map((req, i) => (
              <div key={i} className="flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-400 shrink-0" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <p className="text-xs font-bold text-slate-700">{req}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance issues — iz engine blockers */}
      {compliance.complianceIssues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-black/5">
          <p className="text-[9px] font-black uppercase tracking-widest text-red-600 mb-1.5">Blokatori (engine)</p>
          <div className="flex flex-col gap-1">
            {compliance.complianceIssues.map((issue, i) => (
              <p key={i} className="text-xs font-bold text-red-700 leading-snug">— {issue}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Full Alerts + Compliance Panel ──────────────────────────────────────────

interface AlertsCompliancePanelProps {
  sesija: Sesija;
  allCiklusi: Ciklus[];
  podsesija?: Podsesija | null;
  onAlertAcknowledge?: (id: string) => void;
  onAlertResolve?: (id: string) => void;
}

export function AlertsCompliancePanel({
  sesija,
  allCiklusi,
  podsesija,
  onAlertAcknowledge,
  onAlertResolve,
}: AlertsCompliancePanelProps) {
  const [alertStates, setAlertStates] = useState<Record<string, AlertState>>({});

  // Build from engine
  const rawAlerts  = buildAlertsFromEngine(sesija, allCiklusi, podsesija);
  const compliance = buildComplianceFromEngine(sesija, allCiklusi, podsesija);
  const automation = buildAutomationFromEngine(allCiklusi);

  // Apply UI state overrides (acknowledge/resolve)
  const alerts: AlertItem[] = rawAlerts.map((a) => ({
    ...a,
    state: alertStates[a.id] ?? a.state,
  }));

  function handleAcknowledge(id: string) {
    setAlertStates((prev) => ({ ...prev, [id]: "acknowledged" }));
    onAlertAcknowledge?.(id);
  }

  function handleResolve(id: string) {
    setAlertStates((prev) => ({ ...prev, [id]: "resolved" }));
    onAlertResolve?.(id);
  }

  // Display priority: critical alerts → compliance failures → automation warnings → unresolved
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && a.state === "active");
  const complianceFailing = compliance.complianceStatus === "non_compliant" || compliance.complianceStatus === "partially_compliant";

  return (
    <div className="flex flex-col gap-4">

      {/* PRIORITET 1: Critical alerts */}
      {criticalAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {criticalAlerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}

      {/* PRIORITET 2: Compliance failures */}
      {complianceFailing && (
        <ComplianceCard compliance={compliance} />
      )}

      {/* PRIORITET 3: Automation warnings */}
      {automation.filter((e) => e.type === "block" || e.type === "warning").length > 0 && (
        <AutomationPanel events={automation.filter((e) => e.type === "block" || e.type === "warning")} />
      )}

      {/* PRIORITET 4–5: Alert center (unresolved + recommendations) */}
      <AlertCenter
        alerts={alerts}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
      />

      {/* PRIORITET 6: Compliance (full) if not already shown in critical path */}
      {!complianceFailing && (
        <ComplianceCard compliance={compliance} />
      )}

      {/* Automation recommendations */}
      {automation.filter((e) => e.type === "recommendation").length > 0 && (
        <AutomationPanel events={automation.filter((e) => e.type === "recommendation")} />
      )}

    </div>
  );
}
