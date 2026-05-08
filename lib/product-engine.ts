// ─── Product Engine Map ───────────────────────────────────────────────────────
//
// Centralni source of truth za svu live interpretaciju po proizvodu.
//
// Svaki proizvod ima vlastiti engine koji definira:
//   - indicator model (koje boje, što znači pjena, mjehurići)
//   - pH zone (iz TDS-a — specifične po proizvodu)
//   - saturation model (kada je kemija iscrpljena)
//   - thermal model (utjecaj temperature na reakciju)
//   - warning model (koja upozorenja prikazati)
//   - finish-cycle kriteriji (kada zaustaviti ciklus)
//   - compatibility (maks. temp, trajanje, neutralizacija)
//
// NIKAD ne koristiti hardcoded logiku po komponentama.
// NIKAD ne koristiti iste granice ili iste boje za sve proizvode.
// Svi live rezultati moraju dolaziti iz selectedProductEngine.
//
// Za dodavanje novog proizvoda: dodati novi EngineId u product-engine-types.ts
// i novi unos u productEngineMap ispod.

import type {
  ProductEngine,
  ProductEngineId,
} from "./product-engine-types";

// ─── Fernox DS-3 Engine ───────────────────────────────────────────────────────
// Aktivna tvar: sulfaminska (sulfamidna) kiselina — kristali/prah.
// Indikator: boja + pjena (color+foam).
// Boje: Žuta (pH <2.0, max aktivnost) → Zelena (pH 2.0–3.5, slabi) → Plava (pH >3.5, potrošena).
// Pjena: bijela i jaka = aktivno otapanje kamenca. Nema pjene = iscrpljeno.
// Finish-cycle: boja ostaje Plava + nema pjene + pH stabilan.

