/**
 * scale-removal-estimate.ts
 *
 * Engine za procjenu skinutog kamenca (CaCO3) na temelju:
 *   - product-specific kapaciteta otapanja
 *   - količine dodane kemije
 *   - reakcijskog stanja (pH, boja, bubbling/pjena, protok)
 *
 * SPEC:
 *   - Uvijek raspon, nikad jedna točna brojka
 *   - Uvijek koristiti riječ "procjena"
 *   - Per-mjerenje = incremental (od zadnjeg mjerenja / referentnog)
 *   - Per-ciklus   = zbroj mjerenja
 *   - Per-sesija   = zbroj ciklusa
 */

import type { Mjerenje, Ciklus, Sesija, NadopunaKemikalije } from "./types";
import type { ProductSnapshot } from "./product-types";

// ─── Kapaciteti po proizvodu (fallback kad produkt nema scaleDissolvingCapacityCaCO3) ──

/**
 * Fallback kapaciteti otapanja CaCO3 po kg/L kemikalije.
 * Ključ = ime proizvoda (lowercase, contains match).
 *
 * Format: { min: number, max: number } (kg CaCO3 / kg ili L produkta)
 */
const PRODUCT_CAPACITY_FALLBACK: Array<{
  match: string[];
  min: number;
  max: number;
}> = [
  { match: ["ds-3", "ds3"],           min: 0.40, max: 0.50 },
  { match: ["scalebreaker", "scale breaker", "fx"], min: 0.40, max: 0.50 },
  { match: ["ds-40", "ds40"],         min: 0.25, max: 0.30 },
  { match: ["rector", "boiler cleaner p", "bcp"],   min: 0.50, max: 0.60 },
];

/** Genericni fallback kada nije poznat produkt */
const GENERIC_CAPACITY = { min: 0.25, max: 0.50 };

/**
 * Vraća kapacitet otapanja (min/max kg CaCO3 / kg-ili-L produkta) za dati snapshot.
 */
export function resolveProductCapacity(
  snapshot: ProductSnapshot | undefined
): { min: number; max: number } {
  if (!snapshot) return GENERIC_CAPACITY;

  // 1. scaleDissolvingCapacityCaCO3 na snapshootu (single value → ±10%)
  if (snapshot.scaleDissolvingCapacityCaCO3 != null) {
    const v = snapshot.scaleDissolvingCapacityCaCO3;
    return { min: v * 0.9, max: v };
  }

  // 2. Match po imenu
  const name = (snapshot.name ?? "").toLowerCase();
  const brand = (snapshot.brand ?? "").toLowerCase();
  const full = `${name} ${brand}`;

  for (const entry of PRODUCT_CAPACITY_FALLBACK) {
    if (entry.match.some((m) => full.includes(m))) {
      return { min: entry.min, max: entry.max };
    }
  }

  return GENERIC_CAPACITY;
}

// ─── Reaction multiplier ────────────────────────────────────────────────────

export type ReactionLevel = "jaka" | "srednja" | "slaba" | "iscrpljena";

/**
 * Određuje razinu reakcije na temelju pH, pjene i boje.
 * Jača reakcija = koristiti viši dio kapacitet raspona.
 */
export function resolveReactionLevel(
  ph: number,
  foamLevel?: Mjerenje["foamLevel"],
  colorIndicator?: Mjerenje["colorIndicator"],
): ReactionLevel {
  const foam = foamLevel ?? "nema";
  const color = colorIndicator ?? null;

  // Iscrpljeno: visoki pH + nema pjene + exhausted boja
  if (ph >= 4.0) return "iscrpljena";

  // Jaka: nizak pH + jaka pjena/mjehurici
  const foamJaka = foam === "jaka" || foam === "vrlo_jaka";
  if (ph < 2.0 && foamJaka) return "jaka";

  // Jaka boja (aktivna reakcija) — plavo_zelena = aktivna kiselina, žuta = srednja, smeđa = iscrpljena
  const activeBoja = color === "plavo_zelena";
  if (ph < 2.5 && activeBoja) return "jaka";
  if (ph < 2.5) return "srednja";

  // Slaba: pH 2.5–4.0
  if (ph < 3.0) return "srednja";
  if (ph < 4.0) return "slaba";

  return "iscrpljena";
}

