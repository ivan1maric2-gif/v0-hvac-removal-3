// ─── Dynamic Dashboard Config ─────────────────────────────────────────────────
//
// getDashboardConfig() vraća product-specific dashboard konfiguraciju.
//
// Dashboard se potpuno mijenja ovisno o aktivnom proizvodu:
//   - DS-3:    pH dominantan model — blue/green/yellow tema
//   - FX:      pink/yellow model — magenta/yellow tema
//   - DS-40:   sludge/contamination model — red/orange tema
//   - Rector:  inhibitor-aware descaler — yellow/red tema
//
// VAŽNO:
//   - Ne koristiti univerzalni dashboard.
//   - Svi podaci dolaze iz selectedProductEngine.
//   - Dashboard mora biti spreman za buduće proizvode.

import type { ProductEngine, ProductEngineId } from "./product-engine-types";
import type {
  LiveReactionState,
  ReactionTrend,
  ChemistryConsumptionRate,
} from "./live-interpretation";

// ─── Color theme ──────────────────────────────────────────────────────────────

export interface DashboardColorTheme {
  /** Primarna boja teme (Tailwind klase) */
  primary: string;
  primaryText: string;
  primaryBg: string;
  primaryBorder: string;
  /** Sekundarna boja */
  secondary: string;
  secondaryText: string;
  secondaryBg: string;
  secondaryBorder: string;
  /** Header gradient */
  headerBg: string;
  /** Accent za warning/critical */
  accentText: string;
  accentBg: string;
  accentBorder: string;
  /** Badge za recommendation */
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

// ─── Status card definicija ───────────────────────────────────────────────────

export interface DashboardStatusCard {
  id: string;
  /** Naslov kartice — product-specific */
  title: string;
  /** Vrijednost (string za prikaz) */
  value: string;
  /** Opis */
  description?: string;
  /** Vizualna razina: ok | warn | critical | info */
  level: "ok" | "warn" | "critical" | "info" | "neutral";
  /** Indikator boja dot */
  dotColor: string;
  /** Je li ova kartica prioritetna za ovaj proizvod */
  isPrimary: boolean;
}

// ─── Indicator definicija ─────────────────────────────────────────────────────

export interface DashboardIndicator {
  id: string;
  /** Kratki label */
  label: string;
  /** Vrijednost za prikaz */
  value: string;
  /** Redosljed prikaza (manji = viši prioritet) */
  priority: number;
  /** Tailwind klasa boje */
  color: string;
  /** Ikona identifikator */
  icon: "ph" | "color" | "foam" | "bubbling" | "temp" | "flow" | "sludge" | "magnet";
  /** Da li je ovaj indicator primaran za ovaj proizvod */
  isPrimary: boolean;
}

// ─── Reaction status card ─────────────────────────────────────────────────────

export type LiveReactionStatus =
  | "very_strong"    // Vrlo jaka reakcija
  | "active"         // Aktivna
  | "weakening"      // Slabi
  | "exhausted"      // Iscrpljeno
  | "stable_finished"; // Stabilno / završeno

export const LIVE_REACTION_STATUS_LABEL: Record<LiveReactionStatus, string> = {
  very_strong:      "Vrlo jaka reakcija",
  active:           "Aktivna reakcija",
  weakening:        "Reakcija slabi",
  exhausted:        "Iscrpljeno",
  stable_finished:  "Stabilno / završeno",
};

// ─── Finish cycle readiness ───────────────────────────────────────────────────

export type FinishCycleReadiness =
  | "not_ready"
  | "close"
  | "ready";

export const FINISH_CYCLE_READINESS_LABEL: Record<FinishCycleReadiness, string> = {
  not_ready: "Nije spremo",
  close:     "Blizu završetka",
  ready:     "Spremo za završetak",
};

// ─── Dynamic Dashboard Config ─────────────────────────────────────────────────

export interface DynamicDashboardConfig {
  engineId: ProductEngineId;
  engineName: string;
  productName: string;

  /** Naziv dashboard prikaza */
  dashboardTitle: string;

