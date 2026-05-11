"use client";

import { useState } from "react";
import type { Sesija, Ciklus } from "@/lib/types";

// ─── Engine registry — sve engine funkcije koje projekt koristi ───────────────
// Ovo je statički popis STVARNIH engine modula u projektu.
// UI ne računata ništa — samo prikazuje stanje.

type EngineModule = {
  id: string;
  name: string;
  file: string;
  category: "measurement" | "chemistry" | "reaction" | "flow" | "contradiction" | "priority" | "next_action" | "live_summary" | "tts" | "cycle_session" | "reporting" | "alerts";
  usedIn: string[];
  status: "active" | "partial" | "legacy";
  exportedFunction: string;
};

const ENGINE_MODULES: EngineModule[] = [
  {
    id: "measurement",
    name: "Mjerenje pH",
    file: "lib/preporuka.ts",
    category: "measurement",
    exportedFunction: "getMjerenjePH()",
    usedIn: ["live-dashboard.tsx", "mjerenje-sekvencija.tsx", "brzi-unos-mjerenja.tsx", "alerts-compliance-panel.tsx"],
    status: "active",
  },
  {
    id: "chemistry",
    name: "Kemija — pH Zone",
    file: "lib/preporuka.ts",
    category: "chemistry",
    exportedFunction: "getPhZone() / ReakcijaStatus",
    usedIn: ["live-dashboard.tsx", "live-chemistry-kartica.tsx"],
    status: "partial",
  },
  {
    id: "reaction",
    name: "Reakcija — ocijeniStatus",
    file: "lib/preporuka.ts",
    category: "reaction",
    exportedFunction: "ocijeniStatus()",
    usedIn: ["live-dashboard.tsx", "status-sustava-banner.tsx", "podsesija-ekran.tsx"],
    status: "active",
  },
  {
    id: "flow",
    name: "Protok — calcFlowImprovement",
    file: "lib/preporuka.ts",
    category: "flow",
    exportedFunction: "calcFlowImprovement()",
    usedIn: ["live-dashboard.tsx", "ciklus-vremenski-slijed.tsx"],
    status: "active",
  },
  {
    id: "contradiction",
    name: "Proturječnost — statusLabel detekcija",
    file: "lib/preporuka.ts",
    category: "contradiction",
    exportedFunction: "rs.statusLabel (contradiction via label match)",
    usedIn: ["live-dashboard.tsx"],
    status: "partial",
  },
  {
    id: "live_interpretation",
    name: "Live Interpretacija",
    file: "lib/live-interpretation.ts",
    category: "live_summary",
    exportedFunction: "generateLiveInterpretation()",
    usedIn: ["live-pregled.tsx", "mjerenje-sekvencija.tsx"],
    status: "active",
  },
  {
    id: "product_engine",
    name: "Proizvod — ProductEngine",
    file: "lib/product-engine.ts",
    category: "chemistry",
    exportedFunction: "getProductEngine()",
    usedIn: ["product-chemistry-safety-cards.tsx", "podsesija-ekran.tsx"],
    status: "active",
  },
  {
    id: "cleaning_decision",
    name: "Cleaning Decision",
    file: "lib/cleaning-decision-engine.ts",
    category: "next_action",
    exportedFunction: "generirajCleaningDecision()",
    usedIn: ["cleaning-decision-kartica.tsx", "alerts-compliance-panel.tsx"],
    status: "active",
  },
  {
    id: "scale_removal",
    name: "Procjena kamenca",
    file: "lib/scale-removal-estimate.ts",
    category: "measurement",
    exportedFunction: "calcScaleRemoval()",
    usedIn: ["scale-removal-kartica.tsx"],
    status: "active",
  },
  {
    id: "completion_blockers",
    name: "Completion Blockers",
    file: "lib/preporuka.ts",
    category: "cycle_session",
    exportedFunction: "getCompletionBlockers() / mozeLiZavrsitiPodsesiju()",
    usedIn: ["session-cycle-status.tsx", "podsesija-ekran.tsx", "alerts-compliance-panel.tsx"],
    status: "active",
  },
  {
    id: "report_engine",
    name: "Report Engine",
    file: "lib/report-engine.ts",
    category: "reporting",
    exportedFunction: "buildFinalReport() / buildSummaryText()",
    usedIn: ["servisni-izvjestaj.tsx"],
    status: "active",
  },
  {
    id: "tts",
    name: "TTS — Web Speech API",
    file: "lib/speech.d.ts",
    category: "tts",
    exportedFunction: "speechSynthesis (browser API)",
    usedIn: ["live-dashboard.tsx"],
    status: "active",
  },
  {
    id: "session_status",
    name: "Status sesije",
    file: "lib/preporuka.ts",
    category: "cycle_session",
    exportedFunction: "izracunajStatusSesije()",
    usedIn: ["sesija-ekran.tsx", "session-cycle-status.tsx"],
    status: "active",
  },
  {
    id: "alerts_compliance",
    name: "Alerts + Compliance",
    file: "components/hvac/alerts-compliance-panel.tsx",
    category: "alerts",
    exportedFunction: "AlertsCompliancePanel",
    usedIn: ["sesija-ekran.tsx", "podsesija-ekran.tsx"],
    status: "active",
  },
];

