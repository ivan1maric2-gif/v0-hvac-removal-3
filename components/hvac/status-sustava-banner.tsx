"use client";

// ─── StatusSustavaBanner ─────────────────────────────────────────────────────
//
// Dinamički panel koji se ažurira nakon svakog mjerenja.
// Prikazuje:
//   1. STATUS SUSTAVA  — interpretacija stanja reakcije/sustava (iz enginea)
//   2. SLJEDEĆA AKCIJA — preporuka za tehničara (iz enginea)
//
// IMPORTANT: Ne mijenja algoritme. Prikazuje već izračunate vrijednosti iz:
//   - LiveReactionState (generateLiveInterpretation)
//   - ReactionTrend (generateReactionTrend)
//   - Delta pH / Delta protok
//
// Algoritmi, delta pH, referentna mjerenja i live kalkulacije su NEPROMIJENJENI.

import type { LiveReactionState, ReactionTrend } from "@/lib/live-interpretation";

interface Props {
  /** Iz generateLiveInterpretation — source of truth za kemijsko stanje */
  liveState: LiveReactionState;
  /** Iz generateReactionTrend — trend između mjerenja */
  trend?: ReactionTrend | null;
  /** Delta pH: zadnje - referentno */
  dPhTotal?: number | null;
  /** Delta protok: zadnje - referentno */
  dFlowTotal?: number | null;
  /** Broj nadopuna u ciklusu */
  topUpCount?: number;
  /** Je li ciklus aktivan */
  isActive?: boolean;
}

// ─── Mapiranje chemistryStatus → STATUS SUSTAVA tekst ─────────────────────────
// Koristi engine vrijednosti — ne hardcoded pH pragove.

function buildStatusSustava(
  liveState: LiveReactionState,
  trend: ReactionTrend | null | undefined,
  dPhTotal: number | null | undefined,
  dFlowTotal: number | null | undefined,
  topUpCount: number,
): string {
  const cs = liveState.chemistryStatus;
  const rs = liveState.reactionStrength;
  const sat = liveState.saturationState;

  // Iscrpljeno / neutralizirano
  if (cs === "iscrpljeno" || sat === "iscrpljena") {
    return "Otopina je iscrpljena. Kemijska reakcija se zaustavila.";
  }
  if (cs === "neutralizirano" || sat === "neutralizirana") {
    return "Otopina je neutralizirana. Kemijsko čišćenje je završeno.";
  }

  // Kritično slaba
  if (sat === "kritična") {
    if (dPhTotal !== null && dPhTotal !== undefined && dPhTotal > 0.8) {
      return "Reakcija je gotovo završena — pH je značajno porastao od referentnog mjerenja.";
    }
    return "Otopina je u kritičnoj točki. Učinkovitost naglo pada.";
  }

  // Slabi
  if (cs === "slabi" || rs === "slaba") {
    if (topUpCount >= 2) {
      return "Reakcija slabi i otopina je djelomično iscrpljena. Nadopune su bile provedene.";
    }
    return "Reakcija slabi i učinkovitost otopine opada.";
  }

  // Aktivno / maksimalno aktivno
  if (cs === "maksimalno_aktivno" || rs === "jaka") {
    const flowOk = dFlowTotal !== null && dFlowTotal !== undefined && dFlowTotal > 0.5;
    if (flowOk) {
      return "Reakcija je aktivna, otapanje kamenca je stabilno i protok se poboljšava.";
    }
    return "Reakcija je maksimalno aktivna. Intenzivno otapanje kamenca je u tijeku.";
  }

  if (cs === "aktivno" || rs === "normalna") {
    // Provjeriti pH trend
    const phTrend = trend?.phTrend;
    if (phTrend === "raste") {
      return "Reakcija je aktivna ali pH raste — sredstvo se troši normalnom brzinom.";
    }
    if (phTrend === "pada") {
      return "Reakcija je aktivna i pH pada — sustav reagira dobro.";
    }
    return "Reakcija je aktivna i otapanje kamenca je stabilno.";
  }

  // Nepoznato stanje
  if (cs === "nepoznato") {
    return "Stanje reakcije nije poznato. Unesite pH i ostale parametre za interpretaciju.";
  }

  return liveState.chemistryDescription || "Ciklus je aktivan. Reakcija je u tijeku.";
}

// ─── Mapiranje recommendation → SLJEDEĆA AKCIJA tekst ────────────────────────
// Koristi engine preporuku — ne hardcoded logiku.