const ENGINE_DS3: ProductEngine = {
  id: "ds3",
  name: "DS-3 Engine",
  productName: "Fernox DS-3",
  brand: "Fernox",

  indicatorModel: "color+foam",
  saturationModel: "foam_stops",
  warningModel: "foam_based",

  phZones: [
    { phMin: undefined, phMax: 2.5,  label: "Aktivna reakcija",         status: "active",    description: "Svježa / jaka kisela otopina. Jaka bijela pjena = aktivno otapanje kamenca." },
    { phMin: 2.5,       phMax: 3.5,  label: "Reakcija slabi",           status: "weakening", description: "Kemija se troši, ali još može raditi. Pratiti pjenu i pH. Razmotriti nadopunu." },
    { phMin: 3.5,       phMax: 4.5,  label: "Reakcija pri kraju",       status: "weakening", description: "Kemija je oslabljena. Razmotriti nadopunu ili novi ciklus." },
    { phMin: 4.5,       phMax: undefined, label: "Sredstvo iscrpljeno", status: "exhausted", description: "Kemija više nema dovoljan reakcijski kapacitet. Preporučuje se novi ciklus ili završetak." },
  ],
  exhaustionPH: 4.5,

  colorZones: [
    {
      colorName: "Žuta",
      colorHex: "#eab308",
      phMax: 2.0,
      label: "Maksimalna aktivnost",
      description: "Intenzivna žuta boja. Sredstvo je na punoj snazi. Jaka bijela pjena potvrđuje aktivno otapanje kamenca.",
      chemicalStrength: "maksimalno",
      action: "Nastaviti ciklus. Pratiti pjenu.",
    },
    {
      colorName: "Zelena",
      colorHex: "#22c55e",
      phMin: 2.0,
      phMax: 3.5,
      label: "Djelomično istrošeno",
      description: "Zelena boja — sredstvo je još aktivno, ali snaga opada. Pjena se smanjuje.",
      chemicalStrength: "slabi",
      action: "Pratiti pH i pjenu. Razmotriti nadopunu.",
    },
    {
      colorName: "Plava",
      colorHex: "#3b82f6",
      phMin: 3.5,
      label: "Sredstvo potrošeno",
      description: "Plava boja — sredstvo je potrošeno. Nema pjene. Reakcija se zaustavila.",
      chemicalStrength: "iscrpljeno",
      action: "Isprati sustav. Novi ciklus ili završiti.",
    },
  ],

  foamLogic: {
    foamActiveLevel: ["jaka", "vrlo_jaka"],
    foamWeakeningLevel: ["slaba", "srednja"],
    noFoamMeaning: "Nema pjene — kemijska reakcija je završena ili sredstvo potrošeno.",
    whiteFoamMeaning: "Bijela pjena = aktivno otapanje kamenca (karbonati reagiraju s kiselinom).",
    darkFoamMeaning: "Tamna ili prljava pjena — moguće prisutne korozijske naslage ili mulj.",
  },

  thermalModel: [
    { rangeLabel: "<20 °C",    tempMin: 0,   tempMax: 20,  efficiency: "Spora reakcija — preporučeno zagrijati sustav.",        level: "slow"    },
    { rangeLabel: "20–40 °C",  tempMin: 20,  tempMax: 40,  efficiency: "Normalna do dobra reakcija.",                          level: "normal"  },
    { rangeLabel: "40–60 °C",  tempMin: 40,  tempMax: 60,  efficiency: "Optimalna učinkovitost — brže otapanje kamenca.",      level: "optimal" },
    { rangeLabel: "60–80 °C",  tempMin: 60,  tempMax: 80,  efficiency: "Ubrzana reakcija — pratiti i ne prekoračiti 80 °C.",   level: "caution" },
    { rangeLabel: ">80 °C",    tempMin: 80,  tempMax: 999, efficiency: "Upozorenje — prekoračena maksimalna temperatura.",     level: "warning" },
  ],

  finishCycleCriteria: {
    criteria: [
      "Boja ostaje stabilno Plava",
      "Nema pjene u otopini",
      "pH stabilan u zoni >3.5",
      "Stanje stabilno najmanje 15 minuta",
    ],
    note: "Isprati čistom vodom do neutralnog pH prije puštanja sustava u pogon.",
  },

  compatibility: {
    maxTempC: 80,
    minTempC: 5,
    maxConcentration: 10,
    maxCycleDurationMinutes: 120,
    neutralizationRequired: true,
    rinseRequired: true,
    note: "Optimalna radna temperatura: 40–60°C. Nije kompatibilno s aluminijem, cinkom, emajlom.",
  },

  applicationNote: "Kristali/prah za TPV/DHW sustave, izmjenjivače topline, bojlere i sanitarne sustave.",
};

// ─── Kamco ScaleBreaker FX Engine ────────────────────────────────────────────
// Aktivna tvar: fosforna kiselina (indikator metil-oranž tip).
// Indikator: boja + mjehurići (color+bubbles).
// 6 boja prema pH: Tamno crvena (<1.0) → Intenzivno ružičasta (1.0–2.0) →
//   Narančasto-crvena (2.0–2.8) → Žuto-narančasta (3.0–3.5) → Žuta jantar (3.5–5.0) → Zelena (>5.5).
// KRITIČNA TOČKA: pH 3.0 — iznad toga učinkovitost pada >80%.
// Mjehurići = CO₂ reakcija = aktivno otapanje.
// Ciljana radna boja: Intenzivno ružičasta (pH 1.0–2.0).