// ─── Legacy / Deprecated paths — stvarne UI-level logike koje treba migrirati ─
type DeprecatedPath = {
  id: string;
  description: string;
  file: string;
  line: string;
  severity: "warn" | "critical";
  adapter: string;
};

const DEPRECATED_PATHS: DeprecatedPath[] = [
  {
    id: "dp-1",
    name: "getPhZone() UI function",
    description: "pH zone se računa u live-dashboard.tsx (ln 35) umjesto da se čita iz engine outputa",
    file: "live-dashboard.tsx",
    line: "35",
    severity: "warn",
    adapter: "Legacy pH zone adapter active",
  },
  {
    id: "dp-2",
    name: "snagaSredstva UI calculation",
    description: "snagaSredstva se računa iz pH u live-dashboard.tsx (ln 757) — treba doći iz rs.reactionStrength",
    file: "live-dashboard.tsx",
    line: "757–762",
    severity: "warn",
    adapter: "Inline snaga adapter active",
  },
  {
    id: "dp-3",
    name: "rezultat-mjerenja inline flow text",
    description: "UI sam generira flow status tekst (ln 783-785) umjesto da koristi flowImprovement.statusLabel",
    file: "rezultat-mjerenja.tsx",
    line: "783–785",
    severity: "warn",
    adapter: "Old inline flow text path detected",
  },
  {
    id: "dp-4",
    name: "live-pregled hardcoded scenarios",
    description: "live-pregled.tsx sadrži hardcoded poruke za reaction scenarios (ln 2609, 2638, 2684)",
    file: "live-pregled.tsx",
    line: "2609, 2638, 2684",
    severity: "warn",
    adapter: "Hardcoded scenario text adapter active",
  },
  {
    id: "dp-5",
    name: "thermal-transfer-kartica legacy fallback",
    description: "thermal-transfer-kartica.tsx ima legacy fallback za single-temp mode (ln 302)",
    file: "thermal-transfer-kartica.tsx",
    line: "302",
    severity: "warn",
    adapter: "Legacy single-temp fallback active",
  },
] as unknown as DeprecatedPath[];

// ─── Compatibility adapters ───────────────────────────────────────────────────
const ACTIVE_ADAPTERS = [
  "Legacy pH zone adapter (live-dashboard)",
  "Inline snaga sredstva mapping (live-dashboard)",
  "Old flow text path (rezultat-mjerenja)",
  "Hardcoded scenario text (live-pregled)",
  "Legacy single-temp fallback (thermal-transfer)",
];

// ─── Migration progress — koliko engine modula je fully migrirano ─────────────
const TOTAL_MIGRATION_ITEMS = 14; // ukupno engine poziva koji trebaju biti čisti
const MIGRATED_ITEMS = 9;         // čisti engine pozivi bez UI logike
const MIGRATION_PCT = Math.round((MIGRATED_ITEMS / TOTAL_MIGRATION_ITEMS) * 100);
const READY_FOR_FULL_MIGRATION = DEPRECATED_PATHS.length === 0;

// ─── Category labels ──────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  measurement:    "Mjerenje",
  chemistry:      "Kemija",
  reaction:       "Reakcija",
  flow:           "Protok",
  contradiction:  "Proturječnost",
  priority:       "Prioritet",
  next_action:    "Sljedeća akcija",
  live_summary:   "Live sažetak",
  tts:            "TTS",
  cycle_session:  "Ciklus / Sesija",
  reporting:      "Reporting",
  alerts:         "Alerts / Compliance",
};

