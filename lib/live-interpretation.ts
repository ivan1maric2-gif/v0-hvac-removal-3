// ─── Live Interpretation Engine ───────────────────────────────────────────────
//
// generateLiveInterpretation() je centralna funkcija koja prima:
//   - aktivan ProductEngine (source of truth za svu interpretaciju)
//   - trenutno mjerenje (Mjerenje)
//
// i vraća LiveReactionState — strukturirani objekt sa svim potrebnim podacima
// za prikaz u UI-u.
//
// VAŽNO:
//   - Sva logika mora dolaziti iz product enginea.
//   - Isti podaci moraju dati RAZLIČITE rezultate za različite proizvode.
//   - Ne koristiti hardcoded univerzalna pravila.
//   - Svaki engine ima vlastiti: indicator model, saturation model, warning model.

import type { ProductEngine, EngineThermalLevel } from "./product-engine-types";
import type { Mjerenje, FoamLevel } from "./types";

// ─── Live Recommendation type ─────────────────────────────────────────────────

export type LiveRecommendation =
  | "nastaviti_ciscenje"
  | "pratiti_stanje"
  | "dodati_kemiju"
  | "zavrsiti_ciklus"
  | "novi_ciklus"
  | "smanjiti_temperaturu"
  | "provjeriti_magnetit"
  | "provjeriti_protok"
  | "neutralizirati"
  | "obavijestiti_servisera";

export const LIVE_RECOMMENDATION_LABEL: Record<LiveRecommendation, string> = {
  nastaviti_ciscenje:     "Nastaviti čišćenje",
  pratiti_stanje:         "Pratiti stanje",
  dodati_kemiju:          "Dodati kemiju",
  zavrsiti_ciklus:        "Završiti ciklus",
  novi_ciklus:            "Novi ciklus",
  smanjiti_temperaturu:   "Smanjiti temperaturu",
  provjeriti_magnetit:    "Provjeriti magnetit",
  provjeriti_protok:      "Provjeriti protok",
  neutralizirati:         "Neutralizirati",
  obavijestiti_servisera: "Obavijestiti servisera",
};

// ─── Chemistry status ─────────────────────────────────────────────────────────

export type ChemistryStatus =
  | "maksimalno_aktivno"
  | "aktivno"
  | "slabi"
  | "iscrpljeno"
  | "neutralizirano"
  | "nepoznato";

export const CHEMISTRY_STATUS_LABEL: Record<ChemistryStatus, string> = {
  maksimalno_aktivno: "Maksimalno aktivno",
  aktivno:            "Aktivno",
  slabi:              "Slabi",
  iscrpljeno:         "Iscrpljeno",
  neutralizirano:     "Neutralizirano",
  nepoznato:          "Nepoznato",
};

// ─── Reaction strength ────────────────────────────────────────────────────────

export type ReactionStrength =
  | "jaka"
  | "normalna"
  | "slaba"
  | "nema"
  | "nepoznata";

export const REACTION_STRENGTH_LABEL: Record<ReactionStrength, string> = {
  jaka:      "Jaka reakcija",
  normalna:  "Normalna reakcija",
  slaba:     "Slaba reakcija",
  nema:      "Nema reakcije",
  nepoznata: "Nepoznata",
};

// ─── Saturation state ─────────────────────────────────────────────────────────

export type SaturationState =
  | "svjeza"         // Svježa otopina — daleko od iscrpljenosti
  | "aktivna"        // Aktivna zona — još ima kapaciteta
  | "kritična"       // Kritična točka — učinkovitost dramatično pada
  | "iscrpljena"     // Iscrpljeno — bez kemijskog učinka
  | "neutralizirana" // Neutralizirano
  | "nepoznata";

export const SATURATION_STATE_LABEL: Record<SaturationState, string> = {
  svjeza:        "Svježa otopina",
  aktivna:       "Aktivna zona",
  kritična:      "Kritična točka",
  iscrpljena:    "Iscrpljeno",
  neutralizirana:"Neutralizirano",
  nepoznata:     "Nepoznato",
};

// ─── Contamination state (DS-40) ─────────────────────────────────────────────

export type ContaminationState =
  | "visoka"    // Magnetit/sludge detektiran — skuplja se
  | "srednja"   // Sludge prisutan ali opada
  | "niska"     // Nema sludgea
  | "nepoznata";

// ─── Finish cycle state ───────────────────────────────────────────────────────

export interface FinishCycleState {
  /** Da li su svi uvjeti za završetak ispunjeni */
  ready: boolean;
  /** Lista uvjeta — svaki s indikatorom ispunjenosti */
  criteria: Array<{
    label: string;
    met: boolean | null; // null = ne može se procijeniti
  }>;
}

// ─── Interpreted Color State — app derivira boju iz pH + foam + bubbling ────────
//
// SPEC: App mora interpretirati stanje — NE samo prikazivati input boju.
// "Interpreted color" dolazi iz product enginea, a NE od korisničkog unosa.
//
// Razlika:
//   selectedColor    = korisnički unos (što servisnik vidi)
//   interpretedColor = app interpretacija iz pH + foam + bubbling + saturation

export interface InterpretedColorState {
  /** Naziv interpretirane boje — product-specific, dolazi iz colorZones */
  colorName: string;
  /** Hex boja za vizualni prikaz */
  colorHex: string;
  /** Kratki label npr. "Aktivno pink", "Saturacija orange", "Exhausted yellow" */
  label: string;
  /**
   * Interpretirano stanje reakcije — boja + kemijsko stanje u jednoj frazi.
   * SPEC: "App NE smije prikazivati samo 'Zelena' nego interpretirano stanje."
   * Primjeri: "Žuto-zelena aktivna reakcija", "Aktivno pink", "Saturation orange", "Exhausted yellow"
   */
  reactionColorState: string;
  /** Puni opis kemijskog stanja */
  description: string;
  /** Kemijsko stanje zone */
  chemicalStrength: "maksimalno" | "aktivno" | "slabi" | "iscrpljeno" | "neutralizirano";
  /** Koliko se podudara s korisničkim unosom (null = nije unesena boja) */
  matchesUserInput?: boolean;
  /** Mismatch warning — ako app interpretacija != korisnički unos */
  mismatchWarning?: string;
}

// ─── Warning level ────────────────────────────────────────────────────────────

export type WarningLevel = "info" | "caution" | "warning" | "critical";

export interface LiveWarning {
  level: WarningLevel;
  message: string;
}

// ─── LiveReactionState — glavni output ────────────────────────────────────────

export interface LiveReactionState {
  // ── Identifikacija enginea ─────────────────────────────────────────────────
  engineId: string;
  engineName: string;

  // ── Kemijsko stanje ────────────────────────────────────────────────────────
  chemistryStatus: ChemistryStatus;
  chemistryStatusLabel: string;
  chemistryDescription: string;

  // ── Interpreted Color — APP derivira boju iz pH + foam + bubbling ─────────
  // NE od korisničkog unosa. Dolazi iz product engine colorZones.
  // Spec: "interpreted color mora dolaziti iz product enginea"
  interpretedColor: InterpretedColorState;

  // ── Snaga reakcije ─────────────────────────────────────────────────────────
  reactionStrength: ReactionStrength;
  reactionStrengthLabel: string;
  reactionDescription: string;

  // ── Saturation state ───────────────────────────────────────────────────────
  saturationState: SaturationState;
  saturationStateLabel: string;
  saturationDescription: string;

  // ── Kontaminacija (DS-40 specifično) ──────────────────────────────────────
  contaminationState?: ContaminationState;

  // ── Temperatura ────────────────────────────────────────────────────────────
  thermalLevel?: EngineThermalLevel;
  thermalWarning?: string;

  // ── Upozorenja ─────────────────────────────────────────────────────────────
  warnings: LiveWarning[];

  // ── Preporuka ──────────────────────────────────────────────────────────────
  recommendation: LiveRecommendation;
  recommendationLabel: string;
  recommendationDetail: string;

  // ── Finish cycle ─────────��─────────────────────────────────────────────────
  finishCycleState: FinishCycleState;

  // ── Debug info (prikazati samo u dev panelu) ───────────────────────────────
  debug: {
    phValue?: number;
    colorIndicator?: string;
    foamLevel?: FoamLevel;
    bubblesPresent?: boolean;
    temperatureC?: number;
    tempInC?: number;
    tempOutC?: number;
    deltaTC?: number;
    magnetFilterActive?: boolean;
    flowLMin?: number;
    activeIndicatorModel: string;
    activeSaturationModel: string;
    activeWarningModel: string;
  };
}

// ─── TEMP OUT Trend — TEMP OUT je GLAVNI thermal indikator za descaling ─────────
//
// SPEC (ispravak):
//   deltaTempOut = currentTempOut - referenceTempOut
//   reference = initial_cycle_measurement (referentno mjerenje na početku ciklusa)
//   NE koristiti prethodno mjerenje — koristiti referentno mjerenje.
//
//   - TEMP OUT raste vs. referentno         → "Povećanje izlazne temperature — poboljšava se prijenos topline."
//   - TEMP OUT raste značajno vs. referentno → "Moguće uspješno uklanjanje kamenca."
//   - TEMP OUT stagnira                      → "Prijenos topline stabilan."
//   - TEMP OUT pada vs. referentno           → "Moguća blokada, slab protok ili usporavanje reakcije."
//
// ΔT (TEMP OUT - TEMP IN u istom mjerenju) ostaje POMOĆNI indikator.

export type TempOutThermalStatus = "improving" | "stable" | "worsening";

export interface TempOutTrendAnalysis {
  /** Trenutni TEMP OUT */
  currentTempOut: number;
  /**
   * Referentni TEMP OUT iz initial_cycle_measurement.
   * SPEC: delta = currentTempOut - referenceTempOut (NE prethodno mjerenje!)
   */
  referenceTempOut?: number;
  /** Promjena: currentTempOut - referenceTempOut */
  deltaTempOut?: number;
  /** Thermal trend status */
  thermalStatus: TempOutThermalStatus;
  /** Interpretacijska poruka */
  message: string;
  /** Kratki label za badge */
  label: string;
  /** Razina alarma */
  level: "ok" | "info" | "caution" | "warning";
}

// Pragovi za TEMP OUT interpretaciju (vs. referentno mjerenje)
const TEMP_OUT_THRESHOLDS = {
  /** Značajan rast vs. referentno — "Moguće uspješno uklanjanje kamenca." */
  significantRise: 3,
  /** Normalni rast vs. referentno — "Poboljšava se prijenos topline." */
  rise: 0.5,
  /** Stagnacija (apsolutna razlika) */
  stagnation: 0.5,
} as const;

