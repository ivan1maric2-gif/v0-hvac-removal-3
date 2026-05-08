// ─── Product database ─────────────────────────────────────────────────────────
// Real products — data from manufacturer TDS/documentation.

import type { Product, IndicatorZona } from "./product-types";
// ─── Fernox DS-3 ─────────────────────────────────────────────────────────────
// Aktivna tvar: Sulfaminska (sulfamidna) kiselina — kristali/prah.
// Indikator: boja + pjena (color+foam)
// Boje: Žuta (aktivna) → Zelena (djelomično istrošena) → Plava (potrošena)
// Pjena: jaka = aktivno otapanje | slaba = reakcija slabi | nema = završeno/potrošeno

const DS3_INDICATOR_ZONES: IndicatorZona[] = [
  {
    id: "iz-ds3-1",
    phMin: undefined,
    phMax: 2.5,
    colorName: "Žuta",
    strength: "jako",
    label: "Aktivna reakcija",
    description: "Svježa / jaka kisela otopina. Reakcija aktivna. Jaka pjena = intenzivno otapanje kamenca.",
  },
  {
    id: "iz-ds3-2",
    phMin: 2.5,
    phMax: 3.5,
    colorName: "Zelena",
    strength: "slabi",
    label: "Reakcija slabi",
    description: "Kemija se troši, ali još može raditi. Pratiti pjenu i pH. Razmotriti nadopunu.",
  },
  {
    id: "iz-ds3-3",
    phMin: 3.5,
    phMax: 4.5,
    colorName: "Zelena/Plava",
    strength: "pri_kraju",
    label: "Reakcija pri kraju",
    description: "Kemija je oslabljena. Razmotriti nadopunu ili novi ciklus.",
  },
  {
    id: "iz-ds3-4",
    phMin: 4.5,
    phMax: undefined,
    colorName: "Plava",
    strength: "iscrpljeno",
    label: "Sredstvo iscrpljeno",
    description: "Kemija više nema dovoljan reakcijski kapacitet. Preporučuje se novi ciklus ili završetak.",
  },
];

const DS3_PH_ZONES: import("./product-types").ProductPhZone[] = [
  {
    id: "z-ds3-1",
    label: "Aktivna reakcija",
    phMin: undefined,
    phMax: 2.5,
    description: "Sredstvo je na maksimalnoj snazi. Jaka pjena, intenzivno otapanje.",
    status: "active",
  },
  {
    id: "z-ds3-2",
    label: "Reakcija slabi",
    phMin: 2.5,
    phMax: 3.5,
    description: "Kemija se troši, ali još može raditi. Razmotriti nadopunu.",
    status: "optimal",
  },
  {
    id: "z-ds3-3",
    label: "Reakcija pri kraju",
    phMin: 3.5,
    phMax: 4.5,
    description: "Kemija je oslabljena. Razmotriti nadopunu ili novi ciklus.",
    status: "weakening",
  },
  {
    id: "z-ds3-4",
    label: "Sredstvo iscrpljeno",
    phMin: 4.5,
    phMax: undefined,
    description: "Kemija više nema dovoljan reakcijski kapacitet. Preporučuje se novi ciklus ili završetak.",
    status: "exhausted",
  },
];

