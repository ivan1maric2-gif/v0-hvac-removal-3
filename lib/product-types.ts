// ─── Product database types ───────────────────────────────────────────────────
// All labels in Croatian.

/**
 * Product category — drives system-type compatibility warnings.
 *
 * TPV_DESCALER    : safe for potable water systems (DHW/calorifiers/cylinders).
 *                   Limescale removal only. Requires full flushing after use.
 * TECHNICAL_CLEANER: closed heating/cooling systems — limescale on heat exchangers.
 *                   NOT for potable water. Requires flushing after use.
 * OTHER           : neutralisers and other descaling auxiliaries.
 */
export type ProductCategory =
  | "TPV_DESCALER"
  | "TECHNICAL_CLEANER"
  | "OTHER";

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  TPV_DESCALER: "TPV / potrošna voda — uklanjanje kamenca",
  TECHNICAL_CLEANER: "Tehnički sustav — uklanjanje kamenca",
  OTHER: "Ostalo",
};

/** Part types that are part of the domestic hot-water / potable-water system */
export const TPV_PART_TYPES = new Set([
  "Spremnik TPV",
  "Spirala TPV",
]);

export type TipProizvoda =
  | "sredstvo_uklanjanje_kamenca"
  | "neutralizator"
  | "drugo";

export const TIP_PROIZVODA_LABELS: Record<TipProizvoda, string> = {
  sredstvo_uklanjanje_kamenca: "Sredstvo za uklanjanje kamenca",
  neutralizator: "Neutralizator",
  drugo: "Drugo",
};

export type OblikProizvoda =
  | "tekucina"
  | "prah"
  | "kristali"
  | "granulat"
  | "tekuci_koncentrat"
  | "drugo"
  | "nepoznato";

export const OBLIK_PROIZVODA_LABELS: Record<OblikProizvoda, string> = {
  tekucina: "Tekućina",
  prah: "Prah",
  kristali: "Kristali",
  granulat: "Granulat",
  tekuci_koncentrat: "Tekući koncentrat",
  drugo: "Drugo",
  nepoznato: "Nepoznato",
};

/** Returns true if this product form is mass-based (kg/g), not volume-based. */
export function isMassBasedForm(form: OblikProizvoda): boolean {
  return form === "prah" || form === "kristali" || form === "granulat";
}

/** Returns the allowed dose units for a given product form. */
export function allowedUnitsForForm(form: OblikProizvoda): string[] {
  if (isMassBasedForm(form)) return ["kg", "g"];
  return ["L", "ml"];
}

/** Returns the default dose unit for a given product form. */
export function defaultUnitForForm(form: OblikProizvoda): string {
  if (isMassBasedForm(form)) return "kg";
  return "L";
}

/**
 * Formats a calculated dose amount into the correct unit string based on product form.
 *
 * For liquid/concentrate products: result is in litres (L).
 * For powder/crystal/granulate products: result is in kg or g.
 *   - If densityKgL is provided the amountL (volume-based) is first converted to mass.
 *   - If densityKgL is not provided, amountL is treated as already a mass in kg.
 *   - < 1 kg → displayed as g (rounded to nearest gram).
 *   - >= 1 kg → displayed in kg (up to 2 decimal places).
 *
 * @param amountL   The calculated quantity (volumen × koncentracija / 100), always in litres.
 * @param form      The product's physical form.
 * @param densityKgL  Optional density (kg/L) for liquid-to-mass conversion.
 */
export function formatDozaKolicina(
  amountL: number,
  form: OblikProizvoda,
  densityKgL?: number
): string {
  if (!isMassBasedForm(form)) {
    // Liquid / concentrate — result stays in litres
    return `${Math.round(amountL * 100) / 100} L`;
  }

  // Mass-based — convert using density if available, otherwise treat amountL as kg
  const massKg = densityKgL != null ? amountL * densityKgL : amountL;

  if (massKg < 1) {
    const grams = Math.round(massKg * 1000);
    return `${grams} g`;
  }
  return `${Math.round(massKg * 100) / 100} kg`;
}

