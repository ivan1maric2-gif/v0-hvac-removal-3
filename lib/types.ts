// ─── Core data model ────────────────────────────────────────────────────────

export type StatusSesije =
  | "u_radu"           // Posao u tijeku, nema aktivne reakcije
  | "aktivna_reakcija" // Aktivni ciklus s mjerenjima u tijeku
  | "ciklus_zavrsen"   // Svi ciklusi završeni, čeka se ispiranje/neutralizacija
  | "zavrseno"         // Sve faze završene — zelena
  | "uz_upozorenje"    // Ciklusi završeni ali nedostaje ispiranje ili neutralizacija — žuto
  | "nedovrseno";      // Napuštena sesija bez završetka — crvena

/**
 * Auto-izračun statusa sesije iz stanja ciklusa i completion phases.
 * Serviser nikada ne bira status ručno — ova funkcija je jedini izvor istine.
 *
 * Pravila (prema specifikaciji):
 *  "u_radu"           — sesija otvorena, nema aktivnog ciklusa s mjerenjima
 *  "aktivna_reakcija" — postoji aktivan ciklus s barem 1 mjerenjem
 *  "ciklus_zavrsen"   — svi ciklusi završeni, ali nedostaje ispiranje ili neutralizacija
 *  "zavrseno"         — svi ciklusi završeni + ispiranje + neutralizacija + serviser potvrdio
 *  "uz_upozorenje"    — serviser zatvorio, ciklusi završeni ali nedostaje korak procedure
 *  "nedovrseno"       — sesija napuštena: aktivni ciklus bez kraja ili bez ijednog mjerenja
 */
export function izracunajStatusSesije(s: {
  ciklusi?: Array<{ status: string; mjerenja: unknown[] }>;
  podsesije?: Array<{
    status: string;
    ciklusi?: Array<{ status: string; mjerenja: unknown[] }>;
    completionPhases?: { ispiranje?: unknown; neutralizacija?: unknown } | null;
  }>;
  completionPhases?: { ispiranje?: unknown; neutralizacija?: unknown } | null;
  workMode?: string;
}): StatusSesije {
  const sviCiklusi =
    s.workMode === "with_subsessions"
      ? (s.podsesije ?? []).flatMap((p) => p.ciklusi ?? [])
      : s.ciklusi ?? [];

  const imaBiloKojiCiklus = sviCiklusi.length > 0;
  const aktivniCiklusi    = sviCiklusi.filter((c) => c.status === "aktivan" || c.status === "ceka_pocetno_mjerenje" || c.status === "ceka_redovno_mjerenje" || c.status === "ceka_nadopunu" || c.status === "preporucen_novi_ciklus");
  const imaMjerenja       = (c: { mjerenja: unknown[] }) => c.mjerenja.length > 0;
  const aktivniSMjerenjima = aktivniCiklusi.filter(imaMjerenja);
  const zavrsenihCiklusa  = sviCiklusi.filter((c) => c.status === "zavrsen" || c.status === "prekinut").length;
  const sviZavrseni       = imaBiloKojiCiklus && zavrsenihCiklusa === sviCiklusi.length;

  // Pronađi completion phases (Mode A: na sesiji, Mode B: na podsesijama)
  let imaisiranje = false;
  let imaNeutralizaciju = false;
  if (s.workMode === "with_subsessions") {
    const zavrsenePodsesije = (s.podsesije ?? []).filter((p) => p.status === "zavrseno");
    // Uzimamo zadnju završenu podsesiju s completionPhases
    const zadnjaFaza = [...zavrsenePodsesije].reverse().find((p) => p.completionPhases);
    imaisiranje      = Boolean((zadnjaFaza?.completionPhases?.ispiranje as { systemRinsedWithCleanWater?: boolean } | undefined)?.systemRinsedWithCleanWater);
    imaNeutralizaciju = Boolean((zadnjaFaza?.completionPhases?.neutralizacija as { neutralizerProductName?: string } | undefined)?.neutralizerProductName);
  } else {
    imaisiranje      = Boolean((s.completionPhases?.ispiranje as { systemRinsedWithCleanWater?: boolean } | undefined)?.systemRinsedWithCleanWater);
    imaNeutralizaciju = Boolean((s.completionPhases?.neutralizacija as { neutralizerProductName?: string } | undefined)?.neutralizerProductName);
  }

  // --- Redoslijed provjere (od najspecifičnijeg prema najopćenitijem) ---
  if (!imaBiloKojiCiklus) return "u_radu";
  if (aktivniSMjerenjima.length > 0) return "aktivna_reakcija";
  if (aktivniCiklusi.length > 0) return "u_radu"; // aktivan ali bez mjerenja
  if (sviZavrseni && imaisiranje && imaNeutralizaciju) return "zavrseno";
  if (sviZavrseni) return "ciklus_zavrsen";
  return "u_radu";
}

/**
 * Vraća specifičan label za status "uz_upozorenje" — objašnjava što točno nedostaje.
 * Koristiti umjesto generičkog "Završeno uz upozorenje".
 */
export function getUzUpozorenjeLabel(s: {
  workMode?: string;
  completionPhases?: { ispiranje?: unknown; neutralizacija?: unknown } | null;
  podsesije?: Array<{
    completionPhases?: { ispiranje?: unknown; neutralizacija?: unknown } | null;
  }>;
}): string {
  let imaIspiranje = false;
  let imaNeutralizaciju = false;

  if (s.workMode === "with_subsessions") {
    imaIspiranje      = (s.podsesije ?? []).some((p) => Boolean((p.completionPhases?.ispiranje as { systemRinsedWithCleanWater?: boolean } | undefined)?.systemRinsedWithCleanWater));
    imaNeutralizaciju = (s.podsesije ?? []).some((p) => Boolean((p.completionPhases?.neutralizacija as { neutralizerProductName?: string } | undefined)?.neutralizerProductName));
  } else {
    imaIspiranje      = Boolean((s.completionPhases?.ispiranje as { systemRinsedWithCleanWater?: boolean } | undefined)?.systemRinsedWithCleanWater);
    imaNeutralizaciju = Boolean((s.completionPhases?.neutralizacija as { neutralizerProductName?: string } | undefined)?.neutralizerProductName);
  }

  if (!imaIspiranje && !imaNeutralizaciju) return "Završeno — ispiranje i neutralizacija nisu potvrđeni";
  if (!imaIspiranje)       return "Završeno — ispiranje nije evidentirano";
  if (!imaNeutralizaciju)  return "Završeno — neutralizacija nije potvrđena";
  return "Završeno uz upozorenje";
}