// ─── Execution pipeline order (spec defined) ─────────────────────────────────
const PIPELINE_ORDER = [
  "measurement",
  "chemistry",
  "reaction",
  "flow",
  "contradiction",
  "priority",
  "next_action",
  "live_summary",
  "tts",
  "cycle_session",
  "reporting",
  "alerts",
];

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconCheck({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconWarn({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function IconCpu() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/>
      <line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/>
      <line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/>
    </svg>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: "active" | "partial" | "legacy" | "healthy" | "warning" | "degraded" | "ready" | "hybrid" | "blocked" }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active:   { bg: "bg-emerald-100 border-emerald-200", text: "text-emerald-700", label: "Active" },
    partial:  { bg: "bg-amber-100 border-amber-200",     text: "text-amber-700",   label: "Partial" },
    legacy:   { bg: "bg-red-100 border-red-200",         text: "text-red-700",     label: "Legacy" },
    healthy:  { bg: "bg-emerald-100 border-emerald-200", text: "text-emerald-700", label: "Healthy" },
    warning:  { bg: "bg-amber-100 border-amber-200",     text: "text-amber-700",   label: "Warning" },
    degraded: { bg: "bg-red-100 border-red-200",         text: "text-red-700",     label: "Degraded" },
    ready:    { bg: "bg-emerald-100 border-emerald-200", text: "text-emerald-700", label: "Ready" },
    hybrid:   { bg: "bg-amber-100 border-amber-200",     text: "text-amber-700",   label: "Hybrid" },
    blocked:  { bg: "bg-red-100 border-red-200",         text: "text-red-700",     label: "Blocked" },
  };
  const s = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-widest border rounded-full px-2 py-0.5 ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function AdminSection({ title, children, defaultOpen = false, badge }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</span>
          {badge}
        </div>
        <IconChevron open={open} />
      </button>
      {open && <div className="px-4 py-3 bg-white flex flex-col gap-2">{children}</div>}
    </div>
  );
}

// ─── 1. ENGINE ORCHESTRATION STATUS ──────────────────────────────────────────
function OrchestrationStatusPanel() {
  const activeCount  = ENGINE_MODULES.filter((m) => m.status === "active").length;
  const partialCount = ENGINE_MODULES.filter((m) => m.status === "partial").length;
  const legacyCount  = ENGINE_MODULES.filter((m) => m.status === "legacy").length;

  const overallStatus =
    legacyCount > 2 ? "degraded" :
    partialCount > 0 ? "warning" :
    "healthy";

  const overallBg =
    overallStatus === "healthy"  ? "bg-emerald-50 border-emerald-200" :
    overallStatus === "warning"  ? "bg-amber-50 border-amber-200" :
    "bg-red-50 border-red-200";

  const overallText =
    overallStatus === "healthy"  ? "text-emerald-800" :
    overallStatus === "warning"  ? "text-amber-800" :
    "text-red-800";

  return (
    <div className={`rounded-xl border px-4 py-3 ${overallBg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconCpu />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Orchestration Status</p>
        </div>
        <StatusChip status={overallStatus} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-emerald-600 tabular-nums">{activeCount}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Active</p>
        </div>
        <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-amber-600 tabular-nums">{partialCount}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Partial</p>
        </div>
        <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-red-600 tabular-nums">{legacyCount}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Legacy</p>
        </div>
      </div>
      <p className={`text-xs font-medium mt-2 leading-relaxed ${overallText}`}>
        {overallStatus === "healthy"  ? "Svi engine moduli aktivni i čisti." :
         overallStatus === "warning"  ? `${partialCount} modula u parcijalnom stanju — UI logika još aktivna.` :
         "Engine u degradiranom stanju — legacy paths blokiraju migraciju."}
      </p>
    </div>
  );
}

// ─── 2. EXECUTION TRACE VIEW ─────────────────────────────────────────────────
function ExecutionTraceView() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Grupiraj engine module po pipeline redoslijedu
  const ordered = PIPELINE_ORDER.flatMap((cat) =>
    ENGINE_MODULES.filter((m) => m.category === cat)
  );
  // Dodaj module koji nisu u pipeline-u
  const remaining = ENGINE_MODULES.filter((m) => !PIPELINE_ORDER.includes(m.category));

  const allOrdered = [...ordered, ...remaining];

  return (
    <div className="flex flex-col gap-1">
      {allOrdered.map((mod, i) => {
        const isExpanded = expandedId === mod.id;
        const isLast = i === allOrdered.length - 1;
        const statusDot =
          mod.status === "active"  ? "bg-emerald-500" :
          mod.status === "partial" ? "bg-amber-400" :
          "bg-red-500";

        return (
          <div key={mod.id} className="flex gap-2">
            {/* Pipeline line */}
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full shrink-0 mt-3 ${statusDot}`} aria-hidden="true" />
              {!isLast && <div className="w-0.5 flex-1 my-0.5 bg-slate-200" aria-hidden="true" />}
            </div>
            {/* Row */}
            <div className="flex-1 mb-1">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 w-20 shrink-0">
                      {CATEGORY_LABELS[mod.category] ?? mod.category}
                    </span>
                    <span className="text-xs font-bold text-slate-700 truncate">{mod.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusChip status={mod.status} />
                    <IconChevron open={isExpanded} />
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="mx-2 mb-1 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 w-16 shrink-0">File</span>
                      <span className="text-[10px] font-mono text-slate-600 break-all">{mod.file}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 w-16 shrink-0">Export</span>
                      <span className="text-[10px] font-mono text-teal-700 break-all">{mod.exportedFunction}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 w-16 shrink-0">Used in</span>
                      <div className="flex flex-col gap-0.5">
                        {mod.usedIn.map((f) => (
                          <span key={f} className="text-[10px] font-mono text-slate-500">{f}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 3. CONSOLIDATION / DEPRECATED PATHS ─────────────────────────────────────
function ConsolidationPanel() {
  const criticalPaths = DEPRECATED_PATHS.filter((p) => p.severity === "critical");
  const warnPaths     = DEPRECATED_PATHS.filter((p) => p.severity === "warn");

  return (
    <div className="flex flex-col gap-2">
      {DEPRECATED_PATHS.length === 0 ? (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <IconCheck className="text-emerald-600 shrink-0" />
          <p className="text-xs font-bold text-emerald-800">Nema deprecated paths. Consolidation kompletna.</p>
        </div>
      ) : (
        <>
          {criticalPaths.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-600">Critical ({criticalPaths.length})</p>
            </div>
          )}
          {criticalPaths.map((p) => (
            <DeprecatedPathCard key={p.id} path={p} />
          ))}
          {warnPaths.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Warning ({warnPaths.length})</p>
            </div>
          )}
          {warnPaths.map((p) => (
            <DeprecatedPathCard key={p.id} path={p} />
          ))}
        </>
      )}
    </div>
  );
}

function DeprecatedPathCard({ path }: { path: DeprecatedPath }) {
  const [open, setOpen] = useState(false);
  const isCritical = path.severity === "critical";
  return (
    <div className={`rounded-xl border ${isCritical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-2"
      >
        <div className="flex items-start gap-2 min-w-0">
          <IconWarn className={`shrink-0 mt-0.5 ${isCritical ? "text-red-600" : "text-amber-600"}`} />
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate ${isCritical ? "text-red-800" : "text-amber-800"}`}>
              {path.adapter}
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">{path.file}:{path.line}</p>
          </div>
        </div>
        <IconChevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className={`text-xs leading-relaxed ${isCritical ? "text-red-700" : "text-amber-700"}`}>
            {path.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 4. COMPATIBILITY STATUS CARD ────────────────────────────────────────────
function CompatibilityCard() {
  const compatibilityMode: "ready" | "hybrid" | "blocked" =
    READY_FOR_FULL_MIGRATION ? "ready" :
    DEPRECATED_PATHS.length <= 3 ? "hybrid" :
    "blocked";

  const cardBg =
    compatibilityMode === "ready"   ? "bg-emerald-50 border-emerald-200" :
    compatibilityMode === "hybrid"  ? "bg-amber-50 border-amber-200" :
    "bg-red-50 border-red-200";

  const textColor =
    compatibilityMode === "ready"  ? "text-emerald-800" :
    compatibilityMode === "hybrid" ? "text-amber-800" :
    "text-red-800";

  const modeLabel =
    compatibilityMode === "ready"  ? "Full Engine-Driven Mode" :
    compatibilityMode === "hybrid" ? "Hybrid Compatibility Mode" :
    "Migration Blocked";

  const modeDesc =
    compatibilityMode === "ready"  ? "Svi engine moduli su clean. Nema legacy adaptera." :
    compatibilityMode === "hybrid" ? `${ACTIVE_ADAPTERS.length} legacy adaptera još aktivno. Migracija u tijeku.` :
    "Previše deprecated paths. Potrebna hitna konsolidacija.";

  return (
    <div className={`rounded-xl border px-4 py-4 ${cardBg}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Compatibility Mode</p>
          <h3 className={`text-base font-black leading-tight ${textColor}`}>{modeLabel}</h3>
        </div>
        <StatusChip status={compatibilityMode} />
      </div>
      <p className={`text-xs leading-relaxed mb-3 ${textColor}`}>{modeDesc}</p>

      {/* Migration progress */}
      <div className="bg-white/60 rounded-lg px-3 py-2.5 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Migration Progress</p>
          <p className={`text-sm font-black tabular-nums ${
            MIGRATION_PCT >= 80 ? "text-emerald-600" :
            MIGRATION_PCT >= 50 ? "text-amber-600" :
            "text-red-600"
          }`}>{MIGRATION_PCT}%</p>
        </div>
        <div className="h-2 rounded-full bg-white border border-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              MIGRATION_PCT >= 80 ? "bg-emerald-500" :
              MIGRATION_PCT >= 50 ? "bg-amber-400" :
              "bg-red-500"
            }`}
            style={{ width: `${MIGRATION_PCT}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-400 mt-1 tabular-nums">
          {MIGRATED_ITEMS} / {TOTAL_MIGRATION_ITEMS} engine calls clean
        </p>
      </div>

      {/* Ready for full migration badge */}
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
        READY_FOR_FULL_MIGRATION
          ? "bg-emerald-100 border border-emerald-200"
          : "bg-white/60 border border-slate-200"
      }`}>
        {READY_FOR_FULL_MIGRATION ? (
          <IconCheck className="text-emerald-600 shrink-0" />
        ) : (
          <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
        )}
        <p className={`text-[10px] font-bold ${READY_FOR_FULL_MIGRATION ? "text-emerald-700" : "text-slate-500"}`}>
          {READY_FOR_FULL_MIGRATION ? "Ready for Full Migration: YES" : "Ready for Full Migration: NO"}
        </p>
      </div>
    </div>
  );
}

// ─── 5. LEGACY PATHS VIEW ────────────────────────────────────────────────────
function LegacyPathsView() {
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Active Compatibility Adapters</p>
      </div>
      {ACTIVE_ADAPTERS.map((adapter, i) => (
        <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
          <p className="text-xs text-amber-800 font-medium">{adapter}</p>
        </div>
      ))}
    </div>
  );
}

// ─── FULL ENGINE-DRIVEN BADGE ─────────────────────────────────────────────────
function FullEngineBadge() {
  if (READY_FOR_FULL_MIGRATION) {
    return (
      <div className="flex items-center gap-2 bg-emerald-600 rounded-xl px-4 py-3">
        <IconCheck className="text-white w-4 h-4 shrink-0" />
        <p className="text-sm font-black text-white">Full Engine Driven</p>
        <span className="ml-auto text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white border border-emerald-400 rounded-full px-2 py-0.5">
          Verified
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
      <div>
        <p className="text-xs font-black text-amber-800">Hybrid Mode Active</p>
        <p className="text-[10px] text-amber-600 mt-0.5">Migration still in progress — {DEPRECATED_PATHS.length} deprecated paths remaining</p>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function EngineOrchestrationPanel({ sesija, allCiklusi }: {
  sesija?: Sesija;
  allCiklusi?: Ciklus[];
}) {
  const [adminMode, setAdminMode] = useState(false);

  if (!adminMode) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdminMode(true)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 rounded-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100"
        >
          <IconCpu />
          Engine Admin
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconCpu />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Engine Admin Panel</p>
          <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
            Admin Only
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdminMode(false)}
          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          Sakrij
        </button>
      </div>

      {/* Overall orchestration status */}
      <OrchestrationStatusPanel />

      {/* Full engine driven badge */}
      <FullEngineBadge />

      {/* Compatibility card */}
      <CompatibilityCard />

      {/* Collapsible sections */}
      <AdminSection
        title="Execution Trace"
        defaultOpen={true}
        badge={<span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">{ENGINE_MODULES.length} modula</span>}
      >
        <ExecutionTraceView />
      </AdminSection>

      <AdminSection
        title="Consolidation — Deprecated Paths"
        defaultOpen={false}
        badge={
          DEPRECATED_PATHS.length > 0
            ? <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">{DEPRECATED_PATHS.length} paths</span>
            : <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Clean</span>
        }
      >
        <ConsolidationPanel />
      </AdminSection>

      <AdminSection
        title="Legacy Paths + Adapters"
        defaultOpen={false}
        badge={<span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">{ACTIVE_ADAPTERS.length} active</span>}
      >
        <LegacyPathsView />
      </AdminSection>

    </div>
  );
}