export type StatusProizvoda = "aktivan" | "arhiviran";

export const STATUS_PROIZVODA_LABELS: Record<StatusProizvoda, string> = {
  aktivan: "Aktivan",
  arhiviran: "Arhiviran",
};

/**
 * Data completeness status — how well the product's fields are documented
 * from official manufacturer sources (TDS / SDS / label).
 */
export type StatusPodataka =
  | "iz_tds"             // All important fields entered from official manufacturer documentation
  | "djelomicno_iz_tds"  // Only some fields entered from official documentation
  | "potrebna_dopuna";   // Important fields still missing from official documentation

export const STATUS_PODATAKA_LABELS: Record<StatusPodataka, string> = {
  iz_tds:             "Iz tehničkog lista proizvođača",
  djelomicno_iz_tds:  "Djelomično iz tehničkog lista proizvođača",
  potrebna_dopuna:    "Potrebna dopuna iz tehničkog lista proizvođača",
};

export const STATUS_PODATAKA_SHORT: Record<StatusPodataka, string> = {
  iz_tds:             "Iz TDS-a",
  djelomicno_iz_tds:  "Djelomično iz TDS-a",
  potrebna_dopuna:    "Potrebna dopuna",
};

export type JedinicaDoziranja =
  | "percent"
  | "L_per_10L"
  | "L_per_100L"
  | "kg_per_10L"
  | "kg_per_100L"
  | "ml_per_1L"
  | "g_per_L";

export const JEDINICA_DOZIRANJA_LABELS: Record<JedinicaDoziranja, string> = {
  percent: "%",
  L_per_10L: "L na 10 L vode",
  L_per_100L: "L na 100 L vode",
  kg_per_10L: "kg na 10 L vode",
  kg_per_100L: "kg na 100 L vode",
  ml_per_1L: "ml na 1 L vode",
  g_per_L: "g na 1 L vode",
};

export type PhZoneStatus =
  | "too_strong"
  | "active"
  | "optimal"
  | "weakening"
  | "exhausted";

export const PH_ZONE_STATUS_LABELS: Record<PhZoneStatus, string> = {
  too_strong: "Prejako",
  active: "Aktivno",
  optimal: "Optimalno",
  weakening: "Slabi",
  exhausted: "Iscrpljeno",
};

export const PH_ZONE_STATUS_COLORS: Record<PhZoneStatus, "red" | "orange" | "green" | "yellow" | "gray"> = {
  too_strong: "red",
  active: "orange",
  optimal: "green",
  weakening: "yellow",
  exhausted: "red",
};

export interface ProductPhZone {
  id: string;
  label: string;
  phMin?: number;     // undefined = no lower bound
  phMax?: number;     // undefined = no upper bound
  description: string;
  status: PhZoneStatus;
}

export type ChemicalStatus = "fresh" | "active" | "weakening" | "exhausted" | "unknown";

export const CHEMICAL_STATUS_LABELS: Record<ChemicalStatus, string> = {
  fresh: "Svježe",
  active: "Aktivno",
  weakening: "Slabi",
  exhausted: "Iscrpljeno",
  unknown: "Nepoznato",
};

export interface ProductColorIndicator {
  id: string;
  colorName: string;       // e.g. "Plava", "Zelena"
  colorHex?: string;       // optional for display
  meaning: string;
  chemicalStatus: ChemicalStatus;
}

export type KompatibilnostStatus =
  | "compatible"
  | "caution"
  | "not_recommended"
  | "unknown";

export const KOMPATIBILNOST_LABELS: Record<KompatibilnostStatus, string> = {
  compatible: "Kompatibilno",
  caution: "Oprez",
  not_recommended: "Nije preporučeno",
  unknown: "Nepoznato",
};

export const KOMPATIBILNOST_COLORS: Record<KompatibilnostStatus, "green" | "yellow" | "red" | "gray"> = {
  compatible: "green",
  caution: "yellow",
  not_recommended: "red",
  unknown: "gray",
};