export type StatusPodsesije =
  | "nije_zapoceto"
  | "u_radu"
  | "ceka_mjerenje"
  | "ceka_nadopunu"
  | "ceka_novi_ciklus"
  | "zavrseno"
  | "prekinuto";

export type StatusCiklusa =
  | "priprema"
  | "aktivan"
  | "ceka_pocetno_mjerenje"
  | "ceka_redovno_mjerenje"
  | "ceka_nadopunu"
  | "preporucen_novi_ciklus"
  | "zavrsen"
  | "prekinut";

export type StatusReakcije = "dobra" | "slaba" | "nema_reakcije" | "nepoznato";

export type WorkMode = "no_subsessions" | "with_subsessions";

/** Cleaning mode. */
export type CleaningMode = "descaling" | "powerflushing";

export const CLEANING_MODE_LABELS: Record<CleaningMode, string> = {
  descaling:    "Uklanjanje kamenca",
  powerflushing: "Powerflushing",
};

export const CLEANING_MODE_DESCRIPTIONS: Record<CleaningMode, string> = {
  descaling:    "Uklanjanje kamenca kemijskim sredstvima. Praćenje pH, brzine reakcije i koncentracije.",
  powerflushing: "Ispiranje sustava pod visokim tlakom. Uklanjanje magnetita, mulja i crnih naslaga.",
};

export type RazlogCiklusa =
  | "prvi_ciklus"
  | "otopina_iscrpljena"
  | "previse_taloga"
  | "ph_prebrzo_raste"
  | "nedovoljan_rezultat_nadopune"
  | "nadopuna_vise_nije_ucinkovita"
  | "protok_nije_poboljsan"
  | "potrebno_jace_punjenje"
  | "servisna_odluka"
  | "novi_dio_postupka"
  | "nedovoljan_rezultat"  // legacy alias
  | "drugo";

export const RAZLOZI_CIKLUSA: Record<RazlogCiklusa, string> = {
  prvi_ciklus: "Prvi ciklus",
  otopina_iscrpljena: "Prethodna otopina iscrpljena",
  previse_taloga: "Previše taloga u otopini",
  ph_prebrzo_raste: "pH se brzo ponovno podigao nakon nadopune",
  nadopuna_vise_nije_ucinkovita: "Nadopuna više nije učinkovita",
  protok_nije_poboljsan: "Protok se nije dovoljno poboljšao",
  potrebno_jace_punjenje: "Potrebno jače ili novo punjenje",
  servisna_odluka: "Servisna odluka",
  novi_dio_postupka: "Novi dio postupka",
  nedovoljan_rezultat: "Nedovoljan rezultat nakon nadopune",
  nedovoljan_rezultat_nadopune: "Nedovoljan rezultat nakon nadopune",
  drugo: "Drugo",
};

export type JedinicaKemikalije = "L" | "kg" | "ml" | "g";

export type VrstaDijela =
  | "Spremnik TPV"
  | "Spirala TPV"
  | "Pločasti izmjenjivač"
  | "Cijevni izmjenjivač"
  | "Kotlovski krug"
  | "Toplinska pumpa"
  | "Cjevovod"
  | "Drugo";

export type Materijal =
  | "Inox"
  | "Bakar"
  | "Mesing"
  | "Čelik"
  | "Plastika"
  | "Guma/brtve"
  | "Kombinirano"
  | "Nepoznato";

export type VrstaNaslage =
  | "Kamenac"
  | "Tvrdi kamenac"
  | "Miješane naslage"
  | "Nepoznato";

export type JacinaProblema = "Blago" | "Srednje" | "Jako" | "Kritično";

export type JedinicaProtoka = "l_min" | "sec_10l";

export type MeasurementType =
  | "initial_cycle_measurement"
  | "regular"
  | "after_top_up"
  | "final_cycle"
  | "final_subsession"
  | "final_session";

export type FoamLevel = "nema" | "slaba" | "srednja" | "jaka" | "vrlo_jaka";
export type ColorIndicator =
  | "plava"
  | "plavo_zelena"
  | "zelena"
  | "zuta"
  | "smeda"
  | "bez_boje"
  | "nije_primjenjivo";
export type VisibleReaction = "nema" | "slaba" | "normalna" | "jaka" | "vrlo_jaka";
export type Turbidity = "nema" | "slaba" | "srednja" | "jaka";
export type Sediment = "nema" | "malo" | "srednje" | "puno";
export type Smell = "nema" | "slab" | "jak";

export interface Mjerenje {
  id: string;
  sessionId?: string;
  subsessionId?: string;
  cycleId?: string;
  measurementNumber?: number;
  measurementType: MeasurementType;
  measuredAt: string;           // ISO — primary timestamp
  /** @deprecated use measuredAt */ timestamp?: string;
  minutesFromCycleStart?: number;
  minutesFromPreviousMeasurement?: number;
  // pH
  ph: number;
  /** @deprecated use ph */ pH?: number;
  previousPh?: number;
  phChange?: number;
  phRatePerMinute?: number;
  // Temperature (single point — legacy)
  temperatureC?: number;
  /** @deprecated use temperatureC */ temperatura?: number;
  // Temperature (inlet/outlet — optional)
  tempInC?: number;
  tempOutC?: number;
  /** deltaTC = tempOutC - tempInC (auto-calculated when both provided) */
  deltaTC?: number;
  // Reaction indicators
  foamLevel?: FoamLevel;
  colorIndicator?: ColorIndicator;
  /** Bubble indicator for "color+bubbles" products — true = bubbles present (active reaction) */
  bubblesPresent?: boolean;
  visibleReaction?: VisibleReaction;
  /** DS-40 magnetski filter: true = još skuplja crni talog, false = ne skuplja značajan talog */
  magnetFilterActive?: boolean;
  // Flow
  flowInputValue?: number;
  flowInputUnit?: JedinicaProtoka;
  flowLMin?: number;
  flowChangeFromInitial?: number;
  flowChangeFromPrevious?: number;
  // Water quality
  tds?: string;
  ec?: string;
  turbidity?: Turbidity;
  sediment?: Sediment;
  smell?: Smell;
  // Notes
  note?: string;
  /** @deprecated use note */ napomena?: string;
  // Interpretation saved at save time
  interpretation?: string;
  // Full recommendation saved at save time (from preporuka engine)
  preporuka?: import("./preporuka").Preporuka;
  // Product reference — snapshot of product config at time of measurement
  productId?: string;
  productSnapshot?: import("./product-types").ProductSnapshot;
  // Legacy
  /** @deprecated */ tlak?: number;
  // Input method tracking
  inputMethod?: "manual" | "voice" | "mixed";
  // Timestamps
  createdAt?: string;   // ISO — when the measurement record was created
  updatedAt?: string;   // ISO — last modification time
}