/**
 * Vraća udio kapaciteta koji se koristi ovisno o razini reakcije.
 * Jaka = 0.8–1.0 raspona, srednja = 0.5–0.7, slaba = 0.2–0.4, iscrpljeno = 0.
 */
function reactionFactor(level: ReactionLevel): { low: number; high: number } {
  switch (level) {
    case "jaka":       return { low: 0.80, high: 1.00 };
    case "srednja":    return { low: 0.50, high: 0.70 };
    case "slaba":      return { low: 0.20, high: 0.40 };
    case "iscrpljena": return { low: 0.00, high: 0.05 };
  }
}

// ─── Tip: ScaleEstimate (raspon) ─────────────────────────────────────────────

export interface ScaleEstimate {
  /** Procjena u kg CaCO3 — minimum raspona */
  minKg: number;
  /** Procjena u kg CaCO3 — maksimum raspona */
  maxKg: number;
  /** Razina reakcije korištena za izračun */
  reactionLevel: ReactionLevel;
  /** Kapacitet otapanja korišten */
  capacity: { min: number; max: number };
  /** Količina kemije (kg ili L) na kojoj je bazirana ova procjena */
  chemicalAmountUsed: number;
  /** Da li je kemija bila iscrpljena */
  isExhausted: boolean;
  /** Kratki komentar za prikaz */
  comment: string;
}

export interface ScaleEstimateResult {
  /** Procjena od zadnjeg mjerenja (incremental) */
  perMjerenje: ScaleEstimate;
  /** Kumulativna procjena za cijeli ciklus do ovog mjerenja */
  ciklusKumulativ: ScaleEstimate;
  /** Kumulativna procjena za cijelu sesiju */
  sesijaKumulativ: ScaleEstimate;
}

// ─── Per-mjerenje estimate ────────────────────────────────────────────────────

/**
 * Procjenjuje koliko je kamenca skinuto IZMEĐU dva mjerenja (incremental).
 *
 * Logika:
 * 1. Uzima količinu kemije dodane IZMEĐU mjerenja (nadopune između preth. i ovog mjerenja)
 * 2. Ako nema nadopuna između, koristi promjenu pH kao proxy za "potrošnju kemije u tom intervalu"
 * 3. Množi kapacitet s reaction factor
 *
 * @param currentM    Trenutno mjerenje
 * @param previousM   Prethodno mjerenje (ili null za referentno)
 * @param nadopune    Sve nadopune koje su bile između previousM i currentM
 * @param productSnapshot Snapshot proizvoda
 * @param totalChemicalInCycle Ukupna kemija u ciklusu (kg/L) — za estimaciju kad nema nadopuna
 * @param totalMjerenjaInCycle Ukupan broj mjerenja u ciklusu (za distribuciju)
 */