const ENGINE_SCALEBREAKER_FX: ProductEngine = {
  id: "scalebreaker_fx",
  name: "ScaleBreaker FX Engine",
  productName: "Kamco ScaleBreaker FX",
  brand: "Kamco",

  indicatorModel: "color+bubbles",
  saturationModel: "color_pH_3",
  warningModel: "critical_pH_3",

  phZones: [
    { phMin: undefined, phMax: 1.0,      label: "Koncentrat",         status: "too_strong",  description: "Ultra jaka koncentracija. Burna reakcija — pratiti materijale." },
    { phMin: 1.0,       phMax: 2.0,      label: "Optimalna zona",     status: "optimal",     description: "Ciljana radna zona. Intenzivno ružičasta boja + mjehurići = aktivno otapanje." },
    { phMin: 2.0,       phMax: 3.0,      label: "Oslabljeno",         status: "active",      description: "Sredstvo još radi ali usporava. Razmotriti nadopunu." },
    { phMin: 3.0,       phMax: 3.5,      label: "Kritična točka",     status: "weakening",   description: "pH prešao 3.0 — učinkovitost pala >80%. Dodati svježi FX odmah." },
    { phMin: 3.5,       phMax: 5.5,      label: "Kemijski mrtvo",     status: "exhausted",   description: "Nema slobodne kiseline. Reakcija 0%. Zamijeniti otopinu." },
    { phMin: 5.5,       phMax: undefined, label: "Neutralizirano",    status: "neutralized", description: "Otopina neutralizirana. Sigurno za ispuštanje uz provjeru propisa." },
  ],
  criticalPH: 3.0,
  exhaustionPH: 3.5,

  colorZones: [
    {
      colorName: "Tamno crvena",
      colorHex: "#991b1b",
      phMax: 1.0,
      label: "Koncentrat — ultra jaka",
      description: "Tamno crvena — sredstvo u koncentratu. Burna reakcija, pratiti materijale i sigurnost.",
      chemicalStrength: "maksimalno",
      action: "Pratiti temperaturu i materijale. Osigurati cirkulaciju.",
    },
    {
      colorName: "Intenzivno ružičasta",
      colorHex: "#ec4899",
      phMin: 1.0,
      phMax: 2.0,
      label: "Optimalna zona",
      description: "Ciljana radna boja. Intenzivno ružičasta + mjehurići = aktivna CO₂ reakcija s kamencem.",
      chemicalStrength: "aktivno",
      action: "Nastaviti ciklus. Mjehurići potvrđuju aktivno otapanje.",
    },
    {
      colorName: "Narančasto-crvena",
      colorHex: "#f97316",
      phMin: 2.0,
      phMax: 2.8,
      label: "Oslabljeno — usporava",
      description: "Narančasto-crvena — sredstvo blizu zasićenja. Mjehurići slabe.",
      chemicalStrength: "slabi",
      action: "Razmotriti nadopunu svježim FX.",
    },
    {
      colorName: "Žuto-narančasta",
      colorHex: "#f59e0b",
      phMin: 3.0,
      phMax: 3.5,
      label: "Kritična točka",
      description: "Žuto-narančasta — pH prešao 3.0. Učinkovitost pala >80%. Otapanje gotovo staje.",
      chemicalStrength: "slabi",
      action: "DODATI SVJEŽI FX ODMAH ili završiti ciklus.",
    },
    {
      colorName: "Žuta (jantar)",
      colorHex: "#eab308",
      phMin: 3.5,
      phMax: 5.5,
      label: "Kemijski mrtvo",
      description: "Žuta (jantar) — nema slobodne kiseline. Reakcija 0%. 1L FX je vezao ~0.5 kg kamenca.",
      chemicalStrength: "iscrpljeno",
      action: "Zamijeniti otopinu svježim FX.",
    },
    {
      colorName: "Zelena / prljava",
      colorHex: "#65a30d",
      phMin: 5.5,
      label: "Neutralizirano",
      description: "Zelena ili prljava — otopina neutralizirana. Sigurno za ispuštanje.",
      chemicalStrength: "neutralizirano",
      action: "Ispustiti i ispirati do bistrog izljeva.",
    },
  ],

  bubblingLogic: {
    strongBubblingMeaning: "Jak bubbling = aktivna CO₂ reakcija = kamenac se aktivno otapa.",
    weakBubblingMeaning: "Slab bubbling = reakcija usporava, sredstvo blizu zasićenja.",
    noBubblingMeaning: "Nema mjehurića pri ružičastoj boji = reakcija završena ili sustav čist.",
  },

  thermalModel: [
    { rangeLabel: "<20 °C",    tempMin: 0,   tempMax: 20,  efficiency: "Spora reakcija — preporučeno zagrijati sustav.",       level: "slow"    },
    { rangeLabel: "20–40 °C",  tempMin: 20,  tempMax: 40,  efficiency: "Normalna reakcija.",                                   level: "normal"  },
    { rangeLabel: "40–50 °C",  tempMin: 40,  tempMax: 50,  efficiency: "Optimalna učinkovitost.",                              level: "optimal" },
    { rangeLabel: "50–70 °C",  tempMin: 50,  tempMax: 70,  efficiency: "Ubrzana reakcija — pratiti materijale.",              level: "caution" },
    { rangeLabel: ">70 °C",    tempMin: 70,  tempMax: 999, efficiency: "Upozorenje — prekoračena maksimalna temperatura.",    level: "warning" },
  ],

  finishCycleCriteria: {
    criteria: [
      "Boja stabilno Ružičasta + nema mjehurića ≥20 min (sustav čist)",
      "ILI boja prešla u Žutu (jantar) — kemijski mrtvo",
      "Nema CO₂ reakcije",
      "Protok stabilan",
    ],
    note: "Ružičasta + nema mjehurića = sustav bez kamenca. Žuta = kemija iscrpljena. U oba slučaja zamijeniti ili isprati.",
  },

  compatibility: {
    maxTempC: 70,
    minTempC: 5,
    maxConcentration: 20,
    maxCycleDurationMinutes: 180,
    neutralizationRequired: true,
    rinseRequired: true,
    note: "Kritična točka pH 3.0. Nije kompatibilno s aluminijem i galvaniziranim čelikom.",
  },

  applicationNote: "Tekuće kiselo sredstvo za TPV/DHW sustave, izmjenjivače topline, bojlere. Ciljana radna boja: Intenzivno ružičasta.",
};