/**
 * Analizira TEMP OUT trend između trenutnog i REFERENTNOG mjerenja.
 *
 * SPEC: deltaTempOut = currentTempOut - referenceTempOut
 * Referentno = initial_cycle_measurement (početak ciklusa).
 * NE koristiti prethodno mjerenje kao referencu.
 *
 * @param currentTempOut  - TEMP OUT trenutnog mjerenja
 * @param referenceTempOut - TEMP OUT iz initial_cycle_measurement (referentno)
 */
export function tempOutTrendAnalysis(
  currentTempOut: number,
  referenceTempOut?: number,
): TempOutTrendAnalysis {
  const deltaTempOut = referenceTempOut !== undefined
    ? parseFloat((currentTempOut - referenceTempOut).toFixed(1))
    : undefined;

  // Nema referentnog mjerenja — samo prikazati trenutni
  if (deltaTempOut === undefined) {
    return {
      currentTempOut,
      thermalStatus: "stable",
      message: "Referentno mjerenje nije dostupno.",
      label: "Bez reference",
      level: "info",
    };
  }

  // Značajan rast vs. referentno — kamenac se uklanja
  if (deltaTempOut >= TEMP_OUT_THRESHOLDS.significantRise) {
    return {
      currentTempOut,
      referenceTempOut,
      deltaTempOut,
      thermalStatus: "improving",
      message: "Moguće uspješno uklanjanje kamenca.",
      label: "Poboljšanje",
      level: "ok",
    };
  }

  // Normalni rast vs. referentno — prijenos se poboljšava
  if (deltaTempOut > TEMP_OUT_THRESHOLDS.rise) {
    return {
      currentTempOut,
      referenceTempOut,
      deltaTempOut,
      thermalStatus: "improving",
      message: "Povećanje izlazne temperature — poboljšava se prijenos topline.",
      label: "Poboljšanje",
      level: "ok",
    };
  }

  // Stagnacija
  if (Math.abs(deltaTempOut) <= TEMP_OUT_THRESHOLDS.stagnation) {
    return {
      currentTempOut,
      referenceTempOut,
      deltaTempOut,
      thermalStatus: "stable",
      message: "Prijenos topline stabilan.",
      label: "Stabilno",
      level: "info",
    };
  }

  // Pad vs. referentno — blokada, slab protok ili usporavanje reakcije
  return {
    currentTempOut,
    referenceTempOut,
    deltaTempOut,
    thermalStatus: "worsening",
    message: "Moguća blokada, slab protok ili usporavanje reakcije.",
    label: "Upozorenje",
    level: "caution",
  };
}

// ─── Helper: pronalazi thermal level za zadanu temperaturu ───────────────────

function getThermalLevel(
  thermalModel: EngineThermalLevel[],
  tempC: number
): EngineThermalLevel | undefined {
  return thermalModel.find(
    (t) => tempC >= t.tempMin && tempC < t.tempMax
  );
}

// ─── Helper: procjena snage reakcije iz bubblinga ─────────────────────────────

function bubblingToReactionStrength(
  bubblesPresent: boolean | undefined,
  visibleReaction: string | undefined
): ReactionStrength {
  if (visibleReaction === "vrlo_jaka" || visibleReaction === "jaka") return "jaka";
  if (visibleReaction === "normalna") return "normalna";
  if (visibleReaction === "slaba") return "slaba";
  if (bubblesPresent === true) return "normalna";
  if (bubblesPresent === false) return "nema";
  return "nepoznata";
}

// ─── Helper: procjena snage reakcije iz pjene ────────────────────────────────

function foamToReactionStrength(foamLevel: FoamLevel | undefined): ReactionStrength {
  if (foamLevel === "vrlo_jaka" || foamLevel === "jaka") return "jaka";
  if (foamLevel === "srednja") return "normalna";
  if (foamLevel === "slaba") return "slaba";
  if (foamLevel === "nema") return "nema";
  return "nepoznata";
}

// ─── Helper: derivira InterpretedColorState iz pH + foam + bubbling + colorZones
//
// VAŽNO: Ovo je APP interpretacija — NE korisnički unos.
// Logika:
//   1. pH → pronađi odgovarajuću colorZone (phMin/phMax)
//   2. foam/bubbling → može potvrditi ili modificirati (npr. jaka pjena = aktivniji od pH-a)
//   3. sludge/contamination → može override-ati (DS-40 black sludge)
//   4. korisnički unos → provjeri mismatch

function deriveInterpretedColor(
  engine: ProductEngine,
  m: Mjerenje,
  chemistryStatus: ChemistryStatus,
): InterpretedColorState {
  const ph    = m.ph ?? m.pH;
  const foam  = m.foamLevel;
  const bubbles       = m.bubblesPresent;
  const visibleReaction = m.visibleReaction as string | undefined;
  const userColor     = (m.colorIndicator ?? "").toLowerCase().trim();
  const colorZones    = engine.colorZones;

  // ── 1. Pronađi zonu prema pH ─────────────────────────────────────────────
  let matchedZone = colorZones.find((z) => {
    const minOk = z.phMin === undefined || (ph !== undefined && ph >= z.phMin);
    const maxOk = z.phMax === undefined || (ph !== undefined && ph <  z.phMax);
    return minOk && maxOk;
  });

  // ── 2. Foam/bubbling override — produbi interpretaciju ───────────────────
  // Jaka pjena/bubbling s pH na granici → uzmi aktivniju zonu
  const strongActivity = foam === "jaka" || foam === "vrlo_jaka"
    || visibleReaction === "jaka" || visibleReaction === "vrlo_jaka"
    || (bubbles === true && visibleReaction === "normalna");

  if (strongActivity && matchedZone?.chemicalStrength === "slabi" && colorZones.length > 0) {
    // Ako je pjena/bubbling još jak ali pH je u "slabi" zoni — prikaži aktivniju zonu
    const activerIdx = colorZones.indexOf(matchedZone) - 1;
    if (activerIdx >= 0) {
      const activerZone = colorZones[activerIdx];
      if (activerZone.chemicalStrength === "aktivno" || activerZone.chemicalStrength === "maksimalno") {
        matchedZone = activerZone;
      }
    }
  }

  // ── 3. DS-40 sludge override — contamination může utjecati na boju ───────
  if (engine.indicatorModel === "color+foam+sludge") {
    const magnetFilter = m.magnetFilterActive;
    const color = (m.colorIndicator ?? "").toLowerCase();
    const isDark = color.includes("crn") || color.includes("black") || color.includes("tamn") || color.includes("dark");
    if (isDark && magnetFilter === true) {
      // Black sludge može pokriti indikator — označi
      return {
        colorName: "Crna / tamna (sludge)",
        colorHex: "#1c1917",
        label: "Black sludge — indikator nepouzdan",
        reactionColorState: "Crna — black sludge · indikator nepouzdan",
        description: engine.sludgeLogic?.indicatorOverrideWarning
          ?? "Crni talog (magnetit) može pokriti indikator boje. Vizualni prikaz nepouzdan.",
        chemicalStrength: "aktivno",
        matchesUserInput: true,
        mismatchWarning: "Magnetit/sludge može prekriti indikator. Koristiti pH kao primarni signal.",
      };
    }
  }

  // ── 4. Fallback — nije pronađena zona ────────────────────────────────────
  if (!matchedZone) {
    // Pokušaj prema chemistryStatus
    const statusMap: Record<ChemistryStatus, number> = {
      maksimalno_aktivno: 0,
      aktivno:            1,
      slabi:              2,
      iscrpljeno:         colorZones.length - 1,
      neutralizirano:     colorZones.length - 1,
      nepoznato:          Math.floor(colorZones.length / 2),
    };
    matchedZone = colorZones[statusMap[chemistryStatus]] ?? colorZones[0];
  }

  if (!matchedZone) {
    return {
      colorName: "Nepoznato",
      colorHex: "#6b7280",
      label: "Boja nije određena",
      reactionColorState: "Nepoznato — unesite pH za interpretaciju",
      description: "Unesite pH ili boju za interpretaciju.",
      chemicalStrength: "aktivno",
    };
  }

  // ── 5. Provjeri mismatch s korisničkim unosom ─────────────────────────────
  let matchesUserInput: boolean | undefined;
  let mismatchWarning: string | undefined;

  if (userColor) {
    const interpretedLower = matchedZone.colorName.toLowerCase();
    matchesUserInput = interpretedLower.includes(userColor) || userColor.includes(interpretedLower);
    if (!matchesUserInput) {
      mismatchWarning = `Unesena boja "${m.colorIndicator}" ne odgovara app interpretaciji "${matchedZone.colorName}" za pH ${ph?.toFixed(1) ?? "—"}. Koristiti pH kao primarni signal.`;
    }
  }

  // ── 6. Generiranje reactionColorState fraze ───────────────────────────────
  // SPEC: "App NE smije prikazivati samo 'Zelena' nego interpretirano stanje."
  // Format: "[Boja] [kemijsko stanje] [kontekst]"
  // Primjeri: "Žuto-zelena aktivna reakcija", "Aktivno pink", "Saturation orange", "Exhausted yellow"
  const strengthPhrase: Record<typeof matchedZone.chemicalStrength, string> = {
    maksimalno:    "maksimalna aktivnost",
    aktivno:       "aktivna reakcija",
    slabi:         "slabi / usporava",
    iscrpljeno:    "iscrpljeno",
    neutralizirano:"neutralizirano",
  };

  // Foam/bubbling modifikator — jača frazu kad je pjena/bubbling aktivan
  const activitySuffix = strongActivity
    ? (matchedZone.chemicalStrength === "maksimalno" || matchedZone.chemicalStrength === "aktivno"
        ? " · jaka reakcija"
        : "")
    : "";

  const reactionColorState = `${matchedZone.colorName} — ${strengthPhrase[matchedZone.chemicalStrength]}${activitySuffix}`;

  return {
    colorName:         matchedZone.colorName,
    colorHex:          matchedZone.colorHex,
    label:             matchedZone.label,
    reactionColorState,
    description:       matchedZone.description,
    chemicalStrength:  matchedZone.chemicalStrength,
    matchesUserInput,
    mismatchWarning,
  };
}

// ─── DS-3 interpretacija: color+foam, pH dominantno, foam sekundarno ─────────