export type RazlogNadopune =
  | "ph_previsok"
  | "ph_brzo_raste"
  | "reakcija_traje"
  | "pjena_prisutna"
  | "boja_slabljenje"
  | "protok_nije_poboljsan"
  | "servisna_odluka"
  | "drugo";

export const RAZLOZI_NADOPUNE: Record<RazlogNadopune, string> = {
  ph_previsok: "pH previsok",
  ph_brzo_raste: "pH se brzo diže",
  reakcija_traje: "Reakcija još traje",
  pjena_prisutna: "Pjena je prisutna",
  boja_slabljenje: "Boja ukazuje na slabljenje sredstva",
  protok_nije_poboljsan: "Protok se nije dovoljno poboljšao",
  servisna_odluka: "Servisna odluka",
  drugo: "Drugo",
};

export interface NadopunaKemikalije {
  id: string;
  sessionId?: string;
  subsessionId?: string;
  cycleId?: string;
  topUpNumber: number;
  addedAt: string;                   // ISO — primary
  /** @deprecated use addedAt */ timestamp?: string;
  reason: RazlogNadopune;
  // State before top-up (from last measurement)
  previousMeasurementId?: string;
  previousPh?: number;
  previousFoamLevel?: FoamLevel;
  previousColorIndicator?: ColorIndicator;
  previousFlowLMin?: number;
  previousInterpretation?: string;
  // Product reference
  productId?: string;
  productSnapshot?: import("./product-types").ProductSnapshot;
  // Chemical
  chemicalProductName: string;
  /** @deprecated use chemicalProductName */ kemikalija?: string;
  amount: number;
  unit: JedinicaKemikalije;
  densityKgL?: number;
  addedChemicalVolumeL?: number;     // calculated
  /** @deprecated use amount */ kolicina?: number;
  // Volume calculations
  previousTotalSolutionVolumeL: number;
  newTotalSolutionVolumeL: number;
  previousChemicalVolumeL?: number;
  totalChemicalVolumeL?: number;
  newChemicalPercent?: number;
  // Follow-up
  requiresFollowUpMeasurement: true;
  followUpMeasurementId?: string;
  // Notes
  note?: string;
  /** @deprecated use note */ napomena?: string;
  // Timestamps
  createdAt?: string;  // ISO
  updatedAt?: string;  // ISO
  /** @deprecated use createdAt */ created_at?: string;
  /** @deprecated use updatedAt */ updated_at?: string;
}

export type DrainAppearance =
  | "bistra"
  | "blago_mutna"
  | "mutna"
  | "jako_mutna"
  | "puno_taloga"
  | "nije_evidentirano";

export const DRAIN_APPEARANCE_LABELS: Record<DrainAppearance, string> = {
  bistra: "Bistra",
  blago_mutna: "Blago mutna",
  mutna: "Mutna",
  jako_mutna: "Jako mutna",
  puno_taloga: "Puno taloga",
  nije_evidentirano: "Nije evidentirano",
};

export type DrainSediment = "nema" | "malo" | "srednje" | "puno";

export const DRAIN_SEDIMENT_LABELS: Record<DrainSediment, string> = {
  nema: "Nema",
  malo: "Malo",
  srednje: "Srednje",
  puno: "Puno",
};

export type RinseMethod =
  | "mrezna_voda"
  | "djelomicno_ispiranje"
  | "potpuno_ispiranje"
  | "nije_ispirano";

export const RINSE_METHOD_LABELS: Record<RinseMethod, string> = {
  mrezna_voda: "Mrežna voda",
  djelomicno_ispiranje: "Djelomično ispiranje",
  potpuno_ispiranje: "Potpuno ispiranje",
  nije_ispirano: "Nije ispirano",
};

// ─── Cycle decision ───────────────────────────────────────────────────────────

export type CycleDecisionType =
  | "nastavi_ciklus"
  | "nadopuni_sredstvo"
  | "zavrsi_i_isperi"
  | "zavrsi_i_novi_ciklus"
  | "zavrsi_posao"
  | "operator_override";

export interface CycleDecision {
  id: string;
  timestamp: string;
  decision: CycleDecisionType;
  decisionLabel: string;
  reason: string;
  basedOnMeasurementId?: string;
  operatorOverride: boolean;
}

// ─── Full Ciklus interface (per spec) ─────────────────────────────────────────

export interface Ciklus {
  id: string;
  sessionId: string;
  subsessionId?: string;
  cycleNumber: number;
  name?: string;
  startDateTime: string;        // ISO
  endDateTime?: string;         // ISO
  reason: RazlogCiklusa;

  // Drain / rinse checkboxes
  previousSolutionDrained: boolean;
  systemRinsed: boolean;
  cleanWaterAdded: boolean;

  // Drain closing data (filled when starting next cycle)
  drainConfirmedAt?: string;         // ISO — when operator confirmed drain
  drainVolumeL?: number;             // optional: how many litres drained
  drainAppearance?: DrainAppearance; // visual appearance of drained solution
  drainSediment?: DrainSediment;     // sediment after draining
  drainNote?: string;

  // Rinse data
  rinsed?: boolean;
  rinseMethod?: RinseMethod;
  rinsePhAfter?: number;
  rinseTdsAfter?: string;
  rinseNote?: string;

  // Previous cycle closing status (set when a new cycle replaces this one)
  closedAsStatus?: "zavrsen" | "prekinut";

  // Water data
  waterVolumeL: number;
  waterTempC?: number;
  waterPh?: number;
  waterTds?: string;
  waterNote?: string;

  // Product reference (from product database)
  productId?: string;
  productSnapshot?: import("./product-types").ProductSnapshot;

  // Chemical data
  chemicalProductName: string;
  chemicalAmount: number;
  chemicalUnit: JedinicaKemikalije;
  chemicalDensityKgL?: number;    // optional, for kg/g units
  chemicalVolumeL?: number;       // calculated
  chemicalConcentration?: string;
  chemicalAddedAt?: string;       // ISO
  chemicalNote?: string;

  // Calculated fields
  totalSolutionVolumeL?: number;
  chemicalPercent?: number;
  waterChemicalRatio?: string;

  status: StatusCiklusa;
  /** Set to true once the first (initial) measurement has been saved. */
  hasInitialMeasurement?: boolean;