// ─── Fernox DS-40 Engine ──────────────────────────────────────────────────────
// Aktivna tvar: limunska kiselina s inhibitorima.
// Indikator: boja + pjena + magnetit/sludge (color+foam+sludge).
// Boje: Deep Red (pH 1.5–2.5) → Pink/Magenta (pH ~3.0) → Orange (pH 3.5–4.5) → Yellow/Dirty Green (pH >5.0).
// Specifično: detekcija magnetita/black sludge (magnetski filter).
// Kompatibilno s aluminijem — za razliku od DS-3.
// Nije za: single feed indirect cylinders, Primatic sustave.

const ENGINE_DS40: ProductEngine = {
  id: "ds40",
  name: "DS-40 Engine",
  productName: "Fernox DS-40",
  brand: "Fernox",

  indicatorModel: "color+foam+sludge",
  saturationModel: "color_darkens",
  warningModel: "magnetit",

  phZones: [
    { phMin: 1.5,       phMax: 2.5,      label: "Maksimalna snaga",      status: "active",    description: "Deep Red — svježa otopina, intenzivno otapanje kamenca i black sludge." },
    { phMin: 2.5,       phMax: 3.5,      label: "Radna zona",            status: "optimal",   description: "Pink/Magenta (~pH 3.0) — aktivna radna zona. Pratiti CO₂ reakciju i pjenu." },
    { phMin: 3.5,       phMax: 5.0,      label: "Kritična zona",         status: "weakening", description: "Orange (pH 3.5–4.5) — sredstvo slabi. Ako je sustav još prljav — dodati DS-40." },
    { phMin: 5.0,       phMax: undefined, label: "Iscrpljeno",           status: "exhausted", description: "Yellow/Dirty Green (pH >5.0) — bez kemijskog učinka. Dodati DS-40 ili neutralizirati." },
  ],
  exhaustionPH: 5.0,

  colorZones: [
    {
      colorName: "Deep Red",
      colorHex: "#b91c1c",
      phMin: 1.5,
      phMax: 2.5,
      label: "Svježa otopina — maksimalna snaga",
      description: "Tamno crvena — otopina svježa, snaga maksimalna. Intenzivno otapanje kamenca i black sludge.",
      chemicalStrength: "maksimalno",
      action: "Nastaviti ciklus. Pratiti pjenu i magnetski filter.",
    },
    {
      colorName: "Pink / Magenta",
      colorHex: "#db2777",
      phMin: 2.5,
      phMax: 3.5,
      label: "Radna zona — aktivna",
      description: "Ružičasta/magenta (~pH 3.0) — sredstvo u radnoj zoni, aktivno reagira.",
      chemicalStrength: "aktivno",
      action: "Nastaviti. Pratiti magnetski filter za sludge.",
    },
    {
      colorName: "Orange",
      colorHex: "#ea580c",
      phMin: 3.5,
      phMax: 4.5,
      label: "Kritična zona — dodati DS-40",
      description: "Narančasta (pH 3.5–4.5) — sredstvo slabi. Ako je sustav još prljav, dodati DS-40.",
      chemicalStrength: "slabi",
      action: "Ako magnetski filter skuplja talog — dodati DS-40. Ako je čist — završiti.",
    },
    {
      colorName: "Yellow / Dirty Green",
      colorHex: "#ca8a04",
      phMin: 5.0,
      label: "Iscrpljeno — bez učinka",
      description: "Žuta ili prljavo-zelena (pH >5.0) — sredstvo bez kemijskog učinka.",
      chemicalStrength: "iscrpljeno",
      action: "Dodati DS-40 ili završiti i neutralizirati s priloženim Neutraliserom.",
    },
  ],

  foamLogic: {
    foamActiveLevel: ["jaka", "vrlo_jaka"],
    foamWeakeningLevel: ["slaba", "srednja"],
    noFoamMeaning: "Nema pjene — kemijska reakcija je završena.",
    whiteFoamMeaning: "Bijela pjena = aktivno otapanje kamenca.",
    darkFoamMeaning: "Tamna ili crna pjena — prisutan black sludge / magnetit. Pratiti magnetski filter.",
  },

  sludgeLogic: {
    magnetFilterActiveMeaning: "Magnetski filter skuplja crni talog (magnetit) — sustav je onečišćen. Nastaviti dok se ne zaustavi skupljanje.",
    magnetFilterInactiveMeaning: "Magnetski filter više ne skuplja talog — sludge je uklonjen. Razmotriti završetak.",
    indicatorOverrideWarning: "Crni mulj (magnetit) može prekriti ili zamutiti indikator boje — u tom slučaju rezultat boje nije pouzdan.",
  },

  thermalModel: [
    { rangeLabel: "<20 °C",    tempMin: 0,   tempMax: 20,  efficiency: "Spora reakcija.",                                       level: "slow"    },
    { rangeLabel: "20–40 °C",  tempMin: 20,  tempMax: 40,  efficiency: "Normalna reakcija.",                                    level: "normal"  },
    { rangeLabel: "40–50 °C",  tempMin: 40,  tempMax: 50,  efficiency: "Optimalna učinkovitost.",                               level: "optimal" },
    { rangeLabel: ">50 °C",    tempMin: 50,  tempMax: 999, efficiency: "Upozorenje — prekoračena maksimalna temperatura.",     level: "warning" },
  ],

  finishCycleCriteria: {
    criteria: [
      "Magnetski filter više ne skuplja crni talog",
      "Boja stabilna u zoni Yellow/Dirty Green",
      "Nema pjene",
      "Protok stabilan",
    ],
    note: "Dodati System Neutraliser dok se otopina ne okrene u žutu prema uputi. Isprati do bistrog izljeva. Preporučuje se Fernox Protector F1 nakon čišćenja.",
  },

  compatibility: {
    maxTempC: 50,
    minTempC: 10,
    maxConcentration: 100, // g/L specifičan — upotreba po pakiranju
    maxCycleDurationMinutes: 480,
    neutralizationRequired: true,
    rinseRequired: true,
    note: "Kompatibilno s aluminijem. Nije za single feed indirect cylinders i Primatic sustave.",
  },

  applicationNote: "Prah za CH sustave, powerflushing, magnetit/black sludge. Kompatibilno s aluminijem.",
};