function interpretDS3(
  engine: ProductEngine,
  m: Mjerenje,
): LiveReactionState {
  const ph = m.ph ?? m.pH;
  const foam = m.foamLevel;
  const color = (m.colorIndicator ?? "").toLowerCase();
  const temp = m.temperatureC ?? m.temperatura;

  // Chemistry status — pH primarno za DS-3
  let chemistryStatus: ChemistryStatus;
  let chemistryDesc: string;
  let saturationState: SaturationState;
  let saturationDesc: string;

  if (ph !== undefined) {
    if (ph < 2.0) {
      chemistryStatus = "maksimalno_aktivno";
      chemistryDesc   = "pH <2.0 — svježa otopina, maksimalna snaga. Jaka bijela pjena potvrđuje aktivno otapanje.";
      saturationState = "svjeza";
      saturationDesc  = "Daleko od iscrpljenosti. Žuta boja, pH <2.0.";
    } else if (ph < 3.5) {
      chemistryStatus = "slabi";
      chemistryDesc   = "pH 2.0–3.5 — sredstvo aktivno ali opada. Zelena boja, pjena se smanjuje.";
      saturationState = "aktivna";
      saturationDesc  = "Sredstvo troši kapacitet — pratiti pH.";
    } else {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "pH >3.5 — sredstvo potrošeno. Plava boja, nema pjene. Reakcija se zaustavila.";
      saturationState = "iscrpljena";
      saturationDesc  = "Kemija bez učinka. Ispirati ili ponoviti ciklus.";
    }
  } else {
    // Fallback na boju i pjenu ako nema pH
    const isZuta = color.includes("žut") || color.includes("yellow");
    const isZelena = color.includes("zelen") || color.includes("green");
    const isPlava = color.includes("plav") || color.includes("blue");
    if (isZuta) {
      chemistryStatus = "maksimalno_aktivno";
      chemistryDesc   = "Žuta boja — svježa otopina, maksimalna snaga.";
      saturationState = "svjeza";
      saturationDesc  = "Svježa otopina.";
    } else if (isZelena) {
      chemistryStatus = "slabi";
      chemistryDesc   = "Zelena boja — sredstvo slabi.";
      saturationState = "aktivna";
      saturationDesc  = "Sredstvo troši kapacitet.";
    } else if (isPlava) {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "Plava boja — sredstvo potrošeno.";
      saturationState = "iscrpljena";
      saturationDesc  = "Kemija bez učinka.";
    } else {
      chemistryStatus = "nepoznato";
      chemistryDesc   = "Nije moguće utvrditi stanje bez pH ili boje.";
      saturationState = "nepoznata";
      saturationDesc  = "Nedostaju podaci.";
    }
  }

  // Reaction strength — foam primarno za DS-3
  const reactionStrength = foamToReactionStrength(foam);
  let reactionDesc: string;
  if (reactionStrength === "jaka") {
    reactionDesc = engine.foamLogic?.whiteFoamMeaning ?? "Jaka pjena — aktivno otapanje kamenca.";
  } else if (reactionStrength === "normalna" || reactionStrength === "slaba") {
    reactionDesc = "Pjena prisutna ali slabi — reakcija usporava.";
  } else if (reactionStrength === "nema") {
    reactionDesc = engine.foamLogic?.noFoamMeaning ?? "Nema pjene — kemijska reakcija završena.";
  } else {
    reactionDesc = "Nije moguće procijeniti snagu reakcije.";
  }

  // Thermal
  const thermalLevel = temp !== undefined ? getThermalLevel(engine.thermalModel, temp) : undefined;
  const thermalWarning =
    thermalLevel?.level === "warning" ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    thermalLevel?.level === "caution" ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    thermalLevel?.level === "slow"    ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    undefined;

  // TEMP OUT Trend — SPEC: TEMP OUT je GLAVNI thermal indikator za descaling
  const tempOutTrendResultDS3 = m.tempOutC !== undefined
    ? tempOutTrendAnalysis(m.tempOutC, undefined)
    : undefined;

  // Warnings
  const warnings: LiveWarning[] = [];
  if (thermalLevel?.level === "warning") {
    warnings.push({ level: "warning", message: thermalWarning! });
  } else if (thermalLevel?.level === "caution") {
    warnings.push({ level: "caution", message: thermalWarning! });
  }
  // TEMP OUT trend warning za DS-3
  if (tempOutTrendResultDS3?.thermalStatus === "worsening") {
    warnings.push({ level: "caution", message: `TEMP OUT: ${tempOutTrendResultDS3.message}` });
  } else if (tempOutTrendResultDS3?.thermalStatus === "improving") {
    warnings.push({ level: "info", message: `TEMP OUT: ${tempOutTrendResultDS3.message}` });
  }
  if (foam === "jaka" || foam === "vrlo_jaka") {
    const darkFoamColors = ["tamn", "crn", "prljav", "dark", "black"];
    const colorStr = (m.colorIndicator ?? "").toLowerCase();
    if (darkFoamColors.some((d) => colorStr.includes(d))) {
      warnings.push({ level: "caution", message: engine.foamLogic?.darkFoamMeaning ?? "Tamna pjena — moguće korozijske naslage." });
    }
  }
  if (ph !== undefined && ph < 1.0) {
    warnings.push({ level: "caution", message: "Jako kiselinska otopina (pH <1.0) — koristiti PPE." });
  }

  // Recommendation
  let recommendation: LiveRecommendation;
  let recommendationDetail: string;
  if (chemistryStatus === "iscrpljeno") {
    const foamNema = reactionStrength === "nema";
    recommendation = foamNema ? "zavrsiti_ciklus" : "dodati_kemiju";
    recommendationDetail = foamNema
      ? "Sredstvo potrošeno, nema pjene. Isprati i završiti ciklus."
      : "Sredstvo potrošeno — razmotriti novi ciklus s DS-3.";
  } else if (chemistryStatus === "slabi") {
    recommendation = "pratiti_stanje";
    recommendationDetail = "Pjena se smanjuje i pH raste. Pratiti — blizu zasićenja.";
  } else {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Sredstvo na punoj snazi. Nastaviti ciklus i pratiti pjenu.";
  }
  if (thermalLevel?.level === "warning" || thermalLevel?.level === "slow") {
    recommendation = thermalLevel.level === "warning" ? "smanjiti_temperaturu" : recommendation;
  }

  // Finish cycle
  const stableColor = color.includes("plav") || color.includes("blue");
  const noFoam = reactionStrength === "nema";
  const phExhausted = ph !== undefined && ph >= engine.exhaustionPH;
  const finishCycleState: FinishCycleState = {
    ready: stableColor && noFoam && phExhausted,
    criteria: engine.finishCycleCriteria.criteria.map((c) => ({
      label: c,
      met: c.toLowerCase().includes("plava") ? stableColor
         : c.toLowerCase().includes("nema pjene") ? noFoam
         : c.toLowerCase().includes("ph stabilan") ? phExhausted
         : null,
    })),
  };

  return {
    engineId: engine.id,
    engineName: engine.name,
    chemistryStatus,
    chemistryStatusLabel: CHEMISTRY_STATUS_LABEL[chemistryStatus],
    chemistryDescription: chemistryDesc,
    interpretedColor: deriveInterpretedColor(engine, m, chemistryStatus),
    reactionStrength,
    reactionStrengthLabel: REACTION_STRENGTH_LABEL[reactionStrength],
    reactionDescription: reactionDesc,
    saturationState,
    saturationStateLabel: SATURATION_STATE_LABEL[saturationState],
    saturationDescription: saturationDesc,
    thermalLevel,
    thermalWarning,
    warnings,
    recommendation,
    recommendationLabel: LIVE_RECOMMENDATION_LABEL[recommendation],
    recommendationDetail,
    finishCycleState,
    debug: {
      phValue: ph,
      colorIndicator: m.colorIndicator,
      foamLevel: foam,
      bubblesPresent: m.bubblesPresent,
      temperatureC: temp,
      flowLMin: m.flowLMin,
      activeIndicatorModel: engine.indicatorModel,
      activeSaturationModel: engine.saturationModel,
      activeWarningModel: engine.warningModel,
    },
  };
}

// ─── ScaleBreaker FX interpretacija: color+bubbles dominantno, kritični pH 3.0 ──

