"use client";

import type { Preporuka, PreporukaAkcija } from "@/lib/preporuka";
import { AKCIJA_LABELS, SIGURNOST_LABELS } from "@/lib/preporuka";

// ─── Color maps — dark high-contrast ─────────────────────────────────────────

const ZONE_COLOR = {
  green: {
    card:   "bg-slate-900 border-slate-700",
    badge:  "bg-green-900/60 text-green-300 border border-green-700/40",
    accent: "text-green-400",
    dot:    "bg-green-400",
    action: "bg-green-600 hover:bg-green-500 text-white",
  },
  yellow: {
    card:   "bg-slate-900 border-slate-700",
    badge:  "bg-amber-900/50 text-amber-300 border border-amber-700/40",
    accent: "text-amber-400",
    dot:    "bg-amber-400",
    action: "bg-amber-500 hover:bg-amber-400 text-white",
  },
  orange: {
    card:   "bg-slate-900 border-slate-700",
    badge:  "bg-orange-900/50 text-orange-300 border border-orange-700/40",
    accent: "text-orange-400",
    dot:    "bg-orange-400",
    action: "bg-orange-500 hover:bg-orange-400 text-white",
  },
  red: {
    card:   "bg-slate-900 border-slate-700",
    badge:  "bg-red-900/50 text-red-300 border border-red-700/40",
    accent: "text-red-400",
    dot:    "bg-red-400",
    action: "bg-red-600 hover:bg-red-500 text-white",
  },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low:    "bg-slate-700 text-slate-300",
  medium: "bg-amber-900/50 text-amber-300",
  high:   "bg-green-900/50 text-green-300",
};

// ─── Action icon ─────────────────────────────────────────────────────────────

function AkcijaIkona({ action }: { action: PreporukaAkcija }) {
  const paths: Partial<Record<PreporukaAkcija, string>> = {
    continue_circulation: "M12 4v16m8-8H4",
    monitor_next_measurement: "M12 8v4l3 3M12 3a9 9 0 1 1 0 18A9 9 0 0 1 12 3z",
    add_top_up: "M12 4v16m8-8H4",
    start_new_cycle: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    finish_cycle: "M5 13l4 4L19 7",
    rinse_system: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
    finish_subsession: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    finish_session: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
  };
  const d = paths[action] ?? "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PreporukaKarticaProps {
  preporuka: Preporuka;
  /** If true, render compact inline version (no alternatives, no warnings list) */
  compact?: boolean;
  /** Called when user taps "Dodaj preporučenu količinu" */
  onTopUp?: (amountL: number) => void;
}

