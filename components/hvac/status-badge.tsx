"use client";

import { cn } from "@/lib/utils";

type Status = string;

const labelMap: Record<string, string> = {
  // ── Sesija (6 statusa prema specifikaciji) ──────────────────────────────
  u_radu:           "U radu",
  aktivna_reakcija: "Aktivna reakcija",
  ciklus_zavrsen:   "Ciklus završen",
  zavrseno:         "Završeno",
  uz_upozorenje:    "Završeno uz upozorenje",
  nedovrseno:       "Nedovršeno",
  // ── Backwards compat — stari statusi koji mogu biti u pohrani ──────────
  nije_zapoceto:        "Nije započeto",
  pauzirano:            "Pauzirano",
  zatvoreno_nedovrseno: "Nedovršeno",
  djelomicno_zavrseno:  "Završeno uz upozorenje",
  // ── Podsesija ──────────────────────────────────────────────────────────
  ceka_mjerenje:  "Čeka mjerenje",
  ceka_nadopunu:  "Čeka nadopunu",
  ceka_novi_ciklus: "Čeka novi ciklus",
  prekinuto: "Prekinuto",
  // ── Ciklus ─────────────────────────────────────────────────────────────
  priprema:              "Priprema",
  aktivan:               "Aktivan",
  ceka_pocetno_mjerenje: "Čeka referentno mjerenje",
  ceka_redovno_mjerenje: "Čeka redovno mjerenje",
  ceka_nadopunu_ciklus:  "Čeka nadopunu",
  preporucen_novi_ciklus: "Preporučen novi ciklus",
  zavrsen:  "Završen",
  prekinut: "Prekinut",
  // ── Reakcija ───────────────────────────────────────────────────────────
  dobra:        "Dobra reakcija",
  slaba:        "Slaba reakcija",
  nema_reakcije: "Nema reakcije",
  nepoznato:    "Nepoznato",
};

// Animirani dot — samo za aktivne statuse
const dotMap: Record<string, string> = {
  u_radu:           "bg-blue-500",
  aktivna_reakcija: "bg-orange-500 animate-pulse",
  ciklus_zavrsen:   "bg-sky-500",
  zavrseno:         "bg-emerald-500",
  uz_upozorenje:    "bg-amber-500",
  nedovrseno:       "bg-red-500",
  // compat
  zatvoreno_nedovrseno: "bg-red-500",
  djelomicno_zavrseno:  "bg-amber-500",
};

const colorMap: Record<string, string> = {
  // ── Sesija ─────────────────────────────────────────────────────────────
  u_radu:           "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
  aktivna_reakcija: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700/50",
  ciklus_zavrsen:   "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
  zavrseno:         "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
  uz_upozorenje:    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50",
  nedovrseno:       "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/50",
  // ── Backwards compat ───────────────────────────────────────────────────
  nije_zapoceto:        "bg-slate-100 text-slate-600 border-slate-200",
  pauzirano:            "bg-yellow-100 text-yellow-800 border-yellow-300",
  zatvoreno_nedovrseno: "bg-red-100 text-red-700 border-red-300",
  djelomicno_zavrseno:  "bg-amber-100 text-amber-800 border-amber-300",
  // ── Podsesija ──────────────────────────────────────────────────────────
  ceka_mjerenje:   "bg-violet-100 text-violet-800 border-violet-200",
  ceka_nadopunu:   "bg-orange-100 text-orange-800 border-orange-200",
  ceka_novi_ciklus: "bg-sky-100 text-sky-800 border-sky-200",
  prekinuto:       "bg-red-100 text-red-700 border-red-200",
  // ── Ciklus ─────────────────────────────────────────────────────────────
  priprema:              "bg-slate-100 text-slate-600 border-slate-200",
  aktivan:               "bg-blue-100 text-blue-800 border-blue-200",
  ceka_pocetno_mjerenje: "bg-violet-100 text-violet-800 border-violet-200",
  ceka_redovno_mjerenje: "bg-violet-100 text-violet-700 border-violet-200",
  ceka_nadopunu_ciklus:  "bg-orange-100 text-orange-800 border-orange-200",
  preporucen_novi_ciklus: "bg-amber-100 text-amber-800 border-amber-200",
  zavrsen:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  prekinut: "bg-red-100 text-red-700 border-red-200",
  // ── Reakcija ───────────────────────────────────────────────────────────
  dobra:        "bg-emerald-100 text-emerald-800 border-emerald-200",
  slaba:        "bg-orange-100 text-orange-800 border-orange-200",
  nema_reakcije: "bg-red-100 text-red-800 border-red-200",
  nepoznato:    "bg-slate-100 text-slate-500 border-slate-200",
};

interface StatusBadgeProps {
  status: Status;
  size?: "sm" | "md";
  /** Specifičan label koji zamjenjuje generički — koristi se za uz_upozorenje */
  warningLabel?: string;
}

export function StatusBadge({ status, size = "sm", warningLabel }: StatusBadgeProps) {
  // Badge uvijek pokazuje kratki generički label — warningLabel se koristi externe (tooltip, subtitle)
  const label = labelMap[status] ?? status;
  const color = colorMap[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const dot = dotMap[status];

  return (
    <span
      title={warningLabel ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 border font-medium rounded-full whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm",
        color
      )}
    >
      {dot && (
        <span className={cn("shrink-0 rounded-full", dot, size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2")} />
      )}
      {label}
    </span>
  );
}