function interpretScaleBreakerFX(
  engine: ProductEngine,
  m: Mjerenje,
): LiveReactionState {
  const ph = m.ph ?? m.pH;
  const bubbles = m.bubblesPresent;
  const visibleReaction = m.visibleReaction as string | undefined;
  const color = (m.colorIndicator ?? "").toLowerCase();
  const temp = m.temperatureC ?? m.temperatura;

  // Spec primjer: yellow + pH 3.5 + nema bubblinga → "FX chemistry exhausted."
  // Boja dominantno — 6 boja prema TDS

  const isDarkRed    = color.includes("tamno crvena") || color.includes("dark red") || color.includes("tamnocrvena");
  const isPink       = color.includes("ružičast") || color.includes("pink") || color.includes("ruzicasta") || color.includes("magenta");
  const isOrangeRed  = color.includes("narančasto-crvena") || color.includes("orange-red") || color.includes("narancast");
  const isYellowOrange = color.includes("žuto-narančasta") || color.includes("yellow-orange");
  const isYellow     = color.includes("žuta") || color.includes("yellow") || color.includes("jantar") || color.includes("amber");
  const isGreen      = color.includes("zelen") || color.includes("green");

  // pH override — ako je pH visok, to preuzima prioritet
  const phExhausted = ph !== undefined && ph >= engine.exhaustionPH;
  const phCritical  = ph !== undefined && engine.criticalPH !== undefined && ph >= engine.criticalPH;

  let chemistryStatus: ChemistryStatus;
  let chemistryDesc: string;
  let saturationState: SaturationState;
  let saturationDesc: string;

  if (phExhausted || isYellow || isGreen) {
    chemistryStatus = "iscrpljeno";
    chemistryDesc   = isGreen
      ? "Neutralizirano — otopina sigurna za ispuštanje."
      : "FX chemistry exhausted. Nema slobodne kiseline — reakcija 0%.";
    saturationState = isGreen ? "neutralizirana" : "iscrpljena";
    saturationDesc  = isGreen
      ? "Otopina neutralizirana."
      : "Kemija zasićena. 1 L FX vezao ~0.5 kg kamenca.";
  } else if (phCritical || isYellowOrange) {
    chemistryStatus = "slabi";
    chemistryDesc   = "Kritična točka — pH prešao 3.0. Učinkovitost pala >80%. Dodati svježi FX odmah.";
    saturationState = "kritična";
    saturationDesc  = "pH >3.0 — gotovo bez učinka. Zamijeniti ili nadopuniti FX.";
  } else if (isOrangeRed) {
    chemistryStatus = "slabi";
    chemistryDesc   = "Narančasto-crvena — sredstvo blizu zasićenja. CO₂ mjehurići slabe.";
    saturationState = "aktivna";
    saturationDesc  = "Sredstvo troši kapacitet, razmotriti nadopunu.";
  } else if (isDarkRed) {
    chemistryStatus = "maksimalno_aktivno";
    chemistryDesc   = "Tamno crvena — koncentrat. Ultra jaka reakcija. Pratiti materijale.";
    saturationState = "svjeza";
    saturationDesc  = "Visoka koncentracija — pratiti sigurnost.";
  } else if (isPink) {
    // Pink = optimalna radna zona za FX
    chemistryStatus = "aktivno";
    chemistryDesc   = "Intenzivno ružičasta — optimalna radna zona. CO₂ mjehurići = aktivno otapanje kamenca.";
    saturationState = "aktivna";
    saturationDesc  = "Ciljana radna boja. Nastaviti čišćenje.";
  } else {
    // Fallback na pH ako nema jasne boje
    if (ph !== undefined) {
      if (ph < 1.0) {
        chemistryStatus = "maksimalno_aktivno";
        chemistryDesc   = `pH ${ph} — koncentrat, ultra jaka reakcija.`;
        saturationState = "svjeza";
        saturationDesc  = "Visoka koncentracija.";
      } else if (ph < 2.0) {
        chemistryStatus = "aktivno";
        chemistryDesc   = `pH ${ph.toFixed(1)} — optimalna radna zona.`;
        saturationState = "aktivna";
        saturationDesc  = "Aktivna zona.";
      } else if (ph < 3.0) {
        chemistryStatus = "slabi";
        chemistryDesc   = `pH ${ph.toFixed(1)} — sredstvo usporava.`;
        saturationState = "aktivna";
        saturationDesc  = "Razmotriti nadopunu.";
      } else {
        chemistryStatus = "iscrpljeno";
        chemistryDesc   = `pH ${ph.toFixed(1)} — FX chemistry exhausted. Add fresh chemistry or start new cycle.`;
        saturationState = "iscrpljena";
        saturationDesc  = "Zasićeno.";
      }
    } else {
      chemistryStatus = "nepoznato";
      chemistryDesc   = "Unesite boju ili pH za prikaz interpretacije.";
      saturationState = "nepoznata";
      saturationDesc  = "Nedostaju podaci.";
    }
  }

  // Reakcija — CO₂ bubbling dominantno za FX
  const reactionStrength = bubblingToReactionStrength(bubbles, visibleReaction);
  let reactionDesc: string;
  if (reactionStrength === "jaka") {
    reactionDesc = engine.bubblingLogic?.strongBubblingMeaning ?? "Jak CO₂ bubbling — aktivno otapanje.";
  } else if (reactionStrength === "normalna") {
    reactionDesc = engine.bubblingLogic?.weakBubblingMeaning ?? "Bubbling prisutan — reakcija aktivna.";
  } else if (reactionStrength === "slaba") {
    reactionDesc = "CO₂ mjehurići slabe — sredstvo blizu zasićenja.";
  } else if (reactionStrength === "nema") {
    reactionDesc = isPink
      ? engine.bubblingLogic?.noBubblingMeaning ?? "Ružičasta + nema mjehurića = sustav čist."
      : "Nema CO₂ reakcije — kemija iscrpljena ili sustav čist.";
  } else {
    reactionDesc = "Nije moguće procijeniti snagu reakcije.";
  }

  // Thermal
  const thermalLevel = temp !== undefined ? getThermalLevel(engine.thermalModel, temp) : undefined;
  const thermalWarning =
    thermalLevel?.level === "warning" ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    thermalLevel?.level === "caution" ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    thermalLevel?.level === "slow"    ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    undefined;

  // Warnings
  const warnings: LiveWarning[] = [];
  if (phCritical && !phExhausted) {
    warnings.push({ level: "warning", message: "Kritična točka pH 3.0 — učinkovitost pala >80%. Dodati svježi FX odmah." });
  }
  if (thermalLevel?.level === "warning") {
    warnings.push({ level: "warning", message: thermalWarning! });
  } else if (thermalLevel?.level === "caution") {
    warnings.push({ level: "caution", message: thermalWarning! });
  }
  if (engine.compatibility.note && (isDarkRed || (ph !== undefined && ph < 1.0))) {
    warnings.push({ level: "caution", message: "Ultra jaka koncentracija — nije kompatibilno s aluminijem i galvaniziranim čelikom." });
  }

  // Recommendation
  let recommendation: LiveRecommendation;
  let recommendationDetail: string;
  if (chemistryStatus === "iscrpljeno") {
    recommendation = "dodati_kemiju";
    recommendationDetail = "Add fresh chemistry or start new cycle.";
    if (isGreen) {
      recommendation = "zavrsiti_ciklus";
      recommendationDetail = "Otopina neutralizirana. Ispustiti i isprati do bistrog izljeva.";
    }
  } else if (saturationState === "kritična") {
    recommendation = "dodati_kemiju";
    recommendationDetail = "Dodati svježi FX odmah — pH prešao kritičnu točku 3.0.";
  } else if (chemistryStatus === "slabi") {
    recommendation = "pratiti_stanje";
    recommendationDetail = "Sredstvo slabi — pratiti i razmotriti nadopunu FX.";
  } else if (chemistryStatus === "maksimalno_aktivno") {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Koncentrat — pratiti materijale i temperature.";
  } else {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Ružičasta boja + mjehurići = aktivno otapanje. Nastaviti ciklus.";
  }
  if (thermalLevel?.level === "warning") recommendation = "smanjiti_temperaturu";

  // Finish cycle — FX specifično: stable pink + nema bubblinga ILI kemija iscrpljena
  const stablePink = isPink;
  const noBubbling = reactionStrength === "nema";
  const exhausted  = chemistryStatus === "iscrpljeno";
  const finishCycleState: FinishCycleState = {
    ready: (stablePink && noBubbling) || exhausted,
    criteria: engine.finishCycleCriteria.criteria.map((c) => ({
      label: c,
      met: c.toLowerCase().includes("ružičasta") || c.toLowerCase().includes("ruzicasta") ? stablePink
         : c.toLowerCase().includes("nema") && c.toLowerCase().includes("bubbling") || c.toLowerCase().includes("mjehuric") ? noBubbling
         : c.toLowerCase().includes("žut") || c.toLowerCase().includes("yellow") ? exhausted
         : null,
    })),
  };

  return {
    engineId: engine.id,
    engineName: engine.name,
    chemistryStatus,
    chemistryStatusLabel: CHEMISTRY_STATUS_LABEL[chemistryStatus],
    chemistryDescription: chemistryDesc,
    interpretedColor: deriveInterpretedColor(engine, m, chemistryStatus),
    reactionStrength,
    reactionStrengthLabel: REACTION_STRENGTH_LABEL[reactionStrength],
    reactionDescription: reactionDesc,
    saturationState,
    saturationStateLabel: SATURATION_STATE_LABEL[saturationState],
    saturationDescription: saturationDesc,
    thermalLevel,
    thermalWarning,
    warnings,
    recommendation,
    recommendationLabel: LIVE_RECOMMENDATION_LABEL[recommendation],
    recommendationDetail,
    finishCycleState,
    debug: {
      phValue: ph,
      colorIndicator: m.colorIndicator,
      bubblesPresent: bubbles,
      temperatureC: temp,
      flowLMin: m.flowLMin,
      activeIndicatorModel: engine.indicatorModel,
      activeSaturationModel: engine.saturationModel,
      activeWarningModel: engine.warningModel,
    },
  };
}

// ─── DS-40 interpretacija: contamination + sludge + saturation ───────────────

