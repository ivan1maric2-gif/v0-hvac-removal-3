"use client";

import React from "react";
import type { Sesija, Ciklus, Mjerenje, FoamLevel } from "@/lib/types";
import {
  getMjerenjeTimestamp,
  getMjerenjePH,
  pocetnoMjerenjeCiklusa,
  aktivniCiklusSesije,
  getUzUpozorenjeLabel,
} from "@/lib/types";
import { getProductEngine } from "@/lib/product-engine";
import type { ProductEngine } from "@/lib/product-engine-types";
import { generateLiveInterpretation, generateDynamicWarnings, generateReactionTrend } from "@/lib/live-interpretation";
import { LiveChemistryKartica } from "@/components/hvac/live-chemistry-kartica";
import { WarningsKartica } from "@/components/hvac/warnings-kartica";
import { LiveChemistryDashboard } from "@/components/hvac/live-chemistry-dashboard";
import { ScaleRemovalKartica } from "@/components/hvac/scale-removal-kartica";
import { getDashboardConfig } from "@/lib/dynamic-dashboard-config";

// ─── Delta helpers ────────────────────────────────────────────────────────────

function deltaPH(current: number, reference: number): number {
  return current - reference;
}

function deltaFlow(current: number, reference: number): number {
  return current - reference;
}

function trendArrow(delta: number, threshold = 0.05): "up" | "down" | "stable" {
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "stable";
}

// ─── ScaleBreaker FX Interpretation ──────────────────────────────────────────
// Aktivna tvar: fosforna kiselina (indikator tipa metil-oranž).
// 6 boja prema pH — kritična točka pH 3.0 (učinkovitost pada >80%).
// Ciljana radna boja: Intenzivno ružičasta (pH 1.0–2.0).
// Mjehurići = CO₂ reakcija = aktivno otapanje. Nema mjehurića pri ružičastoj = sustav čist.
// Upozorenje: crni mulj (magnetit) može prekriti indikator.
// Prioritet interpretacije: boja → bubbling → pH trend → protok → temperatura.

type ScaleBreakerStatus =
  | "koncentrat"          // Tamno crvena — pH < 1.0
  | "reakcija_aktivna"    // Intenzivno ružičasta + mjehurići DA
  | "reakcija_slabi"      // Narančasto-crvena + mjehurići DA — slabi ali radi
  | "sustav_cist"         // Ružičasta + mjehurići NE ≥ 20 min
  | "kriticna_tocka"      // Žuto-narančasta — pH 3.0–3.5
  | "kemijski_mrtvo"      // Žuta (jantar) — pH 3.5–5.0
  | "neutralizirano"      // Zelena / prljava — pH > 5.5
  | "magnetit_upozorenje";// Tamna / smeđa / prljava boja — nepouzdan indikator

interface ScaleBreakerInterpretation {
  status: ScaleBreakerStatus;
  // Stanje kemije — kratki label
  kemijskoStanje: string;
  // Opis reakcije — prikazati kao glavnu poruku
  message: string;
  // Preporuka — akcija za tehničara
  recommendation: string;
  // Status badge akcija
  action: string;
  actionColor: string;
  // Upozorenje — prikazati ako postoji
  warning?: string;
  // Je li bubbling jak/slab (za sekundarni prikaz)
  bubblingIntenzitet?: "jak" | "slab" | "nema";
  // Temperatura upozorenje
  temperatureWarning?: string;
}

type FxVisibleReaction = "nema" | "slaba" | "normalna" | "jaka" | "vrlo_jaka";

function interpretScaleBreakerFX(
  colorIndicator: string | undefined,
  bubblesPresent: boolean | undefined,
  visibleReaction: FxVisibleReaction | undefined,
  temperatureC: number | undefined,
): ScaleBreakerInterpretation | null {
  if (!colorIndicator) return null;

  const c = colorIndicator.toLowerCase();

  // Detekcija boje — prema preciznoj pH mapi fosforne kiseline
  const isTamnoCrvena    = (c.includes("tamno") && c.includes("crven")) || c.includes("dark red");
  const isRuzicasta      = c.includes("ružičast") || c.includes("ruzicast") || c.includes("pink") || c.includes("roze") || c.includes("intenzivno");
  const isNarancastoCrv  = (c.includes("narančasto") || c.includes("narancasto") || c.includes("orange")) && (c.includes("crven") || c.includes("red"));
  const isZutoNar        = (c.includes("žuto") || c.includes("zuto")) && (c.includes("narančast") || c.includes("narancasto") || c.includes("orange"));
  const isZuta           = (c.includes("žut") || c.includes("zut") || c.includes("yellow") || c.includes("jantar") || c.includes("amber"))
                           && !isNarancastoCrv && !isZutoNar;
  const isZelena         = (c.includes("zelen") || c.includes("green")) && !c.includes("žuto");
  // Magnetit: tamna, smeđa, prljava, crna, siva
  const isMagnetit       = c.includes("smeđ") || c.includes("smeda") || c.includes("tamn") || c.includes("crn")
                           || c.includes("prlj") || c.includes("siv") || c.includes("brow") || c.includes("black") || c.includes("dark");

  // Bubbling intenzitet iz visibleReaction
  const bubblingIntenzitet: "jak" | "slab" | "nema" =
    visibleReaction === "jaka" || visibleReaction === "vrlo_jaka" ? "jak"
    : visibleReaction === "normalna" || visibleReaction === "slaba" ? "slab"
    : bubblesPresent === true ? "slab"
    : "nema";

  // Temperaturno upozorenje
  let temperatureWarning: string | undefined;
  if (temperatureC !== undefined) {
    if (temperatureC > 70) {
      temperatureWarning = "Previsoka temperatura — moguće slabljenje inhibitora korozije.";
    } else if (temperatureC < 20) {
      temperatureWarning = "Niska temperatura — reakcija je usporena. Optimalno: 40–50 °C.";
    }
  }

  // 0) Magnetit / korozija — PRIORITET ako nema jasne boje kiseline
  if (isMagnetit && !isRuzicasta && !isNarancastoCrv && !isZutoNar) {
    return {
      status: "magnetit_upozorenje",
      kemijskoStanje: "Nepouzdan indikator",
      message: "Moguća prisutnost magnetita ili korozije. Vizualni indikator može biti nepouzdan.",
      recommendation: "Koristiti pH mjerni papir ili uređaj za potvrdu stanja kemije.",
      action: "PROVJERITI pH",
      actionColor: "bg-stone-700/50 text-stone-300 border-stone-600",
      warning: "Tamna / smeđa boja otopine može prikriti pravi indikator boje kiseline.",
      bubblingIntenzitet,
      temperatureWarning,
    };
  }

  // 1) Tamno crvena — koncentrat (pH < 1.0)
  if (isTamnoCrvena) {
    return {
      status: "koncentrat",
      kemijskoStanje: "Koncentrat",
      message: "Tamno crvena boja — kiselina je u koncentratu. Burna reakcija.",
      recommendation: "Pratiti materijale sustava i osobnu zaštitnu opremu.",
      action: "PRATITI SIGURNOST",
      actionColor: "bg-red-900/50 text-red-300 border-red-700",
      warning: "Ultra jaka kiselina — moguće oštećenje osjetljivih materijala.",
      bubblingIntenzitet,
      temperatureWarning,
    };
  }

  // 2) Intenzivno ružičasta — optimalna zona (pH 1.0–2.0)
  if (isRuzicasta) {
    if (bubblesPresent === true || bubblingIntenzitet !== "nema") {
      return {
        status: "reakcija_aktivna",
        kemijskoStanje: "Aktivna zona",
        message: "Aktivno otapanje kamenca.",
        recommendation: bubblingIntenzitet === "jak"
          ? "Velika količina kamenca u reakciji — nastaviti čišćenje."
          : "Reakcija ide dobro — nastaviti čišćenje.",
        action: "NASTAVITI ČIŠĆENJE",
        actionColor: "bg-green-900/50 text-green-300 border-green-700",
        bubblingIntenzitet,
        temperatureWarning,
      };
    }
    if (bubblesPresent === false) {
      return {
        status: "sustav_cist",
        kemijskoStanje: "Čišćenje završeno",
        message: "Kamenac uklonjen. Sustav čist.",
        recommendation: "Boja ostaje ružičasta i nema mjehurića — ciklus je završen. Isprati sustav čistom vodom.",
        action: "ZAVRŠITI CIKLUS",
        actionColor: "bg-blue-900/50 text-blue-300 border-blue-700",
        bubblingIntenzitet: "nema",
        temperatureWarning,
      };
    }
    // mjehurići nisu zabilježeni — pratiti
    return {
      status: "reakcija_aktivna",
      kemijskoStanje: "Aktivna zona",
      message: "Kiselina je u optimalnoj radnoj zoni.",
      recommendation: "Pratiti mjehuriće za potvrdu aktivnog otapanja.",
      action: "NASTAVITI ČIŠĆENJE",
      actionColor: "bg-green-900/50 text-green-300 border-green-700",
      bubblingIntenzitet,
      temperatureWarning,
    };
  }

  // 3) Narančasto-crvena + bubbling — kiselina slabi, ali još radi (pH 2.0–2.8)
  if (isNarancastoCrv) {
    return {
      status: "reakcija_slabi",
      kemijskoStanje: "Slabi",
      message: "Kiselina slabi, ali još uvijek aktivno reagira.",
      recommendation: bubblingIntenzitet !== "nema"
        ? "Moguće skoro dodavanje sredstva. Pratiti stanje."
        : "Bubbling staje — razmotriti nadopunu FX-a.",
      action: "PRATITI STANJE",
      actionColor: "bg-orange-900/50 text-orange-300 border-orange-700",
      bubblingIntenzitet,
      temperatureWarning,
    };
  }

  // 4) Žuto-narančasta — KRITIČNA TOČKA (pH 3.0–3.5)
  if (isZutoNar) {
    return {
      status: "kriticna_tocka",
      kemijskoStanje: "Kritična zona",
      message: "Kritična zona — sposobnost otapanja naglo pada.",
      recommendation: "pH je vjerojatno iznad 3.0. Dodati svježi FX odmah bez čekanja.",
      action: "DODATI FX",
      actionColor: "bg-amber-900/50 text-amber-300 border-amber-700",
      warning: "Iznad pH 3.0 fosforna kiselina gubi >80% sposobnosti otapanja.",
      bubblingIntenzitet,
      temperatureWarning,
    };
  }

  // 5) Žuta (jantar) — kemijski mrtvo (pH 3.5–5.0)
  if (isZuta) {
    return {
      status: "kemijski_mrtvo",
      kemijskoStanje: "Iscrpljeno",
      message: "Kemija je iscrpljena i više ne otapa kamenac.",
      recommendation: "Isprazniti otopinu i dodati novu kemiju ili pokrenuti novi ciklus.",
      action: "DODATI NOVU KEMIJU ILI NOVI CIKLUS",
      actionColor: "bg-amber-900/50 text-amber-300 border-amber-700",
      bubblingIntenzitet: "nema",
      temperatureWarning,
    };
  }

  // 6) Zelena / prljava — neutralizirano (pH > 5.5)
  if (isZelena) {
    return {
      status: "neutralizirano",
      kemijskoStanje: "Neutralizirano",
      message: "Otopina neutralizirana ili kontaminirana.",
      recommendation: "Završiti i isprazniti sustav. Sigurno za ispuštanje uz provjeru lokalnih propisa.",
      action: "ZAVRŠITI / ISPRAZNITI SUSTAV",
      actionColor: "bg-teal-900/50 text-teal-300 border-teal-700",
      bubblingIntenzitet: "nema",
      temperatureWarning,
    };
  }

  return null;
}

// Helper to check if product is ScaleBreaker FX type
function isScaleBreakerFXProduct(productSnapshot: { indicatorType?: string; name?: string } | undefined): boolean {
  if (!productSnapshot) return false;
  return productSnapshot.indicatorType === "color+bubbles" || 
         (productSnapshot.name?.toLowerCase().includes("scalebreaker") ?? false);
}

// ─── Fernox DS-3 Interpretation ──────────────────────────────────────────────
// DS-3 uses color + foam (CO₂ reaction) to determine status.
// 5 combinations: Žuta+jaka pjena | Zelena+pjena | Žuta+nema pjene | Slaba+Plava | Plava+nema pjene

type DS3Status =
  | "maksimalna_reakcija"   // Žuta + jaka pjena
  | "reakcija_u_tijeku"     // Zelena + pjena postoji
  | "kamenac_uklonjen"      // Žuta + nema pjene
  | "reakcija_zavrsena"     // Slaba pjena + Plava
  | "kemija_potrosena";     // Plava + nema pjene

interface DS3Interpretation {
  status: DS3Status;
  message: string;
  action: string;
  actionColor: string;
  temperatureWarning?: string;
}

function interpretDS3(
  colorIndicator: string | undefined,
  foamLevel: string | undefined,
  temperatureC: number | undefined
): DS3Interpretation | null {
  if (!colorIndicator) return null;

  const color = colorIndicator.toLowerCase();
  // foamLevel uses enum: "vrlo_jaka" | "jaka" | "srednja" | "slaba" | "nema"
  const foam  = (foamLevel ?? "").toLowerCase();

  const isZuta   = color.includes("žut") || color.includes("zut") || color.includes("yellow");
  const isZelena = color.includes("zelen") || color.includes("green");
  const isPlava  = color.includes("plav") || color.includes("blue");

  const jakaP  = foam === "jaka" || foam === "vrlo_jaka";
  const imaP   = foam === "srednja" || foam === "slaba" || jakaP;
  const nemaP  = foam === "nema" || foam === "";
  const slabaP = foam === "slaba";

  // Temperaturno upozorenje (neovisno o boji/pjeni)
  let temperatureWarning: string | undefined;
  if (temperatureC !== undefined) {
    if (temperatureC > 80) {
      temperatureWarning = "Previsoka temperatura — moguće oštećenje sustava ili kemije.";
    } else if (temperatureC < 20) {
      temperatureWarning = "Niska temperatura — reakcija je usporena. Optimalno: 40–60 °C.";
    }
  }

  let result: DS3Interpretation | null = null;

  // 1) Žuta + jaka pjena → Maksimalna reakcija
  if (isZuta && jakaP) {
    result = {
      status: "maksimalna_reakcija",
      message: "Maksimalna reakcija — aktivno otapanje kamenca.",
      action: "NASTAVITI ČIŠĆENJE",
      actionColor: "bg-green-900/50 text-green-300 border-green-700",
    };
  }
  // 2) Zelena + pjena postoji → Reakcija u tijeku
  else if (isZelena && imaP) {
    result = {
      status: "reakcija_u_tijeku",
      message: "Reakcija je u tijeku. Sredstvo postupno gubi snagu.",
      action: "NASTAVITI / PRATITI",
      actionColor: "bg-teal-900/50 text-teal-300 border-teal-700",
    };
  }
  // 3) Žuta + nema pjene → Kamenac uklonjen
  else if (isZuta && nemaP) {
    result = {
      status: "kamenac_uklonjen",
      message: "Otopina je i dalje aktivna, ali nema više reakcije — kamenac je uklonjen.",
      action: "ZAVRŠITI CIKLUS",
      actionColor: "bg-blue-900/50 text-blue-300 border-blue-700",
    };
  }
  // 4) Slaba pjena + Plava → Reakcija završena
  else if (isPlava && slabaP) {
    result = {
      status: "reakcija_zavrsena",
      message: "Reakcija je završena. Otopina je neutralizirana mineralima.",
      action: "ZAMIJENITI OTOPINU",
      actionColor: "bg-slate-800 text-slate-200 border-slate-600",
    };
  }
  // 5) Plava + nema pjene → Kemija potrošena
  else if (isPlava && nemaP) {
    result = {
      status: "kemija_potrosena",
      message: "Kemija je potrošena i više nema snagu otapanja.",
      action: "DODATI KEMIJU ILI NOVI CIKLUS",
      actionColor: "bg-amber-900/50 text-amber-300 border-amber-700",
    };
  }

  if (!result) return temperatureWarning ? {
    status: "reakcija_u_tijeku",
    message: "Pratiti reakciju — boja ili pjena nisu dovoljni za zaključak.",
    action: "PRATITI",
    actionColor: "bg-muted text-muted-foreground border-border",
    temperatureWarning,
  } : null;

  return { ...result, temperatureWarning };
}

// Helper to check if product is DS-3 type (color+foam)
function isDS3Product(productSnapshot: { indicatorType?: string; name?: string } | undefined): boolean {
  if (!productSnapshot) return false;
  return productSnapshot.indicatorType === "color+foam" ||
         (productSnapshot.name?.toLowerCase().includes("ds-3") ?? false) ||
         (productSnapshot.name?.toLowerCase().includes("ds3") ?? false);
}