export function estimatePerMjerenje(
  currentM: Mjerenje,
  previousM: Mjerenje | null,
  nadopune: NadopunaKemikalije[],
  productSnapshot: ProductSnapshot | undefined,
  totalChemicalInCycle: number,
  totalMjerenjaInCycle: number,
): ScaleEstimate {
  const capacity = resolveProductCapacity(productSnapshot);
  const ph = currentM.ph ?? (currentM as any).pH ?? 7;
  const reactionLevel = resolveReactionLevel(ph, currentM.foamLevel, currentM.colorIndicator);
  const factor = reactionFactor(reactionLevel);

  // Kemija dodana između ova dva mjerenja (nadopune)
  const chemicalFromTopUps = nadopune.reduce((sum, n) => {
    const vol = n.addedChemicalVolumeL ?? n.kolicina ?? 0;
    return sum + vol;
  }, 0);

  // Ako nema nadopuna, rasporediti "inicijalnu kemiju" ravnomjerno na mjerenja
  // ali skalirati s pH padom (veći pH pad = više kemije potrošeno)
  let chemicalAmount: number;
  if (chemicalFromTopUps > 0) {
    chemicalAmount = chemicalFromTopUps;
  } else {
    // Distribucija inicijalne kemije + pH-based korekcija
    const perMjBase = totalMjerenjaInCycle > 0
      ? totalChemicalInCycle / totalMjerenjaInCycle
      : totalChemicalInCycle;

    // pH pad od prethodnog = proxy za aktivnost u ovom intervalu
    const prevPh = previousM ? (previousM.ph ?? (previousM as any).pH ?? ph) : ph;
    const phDrop = Math.max(0, prevPh - ph);
    // Ako pH raste (kemija se troši, kamenac reakcija završava) — manja procjena
    const phFactor = phDrop > 0.5 ? 1.2 : phDrop > 0 ? 1.0 : 0.8;

    chemicalAmount = perMjBase * phFactor;
  }

  const minKg = parseFloat((chemicalAmount * capacity.min * factor.low).toFixed(3));
  const maxKg = parseFloat((chemicalAmount * capacity.max * factor.high).toFixed(3));

  const comment = buildComment(reactionLevel, minKg, maxKg, false);

  return {
    minKg,
    maxKg,
    reactionLevel,
    capacity,
    chemicalAmountUsed: chemicalAmount,
    isExhausted: reactionLevel === "iscrpljena",
    comment,
  };
}

// ─── Per-ciklus aggregate ─────────────────────────────────────────────────────

/**
 * Zbraja sve per-mjerenje procjene za ciklus.
 * Uključuje kemiju iz nadopuna.
 */
export function estimatePerCiklus(
  ciklus: Ciklus,
): ScaleEstimate {
  const snapshot = ciklus.productSnapshot;
  const capacity = resolveProductCapacity(snapshot);

  // Ukupna kemija: inicijalna + sve nadopune
  const initialChem = ciklus.chemicalVolumeL ?? ciklus.kolicina_kemikalije ?? 0;
  const topUpChem = ciklus.nadopune.reduce((sum, n) => sum + (n.addedChemicalVolumeL ?? n.kolicina ?? 0), 0);
  const totalChem = initialChem + topUpChem;

  const mjerenja = ciklus.mjerenja;
  const totalMj = mjerenja.length;

  if (totalMj === 0) {
    // Nema mjerenja — procjena samo na temelju kemije i generičke reakcije
    const factor = reactionFactor("srednja");
    return {
      minKg: parseFloat((totalChem * capacity.min * factor.low).toFixed(3)),
      maxKg: parseFloat((totalChem * capacity.max * factor.high).toFixed(3)),
      reactionLevel: "srednja",
      capacity,
      chemicalAmountUsed: totalChem,
      isExhausted: false,
      comment: "Procjena temeljena samo na kolicini kemije (nema mjerenja).",
    };
  }

  // Agregiramo po mjerenjima
  let totalMin = 0;
  let totalMax = 0;

  // Peak pjena — najjača pjena kroz cijeli ciklus (ne samo zadnje mjerenje)
  const foamRank: Record<string, number> = { nema: 0, slaba: 1, srednja: 2, jaka: 3, vrlo_jaka: 4 };
  const peakFoam = mjerenja.reduce<Mjerenje["foamLevel"]>((best, m) => {
    const r = foamRank[m.foamLevel ?? "nema"] ?? 0;
    const b = foamRank[best ?? "nema"] ?? 0;
    return r > b ? m.foamLevel : best;
  }, "nema");

  // Min pH kroz ciklus (najniži = najjača reakcija)
  const minPh = mjerenja.reduce((min, m) => {
    const ph = m.ph ?? (m as any).pH;
    return ph != null && ph < min ? ph : min;
  }, Infinity);

  // DominantLevel: koristiti MIN pH i PEAK pjenu — ne samo zadnje mjerenje
  const dominantPh = minPh < Infinity ? minPh : ((mjerenja[mjerenja.length - 1]?.ph ?? (mjerenja[mjerenja.length - 1] as any)?.pH) ?? 7);
  const dominantLevel = resolveReactionLevel(dominantPh, peakFoam, mjerenja[mjerenja.length - 1]?.colorIndicator);

  for (let i = 0; i < totalMj; i++) {
    const m = mjerenja[i];
    const prev = i === 0 ? null : mjerenja[i - 1];

    // Nadopune između prethodnog i ovog mjerenja
    const prevTime = prev ? (prev.measuredAt ?? prev.timestamp ?? "") : (ciklus.startDateTime ?? "");
    const currTime = m.measuredAt ?? m.timestamp ?? "";
    const nadopuneZaMjerenje = ciklus.nadopune.filter((n) => {
      const t = n.addedAt ?? n.timestamp ?? "";
      return t > prevTime && t <= currTime;
    });

    const est = estimatePerMjerenje(
      m, prev, nadopuneZaMjerenje, snapshot, totalChem, totalMj
    );
    totalMin += est.minKg;
    totalMax += est.maxKg;
  }

  // Kap na realnu granicu — ne može biti više od teorijskog max
  const theoreticalMax = totalChem * capacity.max;
  const cappedMin = parseFloat(Math.min(totalMin, theoreticalMax * 0.9).toFixed(3));
  const cappedMax = parseFloat(Math.min(totalMax, theoreticalMax).toFixed(3));

  const comment = buildComment(dominantLevel, cappedMin, cappedMax, false);

  return {
    minKg: cappedMin,
    maxKg: cappedMax,
    reactionLevel: dominantLevel,
    capacity,
    chemicalAmountUsed: totalChem,
    isExhausted: dominantLevel === "iscrpljena",
    comment,
  };
}