function interpretDS40(
  engine: ProductEngine,
  m: Mjerenje,
): LiveReactionState {
  const ph = m.ph ?? m.pH;
  const foam = m.foamLevel;
  const magnetFilter = m.magnetFilterActive;
  const color = (m.colorIndicator ?? "").toLowerCase();
  const temp = m.temperatureC ?? m.temperatura;

  // Contamination state — magnetski filter je primarni signal za DS-40
  let contaminationState: ContaminationState;
  if (magnetFilter === true) {
    contaminationState = "visoka";
  } else if (magnetFilter === false) {
    contaminationState = "niska";
  } else {
    contaminationState = "nepoznata";
  }

  // Chemistry status — boja tamni prema sludge-u (saturation model: color_darkens)
  const isDeepRed    = color.includes("deep red") || color.includes("tamnocrvena") || color.includes("tamno crvena");
  const isPink       = color.includes("pink") || color.includes("ružičasta") || color.includes("magenta");
  const isOrange     = color.includes("orange") || color.includes("narančasta");
  const isYellowDirty = color.includes("yellow") || color.includes("žuta") || color.includes("prljav") || color.includes("dirty");

  let chemistryStatus: ChemistryStatus;
  let chemistryDesc: string;
  let saturationState: SaturationState;
  let saturationDesc: string;

  if (ph !== undefined) {
    if (ph < 2.5) {
      chemistryStatus = "maksimalno_aktivno";
      chemistryDesc   = "pH <2.5 — svježa otopina, maksimalna snaga. Deep Red boja.";
      saturationState = "svjeza";
      saturationDesc  = "Daleko od iscrpljenosti.";
    } else if (ph < 3.5) {
      chemistryStatus = "aktivno";
      chemistryDesc   = "pH 2.5–3.5 — aktivna radna zona (Pink/Magenta). Pratiti magnetski filter.";
      saturationState = "aktivna";
      saturationDesc  = "Radna zona — pratiti sludge.";
    } else if (ph < 5.0) {
      chemistryStatus = "slabi";
      chemistryDesc   = "pH 3.5–5.0 — Orange zona. Sredstvo slabi. Pratiti magnetski filter.";
      saturationState = "kritična";
      saturationDesc  = magnetFilter ? "Magnetit se još skuplja — razmotriti nadopunu DS-40." : "Razmotriti završetak ako je magnetski filter čist.";
    } else {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "pH >5.0 — Yellow/Dirty Green. Bez kemijskog učinka.";
      saturationState = "iscrpljena";
      saturationDesc  = "Dodati DS-40 ili neutralizirati s System Neutraliserom.";
    }
  } else {
    // Fallback na boju
    if (isDeepRed) {
      chemistryStatus = "maksimalno_aktivno";
      chemistryDesc   = "Deep Red — svježa otopina, maksimalna snaga.";
      saturationState = "svjeza";
      saturationDesc  = "Svježa otopina.";
    } else if (isPink) {
      chemistryStatus = "aktivno";
      chemistryDesc   = "Pink/Magenta (~pH 3.0) — aktivna radna zona.";
      saturationState = "aktivna";
      saturationDesc  = "Radna zona.";
    } else if (isOrange) {
      chemistryStatus = "slabi";
      chemistryDesc   = "Orange — sredstvo slabi. Pratiti magnetski filter.";
      saturationState = "kritična";
      saturationDesc  = "Blizu iscrpljenosti.";
    } else if (isYellowDirty) {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "Yellow/Dirty Green — bez kemijskog učinka.";
      saturationState = "iscrpljena";
      saturationDesc  = "Dodati DS-40 ili neutralizirati.";
    } else {
      chemistryStatus = "nepoznato";
      chemistryDesc   = "Unesite pH ili boju za prikaz interpretacije.";
      saturationState = "nepoznata";
      saturationDesc  = "Nedostaju podaci.";
    }
  }

  // Reaction strength — foam + sludge za DS-40
  const reactionStrength = foamToReactionStrength(foam);
  let reactionDesc: string;
  if (reactionStrength === "jaka") {
    reactionDesc = "Jaka pjena — aktivno otapanje kamenca i magnetita.";
  } else if (reactionStrength === "normalna" || reactionStrength === "slaba") {
    reactionDesc = "Pjena prisutna — reakcija aktivna ali usporava.";
  } else if (reactionStrength === "nema") {
    reactionDesc = engine.foamLogic?.noFoamMeaning ?? "Nema pjene — reakcija završena.";
  } else {
    reactionDesc = "Pratiti pjenu i magnetski filter.";
  }

  // Thermal
  const thermalLevel = temp !== undefined ? getThermalLevel(engine.thermalModel, temp) : undefined;
  const thermalWarning =
    thermalLevel?.level === "warning" ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    thermalLevel?.level === "slow"    ? `Temperatura ${temp}°C — ${thermalLevel.efficiency}` :
    undefined;

  // Warnings
  const warnings: LiveWarning[] = [];
  if (magnetFilter === true) {
    warnings.push({ level: "info", message: engine.sludgeLogic?.magnetFilterActiveMeaning ?? "Magnetski filter skuplja crni talog — nastaviti dok se ne zaustavi." });
  }
  if (foam === "jaka" || foam === "vrlo_jaka") {
    const colorStr = (m.colorIndicator ?? "").toLowerCase();
    if (colorStr.includes("crn") || colorStr.includes("tamn") || colorStr.includes("black")) {
      warnings.push({ level: "warning", message: engine.sludgeLogic?.indicatorOverrideWarning ?? "Crni mulj može zamutiti indikator boje — rezultat boje nije pouzdan." });
    }
  }
  if (thermalLevel?.level === "warning") {
    warnings.push({ level: "warning", message: thermalWarning! });
  }
  if (engine.compatibility.note) {
    warnings.push({ level: "info", message: engine.compatibility.note });
  }

  // Recommendation
  let recommendation: LiveRecommendation;
  let recommendationDetail: string;
  if (chemistryStatus === "iscrpljeno") {
    recommendation = magnetFilter ? "dodati_kemiju" : "zavrsiti_ciklus";
    recommendationDetail = magnetFilter
      ? "Kemija iscrpljena ali magnetski filter skuplja talog — dodati DS-40."
      : "Kemija iscrpljena i magnetski filter čist. Dodati System Neutraliser i isprati.";
  } else if (contaminationState === "visoka") {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Magnetski filter skuplja crni talog — nastaviti dok se ne zaustavi skupljanje.";
  } else if (saturationState === "kritična") {
    recommendation = magnetFilter !== false ? "dodati_kemiju" : "pratiti_stanje";
    recommendationDetail = "Orange zona — sredstvo slabi. Pratiti magnetski filter.";
  } else {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Nastaviti čišćenje. Pratiti magnetski filter za sludge.";
  }
  if (magnetFilter === false && chemistryStatus !== "maksimalno_aktivno") {
    recommendation = "zavrsiti_ciklus";
    recommendationDetail = "Magnetski filter više ne skuplja talog. Razmotriti završetak i neutralizaciju.";
  }
  if (thermalLevel?.level === "warning") recommendation = "smanjiti_temperaturu";

  // Finish cycle — DS-40: magnetski filter inaktivan + nema pjene + stabilna boja
  const magnetDone = magnetFilter === false;
  const noFoam = reactionStrength === "nema";
  const stableColor = isYellowDirty || (ph !== undefined && ph >= engine.exhaustionPH);
  const finishCycleState: FinishCycleState = {
    ready: magnetDone && noFoam,
    criteria: engine.finishCycleCriteria.criteria.map((c) => ({
      label: c,
      met: c.toLowerCase().includes("magnetsk") ? magnetDone
         : c.toLowerCase().includes("nema pjene") ? noFoam
         : c.toLowerCase().includes("boja") ? stableColor
         : null,
    })),
  };

  return {
    engineId: engine.id,
    engineName: engine.name,
    chemistryStatus,
    chemistryStatusLabel: CHEMISTRY_STATUS_LABEL[chemistryStatus],
    chemistryDescription: chemistryDesc,
    interpretedColor: deriveInterpretedColor(engine, m, chemistryStatus),
    reactionStrength,
    reactionStrengthLabel: REACTION_STRENGTH_LABEL[reactionStrength],
    reactionDescription: reactionDesc,
    saturationState,
    saturationStateLabel: SATURATION_STATE_LABEL[saturationState],
    saturationDescription: saturationDesc,
    contaminationState,
    thermalLevel,
    thermalWarning,
    warnings,
    recommendation,
    recommendationLabel: LIVE_RECOMMENDATION_LABEL[recommendation],
    recommendationDetail,
    finishCycleState,
    debug: {
      phValue: ph,
      colorIndicator: m.colorIndicator,
      foamLevel: foam,
      temperatureC: temp,
      magnetFilterActive: magnetFilter,
      flowLMin: m.flowLMin,
      activeIndicatorModel: engine.indicatorModel,
      activeSaturationModel: engine.saturationModel,
      activeWarningModel: engine.warningModel,
    },
  };
}

// ─── Rector BCP interpretacija: yellow→red model + thermal + inhibitor warnings ─