  // ─── Nulto mjerenje (NAKON dodavanja kemije) ────────────────────────────────
  // Ovo je "točka 0" za praćenje reakcije. Sva live mjerenja se uspoređuju s ovim.
  /** pH measured immediately after adding chemicals (zero measurement) */
  zeroMeasurementPh?: number;
  /** Flow rate measured immediately after adding chemicals (zero measurement) */
  zeroMeasurementFlowLMin?: number;
  /** Timestamp when zero measurement was taken */
  zeroMeasurementAt?: string;

  mjerenja: Mjerenje[];
  nadopune: NadopunaKemikalije[];
  decisions?: CycleDecision[];
  cleaningEffectiveness?: import("./preporuka").CleaningEffectiveness;
  recommendation?: string;

  /**
   * Flow rate measured BEFORE chemicals were added (referentno mjerenje).
   * Used by flow analytics to calculate improvement % throughout the cycle.
   */
  baselineFlowLMin?: number;

  /** Concentration % selected by the technician (preset or free input) */
  selectedConcentrationPercent?: number;
  /** Amount calculated from water + concentration (before any manual override) */
  calculatedChemicalAmount?: number;
  /** Whether the technician manually adjusted the calculated amount */
  wasAmountManuallyAdjusted?: boolean;

  // Stanje sustava prije čišćenja (entered at cycle start)
  /** Initial flow rate of the system before any cleaning — in L/min */
  initialFlowLMin?: number;
  /** pH of the system water before cleaning */
  initialPhSustava?: number;
  /** Water/system temperature before cleaning (°C) */
  initialTempCSustava?: number;
  /** Visual appearance of system water before cleaning */
  vizualnoStanjeVode?: "bistra" | "mutna" | "talog" | "komadi_kamenca" | "nije_provjereno";
  /** Free-text note about system state before cleaning */
  napomenaStanjePrije?: string;

  // Top-up tracking
  totalTopUps?: number;
  currentTotalSolutionVolumeL?: number;
  totalChemicalAddedL?: number;
  totalChemicalAddedKg?: number;
  currentChemicalPercent?: number;
  waitingForTopUpMeasurement?: boolean;

  // Legacy compat aliases — kept so old demo data still compiles
  /** @deprecated use cycleNumber */ broj?: number;
  /** @deprecated use waterVolumeL */ volumen_vode?: number;
  /** @deprecated use chemicalProductName */ kemikalija?: string;
  /** @deprecated use chemicalVolumeL */ kolicina_kemikalije?: number;
  /** @deprecated */ timestamp_pocetka?: string;
  /** @deprecated */ timestamp_zavrsetka?: string;

  /** Mandatory completion phases: rinsing, neutralization, final pH check. */
  completionPhases?: CompletionPhases;

  // ─── Auto-popunjene završne vrijednosti iz zadnjeg LIVE mjerenja ─────────────
  /** Automatski: pH iz zadnjeg mjerenja ciklusa */
  finalPh?: number;
  /** Automatski: protok iz zadnjeg mjerenja ciklusa (L/min) */
  finalFlowLMin?: number;
  /** Automatski: Temp OUT iz zadnjeg mjerenja ciklusa (°C) */
  finalTempOutC?: number;
  /** Automatski: Δ pH (zadnji − referentni) */
  deltaPh?: number;
  /** Automatski: Δ protok (zadnji − referentni, L/min) */
  deltaFlowLMin?: number;
  /** Automatski: Δ Temp OUT (zadnji − referentni, °C) */
  deltaTempOutC?: number;

  createdAt?: string;
  updatedAt?: string;
}

export interface Podsesija {
  id: string;
  naziv: string;
  redni_broj: number;
  // Dio sustava
  dio_sustava: string;
  opis_dijela?: string;
  lokacija_unutar_objekta?: string;
  vrsta_dijela?: VrstaDijela;
  // Materijal
  materijal: Materijal | string;
  materijal_upozorenje?: string;
  // Volumen i protok
  procijenjeni_volumen: number; // L
  pocetni_protok_vrijednost?: number;
  pocetni_protok_jedinica?: JedinicaProtoka;
  pocetni_protok_l_min?: number;
  napomena_protok?: string;
  // Opis problema
  vrsta_naslage?: VrstaNaslage;
  jacina_problema?: JacinaProblema;
  vizualna_napomena?: string;
  servisna_napomena?: string;
  // Status & reakcija
  status: StatusPodsesije;
  status_reakcije: StatusReakcije;
  kratka_preporuka?: string;
  // Završne faze (Mode B: completion phases su na podsesiji)
  completionPhases?: CompletionPhases;
  // Rad
  ciklusi: Ciklus[];
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  /** @deprecated use createdAt */ created_at?: string;
  /** @deprecated use updatedAt */ updated_at?: string;
}

// ─── System category ─────────────────────────────────────────────────────────

export type SystemCategory =
  | "dhw_potable"       // PTV / TPV — potrošna topla voda
  | "technical_water"   // Tehnička voda — grijanje / hlađenje / solar / toplinska pumpa
  | "unknown";          // Drugo / nepoznato

export const SYSTEM_CATEGORY_LABELS: Record<SystemCategory, string> = {
  dhw_potable:      "PTV / TPV — potrošna topla voda",
  technical_water:  "Tehnička voda — grijanje / hlađenje / solar / toplinska pumpa",
  unknown:          "Drugo / nepoznato",
};

export const SYSTEM_CATEGORY_SHORT_LABELS: Record<SystemCategory, string> = {
  dhw_potable:      "PTV / TPV",
  technical_water:  "Tehnička voda",
  unknown:          "Nepoznato",
};

/** Device/part options per system category */
export const DIJELOVI_SUSTAVA: Record<SystemCategory, string[]> = {
  dhw_potable: [
    "Spremnik TPV",
    "Spirala TPV",
    "Izmjenjivač za potrošnu vodu",
    "Protočni bojler",
    "Cjevovod potrošne vode",
    "Miješajući ventil / armatura",
    "Drugo",
  ],
  technical_water: [
    "Izmjenjivač tehničke vode",
    "Kotlovski krug",
    "Krug grijanja",
    "Krug hlađenja",
    "Solarni krug",
    "Krug toplinske pumpe",
    "Podno grijanje",
    "Radijatorski krug",
    "Cjevovod tehničke vode",
    "Drugo",
  ],
  unknown: [
    "Spremnik TPV",
    "Spirala TPV",
    "Izmjenjivač za potrošnu vodu",
    "Protočni bojler",
    "Cjevovod potrošne vode",
    "Miješajući ventil / armatura",
    "Izmjenjivač tehničke vode",
    "Kotlovski krug",
    "Krug grijanja",
    "Krug hlađenja",
    "Solarni krug",
    "Krug toplinske pumpe",
    "Podno grijanje",
    "Radijatorski krug",
    "Cjevovod tehničke vode",
    "Drugo",
  ],
};