export type MaterialName =
  | "Inox"
  | "Bakar"
  | "Mesing"
  | "Mjed"
  | "Čelik"
  | "Aluminij"
  | "Plastika"
  | "Plastika (općenito)"
  | "Guma/brtve"
  | "Kombinirano"
  | "Nepoznato"
  | "Lijevano željezo"
  | "PVC"
  | "ABS"
  | "PE"
  | "Pocinčani čelik"
  | "Cink"
  | "Krom"
  | "Emajl"
  | "Akril"
  | "Beton"
  | "Azbest";

export interface ProductMaterialCompatibility {
  id: string;
  material: MaterialName;
  compatibilityStatus: KompatibilnostStatus;
  warning: string;
  maxContactTimeMinutes?: number;
  maxConcentration?: number;
}

export interface ProductSafetyNotes {
  personalProtection: string;
  ventilation: string;
  maxTemperatureC?: number;
  minTemperatureC?: number;
  mixingProhibitions?: string;
  rinseNote: string;
  neutralizationNote: string;
  generalNote: string;
}

// ─── Verification status ──────────────────────────────────────────────────────

/**
 * Whether this product's suitability has been confirmed from official
 * manufacturer documentation (TDS / SDS / label).
 *
 * - verified   : All key fields confirmed from official documentation
 * - unverified : Not yet confirmed — treat as uncertain
 */
export type VerificationStatus = "verified" | "unverified";

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  verified:   "Potvrđeno iz tehničkog lista",
  unverified: "Nije potvrđeno iz tehničkog lista",
};

// ─── Application category ─────────────────────────────────────────────────────

/**
 * Defines for which type of system this product is confirmed suitable.
 * MUST be based on official manufacturer documentation (TDS/SDS).
 * If not confirmed, use "unverified".
 */
export type ApplicationCategory =
  | "dhw_potable"    // PTV / TPV — confirmed for potable/domestic hot water
  | "technical_water" // Tehnička voda — confirmed for closed technical loops
  | "heating_closed" // Zatvoreni sustavi grijanja (CH/HVAC)
  | "both"           // Confirmed for both
  | "unverified";    // Not confirmed from official manufacturer documentation

export const APPLICATION_CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  dhw_potable:      "PTV / TPV",
  technical_water:  "Tehnička voda",
  heating_closed:   "Sustav centralnog grijanja",
  both:             "PTV / TPV i Tehnička voda",
  unverified:       "Potrebna provjera",
};

export const APPLICATION_CATEGORY_WARNING: Record<ApplicationCategory, string | null> = {
  dhw_potable:      null,
  technical_water:  null,
  heating_closed:   null,
  both:             null,
  unverified:       "Primjena sredstva nije potvrđena prema tehničkom listu proizvođača.",
};