function interpretRectorBCP(
  engine: ProductEngine,
  m: Mjerenje,
): LiveReactionState {
  const ph = m.ph ?? m.pH;
  const bubbles = m.bubblesPresent;
  const visibleReaction = m.visibleReaction as string | undefined;
  const color = (m.colorIndicator ?? "").toLowerCase();
  const temp = m.temperatureC ?? m.temperatura;
  const foam = m.foamLevel;

  // Spec: Rector mora koristiti yellow→red model
  // Žuta (pH <1.5) → Narančasta (pH 1.5–4.0) → Crvena/Ljubičasta (pH >4.0)
  const isZuta       = color.includes("žut") || color.includes("zut") || color.includes("yellow");
  const isNarancasta = color.includes("narančast") || color.includes("narancasto") || color.includes("orange");
  const isCrvena     = color.includes("crven") || color.includes("red")
                     || color.includes("ljubičast") || color.includes("ljubicasto") || color.includes("purp") || color.includes("violet");

  // Reaction strength — CO₂ bubbling
  const reactionStrength = bubblingToReactionStrength(bubbles, visibleReaction);
  const noBubbling = reactionStrength === "nema";

  let chemistryStatus: ChemistryStatus;
  let chemistryDesc: string;
  let saturationState: SaturationState;
  let saturationDesc: string;

  // Spec primjer: Rector + yellow + pH 1.5 + bubbling → "Optimalna aktivna zona."
  if (ph !== undefined) {
    if (ph < 1.5) {
      // Spec: "Optimalna aktivna zona. Kiselina aktivno otapa kamenac."
      chemistryStatus = "maksimalno_aktivno";
      chemistryDesc   = noBubbling
        ? "Boja stabilno žuta, nema CO₂ reakcije. Kamenac uklonjen — čišćenje završeno."
        : "Optimalna aktivna zona. Kiselina aktivno otapa kamenac.";
      saturationState = noBubbling ? "aktivna" : "svjeza";
      saturationDesc  = noBubbling ? "Žuta + nema bubblinga ≥20 min — sustav čist." : "pH <1.5 — maksimalna snaga.";
    } else if (ph < 4.0) {
      chemistryStatus = "slabi";
      chemistryDesc   = "Sredstvo postupno gubi snagu, ali reakcija još traje.";
      saturationState = "aktivna";
      saturationDesc  = `pH ${ph.toFixed(1)} — saturacija 1.5–4.0. Pratiti brzinu rasta pH.`;
    } else {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "Otopina zasićena. Kiselina bez kemijskog učinka. Exhaustion zone.";
      saturationState = "iscrpljena";
      saturationDesc  = "pH >4.0 — nema slobodne energije za otapanje kamenca.";
    }
  } else {
    // Fallback na yellow→red model (boja)
    if (isZuta) {
      chemistryStatus = noBubbling ? "maksimalno_aktivno" : "maksimalno_aktivno";
      chemistryDesc   = noBubbling
        ? "Boja stabilno žuta, nema CO₂ reakcije — kamenac uklonjen."
        : "Optimalna aktivna zona. Kiselina aktivno otapa kamenac.";
      saturationState = "svjeza";
      saturationDesc  = "pH <1.5 zona — maksimalna snaga.";
    } else if (isNarancasta) {
      chemistryStatus = "slabi";
      chemistryDesc   = "Narančasta boja — sredstvo se troši, pH 1.5–3.5.";
      saturationState = "aktivna";
      saturationDesc  = "Saturacija — pratiti stanje.";
    } else if (isCrvena) {
      chemistryStatus = "iscrpljeno";
      chemistryDesc   = "Crvena/ljubičasta — exhaustion zone. pH >4.0, bez kemijskog učinka.";
      saturationState = "iscrpljena";
      saturationDesc  = "Dodati novu količinu sredstva ili završiti ciklus.";
    } else {
      chemistryStatus = "nepoznato";
      chemistryDesc   = "Unesite boju ili pH za prikaz Rector interpretacije.";
      saturationState = "nepoznata";
      saturationDesc  = "Nedostaju podaci.";
    }
  }

  // Reaction description
  let reactionDesc: string;
  if (reactionStrength === "jaka") {
    reactionDesc = engine.bubblingLogic?.strongBubblingMeaning ?? "Jak CO₂ bubbling — aktivno otapanje kamenca.";
  } else if (reactionStrength === "normalna" || reactionStrength === "slaba") {
    reactionDesc = engine.bubblingLogic?.weakBubblingMeaning ?? "CO₂ mjehurići slabe — reakcija usporava.";
  } else if (reactionStrength === "nema") {
    reactionDesc = isZuta
      ? engine.bubblingLogic?.noBubblingMeaning ?? "Nema CO₂ — kamenac uklonjen ili kemija iscrpljena."
      : "Nema CO₂ reakcije — kemija iscrpljena.";
  } else {
    reactionDesc = "Pratiti CO₂ reakciju.";
  }

  // Thermal — Rector specifično: optimalno 35–40°C, inhibitor warning >45°C
  const thermalLevel = temp !== undefined ? getThermalLevel(engine.thermalModel, temp) : undefined;
  let thermalWarning: string | undefined;
  if (thermalLevel?.level === "warning") {
    thermalWarning = `Temperatura ${temp}°C — moguća degradacija inhibitora korozije. Zaustaviti ili smanjiti.`;
  } else if (thermalLevel?.level === "caution") {
    thermalWarning = `Temperatura ${temp}°C — agresivnija reakcija. Povećan rizik za inhibitore korozije.`;
  } else if (thermalLevel?.level === "slow") {
    thermalWarning = `Temperatura ${temp}°C — reakcija spora. Optimalno 35–40°C.`;
  }

  // TEMP OUT Trend — SPEC: TEMP OUT je GLAVNI thermal indikator za descaling
  // Za Rector: rast TEMP OUT → kamenac se uklanja, pad → blokada ili usporavanje
  const tempOutTrendResult = m.tempOutC !== undefined
    ? tempOutTrendAnalysis(m.tempOutC, undefined) // previous se dodaje u live-pregled.tsx via ReactionTrend
    : undefined;

  // Ugradi TEMP OUT trend u chemistryDesc (Rector specifično)
  if (tempOutTrendResult && chemistryStatus !== "iscrpljeno") {
    chemistryDesc = `${chemistryDesc} ${tempOutTrendResult.message}`;
  }

  // Warnings — inhibitor model specifičan za Rector
  const warnings: LiveWarning[] = [];
  if (thermalLevel?.level === "warning") {
    warnings.push({ level: "critical", message: thermalWarning! });
  } else if (thermalLevel?.level === "caution") {
    warnings.push({ level: "caution", message: thermalWarning! });
  } else if (thermalLevel?.level === "slow") {
    warnings.push({ level: "info", message: thermalWarning! });
  }
  // TEMP OUT trend warning — SPEC: TEMP OUT je GLAVNI thermal indikator
  if (tempOutTrendResult?.thermalStatus === "worsening") {
    warnings.push({ level: "caution", message: `TEMP OUT: ${tempOutTrendResult.message}` });
  } else if (tempOutTrendResult?.thermalStatus === "improving") {
    warnings.push({ level: "info", message: `TEMP OUT: ${tempOutTrendResult.message}` });
  }
  // System scale: brzi prelaz u crvenu = velika količina kamenca
  if ((isCrvena || (ph !== undefined && ph >= 4.0)) && reactionStrength === "jaka") {
    warnings.push({ level: "warning", message: "Brzi prelaz u crvenu + jak bubbling — velika količina kamenca u sustavu." });
  }
  // Foam za Rector (sekundarno)
  if (foam === "jaka" || foam === "vrlo_jaka") {
    warnings.push({ level: "info", message: "Intenzivna pjena — prisutni karbonati ili korozijske naslage." });
  }
  // Max trajanje
  const hasDuration = false; // Nema duration u Mjerenje — samo napomena
  if (!hasDuration && chemistryStatus !== "iscrpljeno") {
    warnings.push({ level: "info", message: "Max. ~2 sata kontakta — ne prekoračiti. Obavezna neutralizacija." });
  }

  // Recommendation
  let recommendation: LiveRecommendation;
  let recommendationDetail: string;
  if (chemistryStatus === "iscrpljeno") {
    if (reactionStrength === "jaka") {
      recommendation = "dodati_kemiju";
      recommendationDetail = "Velika količina kamenca — dodati novu količinu sredstva.";
    } else {
      recommendation = "zavrsiti_ciklus";
      recommendationDetail = "Neutralizirati sustav i potpuno isprati. Provjeriti završni pH.";
    }
  } else if (chemistryStatus === "maksimalno_aktivno" && noBubbling) {
    recommendation = "zavrsiti_ciklus";
    recommendationDetail = "Boja žuta, nema CO₂ — čišćenje završeno. Neutralizirati.";
  } else if (chemistryStatus === "slabi") {
    recommendation = "pratiti_stanje";
    recommendationDetail = "Pratriti brzinu rasta pH. Moguće dodavanje novog sredstva.";
  } else {
    recommendation = "nastaviti_ciscenje";
    recommendationDetail = "Nastaviti čišćenje. Ne ostavljati dulje od ~2 sata.";
  }
  if (thermalLevel?.level === "warning") recommendation = "smanjiti_temperaturu";

  // Finish cycle — Rector: stable yellow + nema bubblinga
  const stableYellow = isZuta || (ph !== undefined && ph < 1.5);
  const finishCycleState: FinishCycleState = {
    ready: stableYellow && noBubbling,
    criteria: engine.finishCycleCriteria.criteria.map((c) => ({
      label: c,
      met: c.toLowerCase().includes("žuta") ? stableYellow
         : c.toLowerCase().includes("nema co") || c.toLowerCase().includes("bubbling") ? noBubbling
         : c.toLowerCase().includes("protok") ? (m.flowLMin != null && m.flowLMin > 0)
         : null,
    })),
  };

  return {
    engineId: engine.id,
    engineName: engine.name,
    chemistryStatus,
    chemistryStatusLabel: CHEMISTRY_STATUS_LABEL[chemistryStatus],
    chemistryDescription: chemistryDesc,
    interpretedColor: deriveInterpretedColor(engine, m, chemistryStatus),
    reactionStrength,
    reactionStrengthLabel: REACTION_STRENGTH_LABEL[reactionStrength],
    reactionDescription: reactionDesc,
    saturationState,
    saturationStateLabel: SATURATION_STATE_LABEL[saturationState],
    saturationDescription: saturationDesc,
    thermalLevel,
    thermalWarning,
    warnings,
    recommendation,
    recommendationLabel: LIVE_RECOMMENDATION_LABEL[recommendation],
    recommendationDetail,
    finishCycleState,
    debug: {
      phValue: ph,
      colorIndicator: m.colorIndicator,
      foamLevel: foam,
      bubblesPresent: bubbles,
      temperatureC: temp,
      flowLMin: m.flowLMin,
      activeIndicatorModel: engine.indicatorModel,
      activeSaturationModel: engine.saturationModel,
      activeWarningModel: engine.warningModel,
    },
  };
}

// ─── Generic fallback interpretacija ─────────────────────────────────────────

function interpretGeneric(
  engine: ProductEngine,
  m: Mjerenje,
): LiveReactionState {
  const ph = m.ph ?? m.pH;
  const temp = m.temperatureC ?? m.temperatura;

  let chemistryStatus: ChemistryStatus = "nepoznato";
  let chemistryDesc = "Generička interpretacija — specifični engine nije dostupan.";
  let saturationState: SaturationState = "nepoznata";
  let saturationDesc = "Koristiti specifični engine za točniju interpretaciju.";

  if (ph !== undefined) {
    // Koristiti engine.phZones za klasifikaciju — ne hardcoded pragove
    const matchedZone = engine.phZones.find((z) => {
      const above = z.phMin == null || ph >= z.phMin;
      const below = z.phMax == null || ph <  z.phMax;
      return above && below;
    });

    const exhaustion = engine.exhaustionPH ?? 4.0;
    const weakening  = exhaustion * 0.75; // ~75% do iscrpljenosti = slabi

    if (matchedZone) {
      if (matchedZone.status === "too_strong") {
        chemistryStatus = "maksimalno_aktivno";
        chemistryDesc   = `pH ${ph.toFixed(2)} — ${matchedZone.label}. ${matchedZone.description}`;
        saturationState = "svjeza";
        saturationDesc  = matchedZone.description;
      } else if (matchedZone.status === "optimal" || matchedZone.status === "active") {
        chemistryStatus = ph < 1.5 ? "maksimalno_aktivno" : "aktivno";
        chemistryDesc   = `pH ${ph.toFixed(2)} — ${matchedZone.label}. ${matchedZone.description}`;
        saturationState = "aktivna";
        saturationDesc  = matchedZone.description;
      } else if (matchedZone.status === "weakening") {
        chemistryStatus = "slabi";
        chemistryDesc   = `pH ${ph.toFixed(2)} — ${matchedZone.label}. ${matchedZone.description}`;
        saturationState = "aktivna";
        saturationDesc  = "Pratiti stanje.";
      } else if (matchedZone.status === "exhausted" || matchedZone.status === "neutralized") {
        chemistryStatus = "iscrpljeno";
        chemistryDesc   = `pH ${ph.toFixed(2)} — ${matchedZone.label}. ${matchedZone.description}`;
        saturationState = "iscrpljena";
        saturationDesc  = "Razmotriti zamjenu ili završetak.";
      }
    } else {
      // Fallback ako phZones ne pokrivaju ovaj pH
      if (ph >= exhaustion) {
        chemistryStatus = "iscrpljeno";
        saturationState = "iscrpljena";
        chemistryDesc   = `pH ${ph.toFixed(2)} — sredstvo vjerojatno iscrpljeno (exhaustion pH: ${exhaustion}).`;
        saturationDesc  = "Razmotriti zamjenu ili završetak.";
      } else if (ph >= weakening) {
        chemistryStatus = "slabi";
        saturationState = "aktivna";
        chemistryDesc   = `pH ${ph.toFixed(2)} — reakcija slabi.`;
        saturationDesc  = "Pratiti stanje.";
      } else {
        chemistryStatus = "aktivno";
        saturationState = "aktivna";
        chemistryDesc   = `pH ${ph.toFixed(2)} — otopina aktivna.`;
        saturationDesc  = "Aktivna zona.";
      }
    }
  }

  const thermalLevel = temp !== undefined ? getThermalLevel(engine.thermalModel, temp) : undefined;

  return {
    engineId: engine.id,
    engineName: engine.name,
    chemistryStatus,
    chemistryStatusLabel: CHEMISTRY_STATUS_LABEL[chemistryStatus],
    chemistryDescription: chemistryDesc,
    interpretedColor: deriveInterpretedColor(engine, m, chemistryStatus),
    reactionStrength: "nepoznata",
    reactionStrengthLabel: REACTION_STRENGTH_LABEL["nepoznata"],
    reactionDescription: "Generička interpretacija — koristiti specifični engine.",
    saturationState,
    saturationStateLabel: SATURATION_STATE_LABEL[saturationState],
    saturationDescription: saturationDesc,
    thermalLevel,
    warnings: [],
    recommendation: "pratiti_stanje",
    recommendationLabel: LIVE_RECOMMENDATION_LABEL["pratiti_stanje"],
    recommendationDetail: "Pratiti stanje i unijeti točne podatke za bolu interpretaciju.",
    finishCycleState: {
      ready: false,
      criteria: engine.finishCycleCriteria.criteria.map((c) => ({ label: c, met: null })),
    },
    debug: {
      phValue: ph,
      colorIndicator: m.colorIndicator,
      foamLevel: m.foamLevel,
      bubblesPresent: m.bubblesPresent,
      temperatureC: temp,
      flowLMin: m.flowLMin,
      activeIndicatorModel: engine.indicatorModel,
      activeSaturationModel: engine.saturationModel,
      activeWarningModel: engine.warningModel,
    },
  };
}