export interface Sesija {
  id: string;
  naziv_objekta: string;
  adresa?: string;           // Adresa objekta (npr. Plitvička jezera 12)
  narucitelj?: string;       // Naručitelj radova (npr. Hotel Plitvice d.o.o.)
  lokacija: string;          // Mjesto / lokacija unutar objekta (npr. PTV kotlovnica, 3. kat)
  datum: string;
  serviser: string;
  kontakt_osoba?: string;
  opis_problema: string;
  status: StatusSesije;
  workMode: WorkMode;
  /** Cleaning mode — determines product filter and recommendation engine path. */
  cleaningMode: CleaningMode;
  /** System category — separates PTV/TPV from technical water systems. */
  systemCategory: SystemCategory;
  // Mode A — direct session workflow
  ciklusi?: Ciklus[];
  // Mode B — with subsessions
  podsesije: Podsesija[];
  // Soft delete
  isDeleted?: boolean;
  deletedAt?: string; // ISO timestamp
  // Demo flag — marks sessions created from demo-data.ts as non-real field data
  isDemo?: boolean;
  // Audit trail — reopen history
  previousStatus?: StatusSesije;       // status before last reopen
  reopenedAt?: string;                  // ISO — when session was reopened
  completedAt?: string;                 // ISO — when session was finished after reopen

  // ─── Auto-popunjene završne vrijednosti sesije (ref = prvo, završno = zadnje) ─
  /** Automatski: pH iz zadnjeg mjerenja zadnjeg ciklusa */
  sessionFinalPh?: number;
  /** Automatski: protok iz zadnjeg mjerenja zadnjeg ciklusa (L/min) */
  sessionFinalFlowLMin?: number;
  /** Automatski: Temp OUT iz zadnjeg mjerenja zadnjeg ciklusa (°C) */
  sessionFinalTempOutC?: number;
  /** Automatski: Δ pH (zadnji − referentni) */
  sessionDeltaPh?: number;
  /** Automatski: Δ protok (zadnji − referentni, L/min) */
  sessionDeltaFlowLMin?: number;
  /** Automatski: Δ Temp OUT (zadnji − referentni, °C) */
  sessionDeltaTempOutC?: number;

  // Timestamps
  createdAt?: string;  // ISO — when the session was first created
  updatedAt?: string;  // ISO — last modification time
}

// ─── Reaction stability ───────────────────────────────────────────────────────

/**
 * Result of the reaction stability analysis engine.
 * "stable" means chemical cleaning is probably finished — rinsing phase should start.
 * "unstable" means the reaction is still active.
 * "inconclusive" means not enough measurements to decide.
 */
export type ReactionStabilityStatus = "stable" | "unstable" | "inconclusive";

export interface ReactionStabilityResult {
  status: ReactionStabilityStatus;
  /** Croatian display label for the live dashboard. */
  statusLabel: string;
  /** Short explanation for the technician. */
  explanation: string;
  /** Next step instruction. */
  nextStep: string;
  /** pH values of the last 3 measurements used in the analysis. */
  lastPhValues: number[];
  /** Max pH delta across the window (indicates stability). */
  maxPhDelta: number;
  /** Average pH rate per minute across the window. */
  avgPhRate: number | null;
  /** True when foam was absent in all analysed measurements. */
  foamAbsent: boolean;
  /** True when flow has improved compared to cycle start. */
  flowImproved: boolean;
}

// ─── Rinsing phase ────────────────────────────────────────────────────────────

export type IzgledIzlazneVode =
  | "bistra"
  | "blago_mutna"
  | "mutna"
  | "jako_mutna"
  | "puno_taloga";

export const IZGLED_IZLAZNE_VODE_LABELS: Record<IzgledIzlazneVode, string> = {
  bistra: "Bistra",
  blago_mutna: "Blago mutna",
  mutna: "Mutna",
  jako_mutna: "Jako mutna",
  puno_taloga: "Puno taloga",
};

export type RinsePhStatus =
  | "prihvatljivo"           // diff <= 0.3 — neutralization not required
  | "provjeriti"             // diff 0.3–0.5 — recommend additional rinsing or check neutralization
  | "nastaviti_ispiranje";   // diff > 0.5 — continue rinsing / consider neutralization

export interface IspiranjeData {
  id: string;
  completedAt: string;        // ISO
  solutionDrained: boolean;
  drainDurationMinutes?: number;
  systemRinsedWithCleanWater: boolean;
  rinsePhValue?: number;      // legacy — kept for backwards compat
  /** pH of mains / inlet water (reference). */
  rinsePhInlet?: number;
  /** pH of outlet water after rinsing. */
  rinsePhOutlet?: number;
  /** Absolute difference: |outlet - inlet|. Computed on save. */
  rinsePhDiff?: number;
  /** Evaluation status based on rinse pH diff. */
  rinsePhStatus?: RinsePhStatus;
  /** True when rinse pH is acceptable and neutralization is not required. */
  neutralizationRequired?: boolean;
  /** Manual override reason when technician skips neutralization despite status. */
  neutralizationSkipReason?: string;
  rinseWaterAppearance?: IzgledIzlazneVode;
  rinseSediment?: DrainSediment;
  note?: string;
  createdAt?: string;  // ISO
  updatedAt?: string;  // ISO
}

// ─── Neutralization phase ─────────────────────────────────────────────────────

export interface NeutralizacijaData {
  id: string;
  completedAt: string;        // ISO
  neutralizerProductName: string;
  neutralizerAmount: number;
  neutralizerUnit: JedinicaKemikalije;
  addedAtTime?: string;       // ISO — when neutralizer was added
  circulationMinutes?: number;
  phAfterNeutralization?: number;
  note?: string;
  createdAt?: string;  // ISO
  updatedAt?: string;  // ISO
}

// ─── Final pH check ───────────────────────────────────────────────────────────

export type FinalPhStatus =
  | "prihvatljiv"        // within acceptable range
  | "nestabilan"         // measurements differ too much
  | "izvan_raspona"      // outside configured target range
  | "potrebna_provjera"; // technician must confirm