// ─── Rector / Miloc BCP Engine ────────────────────────────────────────────────
// Originalni proizvođač: GEL S.p.A. (Boiler Cleaner P Descaler).
// Aktivna tvar: mješavina kiselina s inhibitorima korozije.
// Indikator: boja + CO₂ bubbling + pH (color+bubbles+pH).
// Mapa boja:
//   Žuta  (pH <1.5)  → maksimalno aktivno (ultra jaka reakcija)
//   Narančasta (pH 1.5–4.0) → aktivno, snaga opada
//   Crvena/Ljubičasta (pH >4.0) → iscrpljeno (exhaustion zone)
// CO₂ bubbling = aktivna reakcija s kamencem.
// Temperatura: optimalno 30–35°C, oprez 35–45°C, warning >50°C.
// MAX trajanje: ~2 sata. MAX koncentracija: 15%.

const ENGINE_RECTOR_DESCALER: ProductEngine = {
  id: "rector_descaler",
  name: "Rector BCP Engine",
  productName: "Rector — sredstvo za uklanjanje kamenca",
  brand: "Rector / Miloc",

  indicatorModel: "color+bubbles+pH",
  saturationModel: "pH_threshold",
  warningModel: "inhibitor",

  phZones: [
    { phMin: undefined, phMax: 1.5,      label: "Maksimalno aktivno",   status: "active",    description: "Žuta boja — pH <1.5. Svježa otopina, ultra jaka reakcija, intenzivno otapanje kamenca." },
    { phMin: 1.5,       phMax: 4.0,      label: "Aktivno — snaga opada", status: "weakening", description: "Narančasta boja (pH 1.5–4.0) — kiselina aktivna ali snaga opada. Pratiti stanje." },
    { phMin: 4.0,       phMax: undefined, label: "Iscrpljeno",          status: "exhausted", description: "Crvena/ljubičasta boja (pH >4.0) — exhaustion zone. Bez kemijskog učinka." },
  ],
  exhaustionPH: 4.0,

  colorZones: [
    {
      colorName: "Žuta",
      colorHex: "#eab308",
      phMax: 1.5,
      label: "Maksimalno aktivno",
      description: "Žuta boja (pH <1.5) — svježa otopina, maksimalna snaga. CO₂ bubbling potvrđuje aktivno otapanje.",
      chemicalStrength: "maksimalno",
      action: "Nastaviti ciklus. Pratiti CO₂ reakciju i temperaturu.",
    },
    {
      colorName: "Narančasta",
      colorHex: "#ea580c",
      phMin: 1.5,
      phMax: 4.0,
      label: "Aktivno — snaga opada",
      description: "Narančasta boja (pH 1.5–4.0) — sredstvo radi ali se troši. CO₂ bubbling usporava.",
      chemicalStrength: "slabi",
      action: "Pratiti brzinu rasta pH. Razmotriti nadopunu.",
    },
    {
      colorName: "Crvena / Ljubičasta",
      colorHex: "#9333ea",
      phMin: 4.0,
      label: "Iscrpljeno — exhaustion zone",
      description: "Crvena ili ljubičasta (pH >4.0) — kemija bez učinka. Nema CO₂ reakcije.",
      chemicalStrength: "iscrpljeno",
      action: "Završiti ciklus. Neutralizirati i isprati.",
    },
  ],

  bubblingLogic: {
    strongBubblingMeaning: "Jak CO₂ bubbling = aktivna reakcija = kamenac se aktivno otapa.",
    weakBubblingMeaning: "Slab bubbling = reakcija usporava, sredstvo troši snagu.",
    noBubblingMeaning: "Nema CO₂ reakcije — otapanje završeno ili sredstvo iscrpljeno.",
  },

  thermalModel: [
    { rangeLabel: "<10 °C",    tempMin: 0,   tempMax: 10,  efficiency: "Vrlo spora reakcija.",                                                    level: "slow"    },
    { rangeLabel: "20–30 °C",  tempMin: 20,  tempMax: 30,  efficiency: "Normalna reakcija.",                                                      level: "normal"  },
    { rangeLabel: "35–40 °C",  tempMin: 35,  tempMax: 40,  efficiency: "Optimalna učinkovitost.",                                                 level: "optimal" },
    { rangeLabel: "45–50 °C",  tempMin: 45,  tempMax: 50,  efficiency: "Agresivnija reakcija — povećan rizik za inhibitore korozije.",            level: "caution" },
    { rangeLabel: ">50 °C",    tempMin: 50,  tempMax: 999, efficiency: "Upozorenje — moguća degradacija inhibitora korozije. Zaustaviti.",        level: "warning" },
  ],

  finishCycleCriteria: {
    criteria: [
      "Boja ostaje stabilno Žuta",
      "Nema CO₂ reakcije (bubbling se zaustavio)",
      "Protok stabilan",
      "Stanje stabilno najmanje 20 minuta",
    ],
    note: "Ne ostavljati u sustavu dulje od ~2 sata. Obavezna neutralizacija nakon čišćenja.",
  },

  compatibility: {
    maxTempC: 50,
    minTempC: 10,
    maxConcentration: 15,
    maxCycleDurationMinutes: 120,
    neutralizationRequired: true,
    rinseRequired: true,
    note: "MAX 2 sata kontakta. MAX 15% koncentracija. Oprez >45°C (degradacija inhibitora). Optimalno 30–35°C.",
  },

  applicationNote: "Prah za izmjenjivače topline, bojlere, HVAC sustave, cjevovode. Distribuira se pod Rector/Miloc brendom.",
};