export function PreporukaKartica({ preporuka, compact = false, onTopUp }: PreporukaKarticaProps) {
  const colors = ZONE_COLOR[preporuka.phZoneColor];
  const confidenceStyle = CONFIDENCE_COLOR[preporuka.confidence] ?? CONFIDENCE_COLOR.medium;

  return (
    <div className={`border rounded-2xl overflow-hidden ${colors.card}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${colors.badge}`}>
          <AkcijaIkona action={preporuka.recommendedAction} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Preporuka
            </p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
              {preporuka.phZoneLabel}
            </span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5 leading-tight">
            {preporuka.statusLabel}
          </p>
        </div>
      </div>

      {/* Reaction status + pH rate */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
          {preporuka.reactionStatusLabel}
        </span>
        {preporuka.phRateLabel && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {preporuka.phRateLabel}
          </span>
        )}
      </div>

      {/* Explanation */}
      <div className="px-4 pb-3">
        <p className="text-xs leading-relaxed text-slate-400">
          {preporuka.explanation}
        </p>
      </div>

      {/* Recommended action — dominant CTA */}
      <div className={`mx-4 mb-3 rounded-xl px-4 py-3 flex items-center gap-3 ${colors.action}`}>
        <span className="shrink-0 w-2 h-2 rounded-full bg-white/40" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold opacity-70">
            Glavna uputa
          </p>
          <p className="text-base font-black leading-tight">
            {preporuka.recommendedActionLabel}
          </p>
        </div>
        {/* Confidence badge */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${confidenceStyle}`}>
          {preporuka.confidenceLabel}
        </span>
      </div>

      {/* Scale status */}
      {!compact && preporuka.scaleStatus && (() => {
        const badgeColors: Record<string, string> = {
          "Nastavi":     "bg-green-900/50 text-green-300 border-green-700/40",
          "Dodaj kemiju":"bg-amber-900/50 text-amber-300 border-amber-700/40",
          "Ispiranje":   "bg-blue-900/50 text-blue-300 border-blue-700/40",
          "Novi ciklus": "bg-orange-900/50 text-orange-300 border-orange-700/40",
          "Gotovo":      "bg-slate-700 text-slate-300 border-slate-600",
        };
        const badgeClass = preporuka.scaleBadge ? (badgeColors[preporuka.scaleBadge] ?? "bg-slate-700 text-slate-300 border-slate-600") : null;
        return (
          <div className="px-4 pb-3">
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Stanje kamenca
                </p>
                {badgeClass && preporuka.scaleBadge && (
                  <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${badgeClass}`}>
                    {preporuka.scaleBadge}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-white">{preporuka.scaleStatus}</p>
              {preporuka.scaleRecommendation && (
                <p className="text-xs text-slate-400">{preporuka.scaleRecommendation}</p>
              )}
              {preporuka.scaleAddNote && (
                <p className="text-[11px] text-green-400 font-medium">{preporuka.scaleAddNote}</p>
              )}
              {preporuka.scaleAddWarning && (
                <p className="text-[11px] text-red-400 font-semibold">{preporuka.scaleAddWarning}</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Alternatives */}
      {!compact && preporuka.alternatives.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
            Moguće alternative
          </p>
          <ul className="flex flex-col gap-1">
            {preporuka.alternatives.map((alt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="shrink-0 mt-0.5 text-slate-500">—</span>
                {alt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {!compact && preporuka.warnings.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-red-950/60 border border-red-800/40 rounded-xl px-3 py-2 flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-0.5">
              Upozorenja
            </p>
            {preporuka.warnings.map((w, i) => (
              <p key={i} className="text-xs text-red-300 leading-relaxed">{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Recommended top-up amount */}
      {!compact && preporuka.recommendedAddAmountL != null && (() => {
        const badgeColors: Record<string, string> = {
          "Ne dodavati":   "bg-slate-700 text-slate-300 border-slate-600",
          "Dodaj malo":    "bg-amber-900/50 text-amber-300 border-amber-700/40",
          "Dodaj srednje": "bg-orange-900/50 text-orange-300 border-orange-700/40",
          "Novi ciklus":   "bg-red-900/50 text-red-300 border-red-700/40",
          "Ispiranje":     "bg-blue-900/50 text-blue-300 border-blue-700/40",
        };
        const badge = preporuka.topUpActionBadge;
        const badgeClass = badge ? (badgeColors[badge] ?? "bg-slate-700 text-slate-300 border-slate-600") : null;
        const showButton = onTopUp && preporuka.recommendedAddAmountL > 0 && badge !== "Novi ciklus" && badge !== "Ispiranje" && badge !== "Ne dodavati";

        return (
          <div className="px-4 pb-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <svg className={`shrink-0 ${colors.accent}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Preporucena nadopuna
                  </p>
                </div>
                {badge && badgeClass && (
                  <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${badgeClass}`}>
                    {badge}
                  </span>
                )}
              </div>

              {preporuka.topUpReason && (
                <p className="text-xs text-slate-400 italic">{preporuka.topUpReason}</p>
              )}

              {preporuka.recommendedAddAmountL > 0 && (
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold leading-none ${colors.accent}`}>
                    {preporuka.recommendedAddAmountL.toFixed(1)} L
                  </span>
                  {preporuka.recommendedAddPercent != null && preporuka.recommendedAddPercent > 0 && (
                    <span className="text-xs text-slate-400">
                      (~{preporuka.recommendedAddPercent}% od dosad dodanog)
                    </span>
                  )}
                </div>
              )}

              {preporuka.topUpWarning && (
                <p className="text-[11px] font-semibold text-amber-300 leading-relaxed bg-amber-900/40 border border-amber-700/40 rounded-lg px-2.5 py-1.5">
                  {preporuka.topUpWarning}
                </p>
              )}

              {preporuka.topUpSafetyNote && preporuka.recommendedAddAmountL > 0 && (
                <p className="text-[11px] text-slate-400 leading-relaxed italic">
                  {preporuka.topUpSafetyNote}
                </p>
              )}

              {showButton && (
                <button
                  type="button"
                  onClick={() => onTopUp!(preporuka.recommendedAddAmountL!)}
                  className={`w-full mt-1 rounded-xl py-3 text-sm font-black transition-all active:scale-[0.98] ${colors.action}`}
                >
                  Dodaj preporucenu kolicinu
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Compact inline version for measurement history lists ─────────────────────

export function PreporukaRedak({ preporuka }: { preporuka: Preporuka }) {
  const colors = ZONE_COLOR[preporuka.phZoneColor];
  const confidenceStyle = CONFIDENCE_COLOR[preporuka.confidence] ?? CONFIDENCE_COLOR.medium;
  return (
    <div className="rounded-xl px-3 py-2 flex items-center gap-2 border bg-slate-900 border-slate-700">
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      <p className={`text-xs font-semibold flex-1 ${colors.accent}`}>
        {preporuka.recommendedActionLabel}
      </p>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${confidenceStyle}`}>
        {preporuka.confidenceLabel}
      </span>
    </div>
  );
}