  /** Boja tema za cijeli dashboard */
  colorTheme: DashboardColorTheme;

  /** Prioritetni indikatori — sortirani po priority */
  indicators: DashboardIndicator[];

  /** Product-specific status kartice */
  statusCards: DashboardStatusCard[];

  /** Chemistry summary kartica */
  chemistryCard: {
    title: string;
    status: string;
    statusColor: string;
    description: string;
  };

  /** Reaction status */
  reactionCard: {
    title: string;
    status: LiveReactionStatus;
    statusLabel: string;
    description: string;
    strengthPercent: number;
    color: string;
  };

  /** Saturation kartica */
  saturationCard: {
    title: string;
    value: string;
    color: string;
    description: string;
  };

  /** Thermal kartica */
  thermalCard: {
    title: string;
    value: string;
    level: string;
    color: string;
    warning?: string;
  };

  /** Contamination kartica (DS-40 specifično) */
  contaminationCard?: {
    title: string;
    status: string;
    color: string;
    description: string;
  };

  /** Chemistry consumption status */
  consumptionStatus: {
    rate: ChemistryConsumptionRate;
    label: string;
    color: string;
    description: string;
  };

  /** Finish-cycle readiness */
  finishCycleReadiness: FinishCycleReadiness;
  finishCycleReadinessLabel: string;
  finishCycleReadinessColor: string;