const DS3: Product = {
  id: "prod-ds3-001",
  isDemo: false,
  name: "Fernox DS-3",
  brand: "Fernox",
  productType: "sredstvo_uklanjanje_kamenca",
  productCategory: "TPV_DESCALER",
  allowedCleaningModes: ["descaling"],
  form: "kristali",
  status: "aktivan",
  statusPodataka: "iz_tds",
  purpose: "Sredstvo u kristalima/prahu s indikatorom boje i pjene za uklanjanje kamenca iz: izmjenjivača topline, bojlera, sustava potrošne tople vode (TPV), sanitarnih sustava i HVAC descaling.",
  note: "Aktivna tvar: sulfaminska (sulfamidna) kiselina. Kristali/prah — doziranje u gramima ili kilogramima.",

  applicationCategory: "dhw_potable",
  verificationStatus: "verified",
  applicationSourceDocument: "Fernox DS-3 Product Information",
  applicationSourceNote: "Primjena potvrđena za TPV/DHW sustave, izmjenjivače topline, bojlere i sanitarne sustave.",

  sourceDocumentName: "Fernox DS-3 Product Information",
  sourceDocumentType: "TDS",
  sourceDate: undefined,
  sourceVersion: undefined,
  sourceNote: "Podaci prema Fernox DS-3 dokumentaciji.",

  neutralizationRequired: true,
  rinseRequired: true,
  rinse: "Isprati čistom vodom do neutralnog pH prije ponovnog puštanja sustava u pogon.",

  // Doziranje: 250 g / 10 L (lagano) → 500 g / 10 L (srednje) → 1 kg / 10 L (jako)
  // Maksimalna koncentracija: 10%
  dosageMin: 25,
  dosageMax: 100,
  dosageUnit: "g_per_L",
  defaultStartingDose: 50,
  maxRecommendedDose: 100,
  topUpAllowed: true,
  dosageNote: "250 g / 10 L lagano zaprljanje | 500 g / 10 L srednje | 1 kg / 10 L jako. Maksimalna koncentracija: 10%.",
  hasMassBasedDosing: true,
  hasVolumeBasedDosing: false,
  allowedDoseUnits: ["g", "kg"],

  densityKgL: undefined,
  useDensityForMassConversion: false,
  densityNote: "Kristali/prah — gustoća nije primjenjiva za doziranje.",

  phZones: DS3_PH_ZONES,
  indicatorZones: DS3_INDICATOR_ZONES,

  hasColorIndicator: true,
  indicatorType: "color+foam",
  colorIndicators: [
    {
      id: "ci-ds3-1",
      colorName: "Žuta",
      colorHex: "#eab308",
      meaning: "Aktivna — pH 1.0–2.0, maksimalna snaga. Jaka pjena = aktivno otapanje.",
      chemicalStatus: "active",
    },
    {
      id: "ci-ds3-2",
      colorName: "Zelena",
      colorHex: "#22c55e",
      meaning: "Djelomično istrošena — pH 2.0–3.5, srednja snaga. Pratiti pjenu.",
      chemicalStatus: "weakening",
    },
    {
      id: "ci-ds3-3",
      colorName: "Plava",
      colorHex: "#3b82f6",
      meaning: "Potrošena — pH >4.0, snaga 0%. Nema pjene. Isprati i ponoviti.",
      chemicalStatus: "exhausted",
    },
  ],

  materialCompatibility: [
    { id: "mat-ds3-1", material: "Bakar",           compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-2", material: "Mjed",             compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-3", material: "Čelik",            compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-4", material: "Inox",             compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-5", material: "Lijevano željezo", compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-6", material: "PVC",              compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-7", material: "ABS",              compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-8", material: "PE",               compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-ds3-9", material: "Plastika (općenito)", compatibilityStatus: "compatible",   warning: "Provjeriti specifičnu otpornost plastike." },
    { id: "mat-ds3-10", material: "Aluminij",        compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s aluminijem." },
    { id: "mat-ds3-11", material: "Pocinčani čelik", compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s pocinčanim čelikom." },
    { id: "mat-ds3-12", material: "Cink",            compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s cinkom." },
    { id: "mat-ds3-13", material: "Krom",            compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s kromom." },
    { id: "mat-ds3-14", material: "Emajl",           compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s emajlom." },
    { id: "mat-ds3-15", material: "Akril",           compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s akriličnim površinama." },
    { id: "mat-ds3-16", material: "Beton",           compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s betonom." },
    { id: "mat-ds3-17", material: "Azbest",          compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s azbestom." },
    { id: "mat-ds3-18", material: "Kombinirano",     compatibilityStatus: "caution",         warning: "Konzervativni pristup — provjeriti sve materijale u sustavu." },
    { id: "mat-ds3-19", material: "Nepoznato",       compatibilityStatus: "caution",         warning: "Materijal nije poznat — koristiti konzervativni postupak." },
  ],

  safetyNotes: {
    personalProtection: "Zaštitne rukavice, naočale i zaštitna odjeća.",
    ventilation: "Raditi u dobro prozračenom prostoru.",
    maxTemperatureC: 80,
    minTemperatureC: 5,
    mixingProhibitions: "Ne miješati s lužinama, oksidansima ili kloridima.",
    rinseNote: "OBAVEZNO isprati čistom vodom do neutralnog pH prije puštanja sustava u pogon.",
    neutralizationNote: "Neutralizirati otpadnu otopinu prema lokalnim propisima.",
    generalNote: "Optimalna temperatura rada: 40–60°C. Maksimalno: 80°C.",
  },

  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};



// ─── Fernox DS-40 ─────────────────────────────────────────────────────────────
// Prah / free-flowing powder. Aktivna tvar: limunska kiselina s inhibitorima.
// Indictor: color + foam + sludge (color+foam+sludge).
// pH kod 2% w/w otopine: 2–3.
// Mapa boja: Deep Red (pH 1.5–2.5) → Pink/Magenta (~3.0) → Orange (3.5–4.5) → Yellow/Dirty Green (>5.0)
// Primjena: sustavi CH, powerflushing, izmjenjivači, bojleri, magnetit/black sludge.
// Pakiranje: 2 kg sustav = 1.5 kg DS-40 + 500 ml System Neutraliser.
// Kompatibilan s aluminijem (za razliku od DS-3).
// NIje za: single feed indirect cylinders, Primatic sustave.

const DS40_INDICATOR_ZONES: IndicatorZona[] = [
  {
    id: "iz-ds40-1",
    phMin: 1.5,
    phMax: 2.5,
    colorName: "Deep Red",
    strength: "jako",
    label: "Svježa otopina — maksimalna snaga",
    description: "Tamno crvena boja — otopina je svježa, snaga maksimalna. Intenzivno otapanje kamenca i black sludge.",
  },
  {
    id: "iz-ds40-2",
    phMin: 2.5,
    phMax: 3.5,
    colorName: "Pink / Magenta",
    strength: "aktivno",
    label: "Radna zona — aktivna",
    description: "Ružičasta/magenta boja (~pH 3.0) — sredstvo je u radnoj zoni i aktivno reagira.",
  },
  {
    id: "iz-ds40-3",
    phMin: 3.5,
    phMax: 4.5,
    colorName: "Orange",
    strength: "slabi",
    label: "Kritična zona — dodati DS-40",
    description: "Narančasta boja (pH 3.5–4.5) — sredstvo je u kritičnoj zoni. Ako je sustav još prljav, dodati DS-40.",
  },
  {
    id: "iz-ds40-4",
    phMin: 5.0,
    phMax: undefined,
    colorName: "Yellow / Dirty Green",
    strength: "iscrpljeno",
    label: "Iscrpljeno — bez učinka",
    description: "Žuta ili prljavo-zelena boja (pH >5.0) — sredstvo je bez učinka. Dodati DS-40 ili završiti i neutralizirati.",
  },
];

const DS40_PH_ZONES: import("./product-types").ProductPhZone[] = [
  {
    id: "z-ds40-1",
    label: "Maksimalna snaga",
    phMin: 1.5,
    phMax: 2.5,
    description: "Svježa otopina — intenzivno otapanje kamenca i black sludge.",
    status: "active",
  },
  {
    id: "z-ds40-2",
    label: "Radna zona",
    phMin: 2.5,
    phMax: 3.5,
    description: "Aktivna radna zona. Pratiti CO₂ reakciju i pjenu.",
    status: "optimal",
  },
  {
    id: "z-ds40-3",
    label: "Kritična zona",
    phMin: 3.5,
    phMax: 5.0,
    description: "Sredstvo slabi. Ako je sustav još prljav — dodati DS-40.",
    status: "weakening",
  },
  {
    id: "z-ds40-4",
    label: "Iscrpljeno",
    phMin: 5.0,
    phMax: undefined,
    description: "Bez kemijskog učinka. Dodati DS-40 ili završiti i neutralizirati.",
    status: "exhausted",
  },
];

const DS40: Product = {
  id: "prod-ds40-001",
  isDemo: false,
  name: "Fernox DS-40",
  brand: "Fernox",
  productType: "sredstvo_uklanjanje_kamenca",
  // DS-40 je namijenjen za sustave CH (centrale), powerflushing i black sludge —
  // nije isključivo TPV, ali kompatibilan s miješanim metalnim sustavima uključujući aluminij.
  productCategory: "TECHNICAL_CLEANER",
  allowedCleaningModes: ["descaling", "powerflushing"],
  form: "prah",
  status: "aktivan",
  statusPodataka: "iz_tds",
  purpose: "Prah za uklanjanje kamenca, magnetita i black sludge iz sustava centralnog grijanja, izmjenjivača topline, bojlera i HVAC sustava. Aktivna tvar: limunska kiselina s inhibitorima. Kompatibilan s aluminijem.",
  note: "Pakiranje 2 kg sustav: 1.5 kg DS-40 Descaler & Cleaner + 500 ml System Neutraliser. Nije za single feed indirect cylinders i Primatic sustave.",

  applicationCategory: "heating_closed",
  applicationSourceDocument: "Fernox DS-40 Technical Data Sheet",
  applicationSourceNote: "Podaci uneseni prema Fernox DS-40 TDS. Primjena: CH sustavi, powerflushing, magnetit/black sludge.",

  sourceDocumentName: "Fernox DS-40 Technical Data Sheet",
  sourceDocumentType: "TDS",
  sourceDate: undefined,
  sourceVersion: undefined,
  sourceNote: "Podaci iz Fernox DS-40 TDS.",

  neutralizationRequired: true,
  rinseRequired: true,
  rinse: "Dodati System Neutraliser dok se otopina ne okrene u žutu prema uputi. Ispustiti i ispirati više puta svježom vodom dok voda na ispustu ne bude bistra. Preporučuje se dodati Fernox Protector F1 nakon završnog ispiranja.",

  // DS-40 = prah, jedno pakiranje (1.5 kg) standardno za kućni CH sustav
  dosageMin: 1500,
  dosageMax: 3000,
  dosageUnit: "g_per_L",
  defaultStartingDose: 1500,
  maxRecommendedDose: 3000,
  topUpAllowed: true,
  dosageNote: "Standardno: 1 pakiranje (1.5 kg) za tipičan kućni CH sustav. Za velike ili jako zaprljane sustave dodati dodatni prah.",
  hasMassBasedDosing: true,
  hasVolumeBasedDosing: false,
  allowedDoseUnits: ["kg", "g"],

  densityKgL: undefined,
  useDensityForMassConversion: false,
  densityNote: undefined,

  phZones: DS40_PH_ZONES,
  indicatorZones: DS40_INDICATOR_ZONES,

  hasColorIndicator: true,
  indicatorType: "color+foam+sludge",
  colorIndicators: [
    {
      id: "ci-ds40-1",
      colorName: "Deep Red",
      colorHex: "#b91c1c",
      meaning: "Svježa otopina — maksimalna snaga (pH 1.5–2.5). Intenzivno otapanje kamenca.",
      chemicalStatus: "fresh",
    },
    {
      id: "ci-ds40-2",
      colorName: "Pink / Magenta",
      colorHex: "#db2777",
      meaning: "Radna zona (~pH 3.0) — sredstvo aktivno reagira.",
      chemicalStatus: "active",
    },
    {
      id: "ci-ds40-3",
      colorName: "Orange",
      colorHex: "#ea580c",
      meaning: "Kritična zona (pH 3.5–4.5) — sredstvo slabi. Dodati DS-40 ako je sustav još prljav.",
      chemicalStatus: "weakening",
    },
    {
      id: "ci-ds40-4",
      colorName: "Yellow / Dirty Green",
      colorHex: "#ca8a04",
      meaning: "Iscrpljeno (pH >5.0) — bez kemijskog učinka. Dodati DS-40 ili završiti i neutralizirati.",
      chemicalStatus: "exhausted",
    },
  ],

  materialCompatibility: [
    { id: "mat-ds40-1", material: "Bakar",               compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-ds40-2", material: "Mjed",                compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-ds40-3", material: "Čelik",               compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-ds40-4", material: "Inox",                compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-ds40-5", material: "Aluminij",            compatibilityStatus: "compatible",  warning: "Kompatibilno s aluminijem — potvrđeno prema Fernox TDS-u." },
    { id: "mat-ds40-6", material: "Plastika",            compatibilityStatus: "compatible",  warning: "Provjeriti specifičnu otpornost plastike." },
    { id: "mat-ds40-7", material: "Guma/brtve",          compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-ds40-8", material: "Kombinirano",          compatibilityStatus: "compatible",  warning: "DS-40 je dizajniran za miješane metalne sustave." },
    { id: "mat-ds40-9", material: "Nepoznato",           compatibilityStatus: "caution",     warning: "Materijal nije poznat — konzervativni postupak." },
  ],

  safetyNotes: {
    personalProtection: "Zaštitne rukavice, naočale i zaštitna odjeća obavezni pri radu s praškom.",
    ventilation: "Raditi u dobro prozračenom prostoru. Izbjegavati udisanje prašine pri doziranju.",
    maxTemperatureC: 50,
    minTemperatureC: 10,
    mixingProhibitions: "Ne miješati s lužinama, oksidansima niti s DS-3.",
    rinseNote: "Ispirati dok voda na ispustu ne bude bistra. Neutralizirati s priloženim System Neutraliserom.",
    neutralizationNote: "Koristiti priloženi Fernox System Neutraliser. Dodavati dok se otopina ne okrene u žutu prema uputi.",
    generalNote: "Optimalna temperatura rada: 40–50 °C. Nije za single feed indirect cylinders i Primatic sustave. Preporučuje se Fernox Protector F1 nakon čišćenja.",
  },

  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ─── Kamco Scalebreaker FX ──────────────────────────────────────�������─────────────
// Liquid acid descaler by Kamco for DHW/heating systems.
// Status podataka: djelomicno_iz_tds — basic data present, detailed dosage TDS needed.
// Note: indicatorZones are demo values — verify against Kamco Scalebreaker FX TDS before field use.

// Indikator: fosforna kiselina (ili metil-oranž tip) — 6 boja prema pH
// Kritična točka: pH 3.0 — iznad tog pH učinkovitost pada za >80%
// Ciljana radna boja: Intenzivno ružičasta (pH 1.0–2.0)
// Upozorenje: crni mulj (magnetit) može prekriti indikator — u tom slučaju dodati FX

const KAMCO_FX_INDICATOR_ZONES: IndicatorZona[] = [
  {
    id: "iz-kfx-1",
    phMin: undefined,
    phMax: 1.0,
    colorName: "Tamno crvena",
    strength: "jako",
    label: "Koncentrat — ultra jaka",
    description: "Tamno crvena boja — sredstvo je u koncentratu. Reagira trenutno i burno. Paziti na materijale.",
  },
  {
    id: "iz-kfx-2",
    phMin: 1.0,
    phMax: 2.0,
    colorName: "Intenzivno ružičasta",
    strength: "aktivno",
    label: "Optimalna zona",
    description: "Intenzivno ružičasta — ciljana radna boja. Optimalni omjer brzine i sigurnosti. Mjehurići = aktivna CO₂ reakcija.",
  },
  {
    id: "iz-kfx-3",
    phMin: 2.0,
    phMax: 2.8,
    colorName: "Narančasto-crvena",
    strength: "slabi",
    label: "Oslabljeno — usporava",
    description: "Narančasto-crvena boja — sredstvo još radi, ali je blizu zasićenja. Razmotriti nadopunu.",
  },
  {
    id: "iz-kfx-4",
    phMin: 3.0,
    phMax: 3.5,
    colorName: "Žuto-narančasta",
    strength: "pri_kraju",
    label: "Kritična točka — dodati FX odmah",
    description: "Žuto-narančasta — pH je prešao 3.0. Učinkovitost pala za >80%. Otapanje gotovo staje. Dodati svježi FX odmah.",
  },
  {
    id: "iz-kfx-5",
    phMin: 3.5,
    phMax: 5.0,
    colorName: "Žuta (jantar)",
    strength: "iscrpljeno",
    label: "Kemijski mrtvo",
    description: "Žuta (jantar) boja — nema slobodne kiseline. Reakcija 0%. 1 L FX-a je već vezao ~0.5 kg kamenca. Zamijeniti otopinu.",
  },
  {
    id: "iz-kfx-6",
    phMin: 5.5,
    phMax: undefined,
    colorName: "Zelena / prljava",
    strength: "iscrpljeno",
    label: "Neutralizirano — sigurno za ispuštanje",
    description: "Zelena ili prljava boja — otopina neutralizirana. Sigurno za ispuštanje uz provjeru lokalnih propisa.",
  },
];

const KAMCO_FX_PH_ZONES: import("./product-types").ProductPhZone[] = [
  {
    id: "z-kfx-spec-1",
    label: "Koncentrat",
    phMin: undefined,
    phMax: 1.0,
    description: "Ultra jaka koncentracija. Burna reakcija — pratiti materijale i sigurnost.",
    status: "too_strong",
  },
  {
    id: "z-kfx-spec-2",
    label: "Optimalna zona",
    phMin: 1.0,
    phMax: 2.0,
    description: "Ciljana radna zona — intenzivno ružičasta boja. Optimalni omjer snage i sigurnosti.",
    status: "optimal",
  },
  {
    id: "z-kfx-spec-3",
    label: "Oslabljeno",
    phMin: 2.0,
    phMax: 3.0,
    description: "Sredstvo još radi ali usporava. Blizu zasićenja — razmotriti nadopunu.",
    status: "active",
  },
  {
    id: "z-kfx-spec-4",
    label: "Kritična točka",
    phMin: 3.0,
    phMax: 3.5,
    description: "pH prešao 3.0 — učinkovitost pala >80%. Dodati svježi FX odmah.",
    status: "weakening",
  },
  {
    id: "z-kfx-spec-5",
    label: "Kemijski mrtvo",
    phMin: 3.5,
    phMax: 5.5,
    description: "Nema slobodne kiseline. Reakcija 0%. Zamijeniti otopinu.",
    status: "exhausted",
  },
  {
    id: "z-kfx-spec-6",
    label: "Neutralizirano",
    phMin: 5.5,
    phMax: undefined,
    description: "Otopina neutralizirana. Sigurno za ispuštanje uz provjeru propisa.",
    status: "exhausted",
  },
];

const KAMCO_FX: Product = {
  id: "prod-kamco-fx-001",
  isDemo: false,
  name: "Kamco Scalebreaker FX",
  brand: "Kamco",
  productType: "sredstvo_uklanjanje_kamenca",
  productCategory: "TPV_DESCALER",
  allowedCleaningModes: ["descaling"],
  form: "tekucina",
  status: "aktivan",
  statusPodataka: "iz_tds",
  purpose: "Tekuće kiselo sredstvo na bazi fosforne kiseline za uklanjanje kamenca iz: izmjenjivača topline, bojlera, TPV sustava, sanitarnih i HVAC sustava. Indikator boje mijenja se od tamno crvene → ružičaste → žute prema potrošenosti.",
  note: "Aktivna tvar: fosforna kiselina. Kritična točka pH 3.0 — iznad tog pH učinkovitost pada >80%. Ciljana radna boja: intenzivno ružičasta (pH 1.0–2.0). Crni mulj (magnetit) može prekriti indikator.",

  applicationCategory: "dhw_potable",
  applicationSourceDocument: "Kamco Scalebreaker FX Technical Data Sheet",
  applicationSourceNote: "Primjena potvrđena za TPV/DHW sustave prema Kamco TDS-u.",

  sourceDocumentName: "Kamco Scalebreaker FX Technical Data Sheet",
  sourceDocumentType: "TDS",
  sourceDate: undefined,
  sourceVersion: undefined,
  sourceNote: "Ključni podaci uneseni prema Kamco TDS-u. Doziranje i pH zone potrebno verificirati prema aktualnoj verziji dokumenta.",

  neutralizationRequired: true,
  rinseRequired: true,
  rinse: "Isprati sustavom čiste vode do pH neutralizacije. Slijediti Kamco upute za ispiranje.",

  dosageMin: 5,
  dosageMax: 20,
  dosageUnit: "percent",
  defaultStartingDose: 5,
  maxRecommendedDose: 20,
  topUpAllowed: true,
  dosageNote: "5% standardna primjena | 10% teže naslage | 10–20% jako zaprljanje. Maksimalno 20%.",

  densityKgL: undefined,
  useDensityForMassConversion: false,
  densityNote: undefined,

  phZones: KAMCO_FX_PH_ZONES,
  indicatorZones: KAMCO_FX_INDICATOR_ZONES,

  hasColorIndicator: true,
  indicatorType: "color+bubbles",
  colorIndicators: [
    {
      id: "ci-kfx-1",
      colorName: "Tamno crvena",
      colorHex: "#991b1b",
      meaning: "Koncentrat — ultra jaka. Burna reakcija, pratiti materijale.",
      chemicalStatus: "fresh",
    },
    {
      id: "ci-kfx-2",
      colorName: "Intenzivno ružičasta",
      colorHex: "#ec4899",
      meaning: "Optimalna zona (pH 1.0–2.0) — ciljana radna boja. Mjehurići = aktivna CO₂ reakcija s kamencem.",
      chemicalStatus: "active",
    },
    {
      id: "ci-kfx-3",
      colorName: "Narančasto-crvena",
      colorHex: "#f97316",
      meaning: "Oslabljeno (pH 2.0–2.8) — još radi, blizu zasićenja. Razmotriti nadopunu.",
      chemicalStatus: "weakening",
    },
    {
      id: "ci-kfx-4",
      colorName: "Žuto-narančasta",
      colorHex: "#f59e0b",
      meaning: "Kritична točka (pH 3.0–3.5) — učinkovitost pala >80%. Dodati svježi FX odmah.",
      chemicalStatus: "weakening",
    },
    {
      id: "ci-kfx-5",
      colorName: "Žuta (jantar)",
      colorHex: "#eab308",
      meaning: "Kemijski mrtvo (pH 3.5–5.0) — nema slobodne kiseline, reakcija 0%. Zamijeniti otopinu.",
      chemicalStatus: "exhausted",
    },
    {
      id: "ci-kfx-6",
      colorName: "Zelena / prljava",
      colorHex: "#65a30d",
      meaning: "Neutralizirano (pH >5.5) — sigurno za ispuštanje uz provjeru lokalnih propisa.",
      chemicalStatus: "exhausted",
    },
  ],

  materialCompatibility: [
    { id: "mat-kfx-1", material: "Bakar",              compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-kfx-2", material: "Mjed",               compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-kfx-3", material: "Čelik",              compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-kfx-4", material: "Inox",               compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-kfx-5", material: "Plastika",            compatibilityStatus: "compatible",      warning: "Provjeriti specifičnu otpornost plastike." },
    { id: "mat-kfx-6", material: "Guma/brtve",          compatibilityStatus: "compatible",      warning: "" },
    { id: "mat-kfx-7", material: "Aluminij",            compatibilityStatus: "not_recommended", warning: "Nije kompatibilno s aluminijem." },
    { id: "mat-kfx-8", material: "Pocinčani čelik",     compatibilityStatus: "not_recommended", warning: "Nije za galvanizirane (pocinčane) sustave." },
    { id: "mat-kfx-9", material: "Kombinirano",        compatibilityStatus: "caution",         warning: "Konzervativni pristup — provjeriti sve materijale u sustavu." },
    { id: "mat-kfx-10",material: "Nepoznato",          compatibilityStatus: "caution",         warning: "Materijal nije poznat — koristiti konzervativni postupak." },
  ],

  safetyNotes: {
    personalProtection: "Zaštitne rukavice, naočale i zaštitna odjeća obavezni.",
    ventilation: "Raditi u dobro prozračenom prostoru.",
    maxTemperatureC: 70,
    minTemperatureC: 5,
    mixingProhibitions: "Ne miješati s lužinama i oksidansima.",
    rinseNote: "OBAVEZNO isprati sustavom čiste pitke vode do pH neutralizacije pred ponovnim puštanjem sustava u pogon.",
    neutralizationNote: "Neutralizirati otpadnu otopinu prema lokalnim propisima.",
    generalNote: "Optimalna temperatura rada: 40–50°C. Maksimalno: 70°C. Pridržavati se Kamco TDS-a i SDS-a.",
  },

  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// ─── Rector / Miloc — Boiler Cleaner P Descaler ───────────────────────────────
// Originalni proizvođač: GEL S.p.A.
// Aktivna tvar: mješavina kiselina s inhibitorima korozije.
// Oblik: prah.
// Indikator: boja + CO₂ bubbling + pH (color+bubbles+pH).
// Mapa boja:
//   Žuta  (pH <1.5)  → maksimalno aktivno
//   Narančasta (pH 1.5–4.0) → aktivno slabi
//   Crvena/Ljubičasta (pH >4.0) → iscrpljeno
// Doziranje: 1 kg na 10 L vode (standardno), max 15%.
// Temperatura: optimalno 30–35°C, oprez 35–45°C, warning >50°C.
// Proceduralno: ne ostavljati >2 h; obavezna neutralizacija.

const RECTOR_BCP_PH_ZONES: import("./product-types").ProductPhZone[] = [
  {
    id: "z-rbcp-1",
    label: "Maksimalno aktivno",
    phMin: undefined,
    phMax: 1.5,
    description: "Žuta boja — maksimalna snaga. Ultra jaka reakcija. Intenzivno otapanje kamenca.",
    status: "active",
  },
  {
    id: "z-rbcp-2",
    label: "Aktivno — slabi",
    phMin: 1.5,
    phMax: 4.0,
    description: "Narančasta boja (pH 1.5–4.0) — kiselina je aktivna ali snaga opada. Pratiti stanje.",
    status: "weakening",
  },
  {
    id: "z-rbcp-3",
    label: "Iscrpljeno",
    phMin: 4.0,
    phMax: undefined,
    description: "Crvena/ljubičasta boja (pH >4.0) — exhaustion zone. Bez kemijskog učinka.",
    status: "exhausted",
  },
];

const RECTOR_BCP_INDICATOR_ZONES: IndicatorZona[] = [
  {
    id: "iz-rbcp-1",
    phMin: undefined,
    phMax: 1.5,
    colorName: "Žuta",
    strength: "jako",
    label: "Maksimalno aktivno — ultra jaka reakcija",
    description: "Žuta boja — pH <1.5. Svježa otopina, maksimalna snaga čišćenja.",
  },
  {
    id: "iz-rbcp-2",
    phMin: 1.5,
    phMax: 4.0,
    colorName: "Narančasta",
    strength: "aktivno",
    label: "Aktivno — snaga opada",
    description: "Narančasta boja (pH 1.5–4.0) — sredstvo radi ali se troši.",
  },
  {
    id: "iz-rbcp-3",
    phMin: 4.0,
    phMax: undefined,
    colorName: "Crvena / Ljubičasta",
    strength: "iscrpljeno",
    label: "Iscrpljeno — exhaustion zone",
    description: "Crvena ili ljubičasta boja (pH >4.0) — kemija je bez učinka.",
  },
];

const RECTOR_BCP: Product = {
  id: "prod-rector-bcp-001",
  isDemo: false,
  name: "Rector — sredstvo za uklanjanje kamenca",
  brand: "Rector / Miloc",
  productType: "sredstvo_uklanjanje_kamenca",
  productCategory: "TECHNICAL_CLEANER",
  allowedCleaningModes: ["descaling"],
  form: "prah",
  status: "aktivan",
  statusPodataka: "iz_tds",
  purpose: "Prah na bazi mješavine kiselina s inhibitorima korozije za uklanjanje kamenca iz izmjenjivača topline, bojlera, HVAC sustava, cjevovoda i sustava grijanja. Originalni proizvod: Boiler Cleaner P Descaler, GEL S.p.A. Prikazan pod Rector / Miloc brendom.",
  note: "Indikator boje: žuta (aktivno) → narančasta (slabi) → crvena/ljubičasta (iscrpljeno). Ne ostavljati u sustavu dulje od 2 sata. Max. koncentracija: 15%. Obavezna neutralizacija nakon čišćenja.",

  // ── Kapacitet otapanja ─────────────────────────────────────────────────────
  // 1 kg Rector BCP može okvirno otopiti 0.5–0.6 kg CaCO₃ u optimalnim uvjetima.
  // Označiti kao: servisna procjena u optimalnim uvjetima.
  scalingCapacityKgCaCO3PerKg: { min: 0.5, max: 0.6 },
  scalingCapacityNote: "Servisna procjena: 1 kg sredstva može otopiti okvirno 0.5–0.6 kg CaCO₃ u optimalnim uvjetima.",

  // ── Thermal Efficiency Model ────────────────────────────────────────────────
  thermalEfficiencyModel: [
    { rangeLabel: "10 °C",       tempMin: 0,   tempMax: 10,  efficiency: "Vrlo spora reakcija.",                                    level: "slow"    },
    { rangeLabel: "20–30 °C",    tempMin: 20,  tempMax: 30,  efficiency: "Normalna reakcija.",                                      level: "normal"  },
    { rangeLabel: "35–40 °C",    tempMin: 35,  tempMax: 40,  efficiency: "Optimalna učinkovitost.",                                 level: "optimal" },
    { rangeLabel: "45–50 °C",    tempMin: 45,  tempMax: 50,  efficiency: "Agresivnija reakcija — povećan rizik za inhibitore.",     level: "caution" },
    { rangeLabel: ">50 °C",      tempMin: 50,  tempMax: 999, efficiency: "Upozorenje — moguća degradacija inhibitora korozije.",    level: "warning" },
  ],

  // ── Circulation Efficiency ──────────────────────────────────────────────────
  circulationNote: "Stalna cirkulacija pomoću pumpe za uklanjanje kamenca značajno povećava učinkovitost. Statičko namakanje smanjuje brzinu otapanja.",
  circulationRequired: true,

  // ── System Scale Logika ──────────────────────────────────────────────────��──
  // - Mali kućni izmjenjivači: tipično 200–300 g kamenca.
  // - Veliki spremnici: mogu sadržavati više kilograma kamenca.
  // - Brzi prelaz u crvenu + brzi rast pH → "Velika količina kamenca — moguće potrebna dodatna količina sredstva."
  systemScaleEstimates: [
    { label: "Mali kućni izmjenjivači",   estimateG: "200–300 g",  note: "Tipična količina kamenca u manjim sustavima." },
    { label: "Veliki spremnici / bojleri", estimateG: ">1 000 g",  note: "Mogu sadržavati više kilograma kamenca." },
  ],
  systemScaleWarning: "Velika količina kamenca — moguće potrebna dodatna količina sredstva.",

  // ── Reaction Stop Test ──────────────────────────────────────────────────────
  reactionStopCriteria: [
    "Boja ostaje stabilno žuta",
    "Nema CO₂ reakcije",
    "Protok stabilan",
    "Stanje stabilno najmanje 20 minuta",
  ],

  applicationCategory: "heating_closed",
  applicationSourceDocument: "GEL S.p.A. — Boiler Cleaner P Descaler TDS",
  applicationSourceNote: "Primjena za izmjenjivače topline, bojlere, HVAC sustave, cjevovode i sustave grijanja. Prikazan pod Rector / Miloc brendom.",

  sourceDocumentName: "GEL S.p.A. Boiler Cleaner P Descaler TDS",
  sourceDocumentType: "TDS",
  sourceDate: undefined,
  sourceVersion: undefined,
  sourceNote: "Originalni podaci: GEL S.p.A. Boiler Cleaner P Descaler. Distribuira se pod Rector / Miloc brendom.",

  neutralizationRequired: true,
  rinseRequired: true,
  rinse: "Potpuno isprati sustav. Provjeriti završni pH. Neutralizirati otpadnu otopinu prema lokalnim propisima.",

  // Doziranje: 1 kg / 10 L = 100 g/L → u g/L ekvivalentu: min 80, max 150 (15%)
  dosageMin: 80,
  dosageMax: 150,
  dosageUnit: "g_per_L",
  defaultStartingDose: 100,
  maxRecommendedDose: 150,
  topUpAllowed: true,
  dosageNote: "Standardno: 1 kg na 10 L vode. Maksimalno: 15% otopina. Ne ostavljati u sustavu dulje od ~2 sata.",
  hasMassBasedDosing: true,
  hasVolumeBasedDosing: false,
  allowedDoseUnits: ["kg", "g"],

  densityKgL: undefined,
  useDensityForMassConversion: false,
  densityNote: undefined,

  phZones: RECTOR_BCP_PH_ZONES,
  indicatorZones: RECTOR_BCP_INDICATOR_ZONES,

  hasColorIndicator: true,
  indicatorType: "color+bubbles+pH",
  colorIndicators: [
    {
      id: "ci-rbcp-1",
      colorName: "Žuta",
      colorHex: "#eab308",
      meaning: "Maksimalno aktivno (pH <1.5) — ultra jaka reakcija, intenzivno otapanje kamenca.",
      chemicalStatus: "fresh",
    },
    {
      id: "ci-rbcp-2",
      colorName: "Narančasta",
      colorHex: "#ea580c",
      meaning: "Aktivno ali slabi (pH 1.5–4.0) — sredstvo se troši.",
      chemicalStatus: "weakening",
    },
    {
      id: "ci-rbcp-3",
      colorName: "Crvena / Ljubičasta",
      colorHex: "#9333ea",
      meaning: "Iscrpljeno (pH >4.0) — exhaustion zone, bez kemijskog učinka.",
      chemicalStatus: "exhausted",
    },
  ],

  materialCompatibility: [
    { id: "mat-rbcp-1",  material: "Bakar",           compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-2",  material: "Čelik",           compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-3",  material: "Lijevano željezo",compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-4",  material: "Inox",            compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-5",  material: "Aluminij",        compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-6",  material: "Mjed",            compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-7",  material: "Aluminij",        compatibilityStatus: "compatible",  warning: "" },
    { id: "mat-rbcp-8",  material: "Nepoznato",       compatibilityStatus: "caution",     warning: "Materijal nije poznat — konzervativni postupak." },
  ],

  safetyNotes: {
    personalProtection: "Zaštitne rukavice, naočale i zaštitna odjeća obavezni.",
    ventilation: "Raditi u dobro prozračenom prostoru. Izbjegavati udisanje prašine pri doziranju.",
    maxTemperatureC: 50,
    minTemperatureC: 10,
    mixingProhibitions: "Ne miješati s lužinama i oksidansima.",
    rinseNote: "Potpuno isprati sustav čistom vodom. Provjeriti završni pH.",
    neutralizationNote: "Obavezna neutralizacija. Otpadnu otopinu neutralizirati prema lokalnim propisima.",
    generalNote: "Optimalna temperatura: 30–35 °C. Oprez: 35–45 °C. Ne koristiti na >50 °C. Ne ostavljati u sustavu dulje od ~2 sata. Max. koncentracija: 15%.",
  },

  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// Pravi proizvodi (verificirani prema TDS-u)
// Svi aktivni proizvodi
export const PROIZVODI: Product[] = [DS3, DS40, KAMCO_FX, RECTOR_BCP];

// Alias za kompatibilnost
export const DEMO_PROIZVODI: Product[] = PROIZVODI;
export const SVI_PROIZVODI: Product[] = PROIZVODI;