export interface Product {
  id: string;
  name: string;
  brand: string;
  /** True for products seeded from demo-products.ts — values are illustrative, not certified. */
  isDemo?: boolean;
  /**
   * Whether the product's key data has been confirmed from official manufacturer
   * documentation. Defaults to "unverified" when not set.
   */
  verificationStatus?: VerificationStatus;
  productType: TipProizvoda;
  productCategory: ProductCategory;
  /**
   * Which cleaning modes this product is appropriate for.
   * Used to filter the product picker to only show compatible products.
   * Empty array = no restriction (all modes).
   */
  allowedCleaningModes: import("./types").CleaningMode[];
  form: OblikProizvoda;
  /**
   * For which system category this product is confirmed suitable.
   * MUST be derived only from official manufacturer documentation.
   */
  applicationCategory: ApplicationCategory;
  /** Name of official source document (TDS / SDS / label) confirming applicationCategory. */
  applicationSourceDocument?: string;
  /** Free-text note about the application source. */
  applicationSourceNote?: string;
  /** Warning shown when used in a PTV / TPV system (e.g. not food-safe). */
  potableWaterWarning?: string;
  /** Warning shown when used in a technical water system. */
  technicalWaterWarning?: string;
  status: StatusProizvoda;
  /**
   * Data completeness status — how well this product's fields are sourced
   * from official manufacturer documentation.
   * Defaults to "potrebna_dopuna" when not set.
   */
  statusPodataka?: StatusPodataka;
  purpose: string;
  note?: string;
  // Source documentation — manufacturer data provenance
  sourceDocumentName?: string;
  sourceDocumentType?: SourceDocumentType;
  sourceDate?: string;       // ISO date string, e.g. "2024-03-01"
  sourceVersion?: string;    // e.g. "v2.1", "Rev. 4"
  sourceNote?: string;       // free-text note about the source
  // Dosage
  dosageMin: number;
  dosageMax: number;
  dosageUnit: JedinicaDoziranja;
  defaultStartingDose: number;
  maxRecommendedDose: number;
  topUpAllowed: boolean;
  dosageNote?: string;
  /** True when the product is dosed by mass (kg/g). Derived from `form` but can be overridden. */
  hasMassBasedDosing?: boolean;
  /** True when the product can also be dosed by volume (L/ml). False for pure powders without official density. */
  hasVolumeBasedDosing?: boolean;
  /** Explicit list of allowed quantity units for the UI. Overrides form-based defaults when set. */
  allowedDoseUnits?: string[];
  // Density
  densityKgL?: number;
  useDensityForMassConversion: boolean;
  densityNote?: string;
  // pH zones
  phZones: ProductPhZone[];
  /**
   * Unified indicator zones — product-specific pH interpretation from TDS.
   * Each zone links a pH range to an expected indicator color and chemical strength.
   * Empty array = no TDS data; fall back to phZones and generic logic.
   */
  indicatorZones: IndicatorZona[];
  // Color indicator
  hasColorIndicator: boolean;
  /**
   * Type of indicator system for this product:
   * - "color"         : Color change only
   * - "color+foam"    : Color change + foam/bubble presence (e.g., Fernox DS-3: Žuta/Zelena/Plava + pjena)
   * - "color+bubbles" : Color change + bubble presence (e.g., Kamco Scalebreaker FX: Roze + mjehurići)
   * - "bubbles"       : Bubble presence only (no color change)
   * - "none"          : No visual indicator
   */
  indicatorType?: "color" | "color+foam" | "color+bubbles" | "bubbles" | "none" | "color+foam+sludge" | "color+bubbles+pH";
  colorIndicators: ProductColorIndicator[];
  // Material compatibility
  materialCompatibility: ProductMaterialCompatibility[];
  // Rinse & neutralization (from manufacturer documentation)
  neutralizationRequired?: boolean;
  neutralizerProduct?: string;   // e.g. "Fernox Neutraliser F7"
  rinseRequired?: boolean;
  rinse?: string;                // rinse instructions from manufacturer
  // Scale dissolving capacity — for CaCO3 equivalent estimate
  /** How many kg of CaCO3 this product dissolves per kg (or L) of product. From official TDS. */
  scaleDissolvingCapacityCaCO3?: number;
  /** Unit description, e.g. "kg CaCO3 per kg product" or "kg CaCO3 per L product". */
  scaleDissolvingCapacityUnit?: string;
  /** Active acid content in % (optional, for reference). */
  acidActiveContent?: number;
  /** Free-text note from manufacturer regarding scale removal capacity. */
  manufacturerScaleRemovalNote?: string;
  /**
   * List of confirmed safe use cases / system types / materials.
   * Sourced from official TDS / SDS / label. Displayed as "Sigurno za".
   * Examples: "uklanjanje kamenca", "PTV / TPV sustavi", "bakar", "inox"
   */
  safeFor?: string[];
  /**
   * List of prohibited use cases / materials / system types.
   * Sourced from official TDS / SDS / label. Displayed as "Nije za uporabu na".
   * Examples: "aluminij", "pocinčani čelik", "sustavi bez zaštite"
   */
  notFor?: string[];
  // ── Kapacitet otapanja (Rector BCP and similar) ──────────────────────────
  /** Scaling capacity as CaCO₃ dissolved per kg product — {min, max} in kg/kg. Servisna procjena. */
  scalingCapacityKgCaCO3PerKg?: { min: number; max: number };
  /** Free-text note for scaling capacity. */
  scalingCapacityNote?: string;