export const FINAL_PH_STATUS_LABELS: Record<FinalPhStatus, string> = {
  prihvatljiv: "Završni pH prihvatljiv",
  nestabilan: "Završni pH nestabilan",
  izvan_raspona: "Završni pH izvan raspona",
  potrebna_provjera: "Potrebna potvrda servisera",
};

export interface ZavrsniPhCheck {
  id: string;
  completedAt: string;      // ISO
  inletPhValue?: number;    // pH of mains / inlet water (for DHW comparison)
  ph1: number;              // mandatory
  ph2?: number;             // second measurement
  ph3?: number;             // optional third measurement
  minutesBetweenMeasurements?: number;
  finalFlowLMin?: number;
  finalWaterAppearance?: IzgledIzlazneVode;
  status: FinalPhStatus;
  technicianConfirmed: boolean;
  note?: string;
  createdAt?: string;  // ISO
  updatedAt?: string;  // ISO
}

// ─── Scale estimate ───────────────────────────────���───────────────────────────

export interface ProcjenaKamenca {
  estimatedKgCaCO3?: number | null;
  /** Minimalni procijenjeni raspon (kg CaCO3) */
  minKg?: number | null;
  /** Maksimalni procijenjeni raspon (kg CaCO3) */
  maxKg?: number | null;
  isRoughEstimate: boolean;
  /** True when product dissolving capacity was available from the product database. */
  basedOnProductData: boolean;
  /** Note displayed with the estimate. */
  note: string;
  warning?: string;
  /** Razina reakcije — iz algoritma estimateScaleByReactionParams */
  reactionLevel?: "jaka" | "srednja" | "slaba" | "iscrpljena" | "premalo_podataka" | null;
}

// ─── Job completion state ──────────────────────────────────────────���──────────

/**
 * Tracks the mandatory completion phases before "Završi posao" is allowed.
 * Both are stored on the Ciklus (the cycle that was the final cleaning cycle).
 */
export interface CompletionPhases {
  /** Set when user completes the rinsing phase form. */
  ispiranje?: IspiranjeData;
  /** Set when user completes the neutralization phase form. */
  neutralizacija?: NeutralizacijaData;
  /** Set when user completes the final pH check. */
  zavrsniPH?: ZavrsniPhCheck;
  /** Computed scale estimate (set alongside zavrsniPH). */
  procjenaKamenca?: ProcjenaKamenca;
  /** True when technician has clicked "Spreman za završetak". */
  technicianReadyConfirmed?: boolean;
}

// ─── Flow improvement classification ─────────────────────────────────────────

export type ScaleLevel =
  | "slab_kamenac"
  | "srednji_kamenac"
  | "jak_kamenac"
  | "ekstremno_zaprljano";