// ─── Generic fallback engine ──────────────────────────────────────────────────
// Koristi se za proizvode bez specifičnog enginea.
// Generička logika — ne koristiti kao source of truth za specifične proizvode.

const ENGINE_GENERIC: ProductEngine = {
  id: "generic",
  name: "Generic Engine",
  productName: "Nepoznati proizvod",
  brand: "—",

  indicatorModel: "generic",
  saturationModel: "generic_pH",
  warningModel: "generic",

  phZones: [
    { phMin: undefined, phMax: 1.5,      label: "Jako aktivno",          status: "too_strong",  description: "pH <1.5 — sredstvo je jako. Pratiti materijale i sigurnost." },
    { phMin: 1.5,       phMax: 3.0,      label: "Aktivna zona",          status: "optimal",     description: "pH 1.5–3.0 — sredstvo aktivno radi." },
    { phMin: 3.0,       phMax: 4.0,      label: "Slabi",                 status: "weakening",   description: "pH 3.0–4.0 — reakcija slabi. Razmotriti nadopunu." },
    { phMin: 4.0,       phMax: undefined, label: "Iscrpljeno",           status: "exhausted",   description: "pH >4.0 — sredstvo vjerojatno iscrpljeno." },
  ],
  exhaustionPH: 4.0,

  colorZones: [],

  thermalModel: [
    { rangeLabel: "<20 °C",    tempMin: 0,   tempMax: 20,  efficiency: "Spora reakcija.",          level: "slow"    },
    { rangeLabel: "20–40 °C",  tempMin: 20,  tempMax: 40,  efficiency: "Normalna reakcija.",       level: "normal"  },
    { rangeLabel: "40–60 °C",  tempMin: 40,  tempMax: 60,  efficiency: "Dobra reakcija.",          level: "optimal" },
    { rangeLabel: ">60 °C",    tempMin: 60,  tempMax: 999, efficiency: "Pratiti temperaturu.",     level: "caution" },
  ],

  finishCycleCriteria: {
    criteria: [
      "pH stabilan u iscrpljenoj zoni",
      "Nema vidljive reakcije",
      "Protok stabilan",
    ],
  },

  compatibility: {
    maxTempC: 60,
    minTempC: 5,
    maxConcentration: 10,
    maxCycleDurationMinutes: 120,
    neutralizationRequired: true,
    rinseRequired: true,
  },

  applicationNote: "Generička logika — koristiti samo ako za odabrani proizvod ne postoji specifični engine.",
};