  // ── Thermal Efficiency Model ───────────────────────────────────────────────
  /** Temperature-dependent reaction efficiency table. */
  thermalEfficiencyModel?: Array<{
    rangeLabel: string;
    tempMin: number;
    tempMax: number;
    efficiency: string;
    level: "slow" | "normal" | "optimal" | "caution" | "warning";
  }>;

  // ── Circulation ───────────────────────────────────────────────────────────
  /** Circulation recommendation note. */
  circulationNote?: string;
  /** Whether continuous pump circulation is required/recommended. */
  circulationRequired?: boolean;

  // ── System Scale Estimates ────────────────────────────────────────────────
  /** Typical scale amounts per system type. */
  systemScaleEstimates?: Array<{ label: string; estimateG: string; note: string }>;
  /** Warning text shown when pH rises quickly / solution turns red fast. */
  systemScaleWarning?: string;

  // ── Reaction Stop Criteria ────────────────────────────────────────────────
  /** List of criteria indicating cleaning cycle is complete. */
  reactionStopCriteria?: string[];

  // Safety
  safetyNotes: ProductSafetyNotes;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ─── Snapshot type (stored in Cycle / TopUp) ─────────────────────────────────

export type ProductSnapshot = Pick<Product,
  | "id"
  | "name"
  | "brand"
  | "productType"
  | "productCategory"
  | "allowedCleaningModes"
  | "form"
  | "phZones"
  | "indicatorZones"
  | "hasColorIndicator"
  | "indicatorType"
  | "colorIndicators"
  | "materialCompatibility"
  | "densityKgL"
  | "dosageMin"
  | "dosageMax"
  | "dosageUnit"
  | "topUpAllowed"
  | "dosageNote"
  | "sourceDocumentName"
  | "sourceDocumentType"
  | "neutralizationRequired"
  | "rinseRequired"
  | "hasMassBasedDosing"
  | "hasVolumeBasedDosing"
  | "allowedDoseUnits"
  | "applicationCategory"
  | "applicationSourceDocument"
  | "potableWaterWarning"
  | "technicalWaterWarning"
  | "scaleDissolvingCapacityCaCO3"
  | "scaleDissolvingCapacityUnit"
  | "manufacturerScaleRemovalNote"
  | "safeFor"
  | "notFor"
> & {
  statusPodataka?: StatusPodataka;
  verificationStatus?: VerificationStatus;
};

// ─── Unified indicator zone (pH + color + strength) ─────────────────────────
// Source of truth for product-specific pH interpretation. Based on TDS data.

export type SnagaSredstva =
  | "jako"        // Very strong / aggressive — monitor material safety
  | "aktivno"     // Active and effective — optimal range
  | "slabi"       // Weakening — consider top-up
  | "pri_kraju"   // Near exhaustion — top-up or new cycle soon
  | "iscrpljeno"; // Exhausted — new cycle required

export const SNAGA_SREDSTVA_LABELS: Record<SnagaSredstva, string> = {
  jako:        "Jako",
  aktivno:     "Aktivno",
  slabi:       "Slabi",
  pri_kraju:   "Pri kraju",
  iscrpljeno:  "Iscrpljeno",
};

export const SNAGA_SREDSTVA_COLORS: Record<SnagaSredstva, "red" | "orange" | "green" | "yellow" | "gray"> = {
  jako:       "red",
  aktivno:    "green",
  slabi:      "yellow",
  pri_kraju:  "orange",
  iscrpljeno: "red",
};

export interface IndicatorZona {
  /** Unique ID within the product */
  id: string;
  /** pH range — undefined = unbounded */
  phMin?: number;
  phMax?: number;
  /** Expected indicator color name in this zone, e.g. "Plava". Null if product has no color indicator. */
  colorName?: string | null;
  /** Chemical strength in this zone */
  strength: SnagaSredstva;
  /** Short Croatian label, e.g. "Aktivna zona" */
  label: string;
  /** Longer explanation from TDS, shown in UI */
  description: string;
}

/** Find the matching IndicatorZona for a given pH reading. Returns null if no match. */
export function nadjiIndikatorZonu(ph: number, zones: IndicatorZona[]): IndicatorZona | null {
  return zones.find((z) => {
    const aboveMin = z.phMin === undefined || ph >= z.phMin;
    const belowMax = z.phMax === undefined || ph < z.phMax;
    return aboveMin && belowMax;
  }) ?? null;
}

// ─── Default pH zones for generic acidic descaler ────────────────────────────

export const DEFAULT_PH_ZONES: ProductPhZone[] = [
  {
    id: "z-default-1",
    label: "Vrlo agresivna zona",
    phMin: undefined,
    phMax: 1.5,
    description: "Sredstvo je vrlo jako. Pratiti materijal, pH i sigurnost.",
    status: "too_strong",
  },
  {
    id: "z-default-2",
    label: "Jaka aktivnost",
    phMin: 1.5,
    phMax: 2.0,
    description: "Sredstvo je aktivno i ima dobru snagu za otapanje kamenca.",
    status: "active",
  },
  {
    id: "z-default-3",
    label: "Optimalna radna zona",
    phMin: 2.0,
    phMax: 3.0,
    description: "Sredstvo radi u optimalnoj zoni za čišćenje kamenca.",
    status: "optimal",
  },
  {
    id: "z-default-4",
    label: "Reakcija slabi",
    phMin: 3.0,
    phMax: 4.0,
    description: "Sredstvo se troši ili je reakcija pri kraju. Razmotriti nadopunu.",
    status: "weakening",
  },
  {
    id: "z-default-5",
    label: "Sredstvo iscrpljeno",
    phMin: 4.0,
    phMax: undefined,
    description: "Sredstvo je vjerojatno izgubilo učinkovitost. Preporuka: novi ciklus.",
    status: "exhausted",
  },
];

// ──�� Helper: find zone for given pH ──────────────────────────────────────────

export function nadjiZonuZaPH(ph: number, zones: ProductPhZone[]): ProductPhZone | null {
  return zones.find((z) => {
    const aboveMin = z.phMin === undefined || ph >= z.phMin;
    const belowMax = z.phMax === undefined || ph < z.phMax;
    return aboveMin && belowMax;
  }) ?? null;
}

// ─── Helper: material warning from product ────────────────────────────────────

export function upozorenjeZaMaterijal(
  material: string,
  product: Product
): ProductMaterialCompatibility | null {
  return product.materialCompatibility.find(
    (m) => m.material === material
  ) ?? null;
}

// ─── Helper: top-up warning ───────────────────────────────────────────────────

export function nadopunaUpozorenje(product: Product): string | null {
  if (!product.topUpAllowed) {
    return `Ovaj proizvod nije označen kao prikladan za nadopunu. Provjeriti upute proizvođača prije nastavka.`;
  }
  return null;
}

// ─── Source document types ────────────────────────────────────────────────────

export type SourceDocumentType = "TDS" | "SDS" | "Label" | "Manufacturer instructions";

export const SOURCE_DOCUMENT_TYPE_LABELS: Record<SourceDocumentType, string> = {
  TDS: "Tehnički list (TDS)",
  SDS: "Sigurnosno-tehnički list (SDS)",
  Label: "Etiketa proizvoda",
  "Manufacturer instructions": "Upute proizvođača",
};

// ─── Mandatory Croatian warnings ─────────────────────────────────────────────

/** Shown on every product card regardless of data completeness. */
export const PRODUCT_DATA_SOURCE_WARNING =
  "Podaci o proizvodu moraju biti usklađeni s tehničkim listom i sigurnosno-tehničkim listom proizvođača.";

/** Shown when source documentation has not been entered for a product. */
export const PRODUCT_DATA_INCOMPLETE_WARNING =
  "Za ovaj proizvod nisu uneseni svi službeni podaci. Provjeriti tehnički list proizvođača prije korištenja preporuka aplikacije.";

// ─── Warning evaluation ───────────────────────────────────────────────────────

export type ProductWarningLevel = "none" | "caution" | "incompatible";

export interface ProductWarningResult {
  level: ProductWarningLevel;
  /** Main warning message, or null when level === "none" */
  message: string | null;
  /** Whether the technician must actively confirm before continuing */
  requiresConfirmation: boolean;
}

/**
 * Centralised product warning logic.
 *
 * Rules (evaluated in order of severity):
 * 1. product.notFor contains a term that matches the session systemCategory
 *    → level: "incompatible", requires confirmation
 * 2. product.applicationCategory is incompatible with session systemCategory
 *    (legacy fallback when notFor is not populated)
 *    → level: "incompatible", requires confirmation
 * 3. Neither safeFor nor notFor is populated
 *    → level: "caution" (no data, not a generic unverified warning)
 * 4. Product has a specific potable/technical water warning string from manufacturer
 *    → level: "caution"
 * 5. All good → level: "none"
 */
export function evaluirajUpozorenjeProizvoda(
  product: Product | ProductSnapshot,
  systemCategory?: import("./types").SystemCategory
): ProductWarningResult {
  const appCat = product.applicationCategory;
  const verified = (product as Product).verificationStatus ?? "verified"; // treat as verified when not set
  const safeFor = product.safeFor ?? [];
  const notFor = product.notFor ?? [];
  const hasCompatibilityData = safeFor.length > 0 || notFor.length > 0;

  // 0. Verified product with no incompatibility signal → no warning at all
  //    (only skip if applicationCategory is also not "unverified")
  if (verified === "verified" && appCat !== "unverified" && notFor.length === 0) {
    // Still need to check legacy category incompatibility below, so we do NOT
    // return early here — we let rules 1 and 2 run. If neither fires, we return none.
  }

  // 1. notFor-based incompatibility (when systemCategory is known)
  if (systemCategory && systemCategory !== "unknown" && notFor.length > 0) {
    const sysLabel =
      systemCategory === "dhw_potable"
        ? ["ptv", "tpv", "potrošna", "pitka", "potable"]
        : systemCategory === "technical_water"
        ? ["tehnička", "technical", "zatvoreni", "grijanje", "hlađenje"]
        : [];

    const isBlocked = notFor.some((item) =>
      sysLabel.some((kw) => item.toLowerCase().includes(kw))
    );

    if (isBlocked) {
      return {
        level: "incompatible",
        message: "Odabrano sredstvo nije prikladno za ovaj sustav.",
        requiresConfirmation: true,
      };
    }
  }

  // 2. Legacy applicationCategory-based incompatibility
  if (systemCategory && systemCategory !== "unknown") {
    const isIncompatible =
      appCat !== "both" &&
      appCat !== "unverified" &&
      appCat !== systemCategory &&
      !hasCompatibilityData; // skip if notFor/safeFor already present

    if (isIncompatible) {
      return {
        level: "incompatible",
        message: "Odabrano sredstvo nije prikladno za ovaj sustav.",
        requiresConfirmation: true,
      };
    }
  }

  // 3. Explicitly unverified product OR applicationCategory === "unverified"
  //    Only fire when the product is marked unverified — missing safeFor/notFor alone is NOT a warning.
  if (verified === "unverified" || appCat === "unverified") {
    return {
      level: "caution",
      message: "Primjena ovog sredstva nije potvrđena iz tehničkog lista proizvođača.",
      requiresConfirmation: false,
    };
  }

  // 4. Product has a system-specific warning string from manufacturer
  const specificWarning =
    systemCategory === "dhw_potable"
      ? (product as Product).potableWaterWarning ?? null
      : systemCategory === "technical_water"
      ? (product as Product).technicalWaterWarning ?? null
      : null;

  if (specificWarning) {
    return {
      level: "caution",
      message: specificWarning,
      requiresConfirmation: false,
    };
  }

  // 5. All good
  return { level: "none", message: null, requiresConfirmation: false };
}

// ─── Demo data disclaimer ─────────────────────────────────────────────────────

export const DEMO_DISCLAIMER =
  "Demo vrijednosti — urediti prema tehničkom listu proizvoda.";