// ─── Chemistry Consumption Rate ──────────────────────────────────────────────
// Procjenjuje koliko brzo se kemija troši između dva mjerenja.

export type ChemistryConsumptionRate =
  | "slow"      // pH raste sporo (<0.5 / mjerenje)
  | "normal"    // Normalna potrošnja (0.5–1.5 / mjerenje)
  | "rapid"     // Brza iscrpljenost (>1.5 / mjerenje)
  | "unknown";

export const CHEMISTRY_CONSUMPTION_RATE_LABEL: Record<ChemistryConsumptionRate, string> = {
  slow:    "Spora potrošnja",
  normal:  "Normalna potrošnja",
  rapid:   "Brza iscrpljenost",
  unknown: "Nepoznato",
};

// ─── ReactionTrend — analiza trenda između dva mjerenja ───────────────────────

export interface ReactionTrend {
  /** Trend pH između prethodnog i trenutnog mjerenja */
  phTrend: "raste" | "stagnira" | "pada" | "nepoznato";
  /** Delta pH (trenutni - prethodni) */
  phDelta?: number;
  /** Trend protoka */
  flowTrend: "raste" | "stagnira" | "pada" | "nagli_rast" | "nagli_pad" | "nepoznato";
  /** Delta protoka (L/min) */
  flowDelta?: number;
  /** Saturation trend — procjena na osnovu pH + boje */
  saturationTrend: "stabilno" | "raste" | "kritično" | "nepoznato";
  /** Procjena potrošnje kemije */
  chemistryConsumptionRate: ChemistryConsumptionRate;
  /** Intenzitet reakcije — kombinacija buublinga, pjene i pH */
  reactionIntensity: "visoka" | "srednja" | "niska" | "nema" | "nepoznata";
  /** TEMP OUT trend analiza — SPEC: TEMP OUT je GLAVNI thermal indikator za descaling */
  tempOutTrend?: TempOutTrendAnalysis;
}

/** Generira ReactionTrend iz prethodnog i trenutnog mjerenja. */
export function generateReactionTrend(
  current: Mjerenje,
  previous: Mjerenje | undefined,
  /** Referentno mjerenje (initial_cycle_measurement) — za TEMP OUT trend analizu */
  referenceMjerenje?: Mjerenje,
): ReactionTrend {
  const curPH   = current.ph  ?? current.pH;
  const prevPH  = previous?.ph ?? previous?.pH;
  const curFlow  = current.flowLMin;
  const prevFlow = previous?.flowLMin;

  // pH trend
  let phTrend: ReactionTrend["phTrend"] = "nepoznato";
  let phDelta: number | undefined;
  if (curPH !== undefined && prevPH !== undefined) {
    phDelta = curPH - prevPH;
    phTrend = Math.abs(phDelta) < 0.1 ? "stagnira" : phDelta > 0 ? "raste" : "pada";
  }

  // Chemistry consumption rate — koliko brzo raste pH
  let chemistryConsumptionRate: ChemistryConsumptionRate = "unknown";
  if (phDelta !== undefined) {
    if (phDelta < 0.5)       chemistryConsumptionRate = "slow";
    else if (phDelta < 1.5)  chemistryConsumptionRate = "normal";
    else                     chemistryConsumptionRate = "rapid";
  }

  // Flow trend
  let flowTrend: ReactionTrend["flowTrend"] = "nepoznato";
  let flowDelta: number | undefined;
  if (curFlow !== undefined && prevFlow !== undefined) {
    flowDelta = curFlow - prevFlow;
    const absDelta = Math.abs(flowDelta);
    if (absDelta < 0.1)       flowTrend = "stagnira";
    else if (flowDelta > 0.5) flowTrend = "nagli_rast";
    else if (flowDelta < -0.5) flowTrend = "nagli_pad";
    else if (flowDelta > 0)   flowTrend = "raste";
    else                      flowTrend = "pada";
  }

  // Saturation trend
  let saturationTrend: ReactionTrend["saturationTrend"] = "nepoznato";
  if (phTrend !== "nepoznato") {
    saturationTrend = chemistryConsumptionRate === "rapid" ? "kritično"
      : phTrend === "raste" ? "raste"
      : "stabilno";
  }

  // Reaction intensity — kombinacija bubblinga + pjene + pH
  const bubbles = current.bubblesPresent;
  const foam    = current.foamLevel;
  const visible = current.visibleReaction as string | undefined;

  let reactionIntensity: ReactionTrend["reactionIntensity"] = "nepoznata";
  const strongBubbling  = visible === "jaka" || visible === "vrlo_jaka";
  const weakBubbling    = visible === "slaba" || visible === "normalna" || bubbles === true;
  const noBubbling      = bubbles === false && !strongBubbling && !weakBubbling;
  const strongFoam      = foam === "jaka" || foam === "vrlo_jaka";
  const weakFoam        = foam === "slaba" || foam === "srednja";
  const noFoam          = foam === "nema";

  if (strongBubbling || strongFoam) {
    reactionIntensity = "visoka";
  } else if (weakBubbling || weakFoam) {
    reactionIntensity = curPH !== undefined && curPH < 2.0 ? "visoka" : "srednja";
  } else if (noBubbling && noFoam) {
    reactionIntensity = "nema";
  } else if (curPH !== undefined) {
    reactionIntensity = curPH < 1.5 ? "visoka" : curPH < 3.5 ? "srednja" : "niska";
  }

  // TEMP OUT trend — SPEC: delta = currentTempOut - referenceTempOut (initial_cycle_measurement)
  // NE koristiti previous mjerenje — koristiti referentno (initial_cycle_measurement)
  const curTempOut = current.tempOutC;
  const refTempOut = referenceMjerenje?.tempOutC;
  const tempOutTrend: TempOutTrendAnalysis | undefined = curTempOut !== undefined
    ? tempOutTrendAnalysis(curTempOut, refTempOut)
    : undefined;

  return {
    phTrend,
    phDelta,
    flowTrend,
    flowDelta,
    saturationTrend,
    chemistryConsumptionRate,
    reactionIntensity,
    tempOutTrend,
  };
}

// ─── DynamicWarning — prošireni warning s priority i kontekstom ───────────────

export interface DynamicWarning {
  /** Kategorija upozorenja */
  category: "chemistry" | "saturation" | "thermal" | "compatibility" | "flow" | "contamination" | "finish_cycle";
  level: WarningLevel;
  /** Kratki naslov (1–5 riječi) */
  title: string;
  /** Puni opis — product-specific */
  message: string;
  /** Preporučena akcija */
  action?: string;
  /** Trend koji je potakao ovaj warning (za prikaz konteksta) */
  triggeredBy?: string;
}

// ─── generateDynamicWarnings() — centralna funkcija za sve warninge ───────────
//
// Analizira: engine + currentMeasurement + previousMeasurement + sessionTrend
// Vraća: sortirani niz DynamicWarning, poredani critical → warning → caution → info
//
// VAŽNO: Svi warningi su product-specific — dolaze iz enginea, ne iz generalnih pravila.