// ─── Fernox DS-40 Interpretation ─────────────────────────────────────────────
// Aktivna tvar: limunska kiselina s inhibitorima.
// Indikator: color + foam + sludge (color+foam+sludge).
// Mapa boja prema pH:
//   Deep Red (pH 1.5–2.5) → Pink/Magenta (~3.0) → Orange (3.5–4.5) → Yellow/Dirty Green (>5.0)
// CO₂ / pjena:
//   Intenzivna pjena/mjehurići = kamenac se otapa
//   Bijela pjena = karbonati/kamenac
//   Smeđa/prljava pjena = ulja, korozija, nečistoće
// Magnetit/black sludge: tamna otopina = indikator može biti nepouzdan → koristiti pH + protok
// Završetak: crvena/pink + nema CO₂ ≥ 20 min + pH stabilan + protok stabilan

type DS40Status =
  | "maksimalna_snaga"     // Deep Red — pH 1.5–2.5
  | "radna_zona"           // Pink/Magenta — pH ~3.0
  | "kriticna_zona"        // Orange — pH 3.5–4.5, dodati DS-40
  | "iscrpljeno"           // Yellow/Dirty Green — pH >5.0
  | "ciscenje_zavrseno"    // Crvena/Pink + nema CO₂ ≥ 20 min
  | "black_sludge"         // Tamna/smeđa otopina — magnetit/sludge prisutan
  | "bijela_pjena"         // Bijela pjena — karbonati/kamenac
  | "prljava_pjena";       // Smeđa pjena — korozija/ulja

interface DS40Interpretation {
  status: DS40Status;
  kemijskoStanje: string;
  // Zasićenost — saturation status
  saturationStatus?: string;
  // Kontaminacija — contamination status
  contaminationStatus?: string;
  message: string;
  // Sekundarna napomena (CO₂, pjena)
  napomena?: string;
  recommendation: string;
  action: string;
  actionColor: string;
  warning?: string;
  temperatureWarning?: string;
}

// Prioritet: 1-boja, 2-kontaminacija, 3-CO₂, 4-pH trend, 5-protok, 6-temperatura
function interpretDS40(
  colorIndicator: string | undefined,
  foamLevel: string | undefined,
  bubblesPresent: boolean | undefined,
  temperatureC: number | undefined,
): DS40Interpretation | null {
  if (!colorIndicator && !foamLevel) return null;

  const c = (colorIndicator ?? "").toLowerCase();
  const f = (foamLevel ?? "").toLowerCase();

  // ── 1. BOJA — DS-40 pH mapa ────────────────────────────────────────────────
  const isDeepRed     = c.includes("deep red") || c.includes("tamno crven") || c.includes("dark red");
  const isPink        = c.includes("pink") || c.includes("magenta") || c.includes("ružičast") || c.includes("ruzicast");
  const isOrange      = c.includes("narančast") || c.includes("narancasto") || c.includes("orange");
  const isYellow      = (c.includes("žut") || c.includes("zut") || c.includes("yellow") || c.includes("dirty green") || c.includes("prljavo"))
                        && !isOrange;

  // ── 2. KONTAMINACIJA — magnetit, black sludge ─────────────────────────────
  const isBlackSludge = (c.includes("smeđ") || c.includes("smeda") || c.includes("crn") || c.includes("tamn")
                        || c.includes("black") || c.includes("brow") || c.includes("grey") || c.includes("siv"))
                        && !isPink && !isDeepRed && !isOrange;

  // ── 3. CO₂ / PJENA ────────────────────────────────────────────────────────
  const hasBubbles  = bubblesPresent === true || f === "jaka" || f === "very_jaka" || f === "srednja";
  const noBubbles   = bubblesPresent === false || f === "nema";
  const isWhiteFoam = f.includes("bijel") || f.includes("white");
  const isBrownFoam = f.includes("smeđ") || f.includes("smeda") || f.includes("brown") || f.includes("prlj");

  // ── 6. TEMPERATURA ────────────────────────────────────────────────────────
  let temperatureWarning: string | undefined;
  if (temperatureC !== undefined) {
    if (temperatureC > 60)
      temperatureWarning = "Previsoka temperatura — moguća prebrza reakcija ili degradacija inhibitora.";
    else if (temperatureC < 20)
      temperatureWarning = "Niska temperatura — reakcija je usporena. Optimalno: 40–50 °C.";
  }

  // ── PRIORITET 1: BOJA ────────────────────────────────────────────────────

  // Deep Red — pH 1.5–2.5, maksimalna snaga
  if (isDeepRed) {
    const co2napomena = hasBubbles
      ? "Aktivno otapanje kamenca."
      : isWhiteFoam ? "Prisutni karbonati i kamenac."
      : undefined;
    const contamNote = isBrownFoam ? "Moguća korozija, ulja ili magnetit." : undefined;
    return {
      status: "maksimalna_snaga",
      kemijskoStanje: "Maksimalna snaga",
      saturationStatus: "Svježa otopina — pH 1.5–2.5",
      contaminationStatus: contamNote,
      message: "Svježa otopina — maksimalna snaga čišćenja.",
      napomena: co2napomena ?? "Kiselina aktivno uklanja kamenac i naslage.",
      recommendation: "Nastaviti čišćenje. Pratiti CO₂ reakciju i pjenu.",
      action: "NASTAVITI ČIŠĆENJE",
      actionColor: "bg-red-900/50 text-red-300 border-red-700",
      temperatureWarning,
    };
  }

  // Pink / Magenta — pH ~3.0, radna zona
  if (isPink) {
    // Pink + nema bubblinga ≥ 20 min → čišćenje završeno
    if (noBubbles) {
      return {
        status: "ciscenje_zavrseno",
        kemijskoStanje: "Čišćenje završeno",
        saturationStatus: "Radna zona — pH ~3.0",
        message: "Kamenac uklonjen.\nReakcija završena.",
        napomena: "Boja ostaje crvena/pink i nema CO₂ mjehurića ≥ 20 min.",
        recommendation: "Dodati System Neutraliser i ispirati dok voda ne bude bistra.",
        action: "ZAVRŠITI CIKLUS",
        actionColor: "bg-blue-900/50 text-blue-300 border-blue-700",
        temperatureWarning,
      };
    }
    const co2napomena = hasBubbles
      ? "Aktivno otapanje kamenca."
      : isWhiteFoam ? "Prisutni karbonati i kamenac."
      : undefined;
    const contamNote = isBrownFoam ? "Moguća korozija, ulja ili magnetit." : undefined;
    return {
      status: "radna_zona",
      kemijskoStanje: "Radna zona",
      saturationStatus: "Aktivna zona — pH ~3.0",
      contaminationStatus: contamNote,
      message: "Radna zona — sredstvo još aktivno reagira.",
      napomena: co2napomena,
      recommendation: "Nastaviti čišćenje. Pratiti promjenu boje prema narančastoj.",
      action: "NASTAVITI / PRATITI",
      actionColor: "bg-orange-900/50 text-orange-300 border-orange-700",
      temperatureWarning,
    };
  }

  // Orange — pH 3.5–4.5, kritična saturation zona
  if (isOrange) {
    return {
      status: "kriticna_zona",
      kemijskoStanje: "Kritična zona",
      saturationStatus: "Saturation zona — pH 3.5–4.5",
      message: "Kritična saturation zona.\nKiselina gubi snagu.",
      napomena: hasBubbles ? "Još postoji CO₂ reakcija — pratiti stanje." : undefined,
      recommendation: "Dodati DS-40 ako je sustav još prljav. Ako je čist — neutralizirati i ispirati.",
      action: "DODATI DS-40 AKO JE SUSTAV JOŠ PRLJAV",
      actionColor: "bg-amber-900/50 text-amber-300 border-amber-700",
      warning: "pH vjerojatno iznad 3.5 — sposobnost otapanja naglo opada.",
      temperatureWarning,
    };
  }

  // Yellow / Dirty Green — pH >5.0, iscrpljeno
  if (isYellow) {
    return {
      status: "iscrpljeno",
      kemijskoStanje: "Iscrpljeno",
      saturationStatus: "Bez učinka — pH >5.0",
      message: "Otopina iscrpljena.\nDaljnje čišćenje više nije učinkovito.",
      recommendation: "Dodati DS-40 ako je sustav još prljav. Ako nije — dodati System Neutraliser i ispirati.",
      action: "NOVA KEMIJA ILI ZAVRŠETAK CIKLUSA",
      actionColor: "bg-yellow-900/50 text-yellow-200 border-yellow-700",
      temperatureWarning,
    };
  }

  // ── PRIORITET 2: KONTAMINACIJA (boja neprepoznatljiva) ───────────────────

  if (isBlackSludge) {
    return {
      status: "black_sludge",
      kemijskoStanje: "Kontaminacija",
      contaminationStatus: "Magnetit / Black sludge prisutan",
      message: "Velika količina magnetita ili black sludge.\nIndikator boje može biti nepouzdan.",
      napomena: "Koristiti pH papir i pratiti stanje magnetskog filtera.",
      recommendation: "Pratiti protok i magnetski filter kao primarni indikator. Koristiti pH papir za provjeru stanja kemije.",
      action: "PRATITI pH + FILTER",
      actionColor: "bg-stone-700/50 text-stone-300 border-stone-600",
      warning: "DS-40 uklanja magnetit i black sludge, ali tamna boja otopine može prikriti pravi indikator kiseline.",
      temperatureWarning,
    };
  }

  // ── PRIORITET 3: CO₂ / PJENA (ako nema jasne boje) ─────────────────────

  if (isWhiteFoam && !isBrownFoam) {
    return {
      status: "bijela_pjena",
      kemijskoStanje: "CO₂ reakcija",
      message: "Prisutni karbonati i kamenac.",
      napomena: "Bijela pjena = CO₂ iz reakcije s CaCO₃ — normalna reakcija kiseline.",
      recommendation: "Nastaviti čišćenje. Pratiti promjenu boje otopine.",
      action: "NASTAVITI ČIŠĆENJE",
      actionColor: "bg-green-900/50 text-green-300 border-green-700",
      temperatureWarning,
    };
  }

  if (isBrownFoam) {
    return {
      status: "prljava_pjena",
      kemijskoStanje: "Kontaminacija",
      contaminationStatus: "Moguća korozija, ulja ili magnetit",
      message: "Moguća korozija, ulja ili magnetit.",
      napomena: "Smeđa/prljava pjena ukazuje na nečistoće u sustavu.",
      recommendation: "Pratiti stanje magnetskog filtera. Razmotriti powerflushing ako se stanje ne poboljšava.",
      action: "PRATITI STANJE",
      actionColor: "bg-orange-900/50 text-orange-300 border-orange-700",
      temperatureWarning,
    };
  }

  return null;
}

// Helper to check if product is DS-40 type (color+foam+sludge)
function isDS40Product(productSnapshot: { indicatorType?: string; name?: string } | undefined): boolean {
  if (!productSnapshot) return false;
  return productSnapshot.indicatorType === "color+foam+sludge" ||
         (productSnapshot.name?.toLowerCase().includes("ds-40") ?? false) ||
         (productSnapshot.name?.toLowerCase().includes("ds40") ?? false);
}

// ─── DS-40 Status Kartica ─────────────────────────────────────────────────────

interface DS40StatusKarticaProps {
  interpretation: DS40Interpretation;
  flowTrend?: ProtokTrendLevel;
  flowLMin?: number | null;
  magnetFilterActive?: boolean | null; // true = skuplja talog, false = ne skuplja
}