export interface FlowImprovementResult {
  /** Percentage improvement of current flow vs reference flow. */
  deltaFlowPercent: number;
  /** Classified scale severity based on deltaFlowPercent. */
  scaleLevel: ScaleLevel;
  /** Croatian display label for the scale level. */
  scaleLevelLabel: string;
  /** True if the last 2 measurements show < 1% relative flow change — cleaning has plateaued. */
  stagnation: boolean;
  /** Croatian status label: stagnation overrides scale label. */
  statusLabel: string;
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

/** Convert chemical amount to litres (for % calculation). */
export function kemikalijaULitre(
  amount: number,
  unit: JedinicaKemikalije,
  densityKgL?: number
): number | null {
  if (unit === "L") return amount;
  if (unit === "ml") return amount / 1000;
  if (unit === "kg") {
    if (!densityKgL) return null;
    return amount / densityKgL;
  }
  if (unit === "g") {
    if (!densityKgL) return null;
    return amount / 1000 / densityKgL;
  }
  return null;
}

export function izracunajCiklusKemiju(
  waterVolumeL: number,
  chemicalAmount: number,
  chemicalUnit: JedinicaKemikalije,
  densityKgL?: number
): {
  chemicalVolumeL: number | null;
  totalSolutionVolumeL: number | null;
  chemicalPercent: number | null;
  waterChemicalRatio: string | null;
  needsDensity: boolean;
} {
  const needsDensity = (chemicalUnit === "kg" || chemicalUnit === "g") && !densityKgL;
  const chemicalVolumeL = kemikalijaULitre(chemicalAmount, chemicalUnit, densityKgL);
  if (chemicalVolumeL === null) {
    return { chemicalVolumeL: null, totalSolutionVolumeL: null, chemicalPercent: null, waterChemicalRatio: null, needsDensity };
  }
  const totalSolutionVolumeL = waterVolumeL + chemicalVolumeL;
  const chemicalPercent = (chemicalVolumeL / totalSolutionVolumeL) * 100;
  const ratio = chemicalVolumeL > 0
    ? `${(waterVolumeL / chemicalVolumeL).toFixed(1)} : 1`
    : "N/A";
  return { chemicalVolumeL, totalSolutionVolumeL, chemicalPercent, waterChemicalRatio: ratio, needsDensity };
}

// ─── Top-up volume calculation helper ────────────────────────────────────────

export interface NadopunaVolumenRezultat {
  addedChemicalVolumeL: number | null;
  newTotalSolutionVolumeL: number | null;
  totalChemicalVolumeL: number | null;
  newChemicalPercent: number | null;
  needsDensity: boolean;
  isApproximate: boolean;
}

export function izracunajNadopunuVolumen(
  previousTotalSolutionVolumeL: number,
  previousChemicalVolumeL: number,
  addedAmount: number,
  unit: JedinicaKemikalije,
  densityKgL?: number
): NadopunaVolumenRezultat {
  const needsDensity = (unit === "kg" || unit === "g") && !densityKgL;
  const isApproximate = (unit === "kg" || unit === "g");
  const addedChemicalVolumeL = kemikalijaULitre(addedAmount, unit, densityKgL);
  if (addedChemicalVolumeL === null) {
    return { addedChemicalVolumeL: null, newTotalSolutionVolumeL: null, totalChemicalVolumeL: null, newChemicalPercent: null, needsDensity, isApproximate };
  }
  const newTotalSolutionVolumeL = previousTotalSolutionVolumeL + addedChemicalVolumeL;
  const totalChemicalVolumeL = previousChemicalVolumeL + addedChemicalVolumeL;
  const newChemicalPercent = newTotalSolutionVolumeL > 0
    ? (totalChemicalVolumeL / newTotalSolutionVolumeL) * 100
    : null;
  return { addedChemicalVolumeL, newTotalSolutionVolumeL, totalChemicalVolumeL, newChemicalPercent, needsDensity, isApproximate };
}

// ─── Material warning helper ─────────���────────────────────────────────────────

export function materijalUpozorenje(materijal: string): string | null {
  switch (materijal) {
    case "Bakar":
      return "Oprez: provjeriti kompatibilnost sredstva s bakrom.";
    case "Inox":
      return "Inox: pratiti koncentraciju, pH i vrijeme kontakta.";
    case "Plastika":
      return "Provjeriti otpornost plastike na sredstvo i temperaturu.";
    case "Nepoznato":
      return "Materijal nije poznat — koristiti konzervativniji postupak.";
    default:
      return null;
  }
}

// ─── Flow calculation helper ───────────���──────────────────────────────────────

export function izracunajProtokLMin(vrijednost: number, jedinica: JedinicaProtoka): number {
  if (jedinica === "l_min") return vrijednost;
  return 600 / vrijednost;
}

// ─── Derived helpers ────────────────────────────��──────────────���─────────────

export function aktivniCiklusPodsesije(podsesija: Podsesija): Ciklus | undefined {
  return podsesija.ciklusi.find(
    (c) => c.status !== "zavrsen" && c.status !== "prekinut"
  );
}

/** @deprecated use aktivniCiklusPodsesije */
export const aktivniCiklus = aktivniCiklusPodsesije;

export function aktivniCiklusSesije(sesija: Sesija): Ciklus | undefined {
  return sesija.ciklusi?.find(
    (c) => c.status !== "zavrsen" && c.status !== "prekinut"
  );
}

export function zadnjiPHPodsesije(podsesija: Podsesija): number | null {
  const sva = podsesija.ciklusi
    .flatMap((c) => c.mjerenja)
    .sort((a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime());
  return sva.length > 0 ? getMjerenjePH(sva[0]) : null;
}

/** @deprecated use zadnjiPHPodsesije */
export const zadnjiPH = zadnjiPHPodsesije;

export function zadnjeMjerenjePodsesije(podsesija: Podsesija): Mjerenje | null {
  const sva = podsesija.ciklusi
    .flatMap((c) => c.mjerenja)
    .sort((a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime());
  return sva.length > 0 ? sva[0] : null;
}

/** @deprecated use zadnjeMjerenjePodsesije */
export const zadnjeMjerenje = zadnjeMjerenjePodsesije;

export function zadnjiPHSesije(sesija: Sesija): number | null {
  const sva = (sesija.ciklusi ?? [])
    .flatMap((c) => c.mjerenja)
    .sort((a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime());
  return sva.length > 0 ? getMjerenjePH(sva[0]) : null;
}

export function pocetnoMjerenjeCiklusa(ciklus: Ciklus): Mjerenje | undefined {
  return ciklus.mjerenja.find(
    (m) => m.measurementType === "initial_cycle_measurement"
  );
}

export function zadnjeMjerenjeCiklusa(ciklus: Ciklus): Mjerenje | undefined {
  if (ciklus.mjerenja.length === 0) return undefined;
  return [...ciklus.mjerenja].sort(
    (a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime()
  )[0];
}

// ─── pH helpers ───────────────────────────────────────────────────────────────

/** Returns the ph value from a Mjerenje, handling the ph/pH alias. */
export function getMjerenjePH(m: Mjerenje): number {
  return m.ph ?? m.pH ?? 0;
}

/** Returns the timestamp from a Mjerenje, handling measuredAt/timestamp alias. */
export function getMjerenjeTimestamp(m: Mjerenje): string {
  return m.measuredAt ?? m.timestamp ?? new Date().toISOString();
}

// ─── Interpretation helper ───────���──────────────────────────���─────────────────

export interface InterpretacijaRezultat {
  zona: string;
  zonaColor: "green" | "yellow" | "orange" | "red";
  brzina: string | null;
  tekst: string;
  prijedlogAkcije: "nastaviti" | "dodaj_nadopunu" | "novi_ciklus" | "zavrsi" | null;
}

export function interpretirajMjerenje(
  ph: number,
  phRatePerMinute: number | undefined,
  foamLevel: FoamLevel | undefined
): InterpretacijaRezultat {
  // pH zone
  let zona: string;
  let zonaColor: InterpretacijaRezultat["zonaColor"];
  let prijedlogAkcije: InterpretacijaRezultat["prijedlogAkcije"] = "nastaviti";

  if (ph < 1.5) {
    zona = "Vrlo agresivna zona";
    zonaColor = "red";
  } else if (ph < 2.0) {
    zona = "Jaka aktivnost";
    zonaColor = "orange";
  } else if (ph < 3.0) {
    zona = "Optimalna radna zona";
    zonaColor = "green";
  } else if (ph < 4.0) {
    zona = "Reakcija slabi";
    zonaColor = "yellow";
    prijedlogAkcije = "dodaj_nadopunu";
  } else {
    zona = "Sredstvo je vjerojatno iscrpljeno";
    zonaColor = "red";
    prijedlogAkcije = "novi_ciklus";
  }

  // pH rate text
  let brzina: string | null = null;
  if (phRatePerMinute !== undefined && phRatePerMinute !== null) {
    const absRate = Math.abs(phRatePerMinute);
    if (absRate > 0.05) brzina = "Brza reakcija / sredstvo se brzo trosi";
    else if (absRate >= 0.02) brzina = "Normalna reakcija";
    else brzina = "Spora ili stabilna reakcija";
  }

  // Interpretation text combining pH zone, rate and foam
  const foamJaka = foamLevel === "jaka" || foamLevel === "vrlo_jaka";
  const phRaste = phRatePerMinute !== undefined && phRatePerMinute > 0;
  const phStabilan = phRatePerMinute !== undefined && Math.abs(phRatePerMinute) < 0.01;
  const nemaPjene = !foamLevel || foamLevel === "nema";

  let tekst: string;
  if (ph >= 4.0) {
    tekst = "pH je visok. Sredstvo je vjerojatno iscrpljeno. Preporučuje se novi ciklus ili završetak.";
    prijedlogAkcije = "novi_ciklus";
  } else if (foamJaka && phRaste) {
    tekst = "pH raste i prisutna je jaka pjena. Reakcija je aktivna i sredstvo se troši.";
  } else if (nemaPjene && phStabilan) {
    tekst = "pH je stabilan i nema značajne pjene. Reakcija je slaba ili pri kraju.";
    if (ph > 3.0) prijedlogAkcije = "dodaj_nadopunu";
  } else if (ph >= 3.0 && ph < 4.0) {
    tekst = "Reakcija slabi. Razmotrite nadopunu sredstva ili novi ciklus.";
    prijedlogAkcije = "dodaj_nadopunu";
  } else {
    tekst = `pH ${ph.toFixed(1)} — ${zona}.`;
  }

  return { zona, zonaColor, brzina, tekst, prijedlogAkcije };
}

// ─── Nulto mjerenje helpers ────────────────────────────────────────────────────

/**
 * Vraća nulto mjerenje ciklusa (prvo mjerenje tipa initial_cycle_measurement).
 * Ovo je točka 0 za praćenje reakcije - sva live mjerenja se uspoređuju s ovim.
 */
export function nultoMjerenjeCiklusa(ciklus: Ciklus): Mjerenje | undefined {
  return ciklus.mjerenja.find(
    (m) => m.measurementType === "initial_cycle_measurement"
  );
}

/** Alias za pocetnoMjerenjeCiklusa - koristi se za nulto mjerenje nakon kemije */
export const getNultoMjerenje = nultoMjerenjeCiklusa;

/**
 * Izračunava delta vrijednosti isključivo u odnosu na referentno/nulto mjerenje (nakon kemije).
 * Ova aplikacija je specijalizirana za uklanjanje kamenca — nema baseline-a prije kemije.
 */
export interface CycleDeltaValues {
  /** Delta pH od referentnog/nultog mjerenja (odmah nakon kemije) */
  deltaPhFromZero: number | null;
  /** Delta protok od referentnog/nultog mjerenja (L/min) */
  deltaFlowFromZero: number | null;
  /** Postotak poboljšanja protoka od referentnog mjerenja */
  flowImprovementFromZeroPercent: number | null;
  // Backward compat aliases — uvijek null u novoj logici
  deltaFlowFromInitial: null;
  flowImprovementPercent: null;
}

export function izracunajDeltaCiklusa(
  ciklus: Ciklus,
  trenutnoMjerenje: Mjerenje
): CycleDeltaValues {
  const result: CycleDeltaValues = {
    deltaPhFromZero: null,
    deltaFlowFromZero: null,
    flowImprovementFromZeroPercent: null,
    deltaFlowFromInitial: null,
    flowImprovementPercent: null,
  };

  const currentPh = getMjerenjePH(trenutnoMjerenje);
  const currentFlow = trenutnoMjerenje.flowLMin;

  // Referentno/nulto mjerenje = prvo mjerenje odmah nakon kemije
  const nulto = nultoMjerenjeCiklusa(ciklus);
  const zeroPh = ciklus.zeroMeasurementPh ?? (nulto ? getMjerenjePH(nulto) : null);
  const zeroFlow = ciklus.zeroMeasurementFlowLMin ?? nulto?.flowLMin ?? null;

  // Delta pH od referentnog mjerenja
  if (zeroPh !== null) {
    result.deltaPhFromZero = parseFloat((currentPh - zeroPh).toFixed(2));
  }

  // Delta protok od referentnog mjerenja
  if (zeroFlow !== null && currentFlow !== undefined) {
    result.deltaFlowFromZero = parseFloat((currentFlow - zeroFlow).toFixed(2));
    if (zeroFlow > 0) {
      result.flowImprovementFromZeroPercent = parseFloat(
        (((currentFlow - zeroFlow) / zeroFlow) * 100).toFixed(1)
      );
    }
  }

  return result;
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

export interface SesijaStatistika {
  brojPodsesija: number;
  aktivnePodsesije: number;
  zavrsenePodsesije: number;
  ukupnoCiklusa: number;
  ukupnoMjerenja: number;
  ukupnoNadopuna: number;
  ukupnoKemikalije: number;
  /** Jedinica kemikalije ("kg" | "L" | "g" | "ml") — uzima se od prvog ciklusa koji ima chemicalUnit */
  kemikalijeJedinica: string;
}

/** Zbraja kemikaliju ciklusa uzimajući u obzir chemicalAmount + chemicalUnit kao primarni izvor */
function sumCiklusKemikalija(ciklusi: Ciklus[]): { total: number; jedinica: string } {
  let total = 0;
  let jedinica = "L";
  for (const c of ciklusi) {
    // Primarna vrijednost: chemicalAmount + chemicalUnit (uneseno rukom)
    if (c.chemicalAmount != null && c.chemicalAmount > 0) {
      const unit = c.chemicalUnit ?? "L";
      if (jedinica === "L" && unit !== "L") jedinica = unit; // preuzmi prvu non-L jedinicu
      if (unit === "kg" || unit === "g" || unit === "L" || unit === "ml") {
        // normalizirati sve na gramove za zbroj, ali prikazati u originalnoj jedinici
        // Za prikaz: samo zbrajamo isti unit, mješane ignoriramo ali uzimamo prvu
        total += c.chemicalAmount;
      }
    } else {
      // Fallback: chemicalVolumeL
      total += c.chemicalVolumeL ?? c.kolicina_kemikalije ?? 0;
    }
    // Nadopune (uvijek u L)
    for (const n of c.nadopune ?? []) {
      total += n.addedChemicalVolumeL ?? n.kolicina ?? 0;
    }
  }
  return { total, jedinica };
}

export function izracunajStatistiku(sesija: Sesija): SesijaStatistika {
  if (sesija.workMode === "no_subsessions") {
    const ciklusi = sesija.ciklusi ?? [];
    const { total, jedinica } = sumCiklusKemikalija(ciklusi);
    return {
      brojPodsesija: 0,
      aktivnePodsesije: 0,
      zavrsenePodsesije: 0,
      ukupnoCiklusa: ciklusi.length,
      ukupnoMjerenja: ciklusi.flatMap((c) => c.mjerenja).length,
      ukupnoNadopuna: ciklusi.flatMap((c) => c.nadopune).length,
      ukupnoKemikalije: total,
      kemikalijeJedinica: jedinica,
    };
  }
  const svePodsesije = sesija.podsesije;
  const sveCiklusi = svePodsesije.flatMap((p) => p.ciklusi);
  const { total, jedinica } = sumCiklusKemikalija(sveCiklusi);
  return {
    brojPodsesija: svePodsesije.length,
    aktivnePodsesije: svePodsesije.filter((p) => p.status === "u_radu").length,
    zavrsenePodsesije: svePodsesije.filter((p) => p.status === "zavrseno").length,
    ukupnoCiklusa: sveCiklusi.length,
    ukupnoMjerenja: sveCiklusi.flatMap((c) => c.mjerenja).length,
    ukupnoNadopuna: sveCiklusi.flatMap((c) => c.nadopune).length,
    ukupnoKemikalije: total,
    kemikalijeJedinica: jedinica,
  };
}