export function generateDynamicWarnings(
  engine: ProductEngine,
  current: Mjerenje,
  previous?: Mjerenje,
  sessionTrend?: ReactionTrend,
): DynamicWarning[] {
  const warnings: DynamicWarning[] = [];
  const trend = sessionTrend ?? (previous ? generateReactionTrend(current, previous) : undefined);

  const ph    = current.ph ?? current.pH;
  const temp  = current.temperatureC ?? current.temperatura;
  const color = (current.colorIndicator ?? "").toLowerCase();
  const bubbles       = current.bubblesPresent;
  const visibleReaction = current.visibleReaction as string | undefined;
  const foam          = current.foamLevel;
  const magnetFilter  = current.magnetFilterActive;
  const flowLMin      = current.flowLMin;

  const bubblingStrength = bubblingToReactionStrength(bubbles, visibleReaction);

  // ── 1. CHEMISTRY WARNINGS — per-engine saturation logika ─────────────────

  if (engine.indicatorModel === "color+bubbles") {
    // ScaleBreaker FX: yellow + pH >3 + bubbling slab/nema → chemistry exhausted
    const isYellow = color.includes("žuta") || color.includes("yellow") || color.includes("jantar");
    const phHigh   = ph !== undefined && ph >= 3.0;
    const weakOrNoBubbling = bubblingStrength === "nema" || bubblingStrength === "slaba";
    if (isYellow && (phHigh || weakOrNoBubbling)) {
      warnings.push({
        category: "chemistry",
        level: "critical",
        title: "FX chemistry exhausted",
        message: "FX chemistry exhausted.",
        action: "Add fresh chemistry or start new cycle.",
        triggeredBy: isYellow ? "Žuta boja" : `pH ${ph?.toFixed(1)}`,
      });
    } else if (ph !== undefined && ph >= (engine.criticalPH ?? 3.0) && ph < engine.exhaustionPH) {
      warnings.push({
        category: "chemistry",
        level: "warning",
        title: "Kritičan pH",
        message: `Kritična točka pH ${ph.toFixed(1)} — učinkovitost pala >80%.`,
        action: "Dodati svježi FX odmah.",
        triggeredBy: `pH ${ph.toFixed(1)}`,
      });
    }
  }

  if (engine.indicatorModel === "color+foam+sludge") {
    // DS-40: orange/red + contamination visoka → saturation reached
    const isOrangeRed = color.includes("narančast") || color.includes("orange") || color.includes("crven") || color.includes("red");
    const highContam  = magnetFilter === true;
    if (isOrangeRed && highContam) {
      warnings.push({
        category: "saturation",
        level: "warning",
        title: "DS-40 saturacija",
        message: "DS-40 saturation reached.\nPossible heavy sludge contamination.",
        action: "Dodati novu količinu DS-40 ili razmotriti završetak ciklusa.",
        triggeredBy: "Narančasta/crvena boja + aktivan magnetski filter",
      });
    }
    // Contamination warning — crna/tamna otopina
    const isDarkBlack = color.includes("crn") || color.includes("black") || color.includes("tamn") || color.includes("dark");
    if (isDarkBlack) {
      warnings.push({
        category: "contamination",
        level: "warning",
        title: "Black sludge",
        message: "Moguća velika količina magnetita ili black sludge.",
        action: "Provjeriti magnetski filter. Indikator boje može biti nepouzdan.",
        triggeredBy: "Tamna/crna boja otopine",
      });
    }
    // Smeđa/prljava boja (DS-40 specifično za koroziju)
    const isBrownDirty = color.includes("smeđ") || color.includes("prljav") || color.includes("brown") || color.includes("dirty");
    if (isBrownDirty) {
      warnings.push({
        category: "contamination",
        level: "caution",
        title: "Vizualni indikator",
        message: "Vizualni indikator može biti nepouzdan zbog korozije ili magnetita.",
        triggeredBy: "Smeđa/prljava boja otopine",
      });
    }
  }

  if (engine.indicatorModel === "color+bubbles+pH") {
    // Rector BCP: brzi prelaz u crvenu + brzi rast pH → velika količina kamenca
    const isCrvena = color.includes("crven") || color.includes("red") || color.includes("ljubičast") || color.includes("purp");
    const rapidConsumption = trend?.chemistryConsumptionRate === "rapid";
    const jakiBubbling = bubblingStrength === "jaka";
    if (isCrvena && (rapidConsumption || jakiBubbling)) {
      warnings.push({
        category: "saturation",
        level: "warning",
        title: "Brza saturacija",
        message: "Velika količina kamenca.\nKemija se brzo zasićuje.",
        action: "Dodati novu količinu sredstva.",
        triggeredBy: isCrvena && rapidConsumption ? "Crvena boja + brzi rast pH" : "Crvena boja + jak bubbling",
      });
    } else if (isCrvena) {
      warnings.push({
        category: "chemistry",
        level: "warning",
        title: "Iscrpljeno",
        message: "Otopina zasićena — pH iznad 4.0. Nema slobodne kiseline.",
        action: "Dodati novu količinu sredstva ili neutralizirati i završiti ciklus.",
        triggeredBy: "Crvena/ljubičasta boja",
      });
    }
    // Max trajanje
    warnings.push({
      category: "compatibility",
      level: "info",
      title: "Vremensko ograničenje",
      message: "Max. ~2 sata kontakta — ne prekoračiti. Obavezna neutralizacija.",
    });
  }

  // ── 2. SATURATION WARNINGS — trend based ─────────────────────────────────

  if (trend?.saturationTrend === "kritično") {
    // Samo ako još nije dodan chemistry warning za isti problem
    const hasChemWarn = warnings.some((w) => w.category === "chemistry" && w.level === "critical");
    if (!hasChemWarn) {
      warnings.push({
        category: "saturation",
        level: "warning",
        title: "Brza iscrpljenost",
        message: `pH raste brzo (Δ ${trend.phDelta !== undefined ? "+" + trend.phDelta.toFixed(1) : "?"}) — kemija se brzo zasićuje.`,
        action: "Razmotriti dodavanje svježe kemije.",
        triggeredBy: "Brzi rast pH između mjerenja",
      });
    }
  }

  // ── 3. THERMAL WARNINGS — per-engine temp limiti ─────────────────────────

  if (temp !== undefined) {
    const thermalLevel = getThermalLevel(engine.thermalModel, temp);
    if (thermalLevel?.level === "warning") {
      // FX: >70°C, Rector: >50°C, DS-40: >60°C
      const engineSpecificMsg =
        engine.indicatorModel === "color+bubbles"    ? "Moguće slabljenje inhibitora." :
        engine.indicatorModel === "color+bubbles+pH" ? "Povećan rizik za aluminij i inhibitore." :
        engine.indicatorModel === "color+foam+sludge"? "Moguća degradacija inhibitora ili preagresivna reakcija." :
        thermalLevel.efficiency;
      warnings.push({
        category: "thermal",
        level: "critical",
        title: `Previsoka temperatura`,
        message: `Temperatura ${temp}°C — ${engineSpecificMsg}`,
        action: "Smanjiti temperaturu odmah.",
        triggeredBy: `${temp}°C (max: ${engine.compatibility.maxTempC}°C)`,
      });
    } else if (thermalLevel?.level === "caution") {
      warnings.push({
        category: "thermal",
        level: "caution",
        title: "Povišena temperatura",
        message: `Temperatura ${temp}°C — ${thermalLevel.efficiency}`,
        action: "Pratiti temperaturu.",
        triggeredBy: `${temp}°C`,
      });
    } else if (thermalLevel?.level === "slow") {
      warnings.push({
        category: "thermal",
        level: "info",
        title: "Niska temperatura",
        message: `Temperatura ${temp}°C — ${thermalLevel.efficiency}`,
        action: `Optimum: ${engine.indicatorModel === "color+bubbles+pH" ? "35–40" : "40–50"}°C.`,
        triggeredBy: `${temp}°C`,
      });
    }
  }

  // ── 4. COMPATIBILITY WARNINGS ─────────────────────────────────────────────

  if (ph !== undefined && ph < 1.0 && engine.indicatorModel !== "color+bubbles+pH") {
    warnings.push({
      category: "compatibility",
      level: "caution",
      title: "Jako kiselinska",
      message: "Jako kiselinska otopina (pH <1.0) — koristiti PPE.",
      triggeredBy: `pH ${ph.toFixed(1)}`,
    });
  }

  // ── 5. FLOW WARNINGS ─────────────────────────────────────────────────────

  if (trend?.flowTrend === "nagli_pad") {
    warnings.push({
      category: "flow",
      level: "warning",
      title: "Nagli pad protoka",
      message: "Moguće odlomljeni kamenac ili blokada.",
      action: "Provjeriti sustav i filter.",
      triggeredBy: `Pad protoka: ${trend.flowDelta !== undefined ? trend.flowDelta.toFixed(1) : "?"} L/min`,
    });
  } else if (trend?.flowTrend === "nagli_rast") {
    warnings.push({
      category: "flow",
      level: "info",
      title: "Nagli rast protoka",
      message: "Moguće probijen čep kamenca.",
      action: "Nastaviti čišćenje — dobro napredovanje.",
      triggeredBy: `Rast protoka: +${trend.flowDelta !== undefined ? trend.flowDelta.toFixed(1) : "?"} L/min`,
    });
  } else if (flowLMin !== undefined && flowLMin < 0.2 && flowLMin > 0) {
    warnings.push({
      category: "flow",
      level: "caution",
      title: "Nizak protok",
      message: "Protok vrlo nizak — moguće djelomično začepljenje.",
      triggeredBy: `${flowLMin.toFixed(1)} L/min`,
    });
  }

  // ── 6. CONTAMINATION WARNINGS (DS-40 specifično) ──────────────────────────

  if (engine.indicatorModel === "color+foam+sludge") {
    if (magnetFilter === true) {
      const existing = warnings.some((w) => w.category === "contamination");
      if (!existing) {
        warnings.push({
          category: "contamination",
          level: "info",
          title: "Magnetski filter aktivan",
          message: engine.sludgeLogic?.magnetFilterActiveMeaning ?? "Magnetski filter skuplja crni talog — nastaviti.",
          triggeredBy: "Magnetski filter = aktivan",
        });
      }
    } else if (magnetFilter === false && (foam === "nema" || foam === "slaba")) {
      warnings.push({
        category: "finish_cycle",
        level: "info",
        title: "Filter inaktivan",
        message: engine.sludgeLogic?.magnetFilterInactiveMeaning ?? "Magnetski filter ne skuplja više talog — razmotriti završetak.",
        action: "Dodati System Neutraliser i isprati.",
        triggeredBy: "Magnetski filter = inaktivan + nema pjene",
      });
    }
  }

  // ── 7. FINISH-CYCLE SUGGESTIONS ───────────────────────────────────────────

  if (engine.indicatorModel === "color+bubbles") {
    // FX: stable pink + nema bubblinga → završiti
    const isPink = color.includes("ružičast") || color.includes("pink");
    const noBubblesNow = bubblingStrength === "nema";
    if (isPink && noBubblesNow) {
      warnings.push({
        category: "finish_cycle",
        level: "info",
        title: "Ciklus završen",
        message: "Stable pink + nema bubblinga — čišćenje završeno.",
        action: "Ispustiti i isprati do bistrog izljeva.",
        triggeredBy: "Ružičasta boja + nema CO₂",
      });
    }
  }

  if (engine.indicatorModel === "color+bubbles+pH") {
    // Rector: stable yellow + nema bubblinga → završiti
    const isYellow = color.includes("žut") || color.includes("yellow");
    const noBubblesNow = bubblingStrength === "nema";
    if (isYellow && noBubblesNow) {
      warnings.push({
        category: "finish_cycle",
        level: "info",
        title: "Ciklus završen",
        message: "Stable yellow + nema bubblinga — kamenac uklonjen.",
        action: "Neutralizirati sustav i isprati.",
        triggeredBy: "Žuta boja + nema CO₂",
      });
    }
  }

  if (engine.indicatorModel === "color+foam+sludge") {
    // DS-40: stable red/pink + sludge reakcija stala → završiti
    const isStableRedPink = color.includes("ružičast") || color.includes("pink") || color.includes("crven") || color.includes("red");
    const noFoamNow = foam === "nema" || foam === "slaba";
    if (isStableRedPink && noFoamNow && magnetFilter === false) {
      warnings.push({
        category: "finish_cycle",
        level: "info",
        title: "Ciklus završen",
        message: "Stable red/pink + sludge reakcija stala — čišćenje završeno.",
        action: "Dodati System Neutraliser i isprati.",
        triggeredBy: "Crvena/ružičasta + nema pjene + filter inaktivan",
      });
    }
  }

  // ── Sortiranje: critical → warning → caution → info ──────────────────────

  const PRIORITY: Record<WarningLevel, number> = {
    critical: 0,
    warning:  1,
    caution:  2,
    info:     3,
  };

  return warnings.sort((a, b) => PRIORITY[a.level] - PRIORITY[b.level]);
}

// ─── generateLiveInterpretation — glavna funkcija ─────────────────────────────
//
// Jedina točka ulaza za svu live interpretaciju.
// Dispatch prema engine.indicatorModel — svaki product ima vlastitu logiku.
//
// VAŽNO: Isti podaci (npr. yellow + pH 1.5 + bubbling) daju RAZLIČITE
// rezultate za Rector vs FX vs DS-3 — prema specu.

export function generateLiveInterpretation(
  engine: ProductEngine,
  measurement: Mjerenje,
): LiveReactionState {
  switch (engine.indicatorModel) {
    case "color+foam":
      return interpretDS3(engine, measurement);

    case "color+bubbles":
      return interpretScaleBreakerFX(engine, measurement);

    case "color+foam+sludge":
      return interpretDS40(engine, measurement);

    case "color+bubbles+pH":
      return interpretRectorBCP(engine, measurement);

    case "generic":
    default:
      return interpretGeneric(engine, measurement);
  }
}