  /** Debug sekcija */
  debug: {
    activeEngine: string;
    activeColorModel: string;
    activeSaturationModel: string;
    activeWarningModel: string;
    phValue?: number;
    colorIndicator?: string;
    temperatureC?: number;
    flowLMin?: number;
  };
}

// ─── Color themes per product ─────────────────────────────────────────────────

const COLOR_THEME_DS3: DashboardColorTheme = {
  primary:        "blue",
  primaryText:    "text-blue-400",
  primaryBg:      "bg-blue-950/20",
  primaryBorder:  "border-blue-700/40",
  secondary:      "green",
  secondaryText:  "text-green-400",
  secondaryBg:    "bg-green-950/20",
  secondaryBorder:"border-green-700/40",
  headerBg:       "from-blue-950/30 to-card",
  accentText:     "text-yellow-400",
  accentBg:       "bg-yellow-950/20",
  accentBorder:   "border-yellow-700/35",
  badgeBg:        "bg-blue-900/40",
  badgeText:      "text-blue-200",
  badgeBorder:    "border-blue-700/50",
};

const COLOR_THEME_FX: DashboardColorTheme = {
  primary:        "orange",
  primaryText:    "text-orange-400",
  primaryBg:      "bg-orange-950/20",
  primaryBorder:  "border-orange-700/40",
  secondary:      "yellow",
  secondaryText:  "text-yellow-400",
  secondaryBg:    "bg-yellow-950/20",
  secondaryBorder:"border-yellow-700/35",
  headerBg:       "from-orange-950/30 to-card",
  accentText:     "text-rose-400",
  accentBg:       "bg-rose-950/20",
  accentBorder:   "border-rose-700/35",
  badgeBg:        "bg-orange-900/40",
  badgeText:      "text-orange-200",
  badgeBorder:    "border-orange-700/50",
};

const COLOR_THEME_DS40: DashboardColorTheme = {
  primary:        "orange",
  primaryText:    "text-orange-400",
  primaryBg:      "bg-orange-950/20",
  primaryBorder:  "border-orange-700/40",
  secondary:      "red",
  secondaryText:  "text-red-400",
  secondaryBg:    "bg-red-950/20",
  secondaryBorder:"border-red-700/40",
  headerBg:       "from-orange-950/30 to-card",
  accentText:     "text-rose-400",
  accentBg:       "bg-rose-950/20",
  accentBorder:   "border-rose-700/35",
  badgeBg:        "bg-orange-900/40",
  badgeText:      "text-orange-200",
  badgeBorder:    "border-orange-700/50",
};

const COLOR_THEME_RECTOR: DashboardColorTheme = {
  primary:        "yellow",
  primaryText:    "text-yellow-400",
  primaryBg:      "bg-yellow-950/20",
  primaryBorder:  "border-yellow-700/40",
  secondary:      "red",
  secondaryText:  "text-red-400",
  secondaryBg:    "bg-red-950/20",
  secondaryBorder:"border-red-700/40",
  headerBg:       "from-yellow-950/30 to-card",
  accentText:     "text-rose-400",
  accentBg:       "bg-rose-950/20",
  accentBorder:   "border-rose-700/35",
  badgeBg:        "bg-yellow-900/40",
  badgeText:      "text-yellow-200",
  badgeBorder:    "border-yellow-700/50",
};

const COLOR_THEME_GENERIC: DashboardColorTheme = {
  primary:        "sky",
  primaryText:    "text-sky-400",
  primaryBg:      "bg-sky-950/20",
  primaryBorder:  "border-sky-700/40",
  secondary:      "slate",
  secondaryText:  "text-slate-400",
  secondaryBg:    "bg-slate-900/20",
  secondaryBorder:"border-slate-700/40",
  headerBg:       "from-sky-950/20 to-card",
  accentText:     "text-amber-400",
  accentBg:       "bg-amber-950/20",
  accentBorder:   "border-amber-700/35",
  badgeBg:        "bg-sky-900/40",
  badgeText:      "text-sky-200",
  badgeBorder:    "border-sky-700/50",
};

// ─── Helper: map LiveReactionState na LiveReactionStatus ─────────────────────

function toReactionStatus(state: LiveReactionState): LiveReactionStatus {
  if (state.chemistryStatus === "iscrpljeno")         return "exhausted";
  if (state.chemistryStatus === "neutralizirano")     return "stable_finished";
  if (state.reactionStrength === "jaka" && state.chemistryStatus === "maksimalno_aktivno") return "very_strong";
  if (state.reactionStrength === "jaka" || state.reactionStrength === "normalna") return "active";
  if (state.reactionStrength === "slaba") return "weakening";
  if (state.reactionStrength === "nema")  return "exhausted";
  return "active";
}

function reactionStatusColor(status: LiveReactionStatus): string {
  switch (status) {
    case "very_strong":     return "text-green-400";
    case "active":          return "text-sky-400";
    case "weakening":       return "text-amber-400";
    case "exhausted":       return "text-rose-400";
    case "stable_finished": return "text-blue-400";
  }
}

function reactionStrengthPercent(state: LiveReactionState): number {
  switch (state.reactionStrength) {
    case "jaka":     return 100;
    case "normalna": return 65;
    case "slaba":    return 30;
    case "nema":     return 0;
    default:         return 50;
  }
}

function consumptionRateColor(rate: ChemistryConsumptionRate): string {
  switch (rate) {
    case "slow":    return "text-sky-400";
    case "normal":  return "text-green-400";
    case "rapid":   return "text-rose-400";
    default:        return "text-muted-foreground";
  }
}

function consumptionRateDesc(rate: ChemistryConsumptionRate, engineId: ProductEngineId): string {
  switch (rate) {
    case "slow":   return "Kemija troši se sporo — dobra učinkovitost.";
    case "normal": return "Normalna brzina potrošnje.";
    case "rapid":  return engineId === "rector_descaler"
      ? "Brza iscrpljenost — velika količina kamenca."
      : "Kemija se brzo zasićuje — razmotriti dodavanje.";
    default: return "Nema podataka o potrošnji.";
  }
}

function finishReadiness(state: LiveReactionState): FinishCycleReadiness {
  if (state.finishCycleState.ready) return "ready";
  const metCount = state.finishCycleState.criteria.filter((c) => c.met === true).length;
  const total    = state.finishCycleState.criteria.length;
  if (total > 0 && metCount / total >= 0.5) return "close";
  return "not_ready";
}

function finishReadinessColor(r: FinishCycleReadiness): string {
  switch (r) {
    case "ready":     return "text-blue-400";
    case "close":     return "text-amber-400";
    case "not_ready": return "text-muted-foreground";
  }
}

// ─── getDashboardConfig() ─────────────────────────────────────────────────────

export function getDashboardConfig(
  engine: ProductEngine,
  state: LiveReactionState,
  trend?: ReactionTrend,
): DynamicDashboardConfig {
  const engineId  = engine.id;
  const theme =
    engineId === "ds3"              ? COLOR_THEME_DS3    :
    engineId === "scalebreaker_fx"  ? COLOR_THEME_FX     :
    engineId === "ds40"             ? COLOR_THEME_DS40   :
    engineId === "rector_descaler"  ? COLOR_THEME_RECTOR :
    COLOR_THEME_GENERIC;

  const reactionStatus    = toReactionStatus(state);
  const consumptionRate   = trend?.chemistryConsumptionRate ?? "unknown";
  const finishReadinessVal = finishReadiness(state);

  // ── Indicators — product-specific prioritet ───────────────────────────────

  const baseIndicators: DashboardIndicator[] = [];

  if (state.debug.phValue !== undefined) {
    baseIndicators.push({
      id: "ph",
      label: "pH",
      value: state.debug.phValue.toFixed(2),
      priority: engineId === "ds3" || engineId === "rector_descaler" ? 1 : 3,
      color: state.debug.phValue < 2 ? "text-yellow-400"
           : state.debug.phValue < 3 ? "text-amber-400"
           : "text-rose-400",
      icon: "ph",
      isPrimary: engineId === "ds3" || engineId === "rector_descaler",
    });
  }

  if (state.debug.colorIndicator) {
    baseIndicators.push({
      id: "color",
      label: "Boja otopine",
      value: state.debug.colorIndicator,
      priority: engineId === "scalebreaker_fx" ? 1 : engineId === "rector_descaler" ? 2 : 4,
      color: theme.primaryText,
      icon: "color",
      isPrimary: engineId === "scalebreaker_fx" || engineId === "rector_descaler",
    });
  }

  if (state.debug.foamLevel !== undefined) {
    baseIndicators.push({
      id: "foam",
      label: "Pjena",
      value: state.debug.foamLevel,
      priority: engineId === "ds3" ? 2 : engineId === "ds40" ? 3 : 5,
      color: state.debug.foamLevel === "nema" ? "text-rose-400/70"
           : state.debug.foamLevel === "slaba" ? "text-amber-400"
           : "text-green-400",
      icon: "foam",
      isPrimary: engineId === "ds3" || engineId === "ds40",
    });
  }

  if (state.debug.bubblesPresent !== undefined) {
    baseIndicators.push({
      id: "bubbling",
      label: "CO₂ bubbling",
      value: state.debug.bubblesPresent ? "Da" : "Ne",
      priority: engineId === "scalebreaker_fx" ? 2 : engineId === "rector_descaler" ? 3 : 6,
      color: state.debug.bubblesPresent ? "text-green-400" : "text-rose-400/70",
      icon: "bubbling",
      isPrimary: engineId === "scalebreaker_fx" || engineId === "rector_descaler",
    });
  }

  if (state.debug.temperatureC !== undefined) {
    baseIndicators.push({
      id: "temp",
      label: "Temperatura",
      value: `${state.debug.temperatureC} °C`,
      priority: 4,
      color: state.thermalLevel?.level === "warning" ? "text-red-400"
           : state.thermalLevel?.level === "caution"  ? "text-amber-400"
           : "text-sky-400",
      icon: "temp",
      isPrimary: false,
    });
  }

  if (state.debug.flowLMin !== undefined) {
    baseIndicators.push({
      id: "flow",
      label: "Protok",
      value: `${state.debug.flowLMin.toFixed(1)} L/min`,
      priority: 5,
      color: state.debug.flowLMin < 0.5 ? "text-amber-400" : "text-green-400",
      icon: "flow",
      isPrimary: false,
    });
  }

  if (state.debug.magnetFilterActive !== undefined && engineId === "ds40") {
    baseIndicators.push({
      id: "magnet",
      label: "Magnetski filter",
      value: state.debug.magnetFilterActive ? "Aktivan" : "Inaktivan",
      priority: 1,
      color: state.debug.magnetFilterActive ? "text-rose-400" : "text-green-400",
      icon: "magnet",
      isPrimary: true,
    });
  }

  // Sortiraj po prioritetu
  const indicators = baseIndicators.sort((a, b) => a.priority - b.priority);

  // ── Status kartice — product-specific ────────────────────────────────────

  const statusCards: DashboardStatusCard[] = [];

  // DS-3: Foam Reaction Status
  if (engineId === "ds3") {
    statusCards.push({
      id: "foam_status",
      title: "Foam Reaction Status",
      value: state.debug.foamLevel ?? "—",
      description: state.reactionDescription,
      level: state.reactionStrength === "jaka" ? "ok"
           : state.reactionStrength === "normalna" ? "info"
           : state.reactionStrength === "nema" ? "critical"
           : "warn",
      dotColor: state.reactionStrength === "jaka" ? "bg-green-500"
              : state.reactionStrength === "nema" ? "bg-rose-500"
              : "bg-amber-500",
      isPrimary: true,
    });
    statusCards.push({
      id: "ph_status",
      title: "pH Status",
      value: state.debug.phValue !== undefined ? state.debug.phValue.toFixed(2) : "—",
      description: state.saturationDescription,
      level: (state.debug.phValue ?? 99) < 2.0 ? "ok"
           : (state.debug.phValue ?? 99) < 3.5 ? "warn"
           : "critical",
      dotColor: (state.debug.phValue ?? 99) < 2.0 ? "bg-green-500"
              : (state.debug.phValue ?? 99) < 3.5 ? "bg-amber-500"
              : "bg-rose-500",
      isPrimary: true,
    });
  }

  // FX: Critical pH Zone + Color Status
  if (engineId === "scalebreaker_fx") {
    statusCards.push({
      id: "critical_ph_zone",
      title: "Critical pH Zone",
      value: state.debug.phValue !== undefined ? state.debug.phValue.toFixed(2) : "—",
      description: (state.debug.phValue ?? 0) >= 3.0
        ? "Kritična zona — učinkovitost <20%"
        : "pH u aktivnoj zoni",
      level: (state.debug.phValue ?? 0) >= 3.0 ? "critical"
           : (state.debug.phValue ?? 0) >= 2.5 ? "warn"
           : "ok",
      dotColor: (state.debug.phValue ?? 0) >= 3.0 ? "bg-rose-500"
              : (state.debug.phValue ?? 0) >= 2.5 ? "bg-amber-500"
              : "bg-orange-400",
      isPrimary: true,
    });
    statusCards.push({
      id: "color_status",
      title: "Color Status",
      value: state.debug.colorIndicator ?? "—",
      description: state.chemistryDescription,
      level: state.chemistryStatus === "iscrpljeno" ? "critical"
           : state.chemistryStatus === "slabi"      ? "warn"
           : "ok",
      dotColor: state.chemistryStatus === "iscrpljeno" ? "bg-rose-500"
              : state.chemistryStatus === "slabi" ? "bg-amber-500"
              : "bg-yellow-400",
      isPrimary: true,
    });
  }

  // DS-40: Magnetite Status + Sludge Status
  if (engineId === "ds40") {
    statusCards.push({
      id: "magnetite_status",
      title: "Magnetite Status",
      value: state.debug.magnetFilterActive === true ? "Aktivan" :
             state.debug.magnetFilterActive === false ? "Inaktivan" : "—",
      description: state.debug.magnetFilterActive === true
        ? engine.sludgeLogic?.magnetFilterActiveMeaning ?? "Skuplja crni talog."
        : engine.sludgeLogic?.magnetFilterInactiveMeaning ?? "Filter ne skuplja više.",
      level: state.debug.magnetFilterActive === true ? "warn"
           : state.debug.magnetFilterActive === false ? "info"
           : "neutral",
      dotColor: state.debug.magnetFilterActive === true ? "bg-rose-500" : "bg-sky-400",
      isPrimary: true,
    });
    statusCards.push({
      id: "sludge_status",
      title: "Sludge Status",
      value: state.contaminationState === "visoka"  ? "Visoka razina" :
             state.contaminationState === "srednja" ? "Srednja razina" :
             state.contaminationState === "niska"   ? "Niska razina" : "—",
      description: state.contaminationState === "visoka"
        ? "Crni magnetit ili sludge detektiran u sustavu."
        : "Kontaminacija u normalnim granicama.",
      level: state.contaminationState === "visoka" ? "critical"
           : state.contaminationState === "srednja" ? "warn"
           : "ok",
      dotColor: state.contaminationState === "visoka" ? "bg-red-500"
              : state.contaminationState === "srednja" ? "bg-orange-500"
              : "bg-green-500",
      isPrimary: true,
    });
  }

  // Rector: Inhibitor Protection Status + Yellow→Red Chemistry State
  if (engineId === "rector_descaler") {
    const phVal = state.debug.phValue ?? 0;
    statusCards.push({
      id: "inhibitor_status",
      title: "Inhibitor Protection Status",
      value: state.thermalLevel?.level === "warning" ? "Ugrozena" :
             state.thermalLevel?.level === "caution"  ? "Pratiti" : "OK",
      description: state.thermalLevel?.level === "warning"
        ? `${state.debug.temperatureC}°C — moguca degradacija inhibitora korozije.`
        : "Temperatura u prihvatljivom rasponu.",
      level: state.thermalLevel?.level === "warning" ? "critical"
           : state.thermalLevel?.level === "caution"  ? "warn"
           : "ok",
      dotColor: state.thermalLevel?.level === "warning" ? "bg-red-500"
              : state.thermalLevel?.level === "caution"  ? "bg-amber-500"
              : "bg-green-500",
      isPrimary: true,
    });
    statusCards.push({
      id: "chemistry_state",
      title: "Chemistry State (Yellow→Red)",
      value: phVal < 1.5 ? "Zuta — max aktivno" :
             phVal < 4.0 ? "Narancasta — slabi" : "Crvena — iscrpljeno",
      description: state.chemistryDescription,
      level: phVal < 1.5 ? "ok" : phVal < 4.0 ? "warn" : "critical",
      dotColor: phVal < 1.5 ? "bg-yellow-400" : phVal < 4.0 ? "bg-orange-400" : "bg-rose-500",
      isPrimary: true,
    });
  }

  // ── Chemistry card ────────────────────────────────────────────────────────

  const chemistryCard: DynamicDashboardConfig["chemistryCard"] = {
    title: engineId === "ds3"             ? "pH & Foam Status"
         : engineId === "scalebreaker_fx" ? "FX Chemistry Strength"
         : engineId === "ds40"            ? "DS-40 Reaction Status"
         : engineId === "rector_descaler" ? "Rector Descaler Status"
         : "Chemistry Status",
    status: state.chemistryStatusLabel,
    statusColor:
      state.chemistryStatus === "maksimalno_aktivno" ? theme.accentText :
      state.chemistryStatus === "aktivno"            ? theme.secondaryText :
      state.chemistryStatus === "slabi"              ? "text-amber-400" :
      state.chemistryStatus === "iscrpljeno"         ? "text-rose-400" :
      "text-muted-foreground",
    description: state.chemistryDescription,
  };

  // ── Reaction card ─────────────────────────────────────────────────────────

  const reactionCard: DynamicDashboardConfig["reactionCard"] = {
    title: engineId === "ds3"             ? "Foam Reaction"
         : engineId === "scalebreaker_fx" ? "CO₂ Bubbling"
         : engineId === "ds40"            ? "Sludge Reaction"
         : engineId === "rector_descaler" ? "Bubbling Status"
         : "Live Reaction",
    status: reactionStatus,
    statusLabel: LIVE_REACTION_STATUS_LABEL[reactionStatus],
    description: state.reactionDescription,
    strengthPercent: reactionStrengthPercent(state),
    color: reactionStatusColor(reactionStatus),
  };

  // ── Saturation card ───────────────────────────────────────────────────────

  const saturationCard: DynamicDashboardConfig["saturationCard"] = {
    title: engineId === "ds3"             ? "pH Saturation"
         : engineId === "scalebreaker_fx" ? "FX Saturation Zone"
         : engineId === "ds40"            ? "DS-40 Saturation"
         : engineId === "rector_descaler" ? "Saturation Trend"
         : "Saturation",
    value: state.saturationStateLabel,
    color: state.saturationState === "svjeza"   ? theme.secondaryText :
           state.saturationState === "aktivna"  ? theme.primaryText :
           state.saturationState === "kritična" ? "text-amber-400" :
           state.saturationState === "iscrpljena"? "text-rose-400" :
           "text-muted-foreground",
    description: state.saturationDescription,
  };

  // ── Thermal card ──────────────────────────────────────────────────────────

  const thermalCard: DynamicDashboardConfig["thermalCard"] = {
    title: engineId === "rector_descaler" ? "Thermal / Inhibitor"
         : "Thermal Status",
    value: state.debug.temperatureC !== undefined ? `${state.debug.temperatureC} °C` : "—",
    level: state.thermalLevel?.rangeLabel ?? "—",
    color: state.thermalLevel?.level === "warning" ? "text-red-400"
         : state.thermalLevel?.level === "caution"  ? "text-amber-400"
         : state.thermalLevel?.level === "optimal"  ? "text-green-400"
         : state.thermalLevel?.level === "slow"     ? "text-blue-400"
         : "text-sky-400",
    warning: state.thermalWarning,
  };

  // ── Contamination card (DS-40) ────────────────────────────────────────────

  const contaminationCard: DynamicDashboardConfig["contaminationCard"] = engineId === "ds40" ? {
    title: "Contamination Status",
    status: state.contaminationState === "visoka"  ? "Visoka razina magnetita"
          : state.contaminationState === "srednja" ? "Srednja razina"
          : state.contaminationState === "niska"   ? "Filter cist"
          : "Nepoznato",
    color: state.contaminationState === "visoka"  ? "text-rose-400"
         : state.contaminationState === "srednja" ? "text-orange-400"
         : "text-green-400",
    description: state.contaminationState === "visoka"
      ? "Magnetski filter skuplja crni talog — nastaviti ciscenje."
      : "Razina kontaminacije je prihvatljiva.",
  } : undefined;

  // ── Consumption status ────────────────────────────────────────────────────

  const consumptionStatus: DynamicDashboardConfig["consumptionStatus"] = {
    rate: consumptionRate,
    label: consumptionRate === "slow"   ? "Spora potrosnja"
         : consumptionRate === "normal" ? "Normalna potrosnja"
         : consumptionRate === "rapid"  ? "Brza iscrpljenost"
         : "Nepoznato",
    color: consumptionRateColor(consumptionRate),
    description: consumptionRateDesc(consumptionRate, engineId),
  };

  // ── Debug ─────────────────────────────────────────────────────────────────

  const debug: DynamicDashboardConfig["debug"] = {
    activeEngine:          `${engine.name} (${engine.id})`,
    activeColorModel:      engine.indicatorModel,
    activeSaturationModel: engine.saturationModel,
    activeWarningModel:    engine.warningModel,
    phValue:               state.debug.phValue,
    colorIndicator:        state.debug.colorIndicator,
    temperatureC:          state.debug.temperatureC,
    flowLMin:              state.debug.flowLMin,
  };

  return {
    engineId,
    engineName: engine.name,
    productName: engine.productName,
    dashboardTitle: "Live Chemistry Dashboard",
    colorTheme: theme,
    indicators,
    statusCards,
    chemistryCard,
    reactionCard,
    saturationCard,
    thermalCard,
    contaminationCard,
    consumptionStatus,
    finishCycleReadiness: finishReadinessVal,
    finishCycleReadinessLabel: FINISH_CYCLE_READINESS_LABEL[finishReadinessVal],
    finishCycleReadinessColor: finishReadinessColor(finishReadinessVal),
    debug,
  };
}