// ─── Per-sesija aggregate ─────────────────────────────────────────────────────

/**
 * Zbraja procjene svih ciklusa sesije.
 */
export function estimatePerSesija(sesija: Sesija): {
  estimate: ScaleEstimate;
  perCiklus: ScaleEstimate[];
  ukupnoCiklusa: number;
  ukupnoKemijeL: number;
  flowImprovementPercent: number | null;
  tempOutImprovementC: number | null;
  zakljucak: string;
} {
  // Prikupljamo sve cikluse (direktno + kroz podsesije)
  const sviCiklusi: Ciklus[] = [
    ...(sesija.ciklusi ?? []),
    ...(sesija.podsesije ?? []).flatMap((p) => p.ciklusi ?? []),
  ];

  const perCiklus = sviCiklusi.map((c) => estimatePerCiklus(c));

  const totalMin = perCiklus.reduce((s, e) => s + e.minKg, 0);
  const totalMax = perCiklus.reduce((s, e) => s + e.maxKg, 0);
  const ukupnoKemijeL = sviCiklusi.reduce((s, c) => {
    const init = c.chemicalVolumeL ?? c.kolicina_kemikalije ?? 0;
    const topups = c.nadopune.reduce((ss, n) => ss + (n.addedChemicalVolumeL ?? n.kolicina ?? 0), 0);
    return s + init + topups;
  }, 0);

  // Flow improvement (prvi vs. zadnji — sortirati vremenski da redoslijed ciklusa ne utječe)
  const svaMjerenja = [...sviCiklusi.flatMap((c) => c.mjerenja)].sort(
    (a, b) =>
      new Date(a.measuredAt ?? a.timestamp ?? "").getTime() -
      new Date(b.measuredAt ?? b.timestamp ?? "").getTime()
  );
  const prvoMjerenje = svaMjerenja[0];
  const zadnjeMjerenje = svaMjerenja[svaMjerenja.length - 1];
  let flowImprovementPercent: number | null = null;
  let tempOutImprovementC: number | null = null;

  if (prvoMjerenje?.flowLMin != null && zadnjeMjerenje?.flowLMin != null && prvoMjerenje.flowLMin > 0) {
    flowImprovementPercent = parseFloat(
      (((zadnjeMjerenje.flowLMin - prvoMjerenje.flowLMin) / prvoMjerenje.flowLMin) * 100).toFixed(1)
    );
  }
  if (prvoMjerenje?.tempOutC != null && zadnjeMjerenje?.tempOutC != null) {
    tempOutImprovementC = parseFloat((zadnjeMjerenje.tempOutC - prvoMjerenje.tempOutC).toFixed(1));
  }

  // ── Finalni reactionLevel — koristiti SVE parametre sesije, ne samo zadnje stanje ──
  // Peak pjena kroz sve cikluse
  const foamRank: Record<string, number> = { nema: 0, slaba: 1, srednja: 2, jaka: 3, vrlo_jaka: 4 };
  const peakFoamSesija = sviCiklusi
    .flatMap((c) => c.mjerenja ?? [])
    .reduce<Mjerenje["foamLevel"]>((best, m) => {
      const r = foamRank[m.foamLevel ?? "nema"] ?? 0;
      const b = foamRank[best ?? "nema"] ?? 0;
      return r > b ? m.foamLevel : best;
    }, "nema");

  // estimateScaleByReactionParams uzima u obzir Δprotok, ΔTemp OUT, ΔpH i pjenu
  const prvoMjPH  = prvoMjerenje ? (prvoMjerenje.ph ?? (prvoMjerenje as any).pH ?? null) : null;
  const zadnjeMjPH = zadnjeMjerenje ? (zadnjeMjerenje.ph ?? (zadnjeMjerenje as any).pH ?? null) : null;

  const reactionParamsResult = estimateScaleByReactionParams({
    phStart:      prvoMjPH,
    phEnd:        zadnjeMjPH,
    flowStart:    prvoMjerenje?.flowLMin ?? null,
    flowEnd:      zadnjeMjerenje?.flowLMin ?? null,
    tempOutStart: prvoMjerenje?.tempOutC ?? null,
    tempOutEnd:   zadnjeMjerenje?.tempOutC ?? null,
    peakFoam:     peakFoamSesija,
    brojMjerenja: svaMjerenja.length,
    brojCiklusa:  sviCiklusi.length,
    totalChem:    ukupnoKemijeL,
    productSnapshot: sviCiklusi[0]?.productSnapshot,
  });

  // Ako heuristički algoritam ima dovoljno podataka, koristiti njegov reactionLevel
  // i raspon — inače koristiti zbroj per-ciklus procjena
  const finalReactionLevel: ReactionLevel = reactionParamsResult.premaloPodata
    ? (perCiklus.length > 0 ? perCiklus[perCiklus.length - 1].reactionLevel : "srednja")
    : ((["jaka","srednja","slaba","iscrpljena"].includes(reactionParamsResult.reactionLevel)
        ? reactionParamsResult.reactionLevel
        : "srednja") as ReactionLevel);

  // Koristiti heuristički raspon ako je veći od zbroja per-ciklus procjena
  // (jer per-ciklus može biti premalen zbog nema kemije u polju chemicalVolumeL)
  const useHeuristic = !reactionParamsResult.premaloPodata && ukupnoKemijeL > 0;
  const finalMin = useHeuristic
    ? Math.max(parseFloat(totalMin.toFixed(3)), reactionParamsResult.minKg)
    : parseFloat(totalMin.toFixed(3));
  const finalMax = useHeuristic
    ? Math.max(parseFloat(totalMax.toFixed(3)), reactionParamsResult.maxKg)
    : parseFloat(totalMax.toFixed(3));

  const estimate: ScaleEstimate = {
    minKg: finalMin,
    maxKg: finalMax,
    reactionLevel: finalReactionLevel,
    capacity: perCiklus[0]?.capacity ?? GENERIC_CAPACITY,
    chemicalAmountUsed: ukupnoKemijeL,
    isExhausted: false,
    comment: "",
  };

  const zakljucak = buildSesijaZakljucak(
    estimate,
    sviCiklusi.length,
    ukupnoKemijeL,
    flowImprovementPercent,
    tempOutImprovementC,
  );

  estimate.comment = zakljucak;

  return {
    estimate,
    perCiklus,
    ukupnoCiklusa: sviCiklusi.length,
    ukupnoKemijeL,
    flowImprovementPercent,
    tempOutImprovementC,
    zakljucak,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formatira raspon za prikaz: "0.15–0.30 kg" */
export function formatEstimateRange(est: ScaleEstimate): string {
  if (est.isExhausted && est.maxKg < 0.01) {
    return "< 0.01 kg (kemija iscrpljena)";
  }
  const min = est.minKg < 0.1 ? est.minKg.toFixed(3) : est.minKg.toFixed(2);
  const max = est.maxKg < 0.1 ? est.maxKg.toFixed(3) : est.maxKg.toFixed(2);
  return `${min}–${max} kg`;
}

function buildComment(
  level: ReactionLevel,
  minKg: number,
  maxKg: number,
  isCiklusTotal: boolean,
): string {
  const range = `${minKg < 0.1 ? minKg.toFixed(3) : minKg.toFixed(2)}–${maxKg < 0.1 ? maxKg.toFixed(3) : maxKg.toFixed(2)} kg`;
  switch (level) {
    case "jaka":
      return isCiklusTotal
        ? `Jaka reakcija kroz ciklus — procjena ${range} CaCO3.`
        : `Jaka reakcija — intenzivno otapanje kamenca.`;
    case "srednja":
      return isCiklusTotal
        ? `Srednja aktivnost — procjena ${range} CaCO3.`
        : `Srednja reakcija — kamenac se otapa.`;
    case "slaba":
      return isCiklusTotal
        ? `Slaba aktivnost — procjena ${range} CaCO3. Razmotriti nadopunu.`
        : `Slaba reakcija — kemija slabi ili se ciklus priblizava kraju.`;
    case "iscrpljena":
      return "Kemija iscrpljena — kapacitet ovog dijela kemije je potrosen.";
  }
}

function buildSesijaZakljucak(
  est: ScaleEstimate,
  ciklusa: number,
  kemijeL: number,
  flowPct: number | null,
  tempOutC: number | null,
): string {
  const range = formatEstimateRange(est);
  const parts: string[] = [
    `Ukupno procijenjeno skinuto kamenca: ${range} CaCO3`,
    `kroz ${ciklusa} ${ciklusa === 1 ? "ciklus" : ciklusa < 5 ? "ciklusa" : "ciklusa"} i ${kemijeL.toFixed(1)} L/kg kemije.`,
  ];
  if (flowPct !== null) {
    parts.push(
      flowPct >= 5
        ? `Protok poboljsan za ${flowPct > 0 ? "+" : ""}${flowPct.toFixed(1)}% — sustav se cisti.`
        : flowPct > 0
        ? `Blago poboljsanje protoka (${flowPct.toFixed(1)}%).`
        : `Protok bez znacajne promjene (${flowPct.toFixed(1)}%).`,
    );
  }
  if (tempOutC !== null && Math.abs(tempOutC) >= 0.5) {
    parts.push(
      tempOutC >= 1
        ? `TEMP OUT porastao za +${tempOutC.toFixed(1)} °C — poboljsana izmjena topline.`
        : `TEMP OUT promjena: ${tempOutC.toFixed(1)} °C.`,
    );
  }
  return parts.join(" ");
}

// ─── Heuristički algoritam na temelju svih reakcijskih parametara ─────────

export interface ReactionParams {
  /** Inicijalni pH (referentno mjerenje) */
  phStart: number | null;
  /** Zadnji pH */
  phEnd: number | null;
  /** Inicijalni protok L/min */
  flowStart: number | null;
  /** Zadnji protok L/min */
  flowEnd: number | null;
  /** Inicijalna Temp OUT °C */
  tempOutStart: number | null;
  /** Zadnja Temp OUT °C */
  tempOutEnd: number | null;
  /** Dominantna razina pjene (iz zadnjeg ili najintenzivnijeg mjerenja) */
  peakFoam: Mjerenje["foamLevel"];
  /** Broj mjerenja (duljina trajanja reakcije) */
  brojMjerenja: number;
  /** Broj ciklusa */
  brojCiklusa: number;
  /** Ukupna kemija kg ili L */
  totalChem: number;
  /** Product snapshot */
  productSnapshot?: ProductSnapshot;
}

export interface ReactionEstimateResult {
  minKg: number;
  maxKg: number;
  reactionLevel: "jaka" | "srednja" | "slaba" | "premalo_podataka";
  temeljena: string[];
  napomena: string;
  premaloPodata: boolean;
}

/**
 * Servisna procjena uklonjenog kamenca temeljena na svim reakcijskim parametrima.
 *
 * Heuristika:
 * - Svaki parametar daje score 0–3:
 *   - pH porast (ΔpH):    <0.5→0, 0.5–1→1, 1–3→2, >3→3
 *   - Porast protoka (%): <5→0, 5–15→1, 15–30→2, >30→3
 *   - Porast Temp OUT:    <0.5→0, 0.5–1→1, 1–3→2, >3→3
 *   - Pjena (peak):       nema→0, slaba→1, srednja→2, jaka/vrlo_jaka→3
 * - Ukupni score → razina: 0–2=slaba, 3–5=srednja, 6–8=jaka
 * - Razina × kapacitet × kemija = raspon
 */
export function estimateScaleByReactionParams(p: ReactionParams): ReactionEstimateResult {
  const temeljena: string[] = [];
  let score = 0;
  let dostupnihParametara = 0;

  // 1. ΔpH
  const dPh = p.phStart !== null && p.phEnd !== null ? p.phEnd - p.phStart : null;
  if (dPh !== null) {
    dostupnihParametara++;
    temeljena.push("promjena pH");
    if (dPh >= 3) score += 3;
    else if (dPh >= 1) score += 2;
    else if (dPh >= 0.5) score += 1;
  }

  // 2. Δ protok (%)
  const dFlowPct =
    p.flowStart !== null && p.flowEnd !== null && p.flowStart > 0
      ? ((p.flowEnd - p.flowStart) / p.flowStart) * 100
      : null;
  if (dFlowPct !== null) {
    dostupnihParametara++;
    temeljena.push("porastu protoka");
    if (dFlowPct >= 30) score += 3;
    else if (dFlowPct >= 15) score += 2;
    else if (dFlowPct >= 5) score += 1;
  }

  // 3. Δ Temp OUT
  const dTempOut =
    p.tempOutStart !== null && p.tempOutEnd !== null
      ? p.tempOutEnd - p.tempOutStart
      : null;
  if (dTempOut !== null) {
    dostupnihParametara++;
    temeljena.push("porastu Temp OUT");
    if (dTempOut >= 3) score += 3;
    else if (dTempOut >= 1) score += 2;
    else if (dTempOut >= 0.5) score += 1;
  }

  // 4. Pjena
  if (p.peakFoam && p.peakFoam !== "nema") {
    dostupnihParametara++;
    temeljena.push("intenzitetu reakcije");
    if (p.peakFoam === "jaka" || p.peakFoam === "vrlo_jaka") score += 3;
    else if (p.peakFoam === "srednja") score += 2;
    else score += 1;
  }

  // Premalo podataka
  if (dostupnihParametara < 2 || p.totalChem <= 0) {
    return {
      minKg: 0, maxKg: 0,
      reactionLevel: "premalo_podataka",
      temeljena: [],
      napomena: "Premalo podataka za procjenu uklonjenog kamenca.",
      premaloPodata: true,
    };
  }

  // Razina reakcije
  const reactionLevel: "jaka" | "srednja" | "slaba" =
    score >= 6 ? "jaka" : score >= 3 ? "srednja" : "slaba";

  // Raspon po razini
  const BASE_RANGES = {
    jaka:   { min: 0.30, max: 0.60 },
    srednja: { min: 0.15, max: 0.35 },
    slaba:  { min: 0.05, max: 0.20 },
  };

  const capacity = resolveProductCapacity(p.productSnapshot);
  // Teorijski max = kemija × kapacitet
  const theoreticalMax = p.totalChem * capacity.max;
  const theoreticalMin = p.totalChem * capacity.min;

  // Miješamo teorijski i heuristički
  const heurBase = BASE_RANGES[reactionLevel];
  const rawMin = p.totalChem * heurBase.min + theoreticalMin * 0.3;
  const rawMax = p.totalChem * heurBase.max + theoreticalMax * 0.5;

  // Cap na teorijski max
  const minKg = parseFloat(Math.min(rawMin, theoreticalMax * 0.7).toFixed(2));
  const maxKg = parseFloat(Math.min(rawMax, theoreticalMax).toFixed(2));

  // Napomena
  const razinaTekst =
    reactionLevel === "jaka" ? "Jaka reakcija — aktivno otapanje kamenca." :
    reactionLevel === "srednja" ? "Srednja aktivnost — kamenac se otapa." :
    "Slabija reakcija — manji učinak čišćenja.";

  return {
    minKg,
    maxKg,
    reactionLevel,
    temeljena,
    napomena: razinaTekst,
    premaloPodata: false,
  };
}

/** Formatira heuristički raspon za prikaz */
export function formatReactionEstimateRange(r: ReactionEstimateResult): string {
  if (r.premaloPodata) return "—";
  const fmt = (n: number) => n < 1 ? n.toFixed(2) : n.toFixed(1);
  return `${fmt(r.minKg)} – ${fmt(r.maxKg)} kg`;
}

// ─── Iskorištenost kemije ──────────────────────────────────────────────────

/**
 * Procjenjuje koliko % kemijskog kapaciteta je iskorišteno na temelju
 * procjene skinutog kamenca vs. teorijskog maksimuma.
 */
export function iskoristjenostKemije(
  estimatedMaxKg: number,
  chemicalAmountUsed: number,
  capacity: { min: number; max: number },
): number {
  const theoreticalMax = chemicalAmountUsed * capacity.max;
  if (theoreticalMax <= 0) return 0;
  return Math.min(100, parseFloat(((estimatedMaxKg / theoreticalMax) * 100).toFixed(1)));
}

// ─── Status za prikaz ────────────────────────────────────────────────────────

export type CiklusStatus = "nastavi" | "dodaj_kemiju" | "zavrsi_ciklus";

export interface CiklusStatusResult {
  status: CiklusStatus;
  label: string;
  reason: string;
}

/**
 * Određuje status ciklusa: nastavi / dodaj kemiju / završi ciklus.
 * Koristi se u prikazu procjene na kraju ciklusa.
 */
export function resolveCiklusStatus(
  lastMjerenje: Mjerenje | null,
  estimate: ScaleEstimate,
  iskorištenostPct: number,
): CiklusStatusResult {
  if (!lastMjerenje) {
    return { status: "nastavi", label: "Nastavi cirkulaciju", reason: "Nema mjerenja za procjenu." };
  }

  const ph = lastMjerenje.ph ?? (lastMjerenje as any).pH ?? 7;
  const foam = lastMjerenje.foamLevel ?? "nema";

  if (ph >= 4.0 || estimate.isExhausted || iskorištenostPct >= 90) {
    return {
      status: "zavrsi_ciklus",
      label: "Zavrsi ciklus",
      reason: `Kemija iscrpljena (pH ${ph.toFixed(1)}). Pokrenuti novi ciklus ili zavrsiti.`,
    };
  }

  if (ph >= 3.0 || iskorištenostPct >= 60) {
    return {
      status: "dodaj_kemiju",
      label: "Dodaj kemiju",
      reason: `pH ${ph.toFixed(1)} — kemija slabi. Razmotriti nadopunu ili novi ciklus.`,
    };
  }

  const foamAktivna = foam !== "nema";
  if (foamAktivna && ph < 3.0) {
    return {
      status: "nastavi",
      label: "Nastavi cirkulaciju",
      reason: `Reakcija aktivna (pH ${ph.toFixed(1)}, pjena: ${foam}). Nastavi cirkulaciju.`,
    };
  }

  return {
    status: "nastavi",
    label: "Nastavi cirkulaciju",
    reason: `pH ${ph.toFixed(1)} — reakcija u tijeku.`,
  };
}