function DS40StatusKartica({ interpretation, flowTrend, flowLMin, magnetFilterActive }: DS40StatusKarticaProps) {
  const FLOW_LABEL: Record<ProtokTrendLevel, string> = {
    raste:    "Protok raste",
    stagnira: "Protok stagnira",
    pada:     "Protok pada",
  };
  const FLOW_DESC: Record<ProtokTrendLevel, string> = {
    raste:    "Uspješno čišćenje — naslage i black sludge se uklanjaju.",
    stagnira: "Djelomično začepljenje ili reakcija stagnira.",
    pada:     "Moguće odlomljeni talog ili blokada.",
  };
  const FLOW_COLOR: Record<ProtokTrendLevel, string> = {
    raste:    "text-green-400",
    stagnira: "text-amber-400",
    pada:     "text-red-400",
  };

  const isCiscenjeZavrseno = interpretation.status === "ciscenje_zavrseno";
  const isKriticno         = interpretation.status === "kriticna_zona" || interpretation.status === "iscrpljeno";
  const isContamination    = interpretation.status === "black_sludge" || interpretation.status === "prljava_pjena";

  return (
    <div className="bg-gradient-to-br from-red-950/20 to-card border border-red-700/30 rounded-xl overflow-hidden">

      {/* Header: naziv + action badge */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-700/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/80">
          Status reakcije — DS-40
        </span>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${interpretation.actionColor}`}>
          {interpretation.action}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* Stanje kemije + poruka */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {interpretation.kemijskoStanje}
          </span>
          <p className="text-[15px] font-semibold text-foreground leading-snug whitespace-pre-line">
            {interpretation.message}
          </p>
        </div>

        {/* Saturation status + Contamination status — dvojni red */}
        {(interpretation.saturationStatus || interpretation.contaminationStatus) && (
          <div className="grid grid-cols-2 gap-2">
            {interpretation.saturationStatus && (
              <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Saturation</p>
                <p className="text-[11px] font-semibold text-foreground leading-tight">{interpretation.saturationStatus}</p>
              </div>
            )}
            {interpretation.contaminationStatus && (
              <div className={`border rounded-lg px-3 py-2 flex flex-col gap-0.5 ${
                isContamination ? "bg-stone-800/40 border-stone-600/40" : "bg-amber-900/20 border-amber-700/30"
              }`}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Kontaminacija</p>
                <p className={`text-[11px] font-semibold leading-tight ${
                  isContamination ? "text-stone-300" : "text-amber-300"
                }`}>{interpretation.contaminationStatus}</p>
              </div>
            )}
          </div>
        )}

        {/* CO₂ / pjena napomena */}
        {interpretation.napomena && (
          <div className="bg-muted/30 border border-border rounded-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">{interpretation.napomena}</p>
          </div>
        )}

        {/* Preporuka */}
        <div className="bg-muted/40 border border-border rounded-lg px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Preporuka</p>
          <p className="text-xs text-foreground/90 leading-relaxed">{interpretation.recommendation}</p>
        </div>

        {/* Upozorenje — kritična zona, magnetit, koncentrat */}
        {interpretation.warning && (
          <div className={`border rounded-lg px-3 py-2 ${
            isKriticno
              ? "bg-amber-900/25 border-amber-500/40"
              : "bg-stone-800/40 border-stone-500/40"
          }`}>
            <p className={`text-xs font-semibold leading-relaxed ${
              isKriticno ? "text-amber-300" : "text-stone-300"
            }`}>
              {interpretation.warning}
            </p>
          </div>
        )}

        {/* Magnetski filter — opcionalni status */}
        {magnetFilterActive !== null && magnetFilterActive !== undefined && (
          <div className={`border rounded-lg px-3 py-2 flex items-center gap-2 ${
            magnetFilterActive
              ? "bg-stone-800/40 border-stone-600/40"
              : "bg-green-900/20 border-green-600/30"
          }`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              magnetFilterActive ? "bg-stone-400" : "bg-green-400"
            }`} />
            <p className={`text-xs font-semibold ${
              magnetFilterActive ? "text-stone-300" : "text-green-300"
            }`}>
              {magnetFilterActive
                ? "Magnetit se još uklanja iz sustava."
                : "Black sludge reakcija završena."}
            </p>
          </div>
        )}

        {/* Završetak ciklusa — kriteriji */}
        {isCiscenjeZavrseno && (
          <div className="bg-blue-950/30 border border-blue-500/30 rounded-lg px-3 py-2.5 flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Završetak ciklusa</p>
            <ul className="flex flex-col gap-1 mt-0.5">
              {[
                "Boja ostaje crvena/pink",
                "Nema CO₂ mjehurića ≥ 20 min",
                "pH stabilan",
                "Protok stabilan ili poboljšan",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-blue-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Protok — indikator rezultata čišćenja */}
        {flowTrend && (
          <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className={`text-xs font-bold ${FLOW_COLOR[flowTrend]}`}>{FLOW_LABEL[flowTrend]}</span>
              <span className="text-[11px] text-muted-foreground">{FLOW_DESC[flowTrend]}</span>
            </div>
            {flowLMin != null && (
              <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{flowLMin.toFixed(1)} L/min</span>
            )}
          </div>
        )}

        {/* Temperatura upozorenje */}
        {interpretation.temperatureWarning && (
          <div className="bg-red-900/25 border border-red-500/35 rounded-lg px-3 py-2">
            <p className="text-xs text-red-300 font-semibold">{interpretation.temperatureWarning}</p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Rector / Miloc — Boiler Cleaner P Descaler (GEL S.p.A.) ─────────────────
// Aktivna tvar: mješavina kiselina s inhibitorima korozije.
// Indikator: color + bubbles + pH (color+bubbles+pH).
// Mapa boja:
//   Žuta  (pH <1.5) → maksimalno aktivno (ultra jaka)
//   Narančasta (pH 1.5–4.0) → aktivno, slabi
//   Crvena/Ljubičasta (pH >4.0) → exhaustion zone — iscrpljeno
// Saturation logika:
//   pH >4 = exhaustion zone
//   žuta + nema bubblinga = sustav čist
//   brzi prelaz u crveno = velika količina kamenca

type RectorBCPStatus =
  | "maksimalno_aktivno"   // Žuta — pH <1.5, ultra jaka reakcija
  | "aktivno_slabi"        // Narančasta — pH 1.5–4.0
  | "iscrpljeno"           // Crvena/Ljubičasta — pH >4.0
  | "sustav_cist"          // Žuta + nema bubblinga ≥ 20 min
  | "brza_saturacija";     // Brzi prelaz u crveno = puno kamenca

interface RectorBCPInterpretation {
  status: RectorBCPStatus;
  kemijskoStanje: string;
  saturationStatus?: string;
  message: string;
  napomena?: string;
  recommendation: string;
  action: string;
  actionColor: string;
  warning?: string;
  bubblingIntenzitet: "jak" | "slab" | "nema";
  bubblingLabel: string;
  pjenaLabel?: string;
  flowLabel?: string;
  flowDesc?: string;
  flowColor?: string;
  thermalStatus?: string;
  cirkulacijaWarning?: string;
  systemScaleLabel?: string;
  temperatureWarning?: string;
  temperatureLevel?: "ok" | "spora" | "optimalno" | "oprez" | "kritično";
  zavrsitakCiklusa?: boolean;
}

function interpretRectorBCP(
  colorIndicator: string | undefined,
  bubblesPresent: boolean | undefined,
  visibleReaction: FxVisibleReaction | undefined,
  temperatureC: number | undefined,
  foamLevel?: FoamLevel | null,
  flowLMin?: number | null,
  flowTrend?: ProtokTrendLevel | null,
): RectorBCPInterpretation | null {
  if (!colorIndicator) return null;

  const c = colorIndicator.toLowerCase();

  // ── 1. Detekcija boje (prioritet #1) ─────────────────────────────────────
  const isZuta       = c.includes("žut") || c.includes("zut") || c.includes("yellow");
  const isNarancasta = c.includes("narančast") || c.includes("narancasto") || c.includes("orange");
  const isCrvena     = c.includes("crven") || c.includes("crvena") || c.includes("red")
                     || c.includes("ljubičast") || c.includes("ljubicasto") || c.includes("purp") || c.includes("violet");

  // ── 2. CO₂ / bubbling intenzitet (prioritet #3) ──────────────────────────
  const bubblingIntenzitet: "jak" | "slab" | "nema" =
    visibleReaction === "jaka" || visibleReaction === "vrlo_jaka" ? "jak"
    : visibleReaction === "normalna" || visibleReaction === "slaba" ? "slab"
    : bubblesPresent === true ? "slab"
    : "nema";
  const noBubbles = bubblesPresent === false || bubblingIntenzitet === "nema";

  const bubblingLabel =
    bubblingIntenzitet === "jak"  ? "Aktivno otapanje karbonata."
    : bubblingIntenzitet === "slab" ? "Reakcija se usporava."
    : "Nema CO₂ reakcije.";

  // ── 3. Pjena logika ───────────────────────────────────────────────────────
  // FoamLevel: "nema" | "slaba" | "srednja" | "jaka" | "vrlo_jaka"
  // Bijela/aktivna pjena = "slaba" | "srednja" | "jaka" | "vrlo_jaka"
  let pjenaLabel: string | undefined;
  if (foamLevel && foamLevel !== "nema") {
    if (foamLevel === "slaba" || foamLevel === "srednja")
      pjenaLabel = "Bijela pjena — prisutni karbonati i aktivna reakcija.";
    else if (foamLevel === "jaka" || foamLevel === "vrlo_jaka")
      pjenaLabel = "Tamna ili prljava pjena — moguće prisutne korozijske naslage ili mulj.";
  }

  // ── 4. Protok logika (prioritet #4) ──────────────────────────────────────
  let flowLabel: string | undefined;
  let flowDesc: string | undefined;
  let flowColor: string | undefined;
  // Nagli rast protoka: bubblingIntenzitet jak + raste = probijen čep kamenca
  const isNagliRastProtoka = flowTrend === "raste" && bubblingIntenzitet === "jak";
  if (flowTrend) {
    if (flowTrend === "raste") {
      if (isNagliRastProtoka) {
        flowLabel = "Nagli rast protoka";
        flowDesc  = "Probijen čep kamenca — nastaviti čišćenje.";
        flowColor = "text-green-300";
      } else {
        flowLabel = "Protok raste";
        flowDesc  = "Uspješno čišćenje — naslage se uklanjaju.";
        flowColor = "text-green-400";
      }
    } else if (flowTrend === "stagnira") {
      flowLabel = "Protok stagnira";
      flowDesc  = "Djelomično začepljenje ili reakcija stagnira.";
      flowColor = "text-amber-400";
    } else if (flowTrend === "pada") {
      flowLabel = "Protok pada";
      flowDesc  = "Moguće odlomljeni komadi kamenca ili blokada.";
      flowColor = "text-red-400";
    }
  } else if (flowLMin != null) {
    if (flowLMin < 0.5) {
      flowLabel = "Protok vrlo nizak";
      flowDesc  = "Moguće djelomično začepljenje.";
      flowColor = "text-amber-400";
    }
  }

  // ── 5. Thermal — temperatura (prioritet #5) ──────────────────────────────
  let temperatureWarning: string | undefined;
  let thermalStatus: string | undefined;
  let temperatureLevel: RectorBCPInterpretation["temperatureLevel"] = "ok";
  if (temperatureC !== undefined) {
    if (temperatureC > 50) {
      temperatureWarning = "Moguća degradacija inhibitora korozije.";
      thermalStatus = "Kritična temperatura (>50 °C)";
      temperatureLevel = "kritično";
    } else if (temperatureC >= 45) {
      temperatureWarning = "Temperatura 45–50 °C — agresivnija reakcija, povećan rizik za inhibitore.";
      thermalStatus = "Upozorenje — visoka temperatura";
      temperatureLevel = "oprez";
    } else if (temperatureC >= 35 && temperatureC <= 40) {
      thermalStatus = "Optimalna zona (35–40 °C)";
      temperatureLevel = "optimalno";
    } else if (temperatureC >= 20 && temperatureC < 35) {
      thermalStatus = "Normalna temperatura (20–30 °C)";
      temperatureLevel = "ok";
    } else if (temperatureC <= 10) {
      temperatureWarning = "Spora reakcija zbog hladne otopine.";
      thermalStatus = "Temperatura ≤10 °C — vrlo spora reakcija";
      temperatureLevel = "spora";
    } else {
      temperatureWarning = "Niska temperatura — reakcija spora. Optimalno: 35–40 °C.";
      thermalStatus = "Niska temperatura";
      temperatureLevel = "spora";
    }
  }

  // ── 6. Cirkulacija warning ────────────────────────────────────────────────
  // Ako nema protoka uopće (flowLMin = 0 ili null i nema trenda)
  const cirkulacijaWarning =
    (flowLMin != null && flowLMin === 0) || (!flowTrend && !flowLMin)
      ? "Statičko namakanje smanjuje učinkovitost sredstva."
      : undefined;

  // ── 7. System scale procjena ─────────────────────────────────────────────
  // Spec: boja brzo tamni + pH brzo raste + bubbling jak → "Velika količina kamenca ili dugo neodržavan sustav."
  // Spec: boja brzo prelazi iz žute u crvenu → "Velika količina kamenca.\nKemija se brzo zasićuje."
  let systemScaleLabel: string | undefined;
  if (isCrvena && bubblingIntenzitet === "jak") {
    systemScaleLabel = "Velika količina kamenca ili dugo neodržavan sustav.";
  } else if (isCrvena) {
    systemScaleLabel = "Velika količina kamenca.\nKemija se brzo zasićuje.";
  } else if (isNarancasta && bubblingIntenzitet === "jak") {
    systemScaleLabel = "Kemija se brzo zasićuje.";
  } else if (isZuta && noBubbles) {
    systemScaleLabel = "Mala količina kamenca u sustavu.";
  }

  // ── BOJA — status switching ───────────────────────────────────────────────

  // Žuta
  if (isZuta) {
    // Žuta + nema bubblinga = sustav čist
    if (noBubbles) {
      return {
        status: "sustav_cist",
        kemijskoStanje: "Čišćenje završeno",
        saturationStatus: "Aktivna zona — pH <1.5",
        message: "Kamenac uklonjen.\nSustav čist.",
        napomena: "Boja ostaje stabilno žuta i nema CO₂ mjehurića ≥ 20 min.",
        recommendation: "Neutralizirati sustav i potpuno isprati. Provjeriti završni pH.",
        action: "ZAVRŠITI CIKLUS",
        actionColor: "bg-blue-900/50 text-blue-300 border-blue-700",
        bubblingIntenzitet,
        bubblingLabel,
        pjenaLabel,
        flowLabel,
        flowDesc,
        flowColor,
        thermalStatus,
        cirkulacijaWarning,
        systemScaleLabel: "Mala količina kamenca u sustavu.",
        temperatureWarning,
        temperatureLevel,
        zavrsitakCiklusa: true,
      };
    }
    return {
      status: "maksimalno_aktivno",
      kemijskoStanje: "Maksimalna aktivnost sredstva",
      saturationStatus: "pH <1.5 — optimalna zona",
      message: "Maksimalna aktivnost sredstva.\nKiselina aktivno otapa kamenac.",
      napomena: "pH je u optimalnoj zoni.",
      recommendation: "Nastaviti čišćenje. Ne ostavljati dulje od ~2 sata.",
      action: "NASTAVITI ČIŠĆENJE",
      actionColor: "bg-yellow-900/50 text-yellow-200 border-yellow-700",
      bubblingIntenzitet,
      bubblingLabel,
      pjenaLabel,
      flowLabel,
      flowDesc,
      flowColor,
      thermalStatus,
      cirkulacijaWarning,
      systemScaleLabel: bubblingIntenzitet === "jak"
        ? "Velika količina kamenca ili dugo neodržavan sustav."
        : undefined,
      temperatureWarning,
      temperatureLevel,
      zavrsitakCiklusa: false,
    };
  }

  // Narančasta
  if (isNarancasta) {
    return {
      status: "aktivno_slabi",
      kemijskoStanje: "Aktivno — slabi",
      saturationStatus: "pH 1.5–3.5 — saturacija",
      message: "Sredstvo postupno gubi snagu,\nali reakcija još traje.",
      napomena: bubblingIntenzitet !== "nema"
        ? "CO₂ reakcija još prisutna — sredstvo još radi."
        : "Bubbling prestaje — pratiti stanje.",
      recommendation: "Moguće skoro dodavanje sredstva.",
      action: "PRATITI STANJE",
      actionColor: "bg-orange-900/50 text-orange-300 border-orange-700",
      warning: bubblingIntenzitet === "jak"
        ? "Velika količina kamenca — kemija se brzo zasićuje."
        : undefined,
      bubblingIntenzitet,
      bubblingLabel,
      pjenaLabel,
      flowLabel,
      flowDesc,
      flowColor,
      thermalStatus,
      cirkulacijaWarning,
      systemScaleLabel,
      temperatureWarning,
      temperatureLevel,
      zavrsitakCiklusa: false,
    };
  }

  // Crvena / Ljubičasta
  if (isCrvena) {
    return {
      status: "iscrpljeno",
      kemijskoStanje: "Iscrpljeno",
      saturationStatus: "Exhaustion zone — pH >4.0",
      message: "Otopina je zasićena i više nema\nučinkovitu snagu otapanja.",
      napomena: "pH vjerojatno iznad 4.0",
      recommendation: bubblingIntenzitet === "jak"
        ? "Velika količina kamenca — dodati novu količinu sredstva."
        : "Dodati novu količinu sredstva ili završiti ciklus.",
      action: "DODATI NOVU KOLIČINU SREDSTVA",
      actionColor: "bg-rose-900/50 text-rose-300 border-rose-700",
      warning: bubblingIntenzitet === "jak"
        ? "Brzi prelaz u crvenu — prisutna velika količina kamenca u sustavu."
        : "pH iznad 4.0 — kiselina bez kemijskog učinka.",
      bubblingIntenzitet,
      bubblingLabel,
      pjenaLabel,
      flowLabel,
      flowDesc,
      flowColor,
      thermalStatus,
      cirkulacijaWarning,
      systemScaleLabel,
      temperatureWarning,
      temperatureLevel,
      zavrsitakCiklusa: false,
    };
  }

  return null;
}

// Helper to check if product is Rector BCP type (color+bubbles+pH)
function isRectorBCPProduct(productSnapshot: { indicatorType?: string; name?: string; brand?: string } | undefined): boolean {
  if (!productSnapshot) return false;
  return productSnapshot.indicatorType === "color+bubbles+pH" ||
         (productSnapshot.name?.toLowerCase().includes("rector") ?? false) ||
         (productSnapshot.brand?.toLowerCase().includes("rector") ?? false) ||
         (productSnapshot.name?.toLowerCase().includes("boiler cleaner p") ?? false);
}

// ─── Rector BCP Status Kartica ────────────────────────────────────────────────

interface RectorBCPStatusKarticaProps {
  interpretation: RectorBCPInterpretation;
  flowTrend?: ProtokTrendLevel;
  flowLMin?: number | null;
}

function RectorBCPStatusKartica({ interpretation, flowLMin }: RectorBCPStatusKarticaProps) {
  const isZavrseno  = interpretation.status === "sustav_cist";
  const isIscrpljeno = interpretation.status === "iscrpljeno";
  const isAktivno   = interpretation.status === "maksimalno_aktivno";

  // Boja akcijskog badgea sukladno statusu
  const headerBorderColor =
    isZavrseno   ? "border-blue-700/40 from-blue-950/20"
    : isIscrpljeno ? "border-rose-700/40 from-rose-950/20"
    : isAktivno    ? "border-yellow-700/40 from-yellow-950/20"
    : "border-orange-700/40 from-orange-950/20";

  // Bubbling ikona
  const BUBBLING_COLOR: Record<"jak" | "slab" | "nema", string> = {
    jak:  "text-green-400",
    slab: "text-amber-400",
    nema: "text-rose-400/70",
  };
  const BUBBLING_ICON: Record<"jak" | "slab" | "nema", string> = {
    jak:  "●●●",
    slab: "●●○",
    nema: "○○○",
  };

  // Thermal level color
  const THERMAL_COLOR: Record<NonNullable<RectorBCPInterpretation["temperatureLevel"]>, string> = {
    ok:       "text-sky-400",
    spora:    "text-blue-400",
    optimalno:"text-green-400",
    oprez:    "text-amber-400",
    kritično: "text-red-400",
  };

  return (
    <div className={`bg-gradient-to-br ${headerBorderColor} to-card border rounded-xl overflow-hidden`}>

      {/* ── Header: naziv + action badge ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Status reakcije — Rector BCP
        </span>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${interpretation.actionColor}`}>
          {interpretation.action}
        </span>
      </div>

      <div className="flex flex-col gap-0 divide-y divide-border/50">

        {/* ── 1. Stanje kemije ── */}
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Stanje kemije
          </span>
          <p className="text-[15px] font-bold text-foreground leading-snug whitespace-pre-line">
            {interpretation.message}
          </p>
          {interpretation.napomena && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              {interpretation.napomena}
            </p>
          )}
        </div>

        {/* ── 2. Saturation status ── */}
        {interpretation.saturationStatus && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Saturation
            </span>
            <span className={`text-[11px] font-semibold tabular-nums ${
              isIscrpljeno ? "text-rose-400"
              : interpretation.status === "aktivno_slabi" ? "text-amber-400"
              : "text-yellow-400"
            }`}>
              {interpretation.saturationStatus}
            </span>
          </div>
        )}

        {/* ── 3. Reakcija kamenca (CO₂ bubbling) ── */}
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Reakcija kamenca
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black tracking-tight ${BUBBLING_COLOR[interpretation.bubblingIntenzitet]}`}>
              {BUBBLING_ICON[interpretation.bubblingIntenzitet]}
            </span>
            <span className={`text-xs font-semibold ${BUBBLING_COLOR[interpretation.bubblingIntenzitet]}`}>
              {interpretation.bubblingLabel}
            </span>
          </div>
          {interpretation.pjenaLabel && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{interpretation.pjenaLabel}</p>
          )}
        </div>

        {/* ── 4. Thermal status ── */}
        {(interpretation.thermalStatus || interpretation.temperatureWarning) && (
          <div className="px-4 py-3 flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Thermal status
            </span>
            {interpretation.thermalStatus && (
              <span className={`text-[11px] font-semibold ${THERMAL_COLOR[interpretation.temperatureLevel ?? "ok"]}`}>
                {interpretation.thermalStatus}
              </span>
            )}
            {interpretation.temperatureWarning && (
              <p className={`text-[11px] leading-relaxed ${
                interpretation.temperatureLevel === "kritično" ? "text-red-400"
                : interpretation.temperatureLevel === "oprez"   ? "text-amber-400"
                : "text-blue-400"
              }`}>
                {interpretation.temperatureWarning}
              </p>
            )}
          </div>
        )}

        {/* ── Protok ── */}
        {(interpretation.flowLabel || flowLMin != null) && (
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              {interpretation.flowLabel && (
                <span className={`text-xs font-bold ${interpretation.flowColor ?? "text-foreground"}`}>
                  {interpretation.flowLabel}
                </span>
              )}
              {interpretation.flowDesc && (
                <span className="text-[11px] text-muted-foreground">{interpretation.flowDesc}</span>
              )}
              {interpretation.cirkulacijaWarning && (
                <span className="text-[11px] text-amber-400/80">{interpretation.cirkulacijaWarning}</span>
              )}
            </div>
            {flowLMin != null && (
              <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {flowLMin.toFixed(1)} L/min
              </span>
            )}
          </div>
        )}

        {/* ── 5. Preporuka ── */}
        <div className="px-4 py-3 flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Preporuka
          </span>
          <p className="text-xs text-foreground/90 leading-relaxed">
            {interpretation.recommendation}
          </p>
        </div>

        {/* ── 6. Upozorenje ── */}
        {interpretation.warning && (
          <div className={`px-4 py-3 flex items-start gap-2.5 ${
            isIscrpljeno ? "bg-rose-950/30" : "bg-amber-950/25"
          }`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`shrink-0 mt-0.5 ${isIscrpljeno ? "text-rose-400" : "text-amber-400"}`}>
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <p className={`text-xs font-semibold leading-relaxed ${isIscrpljeno ? "text-rose-300" : "text-amber-300"}`}>
              {interpretation.warning}
            </p>
          </div>
        )}

        {/* ── System scale procjena ── */}
        {interpretation.systemScaleLabel && (
          <div className="px-4 py-2.5 flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 mt-0.5">
              Procjena:
            </span>
            <span className="text-[11px] text-foreground/70 whitespace-pre-line leading-relaxed">{interpretation.systemScaleLabel}</span>
          </div>
        )}

        {/* ── 7. Završetak ciklusa ── */}
        {isZavrseno && (
          <div className="px-4 py-3 flex flex-col gap-2 bg-blue-950/30">
            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400">
              Završetak ciklusa
            </span>
            <ul className="flex flex-col gap-1.5">
              {[
                "Boja ostaje stabilno žuta",
                "Nema CO₂ reakcije — nema bubblinga",
                "Protok stabilan",
                "Stanje stabilno najmanje 20 minuta",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-blue-300">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-400 shrink-0">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Vremensko ograničenje */}
        {!isZavrseno && (
          <div className="px-4 py-2.5">
            <p className="text-[10px] text-amber-500/70 font-semibold">
              Max. ~2 h u sustavu — ne prekoračiti.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── DS-3 Status Kartica ──────────────────────────────────────────────────────

interface DS3StatusKarticaProps {
  interpretation: DS3Interpretation;
  flowTrend?: ProtokTrendLevel;
  flowLMin?: number | null;
}

function DS3StatusKartica({ interpretation, flowTrend, flowLMin }: DS3StatusKarticaProps) {
  const FLOW_LABEL: Record<ProtokTrendLevel, string> = {
    raste:    "Protok raste",
    stagnira: "Protok stagnira",
    pada:     "Protok pada",
  };
  const FLOW_DESC: Record<ProtokTrendLevel, string> = {
    raste:    "Pozitivan rezultat — naslage se otapaju.",
    stagnira: "Djelomično začepljenje.",
    pada:     "Moguće začepljenje ili odlomljeni kamenac.",
  };
  const FLOW_COLOR: Record<ProtokTrendLevel, string> = {
    raste:    "text-green-400",
    stagnira: "text-amber-400",
    pada:     "text-red-400",
  };

  return (
    <div className="bg-gradient-to-br from-yellow-900/15 to-card border border-yellow-500/30 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-yellow-400/80">
          Status reakcije — DS-3
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${interpretation.actionColor}`}>
          {interpretation.action}
        </span>
      </div>

      {/* Poruka */}
      <p className="text-sm font-medium text-foreground leading-relaxed">
        {interpretation.message}
      </p>

      {/* Protok - rezultat čišćenja */}
      {flowTrend && (
        <div className="bg-muted/40 border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs font-bold ${FLOW_COLOR[flowTrend]}`}>{FLOW_LABEL[flowTrend]}</span>
            <span className="text-[11px] text-muted-foreground">{FLOW_DESC[flowTrend]}</span>
          </div>
          {flowLMin != null && (
            <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{flowLMin.toFixed(1)} L/min</span>
          )}
        </div>
      )}

      {/* Temperaturno upozorenje */}
      {interpretation.temperatureWarning && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2">
          <p className="text-xs text-red-300 font-semibold">{interpretation.temperatureWarning}</p>
        </div>
      )}
    </div>
  );
}

// ─── Limestone estimation helpers (FAZA 1) ───────────────────────────────────

type ReakcijaLevel = "jaka" | "normalna" | "slaba";
type PhTrendLevel = "raste_brzo" | "raste_normalno" | "raste_sporo" | "stabilan";
type ProtokTrendLevel = "raste" | "stagnira" | "pada";
type ProcjenaOtapanja = "visoka" | "srednja" | "niska";
type CiklusStatus = "nastaviti" | "dodati_kemiju" | "zavrsiti_ciklus";
/**
 * FINAL CLEANING RESULT — rezultat čišćenja, ODVOJEN od proceduralnog statusa.
 *
 * excellent       = protok +40%+ ili izvrsno poboljšanje + exhaustion
 * very_good       = protok +20-40% ili dobro poboljšanje
 * partial         = protok +5-20%, djelomično čišćenje
 * insufficient    = malo poboljšanja, ali kemija je potrošena (ne treba odmah ponoviti)
 * repeat_required = stagnacija: nema poboljšanja, reakcija prerano stala, kemija NIJE iscrpljena
 *
 * KLJUČNO: exhaustion chemistry ≠ repeat_required.
 * "Kemija iscrpljena" može značiti uspješno završeno čišćenje.
 */
type FinalCleaningResult =
  | "excellent"
  | "very_good"
  | "partial"
  | "insufficient"
  | "repeat_required";

/** Backwards compat alias */
type SesijaZakljucak = FinalCleaningResult;

/**
 * Razlozi završetka sesije — određuje PROCEDURALNI korak koji slijedi.
 * exhaustion   = kemija iscrpljena ����� NE znači loš rezultat
 * reaction_done = reakcija normalno završila
 * manual       = ručno završeno
 * stagnation   = protok nije poboljšan, reakcija prerano stala → repeat_required
 */
type SesijaZavrsnikRazlog = "exhaustion" | "reaction_done" | "manual" | "stagnation";

interface TrendReakcije {
  reakcija: ReakcijaLevel;
  phTrend: PhTrendLevel;
  protokTrend: ProtokTrendLevel;
  procjenaOtapanja: ProcjenaOtapanja;
  phRate: number;
  deltaMinutes: number;
}

interface CiklusProcjena {
  procjenaKamencaMin: number;
  procjenaKamencaMax: number;
  iskoriscenostMin: number;
  iskoriscenostMax: number;
  statusCiklusa: CiklusStatus;
  ukupnoKemije: number;
  deltaPhCiklus: number;
  poboljsanjeProtoka: number; // % promjena protoka u ciklusu
  startFlow: number | null;
  endFlow: number | null;
}

interface SesijaProcjena {
  ukupnoCiklusa: number;
  ukupnoKemije: number;
  ukupnoKamencaMin: number;
  ukupnoKamencaMax: number;
  poboljsanjeProtoka: number;
  /** Rezultat čišćenja — ODVOJENO od proceduralnog statusa */
  finalCleaningResult: FinalCleaningResult;
  /** Backwards compat alias */
  zakljucak: FinalCleaningResult;
  /** Razlog završetka — određuje proceduralni korak koji slijedi */
  zavrsnikRazlog: SesijaZavrsnikRazlog;
  /** Je li kemija bila iscrpljena (exhaustion) — ne prikazivati "Potrebno ponoviti" */
  kemijskaIscrpljenost: boolean;
  /** TEMP OUT poboljšanje u °C (zadnje - prvo) — koristi se za potvrdu dobrog rezultata */
  tempOutImprovementC: number | null;
}

function calculateTrendReakcije(
  currentM: Mjerenje,
  prevM: Mjerenje | null,
  refM: Mjerenje | null
): TrendReakcije | null {
  if (!prevM) return null;

  const currentPh = getMjerenjePH(currentM);
  const prevPh = getMjerenjePH(prevM);
  const refFlow = refM?.flowLMin ?? null;
  const currentFlow = currentM.flowLMin ?? null;

  if (currentPh == null || prevPh == null) return null;

  const currentTime = new Date(getMjerenjeTimestamp(currentM)).getTime();
  const prevTime = new Date(getMjerenjeTimestamp(prevM)).getTime();
  const deltaMinutes = Math.max(1, (currentTime - prevTime) / 60000);
  
  const deltaPh = currentPh - prevPh;
  const phRate = deltaPh / deltaMinutes;

  // Reakcija based on rate
  let reakcija: ReakcijaLevel;
  if (phRate > 0.05) reakcija = "jaka";
  else if (phRate >= 0.02) reakcija = "normalna";
  else reakcija = "slaba";

  // pH trend
  let phTrend: PhTrendLevel;
  if (phRate > 0.05) phTrend = "raste_brzo";
  else if (phRate >= 0.02) phTrend = "raste_normalno";
  else if (phRate >= 0.005) phTrend = "raste_sporo";
  else phTrend = "stabilan";

  // Protok trend (relative to reference)
  let protokTrend: ProtokTrendLevel = "stagnira";
  if (refFlow != null && currentFlow != null && refFlow > 0) {
    const flowChangePercent = ((currentFlow - refFlow) / refFlow) * 100;
    if (flowChangePercent >= 10) protokTrend = "raste";
    else if (flowChangePercent <= -10) protokTrend = "pada";
  }

  // Procjena otapanja
  let procjenaOtapanja: ProcjenaOtapanja;
  if (reakcija === "jaka" && protokTrend === "raste") procjenaOtapanja = "visoka";
  else if (reakcija === "normalna") procjenaOtapanja = "srednja";
  else procjenaOtapanja = "niska";

  return {
    reakcija,
    phTrend,
    protokTrend,
    procjenaOtapanja,
    phRate,
    deltaMinutes,
  };
}

function calculateCiklusProcjena(ciklus: Ciklus): CiklusProcjena | null {
  const mjerenja = sortedMjerenja(ciklus);
  if (mjerenja.length < 2) return null;

  const firstM = mjerenja[0];
  const lastM = mjerenja[mjerenja.length - 1];
  
  const startPh = getMjerenjePH(firstM);
  const endPh = getMjerenjePH(lastM);
  
  if (startPh == null || endPh == null) return null;

  const deltaPhCiklus = endPh - startPh;
  
  // Total chemical added (initial + nadopune)
  let ukupnoKemije = ciklus.chemicalAmount ?? 0;
  if (ciklus.nadopune?.length > 0) {
    ukupnoKemije += ciklus.nadopune.reduce((sum, n) => sum + (n.amount ?? 0), 0);
  }

  // Iskoriscenost based on delta pH
  let iskoriscenostMin: number;
  let iskoriscenostMax: number;
  if (deltaPhCiklus < 1.0) {
    iskoriscenostMin = 0.30; iskoriscenostMax = 0.50;
  } else if (deltaPhCiklus < 2.0) {
    iskoriscenostMin = 0.50; iskoriscenostMax = 0.70;
  } else if (deltaPhCiklus < 3.0) {
    iskoriscenostMin = 0.70; iskoriscenostMax = 0.85;
  } else {
    iskoriscenostMin = 0.85; iskoriscenostMax = 1.00;
  }

  // Procjena kamenca: 1 kg kemije ≈ 0.8 – 1.2 kg kamenca
  const procjenaKamencaMin = ukupnoKemije * iskoriscenostMin * 0.8;
  const procjenaKamencaMax = ukupnoKemije * iskoriscenostMax * 1.2;

  // Poboljsanje protoka (rezultat ciscenja)
  const startFlow = firstM.flowLMin ?? null;
  const endFlow = lastM.flowLMin ?? null;
  let poboljsanjeProtoka = 0;
  if (startFlow != null && endFlow != null && startFlow > 0) {
    poboljsanjeProtoka = ((endFlow - startFlow) / startFlow) * 100;
  }

  // Status ciklusa
  let statusCiklusa: CiklusStatus;
  const lastTrend = mjerenja.length >= 2 
    ? calculateTrendReakcije(lastM, mjerenja[mjerenja.length - 2], firstM)
    : null;
    
  if (endPh > 4.0 && (!lastTrend || lastTrend.reakcija === "slaba" || lastTrend.phTrend === "stabilan")) {
    statusCiklusa = "zavrsiti_ciklus";
  } else if (endPh > 3.0 && lastTrend?.reakcija === "slaba") {
    statusCiklusa = "dodati_kemiju";
  } else {
    statusCiklusa = "nastaviti";
  }

  return {
    procjenaKamencaMin,
    procjenaKamencaMax,
    iskoriscenostMin,
    iskoriscenostMax,
    statusCiklusa,
    ukupnoKemije,
    deltaPhCiklus,
    poboljsanjeProtoka,
    startFlow,
    endFlow,
  };
}

function calculateSesijaProcjena(sesija: Sesija): SesijaProcjena | null {
  const ciklusi = sesija.ciklusi ?? [];
  if (ciklusi.length === 0) return null;

  let ukupnoKemije = 0;
  let ukupnoKamencaMin = 0;
  let ukupnoKamencaMax = 0;

  for (const c of ciklusi) {
    const cp = calculateCiklusProcjena(c);
    if (cp) {
      ukupnoKemije += cp.ukupnoKemije;
      ukupnoKamencaMin += cp.procjenaKamencaMin;
      ukupnoKamencaMax += cp.procjenaKamencaMax;
    }
  }

  // ── Sva mjerenja sortirana po vremenu ──────────────────────────────────────
  const allMjerenja = ciklusi.flatMap(c => c.mjerenja ?? []);
  const sortedAll = [...allMjerenja].sort(
    (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
  );

  // ── Poboljšanje protoka ─────────────────────────────────────────────────────
  // VAŽNO: koristiti PRVO MJERENJE S PROTEKOM kao bazu, ne nužno prvu stavku liste
  // (referentno mjerenje često nema flowLMin = null)
  const mjerenjasSProtokoom = sortedAll.filter(m => m.flowLMin != null && m.flowLMin > 0);
  const firstFlow = mjerenjasSProtokoom[0]?.flowLMin ?? null;
  const lastFlow  = mjerenjasSProtokoom[mjerenjasSProtokoom.length - 1]?.flowLMin ?? null;

  let poboljsanjeProtoka = 0;
  if (firstFlow != null && lastFlow != null && firstFlow > 0) {
    poboljsanjeProtoka = ((lastFlow - firstFlow) / firstFlow) * 100;
  }

  // ── TEMP OUT trend ──────────────────────────────────────────────────────────
  // Referentna (početna) Temp OUT = baseline/nulto mjerenje prvog ciklusa.
  // Fallback: ako baseline nema tempOutC, uzimamo najstarije mjerenje koje ga ima.
  const mjerenjaSTempOut = sortedAll.filter(m => m.tempOutC != null);
  const lastTempOut = mjerenjaSTempOut[mjerenjaSTempOut.length - 1]?.tempOutC ?? null;
  const firstTempOut: number | null = (() => {
    // Pokušaj naći baseline mjerenje (measurementType === "initial_cycle_measurement") u prvom ciklusu
    const firstCiklus = ciklusi[0];
    const baseline = firstCiklus?.mjerenja?.find(
      m => m.measurementType === "initial_cycle_measurement" && m.tempOutC != null
    );
    if (baseline?.tempOutC != null) return baseline.tempOutC;
    // Fallback: najstarije mjerenje s tempOutC koje nije zadnje
    const fallback = mjerenjaSTempOut.find(m => m.id !== mjerenjaSTempOut[mjerenjaSTempOut.length - 1]?.id);
    return fallback?.tempOutC ?? mjerenjaSTempOut[0]?.tempOutC ?? null;
  })();
  const tempOutImprovementC =
    firstTempOut != null && lastTempOut != null && firstTempOut !== lastTempOut
      ? lastTempOut - firstTempOut : null;

  // ── Detekcija iscrpljenosti kemije ─────────────────────────────────────────
  // DS-3 exhaustion ≈ pH > 3.5 bez pjene/bubbinga
  // DS-40 exhaustion ≈ pH > 4.5 bez pjene/bubbinga
  const lastCiklus = ciklusi[ciklusi.length - 1];
  const lastCiklusMjerenja = sortedMjerenja(lastCiklus ?? ciklusi[0]);
  const zadnjeMjerenje = lastCiklusMjerenja[lastCiklusMjerenja.length - 1];
  const zadnjiPH   = zadnjeMjerenje ? getMjerenjePH(zadnjeMjerenje) : null;
  const foamZadnji = zadnjeMjerenje?.foamLevel;

  // Kemijska iscrpljenost: pH visok + nema pjene = kiselina potrošena
  const kemijskaIscrpljenost =
    zadnjiPH !== null &&
    zadnjiPH > 3.5 &&
    (foamZadnji === "nema" || foamZadnji == null);

  // ── Trend zadnjeg ciklusa ───────────────────────────────────────────────────
  const lastCiklusTrend =
    lastCiklusMjerenja.length >= 2
      ? calculateTrendReakcije(
          lastCiklusMjerenja[lastCiklusMjerenja.length - 1],
          lastCiklusMjerenja[lastCiklusMjerenja.length - 2],
          lastCiklusMjerenja[0]
        )
      : null;

  const reakcijaZavrsena =
    !lastCiklusTrend ||
    lastCiklusTrend.reakcija === "slaba" ||
    lastCiklusTrend.phTrend === "stabilan";

  // ── Razlog završetka (proceduralni) ────────────────────────────────────────
  // stagnation = JEDINI razlog za "repeat_required"
  // Uvjet: nema poboljšanja protoka I kemija nije iscrpljena I reakcija nije završila normalno
  const noFlowData = firstFlow == null || lastFlow == null;
  const stagnacija =
    !noFlowData &&
    poboljsanjeProtoka < 5 &&
    !kemijskaIscrpljenost &&
    !reakcijaZavrsena;

  let zavrsnikRazlog: SesijaZavrsnikRazlog;
  if (stagnacija) {
    zavrsnikRazlog = "stagnation";
  } else if (kemijskaIscrpljenost) {
    zavrsnikRazlog = "exhaustion";
  } else if (reakcijaZavrsena) {
    zavrsnikRazlog = "reaction_done";
  } else {
    zavrsnikRazlog = "manual";
  }

  // ── FINAL CLEANING RESULT (odvojeno od proceduralnog) ──────────────────────
  //
  // KLJUČNA PRAVILA:
  //   1. exhaustion chemistry ≠ repeat_required
  //   2. repeat_required SAMO kod potvrđene stagnacije
  //   3. Koristiti: protok trend + TEMP OUT trend + exhaustion + reakcija
  //
  let finalCleaningResult: FinalCleaningResult;

  if (zavrsnikRazlog === "stagnation") {
    // Jedini slučaj za "ponovi" — potvrđena stagnacija bez poboljšanja
    finalCleaningResult = "repeat_required";

  } else if (
    poboljsanjeProtoka >= 40 ||
    (poboljsanjeProtoka >= 25 && kemijskaIscrpljenost) ||
    (kemijskaIscrpljenost && tempOutImprovementC !== null && tempOutImprovementC >= 3)
  ) {
    // Izvrsno: visoko poboljšanje protoka ili kemija potrošena + TEMP OUT značajno raste
    finalCleaningResult = "excellent";

  } else if (
    poboljsanjeProtoka >= 15 ||
    (kemijskaIscrpljenost && poboljsanjeProtoka >= 5) ||
    (kemijskaIscrpljenost && tempOutImprovementC !== null && tempOutImprovementC >= 1)
  ) {
    // Dobar rezultat: solidno poboljšanje ili kemija iscrpljena s vidljivim efektom
    finalCleaningResult = "very_good";

  } else if (poboljsanjeProtoka >= 5 || (kemijskaIscrpljenost && noFlowData)) {
    // Djelomično: malo poboljšanje ili nema podataka o protoku ali kemija iscrpljena
    finalCleaningResult = "partial";

  } else if (kemijskaIscrpljenost) {
    // Kemija je iscrpljena ali bez mjerljivog poboljšanja — nije loše, samo nedovoljno podataka
    finalCleaningResult = "insufficient";

  } else {
    // Nema poboljšanja, ali nije ni stagnacija — nije dovoljno podataka
    finalCleaningResult = "insufficient";
  }

  return {
    ukupnoCiklusa: ciklusi.length,
    ukupnoKemije,
    ukupnoKamencaMin,
    ukupnoKamencaMax,
    poboljsanjeProtoka,
    finalCleaningResult,
    zakljucak: finalCleaningResult, // backwards compat
    zavrsnikRazlog,
    kemijskaIscrpljenost,
    tempOutImprovementC,
  };
}

const REAKCIJA_LABELS: Record<ReakcijaLevel, string> = {
  jaka: "Jaka",
  normalna: "Normalna", 
  slaba: "Slaba",
};

const REAKCIJA_COLORS: Record<ReakcijaLevel, string> = {
  jaka: "text-green-500",
  normalna: "text-amber-500",
  slaba: "text-rose-500",
};

const PH_TREND_LABELS: Record<PhTrendLevel, string> = {
  raste_brzo: "Raste brzo",
  raste_normalno: "Raste normalno",
  raste_sporo: "Raste sporo",
  stabilan: "Stabilan",
};

const PROTOK_TREND_LABELS: Record<ProtokTrendLevel, string> = {
  raste: "Raste",
  stagnira: "Stagnira",
  pada: "Pada",
};

const PROTOK_TREND_COLORS: Record<ProtokTrendLevel, string> = {
  raste: "text-green-500",
  stagnira: "text-muted-foreground",
  pada: "text-rose-500",
};

const PROCJENA_LABELS: Record<ProcjenaOtapanja, string> = {
  visoka: "Visoka",
  srednja: "Srednja",
  niska: "Niska",
};

const PROCJENA_COLORS: Record<ProcjenaOtapanja, string> = {
  visoka: "text-green-500",
  srednja: "text-amber-500",
  niska: "text-rose-500",
};

const STATUS_CIKLUS_LABELS: Record<CiklusStatus, string> = {
  nastaviti: "Nastaviti ciklus",
  dodati_kemiju: "Dodati kemiju",
  zavrsiti_ciklus: "Završiti ciklus",
};

const STATUS_CIKLUS_COLORS: Record<CiklusStatus, string> = {
  nastaviti: "bg-green-900/50 text-green-300 border-green-700",
  dodati_kemiju: "bg-amber-900/50 text-amber-300 border-amber-700",
  zavrsiti_ciklus: "bg-blue-900/50 text-blue-300 border-blue-700",
};

const ZAKLJUCAK_LABELS: Record<FinalCleaningResult, string> = {
  excellent:        "Izvrsno čišćenje",
  very_good:        "Uspješno čišćenje završeno",
  partial:          "Djelomično čišćenje",
  insufficient:     "Nedovoljno podataka",
  repeat_required:  "Potrebno ponoviti",
};

const ZAKLJUCAK_COLORS: Record<FinalCleaningResult, string> = {
  excellent:        "text-green-400",
  very_good:        "text-green-500",
  partial:          "text-amber-500",
  insufficient:     "text-muted-foreground",
  repeat_required:  "text-rose-500",
};

const ZAKLJUCAK_BG: Record<FinalCleaningResult, string> = {
  excellent:        "bg-green-900/30 border-green-700/50",
  very_good:        "bg-green-900/20 border-green-700/40",
  partial:          "bg-amber-900/20 border-amber-700/40",
  insufficient:     "bg-muted/30 border-border",
  repeat_required:  "bg-rose-900/20 border-rose-700/40",
};

function phTrendLabel(arrow: "up" | "down" | "stable") {
  if (arrow === "up") return "↑";
  if (arrow === "down") return "↓";
  return "→";
}

function phTrendColor(arrow: "up" | "down" | "stable") {
  if (arrow === "up") return "text-rose-500";
  if (arrow === "down") return "text-green-500";
  return "text-muted-foreground";
}

function flowTrendLabel(arrow: "up" | "down" | "stable") {
  if (arrow === "up") return "↑";
  if (arrow === "down") return "↓";
  return "→";
}

function flowTrendColor(arrow: "up" | "down" | "stable") {
  if (arrow === "up") return "text-green-500";
  if (arrow === "down") return "text-rose-500";
  return "text-muted-foreground";
}

function fmt(val: number | undefined | null, decimals = 2): string {
  if (val == null) return "—";
  return val.toFixed(decimals);
}

function fmtDelta(val: number | undefined | null, decimals = 2): string {
  if (val == null) return "—";
  const s = Math.abs(val).toFixed(decimals);
  return val > 0 ? `+${s}` : val < 0 ? `-${s}` : `0.${Array(decimals + 1).join("0")}`;
}

// ─── Sort measurements oldest → newest ───────────────────────────────────────

function sortedMjerenja(ciklus: Ciklus): Mjerenje[] {
  return [...ciklus.mjerenja].sort(
    (a, b) =>
      new Date(getMjerenjeTimestamp(a)).getTime() -
      new Date(getMjerenjeTimestamp(b)).getTime()
  );
}

// ─── Measurement row ─────────────────────────────────────────────────────────

interface MjerenjeRowProps {
  label: string;
  isRef: boolean;
  m: Mjerenje;
  prevM: Mjerenje | null;
  refM: Mjerenje | null;
}

function MjerenjeRow({ label, isRef, m, prevM, refM }: MjerenjeRowProps) {
  const ph = getMjerenjePH(m);
  const flow = m.flowLMin ?? null;
  const refPh = refM ? getMjerenjePH(refM) : null;
  const refFlow = refM?.flowLMin ?? null;
  const prevPh = prevM ? getMjerenjePH(prevM) : null;
  const prevFlow = prevM?.flowLMin ?? null;

  const dPhPrev = ph != null && prevPh != null ? deltaPH(ph, prevPh) : null;
  const dPhTotal = ph != null && refPh != null ? deltaPH(ph, refPh) : null;
  const dFlowPrev = flow != null && prevFlow != null ? deltaFlow(flow, prevFlow) : null;
  const dFlowTotal = flow != null && refFlow != null ? deltaFlow(flow, refFlow) : null;

  const phArrow = dPhPrev != null ? trendArrow(dPhPrev, 0.05) : "stable";
  const flowArrow = dFlowPrev != null ? trendArrow(dFlowPrev, 0.1) : "stable";

  return (
    <div
      className={`px-3 py-2.5 flex flex-col gap-1.5 ${
        isRef
          ? "bg-muted/70 border-b border-border"
          : "border-b border-border/50 last:border-b-0"
      }`}
    >
      {/* Top row: label + pH + flow */}
      <div className="flex items-center gap-2">
        {/* Label */}
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-widest w-12 ${
            isRef ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>

        {/* pH block */}
        <div className="flex-1 flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">pH</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-sm font-bold tabular-nums ${isRef ? "text-foreground" : "text-foreground"}`}>
              {fmt(ph)}
            </span>
            {!isRef && (
              <span className={`text-[11px] font-semibold ${phTrendColor(phArrow)}`}>
                {phTrendLabel(phArrow)}
              </span>
            )}
          </div>
        </div>

        {/* Δ pH prev */}
        <div className="flex-1 flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Δ pH</span>
          <span className={`text-xs font-semibold tabular-nums ${
            dPhPrev == null ? "text-muted-foreground" :
            dPhPrev > 0.05 ? "text-rose-500" :
            dPhPrev < -0.05 ? "text-green-500" :
            "text-muted-foreground"
          }`}>
                  {isRef ? "—" : fmtDelta(dPhPrev)}
          </span>
          {!isRef && dPhTotal != null && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              ukupno {fmtDelta(dPhTotal)}
            </span>
          )}
        </div>

        {/* Flow block */}
        <div className="flex-1 flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Protok</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold tabular-nums text-foreground">
              {flow != null ? `${fmt(flow, 1)}` : "—"}
            </span>
            {!isRef && flow != null && (
              <span className={`text-[11px] font-semibold ${flowTrendColor(flowArrow)}`}>
                {flowTrendLabel(flowArrow)}
              </span>
            )}
          </div>
        </div>

        {/* Δ flow prev */}
        <div className="flex-1 flex flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Δ protok</span>
          <span className={`text-xs font-semibold tabular-nums ${
            dFlowPrev == null ? "text-muted-foreground" :
            dFlowPrev > 0.1 ? "text-green-500" :
            dFlowPrev < -0.1 ? "text-rose-500" :
            "text-muted-foreground"
          }`}>
                  {isRef ? "—" : fmtDelta(dFlowPrev, 1)}
          </span>
          {!isRef && dFlowTotal != null && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              ukupno {fmtDelta(dFlowTotal, 1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ScaleBreaker FX Status kartica ──────────────────────────────────────────

interface ScaleBreakerStatusKarticaProps {
  interpretation: ScaleBreakerInterpretation;
  flowTrend?: ProtokTrendLevel;
  flowLMin?: number | null;
}

function ScaleBreakerStatusKartica({ interpretation, flowTrend, flowLMin }: ScaleBreakerStatusKarticaProps) {
  const FLOW_LABEL: Record<ProtokTrendLevel, string> = {
    raste:    "Protok raste",
    stagnira: "Protok stagnira",
    pada:     "Protok pada",
  };
  const FLOW_DESC: Record<ProtokTrendLevel, string> = {
    raste:    "Pozitivan rezultat — naslage se otapaju.",
    stagnira: "Djelomično začepljenje ili reakcija stagnira.",
    pada:     "Moguće začepljenje ili odlomljeni kamenac.",
  };
  const FLOW_COLOR: Record<ProtokTrendLevel, string> = {
    raste:    "text-green-400",
    stagnira: "text-amber-400",
    pada:     "text-red-400",
  };

  const isSustav_cist = interpretation.status === "sustav_cist" || interpretation.status === "neutralizirano";
  const isKriticno    = interpretation.status === "kriticna_tocka" || interpretation.status === "kemijski_mrtvo";

  return (
    <div className="bg-gradient-to-br from-orange-950/25 to-card border border-orange-500/25 rounded-xl overflow-hidden">

      {/* Header: naziv + status badge */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-500/15">
        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80">
          Status reakcije — Scalebreaker FX
        </span>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${interpretation.actionColor}`}>
          {interpretation.action}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* Stanje kemije + status reakcije */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stanje kemije</span>
            <span className="text-[10px] font-semibold text-foreground/60">{interpretation.kemijskoStanje}</span>
          </div>
          <p className="text-[15px] font-semibold text-foreground leading-snug">
            {interpretation.message}
          </p>
        </div>

        {/* Preporuka */}
        <div className="bg-muted/40 border border-border rounded-lg px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Preporuka</p>
          <p className="text-xs text-foreground/90 leading-relaxed">{interpretation.recommendation}</p>
        </div>

        {/* Bubbling intenzitet */}
        {interpretation.bubblingIntenzitet && interpretation.bubblingIntenzitet !== "nema" && (
          <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-lg px-3 py-2">
            <div className="flex gap-0.5">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    interpretation.bubblingIntenzitet === "jak"
                      ? "bg-green-400"
                      : i === 1 ? "bg-green-400" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {interpretation.bubblingIntenzitet === "jak"
                ? "Velika količina kamenca u reakciji."
                : "Reakcija slabi."}
            </p>
          </div>
        )}

        {/* Nema bubblinga + ružičasta = čist sustav */}
        {interpretation.status === "sustav_cist" && (
          <div className="bg-blue-950/30 border border-blue-500/30 rounded-lg px-3 py-2.5 flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Završetak ciklusa</p>
            <ul className="flex flex-col gap-1">
              {["Nema bubblinga", "Boja ostaje ružičasta", "Stanje stabilno"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-blue-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upozorenje — kritična točka, magnetit, koncentrat */}
        {interpretation.warning && (
          <div className={`border rounded-lg px-3 py-2 ${
            isKriticno
              ? "bg-amber-900/25 border-amber-500/40"
              : interpretation.status === "magnetit_upozorenje"
              ? "bg-stone-800/40 border-stone-500/40"
              : "bg-red-900/25 border-red-500/40"
          }`}>
            <p className={`text-xs font-semibold leading-relaxed ${
              isKriticno ? "text-amber-300"
              : interpretation.status === "magnetit_upozorenje" ? "text-stone-300"
              : "text-red-300"
            }`}>
              {interpretation.warning}
            </p>
          </div>
        )}

        {/* Protok — rezultat čišćenja */}
        {flowTrend && (
          <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className={`text-xs font-bold ${FLOW_COLOR[flowTrend]}`}>{FLOW_LABEL[flowTrend]}</span>
              <span className="text-[11px] text-muted-foreground">{FLOW_DESC[flowTrend]}</span>
            </div>
            {flowLMin != null && (
              <span className="text-sm font-bold tabular-nums text-foreground shrink-0">{flowLMin.toFixed(1)} L/min</span>
            )}
          </div>
        )}

        {/* Temperatura upozorenje */}
        {interpretation.temperatureWarning && (
          <div className="bg-red-900/25 border border-red-500/35 rounded-lg px-3 py-2">
            <p className="text-xs text-red-300 font-semibold">{interpretation.temperatureWarning}</p>
          </div>
        )}

        {/* Završetak / ispiranje */}
        {isSustav_cist && interpretation.status === "neutralizirano" && (
          <div className="bg-teal-950/30 border border-teal-500/30 rounded-lg px-3 py-2">
            <p className="text-xs text-teal-300">
              Isprati sustav čistom vodom i provjeriti pH ispusne vode pred puštanjem u pogon.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Trend reakcije kartica (RAZINA 1) ───────────────────────────────────────

interface TrendReakcijeKarticaProps {
  trend: TrendReakcije;
}

function TrendReakcijeKartica({ trend }: TrendReakcijeKarticaProps) {
  // Uputa bazirana na reakciji i pH trendu
  const getUputa = (): { text: string; color: string } => {
    if (trend.reakcija === "jaka" || (trend.reakcija === "normalna" && trend.phTrend !== "stabilan")) {
      return { text: "NASTAVITI ČIŠĆENJE", color: "bg-green-900/50 text-green-300 border-green-700" };
    }
    if (trend.reakcija === "slaba" && trend.phTrend === "stabilan") {
      return { text: "RAZMOTRITI ZAVRŠETAK ILI NADOPUNU", color: "bg-amber-900/50 text-amber-300 border-amber-700" };
    }
    if (trend.reakcija === "slaba") {
      return { text: "PRATITI STANJE", color: "bg-blue-900/50 text-blue-300 border-blue-700" };
    }
    return { text: "NASTAVITI", color: "bg-muted text-muted-foreground border-border" };
  };

  const uputa = getUputa();

  return (
    <div className="bg-gradient-to-br from-card to-muted/30 border border-border rounded-xl p-4 flex flex-col gap-3">
      {/* Header s uputom */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Status mjerenja
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${uputa.color}`}>
          {uputa.text}
        </span>
      </div>
      
      {/* Status grid - samo reakcija, pH trend, protok */}
      <div className="grid grid-cols-3 gap-3">
        {/* Reakcija */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Reakcija</span>
          <span className={`text-sm font-bold ${REAKCIJA_COLORS[trend.reakcija]}`}>
            {REAKCIJA_LABELS[trend.reakcija]}
          </span>
        </div>

        {/* pH trend */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">pH trend</span>
          <span className="text-sm font-bold text-foreground">
            {PH_TREND_LABELS[trend.phTrend]}
          </span>
        </div>

        {/* Protok (rezultat čišćenja) */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Protok</span>
          <span className={`text-sm font-bold ${PROTOK_TREND_COLORS[trend.protokTrend]}`}>
            {PROTOK_TREND_LABELS[trend.protokTrend]}
          </span>
        </div>
      </div>

      {/* Upozorenje ako reakcija slabi */}
      {trend.reakcija === "slaba" && (
        <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-300">
            <strong>Upozorenje:</strong> Reakcija slabi. {trend.phTrend === "stabilan" ? "pH je stabilan — razmotriti nadopunu kemije ili završetak ciklusa." : "Pratiti sljedeća mjerenja."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Procjena ciklusa kartica (RAZINA 2) ─────────────────────────────────────

interface ProcjenaCiklusaKarticaProps {
  procjena: CiklusProcjena;
}

function ProcjenaCiklusaKartica({ procjena }: ProcjenaCiklusaKarticaProps) {
  return (
    <div className="bg-gradient-to-br from-primary/5 to-card border border-primary/20 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          Procjena ciklusa
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CIKLUS_COLORS[procjena.statusCiklusa]}`}>
          {STATUS_CIKLUS_LABELS[procjena.statusCiklusa]}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {/* Poboljšanje protoka (REZULTAT ČIŠĆENJA) */}
        {(procjena.startFlow != null && procjena.endFlow != null) && (
          <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground">Poboljšanje protoka</span>
            <span className={`text-base font-black tabular-nums ${
              procjena.poboljsanjeProtoka >= 20 ? "text-green-500" :
              procjena.poboljsanjeProtoka >= 10 ? "text-amber-500" :
              procjena.poboljsanjeProtoka > 0 ? "text-blue-500" :
              "text-muted-foreground"
            }`}>
              {procjena.poboljsanjeProtoka > 0 ? "+" : ""}{procjena.poboljsanjeProtoka.toFixed(0)}%
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                ({procjena.startFlow.toFixed(1)} → {procjena.endFlow.toFixed(1)} L/min)
              </span>
            </span>
          </div>
        )}

        {/* Procjena kamenca */}
        <div className="bg-muted/50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground">Procjena skinutog kamenca</span>
          <span className="text-base font-black tabular-nums text-foreground">
            {procjena.procjenaKamencaMin.toFixed(1)} – {procjena.procjenaKamencaMax.toFixed(1)} kg
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-1 border-t border-border text-xs text-muted-foreground">
          <span>Kemije: <strong className="text-foreground">{procjena.ukupnoKemije.toFixed(1)} L</strong></span>
          <span>ΔpH: <strong className="text-foreground">{procjena.deltaPhCiklus > 0 ? "+" : ""}{procjena.deltaPhCiklus.toFixed(2)}</strong></span>
        </div>
      </div>
    </div>
  );
}

// ─── Procjena sesije kartica (RAZINA 3) ──────────────────────────────────────

interface ProcjenaSesijeKarticaProps {
  procjena: SesijaProcjena;
}

function ProcjenaSesijeKartica({ procjena }: ProcjenaSesijeKarticaProps) {
  // ── Proceduralni korak — što servisno treba dalje napraviti ──────────────────
  const proceduralniKorak = ((): { naslov: string; opis: string } => {
    switch (procjena.zavrsnikRazlog) {
      case "exhaustion":
        return {
          naslov: "Kemijska reakcija završena.",
          opis: "Slijedi ispiranje i neutralizacija.",
        };
      case "reaction_done":
        return {
          naslov: "Reakcija završena.",
          opis: "Slijedi ispiranje i neutralizacija.",
        };
      case "stagnation":
        return {
          naslov: "Protok nije poboljšan.",
          opis: "Razmotriti mehaničko čišćenje ili ponoviti ciklus s jačom kiselinom.",
        };
      case "manual":
        return {
          naslov: "Servis završen.",
          opis: "Pokrenite ispiranje i neutralizaciju.",
        };
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      {/* ── KARTICA A: Rezultat čišćenja ────────────────────────────────────── */}
      <div className={`border rounded-xl p-4 flex flex-col gap-3 ${ZAKLJUCAK_BG[procjena.finalCleaningResult]}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Rezultat čišćenja
          </span>
          <span className="text-[9px] text-muted-foreground/50 italic">procjena</span>
        </div>

        {/* Glavni zaključak — velika, jasna poruka */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-xl font-black leading-tight ${ZAKLJUCAK_COLORS[procjena.finalCleaningResult]}`}>
            {ZAKLJUCAK_LABELS[procjena.finalCleaningResult]}
          </span>
          {procjena.kemijskaIscrpljenost && procjena.finalCleaningResult !== "repeat_required" && (
            <span className="text-[10px] text-muted-foreground">
              Kemija iscrpljena — reakcija kompletna.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {/* Poboljšanje protoka */}
          {procjena.poboljsanjeProtoka !== 0 && (
            <div className="bg-black/20 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">Poboljšanje protoka</span>
              <span className={`text-base font-black tabular-nums ${
                procjena.poboljsanjeProtoka >= 40 ? "text-green-400" :
                procjena.poboljsanjeProtoka >= 15 ? "text-green-500" :
                procjena.poboljsanjeProtoka >= 5  ? "text-amber-500" :
                "text-rose-500"
              }`}>
                {procjena.poboljsanjeProtoka > 0 ? "+" : ""}{procjena.poboljsanjeProtoka.toFixed(0)} %
              </span>
            </div>
          )}

          {/* TEMP OUT poboljšanje */}
          {procjena.tempOutImprovementC !== null && Math.abs(procjena.tempOutImprovementC) >= 0.5 && (
            <div className="bg-black/20 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">TEMP OUT poboljšanje</span>
              <span className={`text-base font-black tabular-nums ${
                procjena.tempOutImprovementC >= 3 ? "text-green-400" :
                procjena.tempOutImprovementC >= 1 ? "text-green-500" :
                procjena.tempOutImprovementC > 0  ? "text-blue-400" :
                "text-amber-400"
              }`}>
                {procjena.tempOutImprovementC > 0 ? "+" : ""}{procjena.tempOutImprovementC.toFixed(1)} °C
              </span>
            </div>
          )}

          {/* Procjena kamenca */}
          {procjena.ukupnoKamencaMax > 0 && (
            <div className="bg-black/20 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">Procjena skinutog kamenca</span>
              <span className="text-base font-black tabular-nums text-foreground">
                {procjena.ukupnoKamencaMin.toFixed(1)} – {procjena.ukupnoKamencaMax.toFixed(1)} kg CaCO₃
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs text-muted-foreground">
            <span>Ciklusa: <strong className="text-foreground">{procjena.ukupnoCiklusa}</strong></span>
            <span>Kemije: <strong className="text-foreground">{procjena.ukupnoKemije.toFixed(1)} L</strong></span>
          </div>
        </div>
      </div>

      {/* ── KARTICA B: Sljedeći servisni korak ──────────────────────────────── */}
      <div className="border border-border bg-card rounded-xl p-4 flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sljedeći servisni korak
        </span>
        <p className="text-sm font-bold text-foreground leading-snug">
          {proceduralniKorak.naslov}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {proceduralniKorak.opis}
        </p>
      </div>
    </div>
  );
}

// ─── Servisna procjena završetka čišćenja ─────────────────────────────────────
//
// Analizira zadnja N mjerenja aktivnog ciklusa i sesiju u cjelini
// te daje jasnu servisnu poruku — ne samo tehničke podatke.

type StabilizacijaStanje =
  | "reakcija_aktivna"
  | "reakcija_usporava"
  | "reakcija_stabilizirana"
  | "nema_podataka";

type RazinaKamenca =
  | "mala"
  | "umjerena"
  | "veca"
  | "vrlo_jaka";

interface ServisnaProcjena {
  stanje: StabilizacijaStanje;
  naslov: string;
  poruka: string;
  prijedlog: string;
  razinaKamenca: RazinaKamenca | null;
  razinaLabel: string | null;
  urgentno: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// KOMBINACIJSKI ALGORITAM REAKCIJE — 8 stanja
//
// Analizira kombinaciju: Δ pH + Δ protoka + Δ Temp OUT + pjena
// UVIJEK između uzastopnih mjerenja (konsekutivni delta), ne samo od referentnog.
// ─────────────────────────────────────────────────────────────────────────────

/** Klasifikacija trenda jedne varijable na temelju zadnjih N konsekutivnih Δ */
type TrendKlasa = "raste" | "usporava" | "stagnira" | "nepoznato";

function klasificirajTrend(deltas: number[], prag: number, minDeltas = 2): TrendKlasa {
  if (deltas.length < 1) return "nepoznato";

  const zadnji = deltas.slice(-minDeltas);

  // Stagnacija: SVE zadnje Δ unutar ±prag (zahtijeva >= minDeltas)
  if (zadnji.length >= minDeltas && zadnji.every((d) => Math.abs(d) < prag)) {
    return "stagnira";
  }

  // Usporavanje: zadnja Δ manja od 50% prethodne (ali prethodna mora biti >= prag)
  if (
    deltas.length >= 2 &&
    Math.abs(deltas[deltas.length - 2]) >= prag &&
    Math.abs(deltas[deltas.length - 1]) < Math.abs(deltas[deltas.length - 2]) * 0.5
  ) {
    return "usporava";
  }

  // Raste: zadnja Δ je pozitivna i >= prag
  if (deltas.length >= 1 && deltas[deltas.length - 1] >= prag) {
    return "raste";
  }

  return "nepoznato";
}

function calculateStabilizacija(sesija: Sesija, aktivanCiklus: Ciklus | null): ServisnaProcjena {
  const sviCiklusi = sesija.ciklusi ?? [];

  // Sva mjerenja sortirana vremenski
  const svaMjerenja = [...sviCiklusi.flatMap((c) => c.mjerenja ?? [])].sort(
    (a, b) =>
      new Date(getMjerenjeTimestamp(a)).getTime() -
      new Date(getMjerenjeTimestamp(b)).getTime()
  );

  if (svaMjerenja.length < 2) {
    return {
      stanje: "nema_podataka",
      naslov: "Prikupljaju se podaci",
      poruka: "Dodajte još mjerenja za servisnu procjenu.",
      prijedlog: "Izmjerite pH, protok i temperaturu.",
      razinaKamenca: null,
      razinaLabel: null,
      urgentno: false,
    };
  }

  // ── Podskupovi mjerenja po parametru (samo ona koja imaju tu vrijednost) ──────
  const sFlows = svaMjerenja.filter((m) => m.flowLMin != null) as (Mjerenje & { flowLMin: number })[];
  const sTemps = svaMjerenja.filter((m) => m.tempOutC != null) as (Mjerenje & { tempOutC: number })[];
  const sPHs   = svaMjerenja.filter((m) => getMjerenjePH(m) != null);

  // ── Konsekutivne Δ između susjednih mjerenja ────────────────────────────────
  const flowDeltas: number[] = [];
  for (let i = 1; i < sFlows.length; i++)
    flowDeltas.push(sFlows[i].flowLMin - sFlows[i - 1].flowLMin);

  const tempDeltas: number[] = [];
  for (let i = 1; i < sTemps.length; i++)
    tempDeltas.push(sTemps[i].tempOutC - sTemps[i - 1].tempOutC);

  const phDeltas: number[] = [];
  for (let i = 1; i < sPHs.length; i++) {
    const cur = getMjerenjePH(sPHs[i]);
    const prv = getMjerenjePH(sPHs[i - 1]);
    if (cur != null && prv != null) phDeltas.push(cur - prv);
  }

  // ── Pragovi ─────────────────────────────────────────────────────────────────
  const PRAG_FLOW = 0.3;  // L/min
  const PRAG_TEMP = 0.3;  // °C
  const PRAG_PH   = 0.15; // pH

  // ── Klasifikacija trenda za svaki parametar ──────────────────────────────────
  const trendFlow = klasificirajTrend(flowDeltas, PRAG_FLOW);
  const trendTemp = klasificirajTrend(tempDeltas, PRAG_TEMP);
  const trendPH   = klasificirajTrend(phDeltas,   PRAG_PH);

  // ── Ukupni Δ od prvog do zadnjeg mjerenja ────────────────────────────────────
  const deltaProtokUkupno = sFlows.length >= 2
    ? sFlows[sFlows.length - 1].flowLMin - sFlows[0].flowLMin : null;
  const deltaTempUkupno = sTemps.length >= 2
    ? sTemps[sTemps.length - 1].tempOutC - sTemps[0].tempOutC : null;

  // ── Zadnje mjerenje — pjena i pH ─────────────────────────────────────────────
  const zadnjeMj    = svaMjerenja[svaMjerenja.length - 1];
  const zadnjiPHVal = getMjerenjePH(zadnjeMj);
  const pjenaZadnja = zadnjeMj?.foamLevel;
  const pjenaSlaba  = pjenaZadnja === "nema" || pjenaZadnja === "slaba";
  const pjenaJaka   = pjenaZadnja === "jaka" || pjenaZadnja === "vrlo_jaka";

  // pH visok = sredstvo iscrpljeno (kiselina neutralizirana)
  const phVisok = zadnjiPHVal != null && zadnjiPHVal > 3.5;
  // pH nizak = jaka kiselina još prisutna
  const phNizak = zadnjiPHVal != null && zadnjiPHVal < 2.0;

  // ── Razina kamenca (bodovni sustav) ─���──────────────���─────────────────────────
  const totalNadopune = sviCiklusi.reduce((s, c) => s + (c.nadopune?.length ?? 0), 0);
  const phUkupno = sPHs.length >= 2
    ? Math.abs((getMjerenjePH(sPHs[sPHs.length - 1]) ?? 7) - (getMjerenjePH(sPHs[0]) ?? 7)) : 0;

  let razinaKamenca: RazinaKamenca | null = null;
  let razinaLabel: string | null = null;

  if (svaMjerenja.length >= 2) {
    const score =
      (deltaProtokUkupno !== null && deltaProtokUkupno > 3 ? 2 : deltaProtokUkupno !== null && deltaProtokUkupno > 1 ? 1 : 0) +
      (phUkupno > 2 ? 2 : phUkupno > 1 ? 1 : 0) +
      (pjenaJaka ? 1 : 0) +
      (totalNadopune >= 2 ? 2 : totalNadopune === 1 ? 1 : 0) +
      (sviCiklusi.length >= 2 ? 1 : 0);

    if (score >= 7)      { razinaKamenca = "vrlo_jaka"; razinaLabel = "Vrlo jaka reakcija kamenca"; }
    else if (score >= 4) { razinaKamenca = "veca";      razinaLabel = "Veća količina kamenca"; }
    else if (score >= 2) { razinaKamenca = "umjerena";  razinaLabel = "Umjerena količina kamenca"; }
    else                 { razinaKamenca = "mala";      razinaLabel = "Mala količina kamenca"; }
  }

  // Pomoćni string za ukupni napredak
  const napredakStr = [
    deltaProtokUkupno !== null && Math.abs(deltaProtokUkupno) >= PRAG_FLOW
      ? `Protok: ${deltaProtokUkupno > 0 ? "+" : ""}${deltaProtokUkupno.toFixed(1)} L/min` : null,
    deltaTempUkupno !== null && Math.abs(deltaTempUkupno) >= PRAG_TEMP
      ? `Temp OUT: ${deltaTempUkupno > 0 ? "+" : ""}${deltaTempUkupno.toFixed(1)} °C` : null,
  ].filter(Boolean).join(" · ");

  // ════════════════════════════════════════════════════════════════════════════
  // KOMBINACIJSKA MATRICA — 8 stanja iz dokumenta
  // Prioritet: problemi → završetak → usporavanje → aktivno
  // ════════════════════════════════════════════════════════════════════════════

  // ── STANJE 6: pH nizak, ali nema napretka protoka ni temp ────────────────────
  // Moguć problem: začepljenje, loša cirkulacija, blokada
  if (
    phNizak &&
    trendFlow === "stagnira" &&
    trendTemp === "stagnira"
  ) {
    return {
      stanje: "reakcija_aktivna",
      naslov: "Reakcija postoji — nema napretka protočnosti",
      poruka: "Kiselina je aktivna, ali protok i temperatura ne reagiraju. Moguće začepljenje, loša cirkulacija ili blokada.",
      prijedlog: "Provjeriti cirkulaciju i stanje sustava.",
      razinaKamenca,
      razinaLabel,
      urgentno: true,
    };
  }

  // ── STANJE 5: pH visok, protok i temp stagniraju — sredstvo iscrpljeno ───────
  if (
    phVisok &&
    trendFlow === "stagnira" &&
    trendTemp === "stagnira"
  ) {
    return {
      stanje: "reakcija_stabilizirana",
      naslov: "Sredstvo je iscrpljeno",
      poruka: "pH je visok, pjena nestaje. Kiselina je neutralizirana. Nema daljnjeg napretka protoka ni temperature.",
      prijedlog: "Nadopuna sredstva ili novi ciklus.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 4: SVE stagnira ───────────────────────────────────────────────────
  if (
    trendFlow === "stagnira" &&
    trendTemp === "stagnira"
  ) {
    // 4A — dobar krajnji rezultat
    const dobriRezultat =
      (deltaProtokUkupno !== null && deltaProtokUkupno >= 1.0) ||
      (deltaTempUkupno !== null && deltaTempUkupno >= 1.0);

    if (dobriRezultat || pjenaSlaba) {
      return {
        stanje: "reakcija_stabilizirana",
        naslov: "Čišćenje je završeno",
        poruka: `Reakcija više ne pokazuje značajno poboljšanje.${napredakStr ? " Ukupni napredak: " + napredakStr + "." : ""} Nema daljnjeg značajnog poboljšanja protočnosti ni prijenosa topline.`,
        prijedlog: "Završiti ciklus i isprati sustav.",
        razinaKamenca,
        razinaLabel,
        urgentno: false,
      };
    }

    // 4B — loš krajnji rezultat
    return {
      stanje: "reakcija_stabilizirana",
      naslov: "Reakcija stagnira bez zadovoljavajućeg rezultata",
      poruka: "Protok i temperatura ne reagiraju, ali ukupni napredak je nedovoljan.",
      prijedlog: "Razmotriti nadopunu sredstva ili novi ciklus.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 7: Protok raste, Temp OUT stagnira ────────────────────────────────
  if (trendFlow === "raste" && trendTemp === "stagnira") {
    return {
      stanje: "reakcija_aktivna",
      naslov: "Protočnost raste — prijenos topline još ne prati",
      poruka: "Protok se poboljšava, ali izlazna temperatura još ne pokazuje promjenu. Čišćenje napreduje.",
      prijedlog: "Nastaviti cirkulaciju i pratiti temperaturu.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 8: Temp OUT raste, Protok stagnira ────────────────────────────────
  if (trendTemp === "raste" && trendFlow === "stagnira") {
    return {
      stanje: "reakcija_aktivna",
      naslov: "Prijenos topline raste — protočnost ograničena",
      poruka: "Izlazna temperatura se poboljšava, ali protok stagnira. Djelomično čišćenje.",
      prijedlog: "Nastaviti ciklus i pratiti protok.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 2: Protok i Temp rastu, pH usporava ───────────────────────────────
  if (
    (trendFlow === "raste" || trendFlow === "usporava") &&
    (trendTemp === "raste" || trendTemp === "usporava") &&
    trendPH === "usporava"
  ) {
    return {
      stanje: "reakcija_aktivna",
      naslov: "Reakcija slabi — čišćenje napreduje",
      poruka: "Protok i temperatura se poboljšavaju, ali pH trend usporava. Reakcija ide prema kraju.",
      prijedlog: "Nastaviti praćenje reakcije.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 3: pH stabilan, Protok i Temp rastu ───────────────────────────────
  if (
    trendPH === "stagnira" &&
    (trendFlow === "raste" || trendTemp === "raste")
  ) {
    return {
      stanje: "reakcija_aktivna",
      naslov: "Kemija djeluje — protočnost i temperatura rastu",
      poruka: "pH je stabilan, ali protok i temperatura se poboljšavaju. Kemija je i dalje aktivna.",
      prijedlog: "Nastaviti ciklus.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── Usporavanje (jedno ili oba parametra) ────────────────────────────────────
  if (trendFlow === "usporava" || trendTemp === "usporava") {
    return {
      stanje: "reakcija_usporava",
      naslov: "Reakcija usporava",
      poruka: [
        trendFlow === "usporava" ? "Napredak protoka se smanjuje." : "",
        trendTemp === "usporava" ? "Napredak temperature se smanjuje." : "",
      ].filter(Boolean).join(" ") + " Reakcija ide prema kraju.",
      prijedlog: "Pratiti sljedeće mjerenje. Ako stagnira — razmotriti završetak.",
      razinaKamenca,
      razinaLabel,
      urgentno: false,
    };
  }

  // ── STANJE 1: SVE rastu — aktivno otapanje ───────��─��─────────────────────────
  return {
    stanje: "reakcija_aktivna",
    naslov: "Aktivno otapanje kamenca",
    poruka: [
      "Čišćenje učinkovito napreduje.",
      napredakStr ? "Ukupni napredak: " + napredakStr + "." : "",
      pjenaJaka ? "Pjena je jaka — reakcija intenzivna." : "",
    ].filter(Boolean).join(" "),
    prijedlog: "Nastaviti cirkulaciju i praćenje.",
    razinaKamenca,
    razinaLabel,
    urgentno: false,
  };
}

function ServisnaProcjenaPanel({ sesija, aktivanCiklus }: { sesija: Sesija; aktivanCiklus: Ciklus | null }) {
  const proc = calculateStabilizacija(sesija, aktivanCiklus);

  const svaMjerenja = (sesija.ciklusi ?? []).flatMap((c) => c.mjerenja ?? []);
  if (svaMjerenja.length < 1) return null;

  const borderColor =
    proc.stanje === "reakcija_stabilizirana" ? "border-amber-500/40 bg-amber-950/30" :
    proc.stanje === "reakcija_usporava"      ? "border-blue-500/30 bg-blue-950/20" :
    proc.stanje === "nema_podataka"          ? "border-border bg-card" :
    "border-emerald-500/30 bg-emerald-950/20";

  const iconColor =
    proc.stanje === "reakcija_stabilizirana" ? "text-amber-400" :
    proc.stanje === "reakcija_usporava"      ? "text-blue-400" :
    proc.stanje === "nema_podataka"          ? "text-muted-foreground" :
    "text-emerald-400";

  const naslovColor =
    proc.stanje === "reakcija_stabilizirana" ? "text-amber-300" :
    proc.stanje === "reakcija_usporava"      ? "text-blue-300" :
    proc.stanje === "nema_podataka"          ? "text-muted-foreground" :
    "text-emerald-300";

  const razinaColor =
    proc.razinaKamenca === "vrlo_jaka" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" :
    proc.razinaKamenca === "veca"      ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
    proc.razinaKamenca === "umjerena"  ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
    "bg-muted/40 text-muted-foreground border-border";

  return (
    <div className={`rounded-2xl border px-4 py-4 flex flex-col gap-3 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {proc.stanje === "reakcija_stabilizirana" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={iconColor}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : proc.stanje === "reakcija_aktivna" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={iconColor}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={iconColor}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Servisna procjena
          </span>
        </div>
        {proc.razinaLabel && (
          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${razinaColor}`}>
            {proc.razinaLabel}
          </span>
        )}
      </div>

      {/* Glavni zaključak */}
      <div className="flex flex-col gap-1">
        <p className={`text-base font-black leading-tight ${naslovColor}`}>
          {proc.naslov}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {proc.poruka}
        </p>
      </div>

      {/* Prijedlog akcije */}
      <div className="flex items-start gap-2 border-t border-white/10 pt-2.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5 text-muted-foreground/60">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
        <p className="text-xs font-semibold text-muted-foreground/80 leading-snug">
          {proc.prijedlog}
        </p>
      </div>
    </div>
  );
}

// ─── Product Engine Debug Panel ────���─────────────────────────────────────────
// Development/testing prikaz aktivnog enginea po ciklusu.
// Prikazuje: naziv enginea, active indicator model, active saturation model,
// active warning model + finish-cycle kriteriji.
// KORISTITI SAMO za development/testing — ukloniti iz produkcije.

interface ProductEngineDebugPanelProps {
  engine: ProductEngine;
}

function ProductEngineDebugPanel({ engine }: ProductEngineDebugPanelProps) {
  const [open, setOpen] = React.useState(false);

  const indicatorBadgeColor =
    engine.id === "rector_descaler"  ? "bg-primary/10 text-primary border-primary/30" :
    engine.id === "scalebreaker_fx"  ? "bg-orange-900/40 text-orange-300 border-orange-700/50" :
    engine.id === "ds3"              ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50" :
    engine.id === "ds40"             ? "bg-red-900/40 text-red-300 border-red-700/50" :
                                       "bg-muted text-muted-foreground border-border";

  return (
    <div className="border border-dashed border-amber-600/50 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-amber-950/30 hover:bg-amber-950/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500">
            DEV
          </span>
          <span className="text-[10px] font-semibold text-amber-400">
            Active Product Engine
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${indicatorBadgeColor}`}>
            {engine.id}
          </span>
        </div>
        <svg
          className={`w-3 h-3 text-amber-500/60 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-3 py-3 flex flex-col gap-3 bg-amber-950/10">
          {/* Engine identitet */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Engine naziv</span>
              <span className="text-[11px] font-semibold text-amber-200">{engine.name}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Proizvod</span>
              <span className="text-[11px] text-amber-200/80">{engine.productName}</span>
            </div>
          </div>

          {/* 3 modela */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-0.5 bg-amber-900/20 rounded px-2 py-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600">Indicator Model</span>
              <span className="text-[10px] font-mono text-amber-300 break-all">{engine.indicatorModel}</span>
            </div>
            <div className="flex flex-col gap-0.5 bg-amber-900/20 rounded px-2 py-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600">Saturation Model</span>
              <span className="text-[10px] font-mono text-amber-300 break-all">{engine.saturationModel}</span>
            </div>
            <div className="flex flex-col gap-0.5 bg-amber-900/20 rounded px-2 py-1.5">
              <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600">Warning Model</span>
              <span className="text-[10px] font-mono text-amber-300 break-all">{engine.warningModel}</span>
            </div>
          </div>

          {/* pH granice */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Exhaustion pH</span>
              <span className="text-[11px] font-mono font-semibold text-rose-400">&gt;{engine.exhaustionPH}</span>
            </div>
            {engine.criticalPH != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Critical pH</span>
                <span className="text-[11px] font-mono font-semibold text-orange-400">&gt;{engine.criticalPH}</span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Max Temp</span>
              <span className="text-[11px] font-mono font-semibold text-amber-300">{engine.compatibility.maxTempC} °C</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Max trajanje</span>
              <span className="text-[11px] font-mono font-semibold text-amber-300">{engine.compatibility.maxCycleDurationMinutes} min</span>
            </div>
          </div>

          {/* Finish-cycle kriteriji */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Finish-Cycle Criteria</span>
            <ul className="flex flex-col gap-0.5">
              {engine.finishCycleCriteria.criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500 text-[9px] mt-0.5 shrink-0">&#10003;</span>
                  <span className="text-[10px] text-amber-200/70">{c}</span>
                </li>
              ))}
            </ul>
            {engine.finishCycleCriteria.note && (
              <p className="text-[10px] text-amber-500/60 italic mt-0.5">{engine.finishCycleCriteria.note}</p>
            )}
          </div>

          {/* pH zone lista */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">pH Zone ({engine.phZones.length})</span>
            <div className="flex flex-col gap-0.5">
              {engine.phZones.map((z, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono px-1 rounded shrink-0 ${
                    z.status === "exhausted" ? "bg-red-900/50 text-red-300" :
                    z.status === "weakening" ? "bg-amber-900/50 text-amber-300" :
                    z.status === "optimal"   ? "bg-green-900/50 text-green-300" :
                    z.status === "active"    ? "bg-blue-900/50 text-blue-300" :
                    z.status === "too_strong"? "bg-rose-900/50 text-rose-300" :
                    "bg-muted/50 text-muted-foreground"
                  }`}>
                    {z.phMin ?? "—"} – {z.phMax ?? "—"}
                  </span>
                  <span className="text-[10px] text-amber-200/60">{z.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single cycle card ────────────────────────────────────────────────────────

interface CiklusKarticaProps {
  ciklus: Ciklus;
  sesija: Sesija;
  isActive: boolean;
  defaultExpanded?: boolean;
}

function CiklusKartica({ ciklus, sesija, isActive, defaultExpanded = false }: CiklusKarticaProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const mjerenja = sortedMjerenja(ciklus);
  const refM = pocetnoMjerenjeCiklusa(ciklus) ?? mjerenja[0] ?? null;
  const lastM = mjerenja.length > 0 ? mjerenja[mjerenja.length - 1] : null;
  const prevM = mjerenja.length > 1 ? mjerenja[mjerenja.length - 2] : null;

  const refPh = refM ? getMjerenjePH(refM) : null;
  const lastPh = lastM ? getMjerenjePH(lastM) : null;
  const refFlow = refM?.flowLMin ?? null;
  const lastFlow = lastM?.flowLMin ?? null;

  const dPhTotal = lastPh != null && refPh != null ? deltaPH(lastPh, refPh) : null;
  const dFlowTotal = lastFlow != null && refFlow != null ? deltaFlow(lastFlow, refFlow) : null;

  // Procjena kamenca
  const trendReakcije = lastM && prevM ? calculateTrendReakcije(lastM, prevM, refM) : null;
  const ciklusProcjena = calculateCiklusProcjena(ciklus);

  // ── Product Engine — centralni source of truth za svu interpretaciju ─────────
  // Automatski se puni prema odabranom proizvodu (productSnapshot).
  // Sve live interpretacije moraju dolaziti iz ovog enginea.
  const selectedProductEngine: ProductEngine = getProductEngine(ciklus.productSnapshot);

  // ── Live Chemistry Interpretation — per-product dinamička interpretacija ──────
  // Računa se iz zadnjeg mjerenja + selectedProductEngine.
  // Isti podaci MORAJU dati RAZLIČIT rezultat za različite proizvode.
  const liveChemistryState = lastM
    ? generateLiveInterpretation(selectedProductEngine, lastM)
    : null;

  // ── Reaction Trend — analiza trenda između prethodnog i trenutnog mjerenja ───
  // SPEC: za TEMP OUT trend, refM (initial_cycle_measurement) je referentno mjerenje
  const reactionTrend = lastM
    ? generateReactionTrend(lastM, prevM ?? undefined, refM ?? undefined)
    : null;

  // ── Dynamic Warnings — product-specific, sorted critical → info ───────────
  const dynamicWarnings = lastM
    ? generateDynamicWarnings(selectedProductEngine, lastM, prevM ?? undefined, reactionTrend ?? undefined)
    : [];

  // ── Dynamic Dashboard Config — product-specific dashboard ─────────────────
  // Potpuno se mijenja ovisno o selectedProductEngine.
  // DS-3: pH/foam dominant, FX: pink/yellow, DS-40: sludge, Rector: inhibitor
  const dynamicDashboardConfig = liveChemistryState
    ? getDashboardConfig(selectedProductEngine, liveChemistryState, reactionTrend ?? undefined)
    : null;

  // ScaleBreaker FX specific interpretation
  const isScaleBreaker = isScaleBreakerFXProduct(ciklus.productSnapshot);
  const scaleBreakerInterpretation = isScaleBreaker && lastM
    ? interpretScaleBreakerFX(
        lastM.colorIndicator,
        lastM.bubblesPresent,
        lastM.visibleReaction as FxVisibleReaction | undefined,
        lastM.temperatureC,
      )
    : null;
  const fxFlowTrend = isScaleBreaker && trendReakcije ? trendReakcije.protokTrend : undefined;

  // DS-3 specific interpretation
  const isDS3 = isDS3Product(ciklus.productSnapshot);
  const ds3Interpretation = isDS3 && lastM
    ? interpretDS3(lastM.colorIndicator, lastM.foamLevel, lastM.temperatureC)
    : null;
  const ds3FlowTrend = isDS3 && trendReakcije ? trendReakcije.protokTrend : undefined;

  // DS-40 specific interpretation
  const isDS40 = isDS40Product(ciklus.productSnapshot);
  const ds40Interpretation = isDS40 && lastM
    ? interpretDS40(lastM.colorIndicator, lastM.foamLevel, lastM.bubblesPresent, lastM.temperatureC)
    : null;
  const ds40FlowTrend = isDS40 && trendReakcije ? trendReakcije.protokTrend : undefined;

  // Rector BCP specific interpretation
  const isRectorBCP = isRectorBCPProduct(ciklus.productSnapshot);
  const rectorBCPFlowTrend = isRectorBCP && trendReakcije ? trendReakcije.protokTrend : undefined;
  const rectorBCPInterpretation = isRectorBCP && lastM
    ? interpretRectorBCP(
        lastM.colorIndicator,
        lastM.bubblesPresent,
        lastM.visibleReaction as FxVisibleReaction | undefined,
        lastM.temperatureC,
        lastM.foamLevel,
        lastM.flowLMin,
        rectorBCPFlowTrend ?? null,
      )
    : null;

  const statusLabel = isActive ? "Aktivno" : ciklus.status === "prekinut" ? "Prekinuto" : "Završeno";
  const statusColor = isActive
    ? "bg-green-900 text-green-200 border border-green-700"
    : ciklus.status === "prekinut"
    ? "bg-rose-900/40 text-rose-300 border border-rose-700/50"
    : "bg-muted text-muted-foreground border border-border";

  return (
    <div
      className={`rounded-2xl overflow-hidden border transition-all ${
        isActive
          ? "border-primary/50 shadow-md shadow-primary/10"
          : "border-border"
      }`}
    >
      {/* Cycle header — tappable to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full text-left px-4 py-3 flex flex-col gap-2.5 transition-colors hover:bg-muted/20 ${
          isActive ? "bg-primary/8" : "bg-card"
        }`}
      >
        {/* Row 1: Naslov + chevron */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">
                Ciklus #{ciklus.cycleNumber ?? ciklus.broj ?? "—"}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                {statusLabel}
              </span>
              {isActive && (
                <span className="text-[10px] font-bold text-primary animate-pulse">LIVE</span>
              )}
            </div>
            {(ciklus.chemicalProductName ?? ciklus.kemikalija) && (
              <span className="text-xs text-muted-foreground truncate">
                {ciklus.chemicalProductName ?? ciklus.kemikalija}
                {(ciklus.chemicalAmount ?? ciklus.kolicina_kemikalije) && (
                  <> · {ciklus.chemicalAmount ?? ciklus.kolicina_kemikalije} {ciklus.chemicalUnit ?? "L"}</>
                )}
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Row 2: pH ref→zadnji i Protok ref→zadnji — svaki u svom redu */}
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              pH ref→zadnji
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-foreground">
                {fmt(refPh)} → {fmt(lastPh)}
              </span>
              {dPhTotal != null && (
                <span className={`text-[10px] font-semibold tabular-nums ${
                  dPhTotal > 0.05 ? "text-rose-500" : dPhTotal < -0.05 ? "text-green-500" : "text-muted-foreground"
                }`}>
                  Δ {fmtDelta(dPhTotal)}
                </span>
              )}
            </div>
          </div>

          {(refFlow != null || lastFlow != null) && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Protok ref→zadnji
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {fmt(refFlow, 1)} → {fmt(lastFlow, 1)}
                </span>
                {dFlowTotal != null && (
                  <span className={`text-[10px] font-semibold tabular-nums ${
                    dFlowTotal > 0.1 ? "text-green-500" : dFlowTotal < -0.1 ? "text-rose-500" : "text-muted-foreground"
                  }`}>
                    Δ {fmtDelta(dFlowTotal, 1)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Measurement count bar */}
      <div className={`px-4 py-1.5 border-t border-border flex items-center gap-3 ${isActive ? "bg-primary/5" : "bg-muted/30"}`}>
        <span className="text-[10px] text-muted-foreground">
          {mjerenja.length} {mjerenja.length === 1 ? "mjerenje" : mjerenja.length < 5 ? "mjerenja" : "mjerenja"}
        </span>
        {ciklus.nadopune?.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            · {ciklus.nadopune.length} {ciklus.nadopune.length === 1 ? "nadopuna" : "nadopune"}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {expanded ? "Zatvori" : "Prikaži mjerenja"}
        </span>
      </div>

      {/* Expandable measurement list */}
      {expanded && (
        <div className="border-t border-border">
          {/* DEV: Product Engine debug panel */}
          <div className="px-3 pt-3">
            <ProductEngineDebugPanel engine={selectedProductEngine} />
          </div>

          {mjerenja.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground italic">Nema mjerenja u ovom ciklusu.</p>
          ) : (
            <div>
              {mjerenja.map((m, idx) => {
                const isRefRow = m === refM || m.measurementType === "initial_cycle_measurement";
                const prevMeasurement = idx > 0 ? mjerenja[idx - 1] : null;
                const rowNumber = mjerenja
                  .slice(0, idx)
                  .filter((mm) => mm !== refM && mm.measurementType !== "initial_cycle_measurement")
                  .length + 1;

                const label = isRefRow
                  ? "Ref. mj."
                  : `#${rowNumber}`;

                return (
                  <MjerenjeRow
                    key={m.id}
                    label={label}
                    isRef={isRefRow}
                    m={m}
                    prevM={prevMeasurement}
                    refM={refM}
                  />
                );
              })}
            </div>
          )}

          {/* Fernox DS-40: Status reakcije (boja + pjena + sludge) */}
          {isDS40 && ds40Interpretation && (
            <div className="px-3 py-3 border-t border-border">
              <DS40StatusKartica
                interpretation={ds40Interpretation}
                flowTrend={ds40FlowTrend}
                flowLMin={lastM?.flowLMin}
                magnetFilterActive={lastM?.magnetFilterActive ?? null}
              />
            </div>
          )}

          {/* Rector / Miloc BCP: Status reakcije (boja + bubbles + pH) */}
          {isRectorBCP && rectorBCPInterpretation && (
            <div className="px-3 py-3 border-t border-border">
              <RectorBCPStatusKartica
                interpretation={rectorBCPInterpretation}
                flowTrend={rectorBCPFlowTrend}
                flowLMin={lastM?.flowLMin}
              />
            </div>
          )}

          {/* Fernox DS-3: Status reakcije (boja + pjena) */}
          {isDS3 && ds3Interpretation && (
            <div className="px-3 py-3 border-t border-border">
              <DS3StatusKartica
                interpretation={ds3Interpretation}
                flowTrend={ds3FlowTrend}
                flowLMin={lastM?.flowLMin}
              />
            </div>
          )}

          {/* ScaleBreaker FX: Status reakcije (boja + mjehurići + temperatura + protok) */}
          {isScaleBreaker && scaleBreakerInterpretation && (
            <div className="px-3 py-3 border-t border-border">
              <ScaleBreakerStatusKartica
                interpretation={scaleBreakerInterpretation}
                flowTrend={fxFlowTrend}
                flowLMin={lastM?.flowLMin}
              />
            </div>
          )}

          {/* ── Dynamic Warnings & Recommendations — product-specific ── */}
          {(dynamicWarnings.length > 0 || reactionTrend) && (
            <div className="px-3 py-3 border-t border-border">
              <WarningsKartica
                warnings={dynamicWarnings}
                trend={reactionTrend ?? undefined}
                engineName={selectedProductEngine.name}
                recommendation={liveChemistryState?.recommendationLabel}
                recommendationDetail={liveChemistryState?.recommendationDetail}
              />
            </div>
          )}

          {/* ── Live Chemistry Interpretation — Dynamic per-product ── */}
          {/* SPEC: "App mora interpretirati stanje — NE samo prikazivati input boju" */}
          {liveChemistryState && (
            <div className="px-3 py-3 border-t border-border">
              <LiveChemistryKartica
                state={liveChemistryState}
                availableColors={selectedProductEngine?.colorZones ?? []}
                referenceTempOutC={refM?.tempOutC ?? undefined}
              />
            </div>
          )}

          {/* ── Live Chemistry Dashboard — Product-Specific Dynamic Dashboard ── */}
          {/* Boje, statusi, upozorenja i reakcije dolaze iz selectedProductEngine  */}
          {/* DS-3: pH/foam, FX: pink/yellow, DS-40: sludge, Rector: inhibitor    */}
          {dynamicDashboardConfig && (
            <div className="px-3 py-3 border-t border-border">
              <LiveChemistryDashboard
                config={dynamicDashboardConfig}
                warnings={dynamicWarnings}
                trend={reactionTrend ?? undefined}
              />
            </div>
          )}

          {/* TrendReakcijeKartica — samo za proizvode bez specifične logike */}
          {!isDS3 && !isScaleBreaker && trendReakcije && (
            <div className="px-3 py-3 border-t border-border">
              <TrendReakcijeKartica trend={trendReakcije} />
            </div>
          )}

          {/* Procjena skinutog kamenca — sve 3 razine: mjerenje / ciklus / sesija */}
          {mjerenja.length >= 1 && (
            <div className="px-3 py-3 border-t border-border">
              <ScaleRemovalKartica ciklus={ciklus} sesija={sesija} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Top summary bar ───────────────��──────────────────────────────────────────

interface SummaryBarProps {
  sesija: Sesija;
  aktivanCiklus: Ciklus | undefined;
}

function SummaryBar({ sesija, aktivanCiklus }: SummaryBarProps) {
  const sviCiklusi = sesija.ciklusi ?? [];
  // Iskljuci initial_cycle_measurement — to su referentne vrijednosti, ne zadnje mjerenje
  const allMjerenja = sviCiklusi
    .flatMap((c) => c.mjerenja)
    .filter((m) => m.measurementType !== "initial_cycle_measurement");
  // Zadnje mjerenje = zadnji element niza (pohranjen kronološki)
  const lastM = allMjerenja.length > 0 ? allMjerenja[allMjerenja.length - 1] : null;
  const firstM = aktivanCiklus ? pocetnoMjerenjeCiklusa(aktivanCiklus) : null;

  const lastPh = lastM ? getMjerenjePH(lastM) : null;
  const lastFlow = lastM?.flowLMin ?? null;
  const refPh = firstM ? getMjerenjePH(firstM) : null;
  const refFlow = firstM?.flowLMin ?? null;

  const dPh = lastPh != null && refPh != null ? deltaPH(lastPh, refPh) : null;
  const dFlow = lastFlow != null && refFlow != null ? deltaFlow(lastFlow, refFlow) : null;
  const phArrow = dPh != null ? trendArrow(dPh, 0.05) : "stable";
  const flowArrow = dFlow != null ? trendArrow(dFlow, 0.1) : "stable";

  const statusColor =
    sesija.status === "u_radu"
      ? "bg-green-900 text-green-200 border border-green-700"
      : sesija.status === "zavrseno"
      ? "bg-muted text-muted-foreground border border-border"
      : "bg-muted text-muted-foreground border border-border";

  const statusLabel =
    sesija.status === "u_radu"           ? "U radu" :
    sesija.status === "aktivna_reakcija" ? "Aktivna reakcija" :
    sesija.status === "ciklus_zavrsen"   ? "Ciklus završen" :
    sesija.status === "zavrseno"         ? "Završeno" :
    sesija.status === "uz_upozorenje"    ? getUzUpozorenjeLabel(sesija) :
    sesija.status === "nedovrseno"       ? "Nedovršeno" : sesija.status;

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-4 flex flex-col gap-3">
      {/* Session name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sesija</p>
          <p className="text-sm font-bold text-foreground truncate">{sesija.naziv_objekta ?? "—"}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Metrics — vertical stack, one concept per row */}
      <div className="flex flex-col gap-2">
        {/* pH */}
        <div className="bg-muted/50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Zadnji pH</span>
          <div className="flex items-baseline gap-1.5 ml-auto">
            <span className="text-xl font-black tabular-nums text-foreground">{fmt(lastPh)}</span>
            <span className={`text-sm font-bold ${phTrendColor(phArrow)}`}>{phTrendLabel(phArrow)}</span>
          </div>
          {dPh != null && (
            <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${
              dPh > 0.05 ? "text-rose-500" : dPh < -0.05 ? "text-green-500" : "text-muted-foreground"
            }`}>
              Δ {fmtDelta(dPh)} od ref.
            </span>
          )}
        </div>

        {/* Protok */}
        <div className="bg-muted/50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Zadnji protok</span>
          <div className="flex items-baseline gap-1.5 ml-auto">
            <span className="text-xl font-black tabular-nums text-foreground">
              {lastFlow != null ? `${fmt(lastFlow, 1)}` : "—"}
            </span>
            {lastFlow != null && (
              <span className={`text-sm font-bold ${flowTrendColor(flowArrow)}`}>{flowTrendLabel(flowArrow)}</span>
            )}
          </div>
          {dFlow != null && (
            <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${
              dFlow > 0.1 ? "text-green-500" : dFlow < -0.1 ? "text-rose-500" : "text-muted-foreground"
            }`}>
              Δ {fmtDelta(dFlow, 1)} L/min od ref.
            </span>
          )}
        </div>
      </div>

      {/* Cycle + measurement counts */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-2">
        <span>{sviCiklusi.length} {sviCiklusi.length === 1 ? "ciklus" : "ciklusi/ciklusa"}</span>
        <span>·</span>
        <span>{allMjerenja.length} mjerenja ukupno</span>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────��───────────────────────────��───────────────

interface LivePregledProps {
  sesija: Sesija;
}

export function LivePregled({ sesija }: LivePregledProps) {
  const sviCiklusi = sesija.ciklusi ?? [];
  const aktivanCiklus = aktivniCiklusSesije(sesija);

  // Active cycle first, then rest newest→oldest
  const sortedCiklusi = [
    ...(aktivanCiklus ? [aktivanCiklus] : []),
    ...sviCiklusi
      .filter((c) => c !== aktivanCiklus)
      .sort((a, b) => {
        const an = a.cycleNumber ?? a.broj ?? 0;
        const bn = b.cycleNumber ?? b.broj ?? 0;
        return bn - an;
      }),
  ];

  // RAZINA 3: Procjena sesije
  const sesijaProcjena = calculateSesijaProcjena(sesija);

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Top summary */}
      <SummaryBar sesija={sesija} aktivanCiklus={aktivanCiklus ?? null} />

      {/* Servisna procjena aktivna za cijelo vrijeme sesije */}
      <ServisnaProcjenaPanel sesija={sesija} aktivanCiklus={aktivanCiklus ?? null} />

      {/* RAZINA 3: Ukupni rezultat sesije */}
      {sesijaProcjena && sviCiklusi.length > 0 && (
        <ProcjenaSesijeKartica procjena={sesijaProcjena} />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-green-500 text-sm font-bold">↑</span>
          <span className="text-[10px] text-muted-foreground">Raste</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-sm font-bold">→</span>
          <span className="text-[10px] text-muted-foreground">Stabilno</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-rose-500 text-sm font-bold">↓</span>
          <span className="text-[10px] text-muted-foreground">Pada</span>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto italic">Protok: ↑ bolje</span>
      </div>

      {/* Cycle list */}
      {sortedCiklusi.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl px-4 py-8 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Nema ciklusa</p>
          <p className="text-xs text-muted-foreground">Pokrenite prvi ciklus da biste vidjeli mjerenja.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedCiklusi.map((c) => (
            <CiklusKartica
              key={c.id}
              ciklus={c}
              sesija={sesija}
              isActive={c === aktivanCiklus}
              defaultExpanded={c === aktivanCiklus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