// ─── productEngineMap ─────────────────────────────────────────────────────────
//
// Centralni map svih dostupnih enginea.
// Key = ProductEngineId iz product-engine-types.ts.

export const productEngineMap: Record<ProductEngineId, ProductEngine> = {
  ds3:              ENGINE_DS3,
  scalebreaker_fx:  ENGINE_SCALEBREAKER_FX,
  ds40:             ENGINE_DS40,
  rector_descaler:  ENGINE_RECTOR_DESCALER,
  generic:          ENGINE_GENERIC,
};

// ─── getProductEngine ─────────────────────────────────────────────────────────
//
// Pronalazi engine prema productSnapshot-u (name, indicatorType, brand).
// Ovo je jedina funkcija koja smije biti pozvana iz komponenti.
// Nikad ne koristiti productEngineMap direktno u komponentama.
//
// Logika detekcije:
//  1. indicatorType (pouzdan, iz TDS podataka)
//  2. name.toLowerCase() match
//  3. brand.toLowerCase() match
//  4. Fallback → generic engine

export function getProductEngine(
  productSnapshot:
    | { indicatorType?: string; name?: string; brand?: string }
    | undefined
    | null
): ProductEngine {
  if (!productSnapshot) return ENGINE_GENERIC;

  const { indicatorType, name, brand } = productSnapshot;
  const nameLower  = name?.toLowerCase()  ?? "";
  const brandLower = brand?.toLowerCase() ?? "";

  // ScaleBreaker FX
  if (
    indicatorType === "color+bubbles" ||
    nameLower.includes("scalebreaker") ||
    nameLower.includes("scale breaker") ||
    nameLower.includes("scalebreaker fx") ||
    (brandLower.includes("kamco") && nameLower.includes("fx")) ||
    (nameLower.includes("kamco") && nameLower.includes("fx"))
  ) {
    return ENGINE_SCALEBREAKER_FX;
  }

  // Rector BCP
  if (
    indicatorType === "color+bubbles+pH" ||
    nameLower.includes("rector") ||
    brandLower.includes("rector") ||
    nameLower.includes("boiler cleaner p") ||
    nameLower.includes("miloc")
  ) {
    return ENGINE_RECTOR_DESCALER;
  }

  // DS-40 (mora biti PRIJE DS-3 jer DS-40 naziv uključuje "40")
  if (
    indicatorType === "color+foam+sludge" ||
    nameLower.includes("ds-40") ||
    nameLower.includes("ds40")
  ) {
    return ENGINE_DS40;
  }

  // DS-3
  if (
    indicatorType === "color+foam" ||
    nameLower.includes("ds-3") ||
    nameLower.includes("ds3")
  ) {
    return ENGINE_DS3;
  }

  // Generic fallback — ako naziv proizvoda nije prepoznat, ne pretpostavljati engine
  return ENGINE_GENERIC;
}

// ─── getProductEngineById ─────────────────────────────────────────────────────
//
// Direktan pristup po ID-u — koristiti samo kada je ID poznat (npr. test, debug).

export function getProductEngineById(id: ProductEngineId): ProductEngine {
  return productEngineMap[id] ?? ENGINE_GENERIC;
}