function buildSljedecaAkcija(
  liveState: LiveReactionState,
  trend: ReactionTrend | null | undefined,
  dPhTotal: number | null | undefined,
  topUpCount: number,
): string {
  const rec = liveState.recommendation;
  const detail = liveState.recommendationDetail;

  switch (rec) {
    case "nastaviti_ciscenje":
      if (trend?.phTrend === "raste") {
        return "Nastavite cirkulaciju i pratite pH trend — unesite sljedeće mjerenje.";
      }
      return "Nastavite cirkulaciju i pratite stanje. Unesite sljedeće mjerenje.";

    case "pratiti_stanje":
      return "Pratite pH i protok. Unesite mjerenje u sljedećih 15–30 minuta.";

    case "dodati_kemiju":
      if (topUpCount >= 2) {
        return "Razmotrite nadopunu sredstva ili pokretanje novog ciklusa — reakcija je već nadopunjavana.";
      }
      return "Razmotrite nadopunu kemijskog sredstva za obnavljanje reakcije.";

    case "zavrsiti_ciklus":
      if (dPhTotal !== null && dPhTotal !== undefined && dPhTotal > 1.0) {
        return "Ispustite otopinu i provedite ispiranje sustava — pH je značajno porastao.";
      }
      return "Pripremite završetak ciklusa. Ispustite otopinu i provedite ispiranje.";

    case "novi_ciklus":
      return "Ispustite otopinu, provedite ispiranje i pokrenite novi ciklus s novom kemijom.";

    case "neutralizirati":
      return "Provedite neutralizaciju otopine prije ispuštanja.";

    case "smanjiti_temperaturu":
      return "Smanjite temperaturu sustava — previsoka temperatura može oštetiti materijale.";

    case "provjeriti_magnetit":
      return "Provjerite magnetski filter — moguća prisutnost magnetita ili crnog mulja.";

    case "provjeriti_protok":
      return "Provjerite protok sustava — moguće začepljenje ili slab tlak.";

    case "obavijestiti_servisera":
      return "Obavijestite odgovornog servisera — situacija zahtijeva dodatnu provjeru.";

    default:
      return detail || "Unesite sljedeće mjerenje za ažuriranje preporuke.";
  }
}

// ─── Boja/stil prema stanju ───────────────────────────────────────────────────

function getStatusStyle(chemistryStatus: string): {
  containerCls: string;
  statusLabelCls: string;
  akcijaCls: string;
  dotCls: string;
} {
  switch (chemistryStatus) {
    case "maksimalno_aktivno":
      return {
        containerCls: "bg-emerald-500/8 border-emerald-500/20",
        statusLabelCls: "text-emerald-600 dark:text-emerald-400",
        akcijaCls: "text-foreground",
        dotCls: "bg-emerald-500",
      };
    case "aktivno":
      return {
        containerCls: "bg-blue-500/8 border-blue-500/20",
        statusLabelCls: "text-blue-600 dark:text-blue-400",
        akcijaCls: "text-foreground",
        dotCls: "bg-blue-500",
      };
    case "slabi":
      return {
        containerCls: "bg-amber-500/8 border-amber-500/20",
        statusLabelCls: "text-amber-600 dark:text-amber-400",
        akcijaCls: "text-foreground",
        dotCls: "bg-amber-500",
      };
    case "iscrpljeno":
    case "neutralizirano":
      return {
        containerCls: "bg-rose-500/8 border-rose-500/20",
        statusLabelCls: "text-rose-600 dark:text-rose-400",
        akcijaCls: "text-foreground",
        dotCls: "bg-rose-500",
      };
    default:
      return {
        containerCls: "bg-muted/40 border-border",
        statusLabelCls: "text-muted-foreground",
        akcijaCls: "text-foreground",
        dotCls: "bg-muted-foreground",
      };
  }
}

// ─── Komponenta ───────────────────────────────────────────────────────────────

export function StatusSustavaBanner({
  liveState,
  trend,
  dPhTotal,
  dFlowTotal,
  topUpCount = 0,
  isActive = false,
}: Props) {
  const statusTekst = buildStatusSustava(liveState, trend, dPhTotal, dFlowTotal, topUpCount);
  const akcijaTekst = buildSljedecaAkcija(liveState, trend, dPhTotal, topUpCount);
  const style = getStatusStyle(liveState.chemistryStatus);

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex flex-col gap-3 ${style.containerCls}`}>

      {/* STATUS SUSTAVA */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dotCls}`} />
          <p className={`text-[10px] font-bold uppercase tracking-widest ${style.statusLabelCls}`}>
            Status sustava
          </p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed pl-3">
          {statusTekst}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border/60" />

      {/* SLJEDEĆA AKCIJA */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            className="text-foreground shrink-0"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">
            Sljedeća akcija
          </p>
        </div>
        <p className={`text-sm font-semibold leading-snug pl-3.5 ${style.akcijaCls}`}>
          {akcijaTekst}
        </p>
      </div>

    </div>
  );
}
