// ─── Product Engine Types ─────────────────────────────────────────────────────
//
// Centralni tipovi za Product Engine sustav.
// Svaki proizvod mora imati vlastiti engine objekt koji opisuje svu logiku
// interpretacije, pH zona, indikatora i upozorenja.
//
// VAŽNO: Engine je source of truth za svu live interpretaciju.
// Nikad ne koristiti hardcoded konstante u komponentama — sve mora dolaziti
// iz odgovarajućeg ProductEngine objekta.

import type { FoamLevel } from "./types";

// ─── Engine identifikatori ────────────────────────────────────────────────────

export type ProductEngineId =
  | "ds3"
  | "scalebreaker_fx"
  | "ds40"
  | "rector_descaler"
  | "generic";

// ─── Indicator model ─────────────────────────────────────────────────────────

export type EngineIndicatorModel =
  | "color+foam"          // Fernox DS-3: Žuta→Zelena→Plava + pjena
  | "color+bubbles"       // Kamco ScaleBreaker FX: Tamno crvena→Ružičasta→Žuta + mjehurići
  | "color+foam+sludge"   // Fernox DS-40: Deep Red→Pink→Orange→Yellow + pjena + sludge
  | "color+bubbles+pH"    // Rector BCP: Žuta→Narančasta→Crvena + bubbling + pH
  | "generic";

// ─── Saturation model ────────────────────────────────────────────────────────

export type EngineSaturationModel =
  | "foam_stops"      // DS-3: nema pjene = iscrpljeno
  | "color_pH_3"      // ScaleBreaker FX: kritična točka pH 3.0 (>80% pad)
  | "color_darkens"   // DS-40: boja tamni prema sludge-u
  | "pH_threshold"    // Rector BCP: pH >4.0 = iscrpljeno
  | "generic_pH";

// ─── Warning model ───────────────────────────────────────────────────────────

export type EngineWarningModel =
  | "foam_based"      // DS-3: upozorenja bazirana na pjeni
  | "magnetit"        // DS-40: magnetit / black sludge detekcija
  | "critical_pH_3"   // ScaleBreaker FX: kritični pH 3.0
  | "inhibitor"       // Rector BCP: upozorenja za degradaciju inhibitora
  | "generic";

// ─── Thermal model definition ────────────────────────────────────────────────

export interface EngineThermalLevel {
  rangeLabel: string;
  tempMin: number;
  tempMax: number;
  efficiency: string;
  level: "slow" | "normal" | "optimal" | "caution" | "warning";
}

// ─── Color zone definition ────────────────────────────────────────────────────

export interface EngineColorZone {
  /** Naziv boje — mora odgovarati colorIndicator vrijednostima u Mjerenju */
  colorName: string;
  /** Hex boja za UI prikaz */
  colorHex: string;
  /** pH raspon ove zone (optional) */
  phMin?: number;
  phMax?: number;
  /** Kratki label */
  label: string;
  /** Opis za serviser */
  description: string;
  /** Kemijsko stanje u ovoj zoni */
  chemicalStrength: "maksimalno" | "aktivno" | "slabi" | "iscrpljeno" | "neutralizirano";
  /** Preporučena akcija */
  action: string;
}

// ─── Finish cycle criteria ────────────────────────────────────────────────────

export interface EngineFinishCycleCriteria {
  /** Lista kriterija za završetak ciklusa — prikazati kao checklist */
  criteria: string[];
  /** Napomena za servisera */
  note?: string;
}

// ─── pH zone definition ──────────────────────────────────────────────────────

export interface EnginePHZone {
  phMin?: number;
  phMax?: number;
  label: string;
  status: "too_strong" | "active" | "optimal" | "weakening" | "exhausted" | "neutralized";
  description: string;
}

// ─── Compatibility model ─────────────────────────────────────────────────────

export interface EngineCompatibility {
  /** Maksimalna sigurna temperatura u °C */
  maxTempC: number;
  /** Minimalna temperatura rada u °C */
  minTempC: number;
  /** Maksimalna preporučena koncentracija (%) */
  maxConcentration: number;
  /** Maksimalno preporučeno trajanje ciklusa u minutama */
  maxCycleDurationMinutes: number;
  /** Zahtijeva li obaveznu neutralizaciju */
  neutralizationRequired: boolean;
  /** Zahtijeva li ispiranje */
  rinseRequired: boolean;
  /** Napomena o kompatibilnosti */
  note?: string;
}

// ─── Foam logic (za DS-3 i DS-40) ────────────────────────────────────────────

export interface EngineFoamLogic {
  /** Pjena = aktivna reakcija */
  foamActiveLevel: FoamLevel[];
  /** Pjena slabi = reakcija usporava */
  foamWeakeningLevel: FoamLevel[];
  /** Nema pjene = iscrpljeno */
  noFoamMeaning: string;
  /** Aktivna pjena = nema kamenca (bijela) */
  whiteFoamMeaning: string;
  /** Tamna pjena = sludge/korozija */
  darkFoamMeaning?: string;
}

// ─── Bubbling logic (za FX i Rector) ─────────────────────────────────────────

export interface EngineBubblingLogic {
  /** Jak bubbling = aktivno otapanje */
  strongBubblingMeaning: string;
  /** Slab bubbling = reakcija usporava */
  weakBubblingMeaning: string;
  /** Nema bubblinga pri stabilnoj boji = sustav čist */
  noBubblingMeaning: string;
}

// ─── Sludge / magnetit logic (DS-40) ─────────────────────────────────────────

export interface EngineSludgeLogic {
  /** Da li magnetski filter skuplja crni talog */
  magnetFilterActiveMeaning: string;
  /** Da li magnetski filter više ne skuplja — završetak */
  magnetFilterInactiveMeaning: string;
  /** Crni talog može prekriti indikator boje */
  indicatorOverrideWarning: string;
}

// ─── Main ProductEngine interface ─────────────────────────────────────────────

export interface ProductEngine {
  // ── Identifikacija ────────────────────────────────────────────────────────
  id: ProductEngineId;
  /** Naziv enginea za debug prikaz */
  name: string;
  /** Naziv proizvoda */
  productName: string;
  /** Brend */
  brand: string;

  // ── Modeli ────────────────────────────────────────────────────────────────
  indicatorModel: EngineIndicatorModel;
  saturationModel: EngineSaturationModel;
  warningModel: EngineWarningModel;

  // ── pH zone ───────────────────────────────────────────────────────────────
  /** pH zone prema TDS-u */
  phZones: EnginePHZone[];
  /** pH kritična točka — iznad koje je učinkovitost dramatično smanjena */
  criticalPH?: number;
  /** pH exhaustion granica — iznad koje je kemija bez učinka */
  exhaustionPH: number;

  // ── Color zone mapa ───────────────────────────────────────────────────────
  colorZones: EngineColorZone[];

  // ── Logika indikatora ─────────────────────────────────────────────────────
  foamLogic?: EngineFoamLogic;
  bubblingLogic?: EngineBubblingLogic;
  sludgeLogic?: EngineSludgeLogic;

  // ── Thermal model ─────────────────────────────────────────────────────────
  thermalModel: EngineThermalLevel[];

  // ── Finish cycle kriteriji ────────────────────────────────────────────────
  finishCycleCriteria: EngineFinishCycleCriteria;

  // ── Kompatibilnost ────────────────────────────────────────────────────────
  compatibility: EngineCompatibility;

  // ── Napomena o primjeni ───────────────────────────────────────────────────
  applicationNote: string;
}
