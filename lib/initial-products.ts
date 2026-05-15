// ─── Inicijalni proizvodi za bazu ─────────────────────────────────────────────
// Ovo su pravi proizvodi za HVAC descaling. Podaci iz tehnickih listova.

import type { Product } from "./product-types";

const now = new Date().toISOString();

export const INITIAL_PRODUCTS: Product[] = [
  // ─── Kamco Scalebreaker FX ──────────────────────────────────────────────────
  {
    id: "prod-kamco-fx",
    name: "Scalebreaker FX",
    brand: "Kamco",
    verificationStatus: "verified",
    productType: "sredstvo_uklanjanje_kamenca",
    productCategory: "TPV_DESCALER",
    allowedCleaningModes: ["descaling"],
    form: "tekucina",
    applicationCategory: "dhw_potable",
    applicationSourceDocument: "Kamco Scalebreaker FX Technical Data Sheet",
    applicationSourceNote: "Potvrdjeno za PTV/TPV sustave, sigurno za bakar i inox",
    status: "aktivan",
    statusPodataka: "iz_tds",
    purpose: "Uklanjanje kamenca iz spremnika TPV, spirala, bojlera i kalorimetra",
    note: "Sadrzi inhibitore korozije. Siguran za bakar, inox, mesing. Pink indikator boje.",

    // Source
    sourceDocumentName: "Kamco Scalebreaker FX TDS",
    sourceDocumentType: "tds",
    sourceDate: "2024-01-15",
    sourceVersion: "v3.2",
    sourceNote: "Sluzbeni tehnicki list proizvodaca",

    // Dosage
    dosageMin: 5,
    dosageMax: 10,
    dosageUnit: "percent",
    defaultStartingDose: 7,
    maxRecommendedDose: 10,
    topUpAllowed: true,
    dosageNote: "5-10% ovisno o razini kamenca. Poceti s 7% za standardne situacije.",

    // Density
    densityKgL: 1.05,
    useDensityForMassConversion: true,
    densityNote: "Gustoca prema TDS: ~1.05 kg/L",

    // pH zones
    phZones: [
      {
        id: "z-fx-1",
        label: "Prejako",
        phMax: 1.0,
        description: "Sredstvo je prekoncetirano. Razrijediti.",
        status: "too_strong",
      },
      {
        id: "z-fx-2",
        label: "Aktivno",
        phMin: 1.0,
        phMax: 2.5,
        description: "Sredstvo aktivno otapa kite. Roze boja.",
        status: "active",
      },
      {
        id: "z-fx-3",
        label: "Optimalno",
        phMin: 2.5,
        phMax: 3.5,
        description: "Optimalna radna zona. Roze do svijetlo roze.",
        status: "optimal",
      },
      {
        id: "z-fx-4",
        label: "Slabi",
        phMin: 3.5,
        phMax: 5.0,
        description: "Reakcija slabi. Razmotriti nadopunu.",
        status: "weakening",
      },
      {
        id: "z-fx-5",
        label: "Iscrpljeno",
        phMin: 5.0,
        description: "Sredstvo iscrpljeno. Potreban novi ciklus ili nadopuna.",
        status: "exhausted",
      },
    ],

    // Indicator zones
    indicatorZones: [
      {
        id: "iz-fx-1",
        phMax: 2.5,
        colorName: "Roze (tamna)",
        strength: "jako",
        label: "Jako aktivno",
        description: "Sredstvo je jako i aktivno otapa kamenac.",
      },
      {
        id: "iz-fx-2",
        phMin: 2.5,
        phMax: 4.0,
        colorName: "Roze (svijetla)",
        strength: "aktivno",
        label: "Aktivno",
        description: "Sredstvo radi u normalnoj zoni.",
      },
      {
        id: "iz-fx-3",
        phMin: 4.0,
        phMax: 5.5,
        colorName: "Blijedo roze",
        strength: "slabi",
        label: "Slabi",
        description: "Reakcija usporava. Razmotriti nadopunu.",
      },
      {
        id: "iz-fx-4",
        phMin: 5.5,
        colorName: "Bezbojna / prozirna",
        strength: "iscrpljeno",
        label: "Iscrpljeno",
        description: "Sredstvo je neutralizirano. Potrebna zamjena.",
      },
    ],

    // Color indicator
    hasColorIndicator: true,
    indicatorType: "color+bubbles",
    colorIndicators: [
      {
        id: "ci-fx-1",
        colorName: "Roze (tamna)",
        colorHex: "#FF69B4",
        meaning: "Sredstvo je jako i aktivno",
        chemicalStatus: "fresh",
      },
      {
        id: "ci-fx-2",
        colorName: "Roze (svijetla)",
        colorHex: "#FFB6C1",
        meaning: "Sredstvo radi normalno",
        chemicalStatus: "active",
      },
      {
        id: "ci-fx-3",
        colorName: "Blijedo roze",
        colorHex: "#FFE4E9",
        meaning: "Sredstvo slabi - razmotriti nadopunu",
        chemicalStatus: "weakening",
      },
      {
        id: "ci-fx-4",
        colorName: "Bezbojna",
        colorHex: "#F0F0F0",
        meaning: "Sredstvo iscrpljeno - potrebna zamjena",
        chemicalStatus: "exhausted",
      },
    ],

    // Material compatibility
    materialCompatibility: [
      { id: "mat-fx-1", material: "Bakar", compatibilityStatus: "compatible", warning: "" },
      { id: "mat-fx-2", material: "Inox", compatibilityStatus: "compatible", warning: "" },
      { id: "mat-fx-3", material: "Mesing", compatibilityStatus: "compatible", warning: "" },
      { id: "mat-fx-4", material: "Čelik", compatibilityStatus: "caution", warning: "Samo kratkorocno. Isprati nakon upotrebe.", maxContactTimeMinutes: 60 },
      { id: "mat-fx-5", material: "Aluminij", compatibilityStatus: "not_recommended", warning: "Ne koristiti na aluminiju." },
      { id: "mat-fx-6", material: "Pocinčani čelik", compatibilityStatus: "not_recommended", warning: "Moze ostetiti pocincanu povrsinu." },
    ],

    // Rinse & neutralization
    neutralizationRequired: true,
    neutralizerProduct: "Kamco SystemSafe",
    rinseRequired: true,
    rinse: "Isprati cistom vodom dok pH ne dosegne 6.5-7.5",

    // Scale capacity
    scaleDissolvingCapacityCaCO3: 0.5,
    scaleDissolvingCapacityUnit: "kg CaCO3 per L proizvoda",
    manufacturerScaleRemovalNote: "1L Scalebreaker FX otapa oko 500g kamenca (CaCO3)",

    // Safe/Not for
    safeFor: ["PTV/TPV sustavi", "Bojleri", "Kalorimetri", "Spirale", "Bakar", "Inox", "Mesing"],
    notFor: ["Aluminij", "Pocinčani čelik", "Otvoreni sustavi bez ispiranja"],

    // Reaction stop
    reactionStopCriteria: [
      "pH stabilan iznad 5.0 vise od 15 minuta",
      "Boja postala bezbojna/prozirna",
      "Nema vise mjehurića pri cirkulaciji",
    ],

    // Safety
    safetyNotes: {
      personalProtection: "Rukavice, zastitne naocale, pregaca",
      ventilation: "Osigurati dobru ventilaciju",
      maxTemperatureC: 60,
      minTemperatureC: 5,
      mixingProhibitions: "Ne mijesati s drugim kemikalijama ili kiselinama",
      rinseNote: "Temeljito isprati nakon zavrsetka",
      neutralizationNote: "Neutralizirati s Kamco SystemSafe ili slicnim",
      generalNote: "Cuvati izvan dohvata djece. Pohraniti na hladnom mjestu.",
    },

    // Timestamps
    createdAt: now,
    updatedAt: now,
  },
];
