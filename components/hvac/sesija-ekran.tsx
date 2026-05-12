"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/lib/app-state";
import { StatusBadge } from "./status-badge";
import { PokreniCiklusModal } from "./pokreni-ciklus-modal";
import { MjerenjeModal } from "./mjerenje-modal";
import { BrziUnosMjerenja } from "./brzi-unos-mjerenja";
import { RezultatMjerenja } from "./rezultat-mjerenja";
import type { PreporukaAkcija } from "@/lib/preporuka";
import { NadopunaModal } from "./nadopuna-modal";
import type { Sesija, Podsesija, Ciklus, Mjerenje, NadopunaKemikalije, VrstaDijela, Materijal, VrstaNaslage, JacinaProblema, JedinicaProtoka, MeasurementType, WorkMode, IspiranjeData, NeutralizacijaData, ZavrsniPhCheck, ReactionStabilityResult, CompletionPhases } from "@/lib/types";
import { estimatePerSesija, formatEstimateRange, estimateScaleByReactionParams, formatReactionEstimateRange } from "@/lib/scale-removal-estimate";
import { CLEANING_MODE_LABELS } from "@/lib/types";
import {
  aktivniCiklusSesije,
  aktivniCiklusPodsesije,
  zadnjiPHSesije,
  zadnjiPHPodsesije,
  zadnjeMjerenjePodsesije,
  izracunajStatistiku,
  materijalUpozorenje,
  izracunajProtokLMin,
  pocetnoMjerenjeCiklusa,
  getMjerenjePH,
  getMjerenjeTimestamp,
  interpretirajMjerenje,
} from "@/lib/types";
import { calcCleaningEffectiveness, generirajPreporuku, analyseReactionStability, getCompletionBlockers, calcScaleEstimate, mozeLiZavrsitiSesiju } from "@/lib/preporuka";
import type { CleaningEffectiveness } from "@/lib/preporuka";
import { genId, nowISO } from "@/lib/utils";
import { PreporukaKartica } from "./preporuka-kartica";
import { RateZoneBadge } from "./rate-zone-badge";
import { ServisniIzvjestaj } from "./servisni-izvjestaj";
import { LiveTimer } from "./live-timer";
import { MjerenjeLogTabela } from "./mjerenje-log-tabela";
import { LiveDashboard } from "./live-dashboard";
import type { VoiceCommandResult } from "./glasovni-unos";
import { MjerenjeSekvencija } from "./mjerenje-sekvencija";
import { CiklusVremenskiSlijed } from "./ciklus-vremenski-slijed";
import { LivePregled } from "./live-pregled";
import {
  IspiranjeFazaModal,
  NeutralizacijaFazaModal,
  ZavrsniPhCheckModal,
} from "./completion-phases-modal";
import { NoviCiklusWorkflow } from "./novi-ciklus-workflow";
import { toast } from "sonner";
import { getUzUpozorenjeLabel } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Modal =
  | null
  | { tip: "mjerenje"; measurementType: MeasurementType }
  | { tip: "nadopuna" }
  | { tip: "novi_ciklus" }
  | { tip: "novi_ciklus_workflow" } // novi fullscreen workflow
  | { tip: "dodaj_podsesiju" }
  | { tip: "uredi_podsesiju"; podsesija: Podsesija }
  | { tip: "ispiranje" }
  | { tip: "neutralizacija" }
  | { tip: "zavrsni_ph" }
  | { tip: "prisilni_zavrsetak"; blokatoriTekst: string[] };

interface SesijaEkranProps {
  sesijaId: string;
}

export function SesijaEkran({ sesijaId }: SesijaEkranProps) {
  const {
    navigiraj,
    idi_na_pocetni,
    getSesija,
    zavrsiSesiju,
    pauzirajSesiju,
    nastaviSesiju,
    zatvoriSesijuNedovrsenu,
    obrisiSesiju,
    postaviWorkMode,
    dodajPodsesiju,
    urediPodsesiju,
    zavrsiPodsesiju,
    pokreniCiklusSesije,
    zavrsiCiklusSesije,
    prekinutiCiklusSesije,
    azurirajStatusCiklusaSesije,
    dodajMjerenjeSesije,
    dodajNadopunuSesije,
    azurirajCompletionPhasesSesije,
  } = useApp();

  const sesija = getSesija(sesijaId);
  const [modal, setModal] = useState<Modal>(null);
  const [showIzvjestaj, setShowIzvjestaj] = useState(false);

  // ─── Centralni handler za završetak sesije ─────────────────────────────────
  // Poziva se sa SVIH mjesta gdje postoji "Završi sesiju" gumb.
  // Redoslijed: zavrsiSesiju → toast → navigacija na početni.
  function handleZavrsiSesiju() {
    zavrsiSesiju(sesijaId);
    // Toast — tekst ovisi o tome što nedostaje (ispiranje/neutralizacija)
    const sesijaSad = getSesija(sesijaId);
    const label = sesijaSad ? getUzUpozorenjeLabel(sesijaSad) : null;
    const imaUpozorenje =
      sesijaSad?.status === "uz_upozorenje" ||
      (label && label !== "Završeno uz upozorenje");
    if (imaUpozorenje) {
      toast.warning(label ?? "Sesija završena uz upozorenje", {
        description: "Evidentirana u servisnom zapisu.",
        duration: 5000,
      });
    } else {
      toast.success("Sesija završena", {
        description: "Servis uspješno dokumentiran.",
        duration: 4000,
      });
    }
    setModal(null);
    idi_na_pocetni();
  }

  // ─── Centralni handler za prisilni završetak (modal blokatori) ─────────────
  function handlePrisilniZavrsetak() {
    zavrsiSesiju(sesijaId);
    toast.warning("Sesija završena uz upozorenje", {
      description: "Nedostajući koraci evidentirani u servisnom zapisu.",
      duration: 5000,
    });
    setModal(null);
    idi_na_pocetni();
  }

  function handleExportSession() {
    if (!sesija) return;
    const json = JSON.stringify(sesija, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `sesija-${sesija.id.slice(0, 8)}-${sesija.datum?.slice(0, 10) ?? "export"}.json`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPauzeDialog, setShowPauzeDialog] = useState<"pauziraj" | "zatvori_nedovrseno" | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [workTab, setWorkTab] = useState<"live" | "detalji" | "preporuka" | "pregled">("live");
  const [voiceInitialValues, setVoiceInitialValues] = useState<{ ph?: number; flowLMin?: number; foamLevel?: import("@/lib/types").FoamLevel; colorIndicator?: import("@/lib/types").ColorIndicator } | undefined>(undefined);
  const [savedMjerenje, setSavedMjerenje] = useState<import("@/lib/types").Mjerenje | null>(null);

  // ── Early returns NAKON svih hookova ──────────────────────────────────────
  if (!sesija) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
        <p className="text-base font-semibold text-foreground">Sesija više ne postoji.</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sesija je obrisana ili nije dostupna.
        </p>
        <button
          onClick={() => navigiraj({ ime: "povijest" })}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          Povratak na povijest
        </button>
      </div>
    );
  }

  // Guard je uklonjen — Mode A sesije prolaze setup_ciklus samo pri prvom
  // kreiranju (nova-sesija-ekran ih navigira direktno na setup_ciklus).
  // Kasniji ulasci u sesiju-ekran (iz povijesti, back navigacije) ne trebaju
  // redirect jer ciklusi se čuvaju u memoriji, ne persistiraju u Supabase.

  const stat = izracunajStatistiku(sesija);
  const isModeA = sesija.workMode === "no_subsessions";
  const isModeB = sesija.workMode === "with_subsessions";
  const aktivanCiklus = isModeA ? aktivniCiklusSesije(sesija) : undefined;
  const zadnjiPH = isModeA ? zadnjiPHSesije(sesija) : null;
  const ciklusiBezAktivnog = isModeA
    ? (sesija.ciklusi ?? []).filter((c) => c.status === "zavrsen" || c.status === "prekinut")
    : [];

  // Zadnji zavrseni ciklus — izvor za prefill novog ciklusa (volumen + proizvod)
  // NE kopira mjerenja, pH, pjenu ni protok — novi ciklus je uvijek ceist pocetak
  const prethodniCiklus = ciklusiBezAktivnog.length > 0
    ? ciklusiBezAktivnog[ciklusiBezAktivnog.length - 1]
    : null;
  const nemaCiklusa = isModeA && (sesija.ciklusi ?? []).length === 0;
  const sviZavrseni = isModeA && (sesija.ciklusi ?? []).length > 0 && !aktivanCiklus;
  const jeZavrsena = sesija.status === "zavrseno";
  const cekaPocetnoMjerenjeA =
    aktivanCiklus?.status === "ceka_pocetno_mjerenje" &&
    !pocetnoMjerenjeCiklusa(aktivanCiklus);

  // pH exhaustion check for Mode A
  const zadnjiMjerSesije = isModeA && aktivanCiklus && aktivanCiklus.mjerenja.length > 0
    ? [...aktivanCiklus.mjerenja].sort(
        (a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime()
      )[0]
    : null;
  const interpretacijaSesije = zadnjiMjerSesije
    ? interpretirajMjerenje(getMjerenjePH(zadnjiMjerSesije), zadnjiMjerSesije.phRatePerMinute, zadnjiMjerSesije.foamLevel)
    : null;
  const cekaOdlukuSesije = Boolean(
    aktivanCiklus &&
    !cekaPocetnoMjerenjeA &&
    interpretacijaSesije?.prijedlogAkcije &&
    interpretacijaSesije.prijedlogAkcije !== "nastaviti"
  );

  // Reaction stability for Mode A — check last 2-3 measurements
  const stabilityA = (() => {
    if (!isModeA || !aktivanCiklus || aktivanCiklus.mjerenja.length < 2) return null;
    const sorted = [...aktivanCiklus.mjerenja].sort(
      (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
    );
    return analyseReactionStability(sorted, aktivanCiklus);
  })();
  const reakcijaStabilnaA = stabilityA?.status === "stable";

  // Find last finished cycle (for completion phases) in Mode A
  const zadnjiZavrsenCiklusA = isModeA
    ? [...(sesija.ciklusi ?? [])].reverse().find((c) => c.status === "zavrsen" || c.status === "prekinut") ?? null
    : null;

  // Preporuka for Mode A — compute from last measurement of active cycle
  const preporukaA = (() => {
    if (!isModeA || !aktivanCiklus || !zadnjiMjerSesije) return null;
    const sortedMj = [...aktivanCiklus.mjerenja].sort(
      (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
    );
    const prev = sortedMj.length > 1 ? sortedMj[sortedMj.length - 2] : undefined;
    try {
      return generirajPreporuku({
        mjerenje: zadnjiMjerSesije,
        ciklus: aktivanCiklus,
        previousMjerenje: prev,
        sessionId: sesijaId,
        product: aktivanCiklus.productSnapshot ?? null,
        cleaningMode: sesija.cleaningMode,
      });
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col flex-1 bg-background pb-24">
      {/* ── Header ──────���─────────────�����──────���────────────────────────────── */}
      <header className="bg-secondary text-secondary-foreground px-4 pt-4 pb-5 flex flex-col gap-4">

        {/* ── 1. Naziv + Status ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold leading-tight break-words whitespace-normal">
              {sesija.naziv_objekta}
            </h1>
            {sesija.isDemo && (
              <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 rounded px-1.5 py-0.5">
                DEMO
              </span>
            )}
          </div>
          <div className="shrink-0 mt-0.5">
            <StatusBadge status={sesija.status} size="md" />
          </div>
        </div>

        {/* ── 2. Session meta (Serviser, Lokacija, Datum) ───────────────── */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-foreground/80">
          <HeaderMetaItem label="Serviser" value={sesija.serviser} />
          <HeaderMetaItem label="Lokacija" value={sesija.lokacija} />
          <HeaderMetaItem label="Datum" value={formatDate(sesija.datum)} />
          {sesija.kontakt_osoba && (
            <HeaderMetaItem label="Kontakt" value={sesija.kontakt_osoba} />
          )}
        </div>

        {sesija.opis_problema && (
          <p className="text-xs text-secondary-foreground/70 italic leading-relaxed border-t border-secondary-foreground/20 pt-2.5 whitespace-normal break-words">
            {sesija.opis_problema}
          </p>
        )}

        {/* ── 3. Info traka — način rada + brojač (sekundarno) ─────────── */}
        <div className="flex items-center gap-2 flex-wrap border-t border-secondary-foreground/15 pt-2.5">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
            isModeA
              ? "bg-blue-400/15 text-blue-300 border border-blue-400/25"
              : "bg-teal-400/15 text-teal-300 border border-teal-400/25"
          }`}>
            {isModeA ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            )}
            {isModeA ? "Jedan uređaj" : "Više dijelova"}
          </span>

          <span className="text-secondary-foreground/25 text-[10px] select-none">·</span>

          {isModeA && (() => {
            const c = (sesija.ciklusi ?? []).length;
            const m = (sesija.ciklusi ?? []).reduce((s, k) => s + (k.mjerenja ?? []).length, 0);
            return (
              <span className="text-[11px] text-secondary-foreground/55 font-medium">
                {c === 0 ? "Nema ciklusa" : `Ciklusa: ${c}`}
                {m > 0 && <> · Mjerenja: {m}</>}
              </span>
            );
          })()}
          {!isModeA && (() => {
            const p = (sesija.podsesije ?? []).length;
            const c = (sesija.podsesije ?? []).reduce((s, pd) => s + (pd.ciklusi ?? []).length, 0);
            const m = (sesija.podsesije ?? []).reduce(
              (s, pd) => s + (pd.ciklusi ?? []).reduce((s2, k) => s2 + (k.mjerenja ?? []).length, 0), 0
            );
            return (
              <span className="text-[11px] text-secondary-foreground/55 font-medium">
                {p === 0 ? "Nema uređaja" : `Uređaja: ${p}`}
                {c > 0 && <> · Ciklusa: {c}</>}
                {m > 0 && <> · Mjerenja: {m}</>}
              </span>
            );
          })()}

          {/* Action buttons — desna strana info trake */}
          <div className="ml-auto flex items-center gap-1.5">
            {isModeA && (
              <button
                type="button"
                onClick={() => setWorkTab("pregled")}
                onTouchEnd={(e) => { e.preventDefault(); setWorkTab("pregled"); }}
                aria-label="Otvori LIVE pregled"
                className="flex items-center gap-1 text-[11px] font-bold bg-blue-500/20 border border-blue-400/40 text-blue-200 rounded px-2.5 py-1 hover:bg-blue-500/30 transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                LIVE
              </button>
            )}
            <button
              onClick={() => setShowIzvjestaj(true)}
              aria-label="Otvori servisni izvještaj"
              className="flex items-center gap-1 text-[11px] font-semibold bg-secondary-foreground/10 border border-secondary-foreground/20 text-secondary-foreground rounded px-2.5 py-1 hover:bg-secondary-foreground/15 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              Izvještaj
            </button>
            <button
              onClick={handleExportSession}
              aria-label="Spremi sesiju kao JSON"
              className="flex items-center gap-1 text-[11px] font-semibold bg-secondary-foreground/10 border border-secondary-foreground/20 text-secondary-foreground rounded px-2.5 py-1 hover:bg-secondary-foreground/15 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Spremi
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full flex flex-col gap-5">

        {/* Demo data warning */}
        {sesija.isDemo && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-bold">DEMO sesija</span> — Ovo su demo podaci za prikaz i testiranje aplikacije. Ne koristiti za stvarna terenska izvješća.
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MODE A — Direct session workflow
        ══════════════════════════════════════════════════════════════ */}
        {isModeA && (
          <>
            {/* Live timer — visible when a cycle is active */}
            {aktivanCiklus && !jeZavrsena && (
              <LiveTimer />
            )}

            {/* CTA: Pocetno mjerenje */}
            {cekaPocetnoMjerenjeA && aktivanCiklus && (
              <div className="bg-violet-500/10 border-2 border-violet-500/40 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-500">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">
                      Referentno mjerenje (nakon ~3 min cirkulacije)
                    </p>
                    <details className="mt-1 group">
                      <summary className="text-xs text-primary cursor-pointer list-none flex items-center gap-1">
                        <span>Upute</span>
                        <svg className="w-3 h-3 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </summary>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Pokrenite cirkulaciju i pričekajte približno 3 minute da se sredstvo ravnomjerno izmiješa. Zatim unesite referentno mjerenje.
                      </p>
                    </details>
                  </div>
                </div>
                <button
                  onClick={() => setModal({ tip: "mjerenje", measurementType: "initial_cycle_measurement" })}
                  className="w-full bg-violet-600 text-white rounded-xl py-3 font-bold text-sm hover:bg-violet-700 active:scale-[0.98] transition-all"
                  style={{ minHeight: 48, maxHeight: 52 }}
                >
                  Unesi referentno mjerenje
                </button>
              </div>
            )}

            {/* Ceka odluku — pH iscrpljen */}
            {cekaOdlukuSesije && aktivanCiklus && interpretacijaSesije && (
              <div className="rounded-2xl overflow-hidden shadow-md border border-rose-700">
                {/* Status header */}
                <div className="bg-rose-800 px-5 pt-5 pb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200 mb-1.5">Status reakcije</p>
                  <p className="text-3xl font-black text-white leading-tight tracking-tight mb-2">SREDSTVO PRI KRAJU</p>
                  <p className="text-sm text-rose-100 leading-relaxed">{interpretacijaSesije.tekst}</p>
                </div>
                {/* Next step */}
                <div className="bg-rose-900 px-5 pt-4 pb-5 flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-300 mb-1">Mogući sljedeći koraci</p>
                    <p className="text-xl font-black text-white tracking-tight">Odaberi akciju</p>
                  </div>
                  <button
                    onClick={() => setModal({ tip: "nadopuna" })}
                    className="w-full bg-white text-rose-900 rounded-xl py-3.5 font-bold text-sm hover:bg-rose-50 active:scale-[0.98] transition-all"
                  >
                    Dodaj nadopunu sredstva
                  </button>
                  <button
                    onClick={() => setModal({ tip: "novi_ciklus" })}
                    className="w-full bg-rose-700 border border-rose-500 text-white rounded-xl py-3 font-semibold text-sm hover:bg-rose-600 active:scale-[0.98] transition-all"
                  >
                    Pokreni novi ciklus
                  </button>
                  <button
                    onClick={() => zavrsiCiklusSesije(sesijaId, aktivanCiklus.id)}
                    className="w-full bg-rose-800/60 border border-rose-600/50 text-rose-100 rounded-xl py-3 font-medium text-sm hover:bg-rose-700/60 active:scale-[0.98] transition-all"
                  >
                    Završi ciklus
                  </button>
                </div>
              </div>
            )}

            {/* REAKCIJA STABILNA banner — shown when stability engine says "stable" */}
            {reakcijaStabilnaA && aktivanCiklus && stabilityA && (
              <ReakcijaStabilnaBanner
                stability={stabilityA}
                onZavrsiCiklus={() => {
                  zavrsiCiklusSesije(sesijaId, aktivanCiklus.id);
                  setModal({ tip: "ispiranje" });
                }}
              />
            )}

            {/* ── Tab navigation + content — shown when cycle has measurements ── */}
            {aktivanCiklus && aktivanCiklus.mjerenja.length > 0 && (
              <div className="flex flex-col gap-3">
                {/* 4-tab pill bar */}
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
                  {(["live", "detalji", "preporuka", "pregled"] as const).map((tab) => {
                    const labels = { live: "Live", detalji: "Detalji", preporuka: "Preporuka", pregled: "LIVE pregled" };
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setWorkTab(tab)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
                          workTab === tab
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                {/* Live tab */}
                {workTab === "live" && (
                  <LiveDashboard
                    ciklus={aktivanCiklus}
                    stability={stabilityA}
                    callbacks={{
                      objekt: sesija.naziv_objekta,
                      sredstvo: aktivanCiklus.chemicalProductName ?? aktivanCiklus.kemikalija,
                      nadacinRada: "Jedan uredaj",
                      onMjerenje: () => setModal({ tip: "mjerenje", measurementType: "regular" }),
                      onNadopuna: () => setModal({ tip: "nadopuna" }),
                      onNoviCiklus: () => setModal({ tip: "novi_ciklus" }),
                      onZavrsiCiklus: () => zavrsiCiklusSesije(sesijaId, aktivanCiklus.id),
                      onVoiceResult: (r) => { setVoiceInitialValues(r); setModal({ tip: "mjerenje", measurementType: "regular" }); },
                      onVoiceCommand: (cmd: VoiceCommandResult) => {
                        // Handle voice commands
                        if (cmd.command === "dodaj_kemikaliju" && (cmd.kemikalijaKg || cmd.kemikalijaL)) {
                          // Open nadopuna modal — can pre-fill values
                          setModal({ tip: "nadopuna" });
                        } else if (cmd.command === "pokreni_ciklus") {
                          setModal({ tip: "novi_ciklus" });
                        } else if (cmd.command === "zavrsi_ciklus" && aktivanCiklus) {
                          zavrsiCiklusSesije(sesijaId, aktivanCiklus.id);
                        } else if (cmd.command === "pocni_ispiranje") {
                          setModal({ tip: "ispiranje" });
                        } else if (cmd.command === "dodaj_napomenu" && cmd.napomena && aktivanCiklus) {
                          // Note: napomena update via voice command not yet supported
                        }
                      },
                      onEditReferentno: () => setModal({ tip: "mjerenje", measurementType: "initial_cycle_measurement" }),
                    }}
                  />
                )}

                {/* Detalji tab */}
                {workTab === "detalji" && (
                  <div className="flex flex-col gap-4">
                    {/* Mjerenja ciklusa — unified chronological timeline */}
                    <CiklusVremenskiSlijed ciklus={aktivanCiklus} sesija={sesija} />
                    {/* Delta data grid */}
                    <div className="bg-card border border-border rounded-xl px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Napredni podaci
                      </p>
                      {(() => {
                        const allMj = [...aktivanCiklus.mjerenja].sort(
                          (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
                        );
                        const baseline = allMj.find((m) => m.measurementType === "initial_cycle_measurement") ?? null;
                        const lastMj = allMj[allMj.length - 1];
                        const ph = lastMj ? getMjerenjePH(lastMj) : null;
                        const basePh = baseline ? getMjerenjePH(baseline) : null;
                        const baseFlow = baseline?.flowLMin;
                        const currFlow = lastMj?.flowLMin;
                        return (
                          <div className="flex flex-col gap-3 text-xs w-full">
                            {basePh !== null && ph !== null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">ΔpH od poc.</span>
                                <span className="font-bold text-foreground text-base">
                                  {ph - basePh >= 0 ? "+" : ""}{(ph - basePh).toFixed(3)}
                                </span>
                              </div>
                            )}
                            {lastMj?.phChange != null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">ΔpH od zad.</span>
                                <span className="font-bold text-foreground text-base">
                                  {lastMj.phChange >= 0 ? "+" : ""}{lastMj.phChange.toFixed(3)}
                                </span>
                              </div>
                            )}
                            {lastMj?.phRatePerMinute != null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">pH/min</span>
                                <span className="font-bold text-foreground text-base">
                                  {lastMj.phRatePerMinute >= 0 ? "+" : ""}{lastMj.phRatePerMinute.toFixed(4)}
                                </span>
                              </div>
                            )}
                            {baseFlow != null && currFlow != null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Δprotok od poc.</span>
                                <span className="font-bold text-foreground text-base">
                                  {currFlow - baseFlow >= 0 ? "+" : ""}{(currFlow - baseFlow).toFixed(1)} L/min
                                </span>
                              </div>
                            )}
                            {lastMj?.flowChangeFromPrevious != null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Δprotok od zad.</span>
                                <span className="font-bold text-foreground text-base">
                                  {lastMj.flowChangeFromPrevious >= 0 ? "+" : ""}{lastMj.flowChangeFromPrevious.toFixed(1)} L/min
                                </span>
                              </div>
                            )}
                            {lastMj?.temperatureC != null && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Temperatura</span>
                                <span className="font-bold text-foreground text-base">{lastMj.temperatureC} °C</span>
                              </div>
                            )}
                            {lastMj?.turbidity && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Zamucenje</span>
                                <span className="font-bold text-foreground text-base capitalize">{lastMj.turbidity}</span>
                              </div>
                            )}
                            {lastMj?.sediment && (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Talog</span>
                                <span className="font-bold text-foreground text-base capitalize">{lastMj.sediment}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Full measurement log */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-0.5">
                        Log mjerenja — Ciklus #{aktivanCiklus.cycleNumber ?? aktivanCiklus.broj}
                      </p>
                      <MjerenjeLogTabela ciklus={aktivanCiklus} />
                    </div>
                  </div>
                )}

                {/* Preporuka tab */}
                {workTab === "preporuka" && preporukaA && (
                  <PreporukaKartica
                    preporuka={preporukaA}
                    onTopUp={
                      preporukaA.recommendedAction === "add_top_up"
                        ? (_amountL: number) => setModal({ tip: "nadopuna" })
                        : undefined
                    }
                  />
                )}
                {workTab === "preporuka" && !preporukaA && (
                  <div className="bg-card border border-border rounded-xl px-4 py-8 flex flex-col items-center gap-2 text-center">
                    <p className="text-sm font-semibold text-foreground">Nema preporuke</p>
                    <p className="text-xs text-muted-foreground">Dodaj mjerenje za automatsku preporuku.</p>
                  </div>
                )}
              </div>
            )}

            {/* LIVE pregled — always accessible, not gated by active cycle or measurements */}
            {workTab === "pregled" && (
              <LivePregled sesija={sesija} />
            )}

            {/* Aktivni ciklus info card — shown only before initial measurement (LiveDashboard takes over after) */}
            {aktivanCiklus && aktivanCiklus.mjerenja.length === 0 && (
              <div className="bg-card border border-primary/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Ciklus #{aktivanCiklus.cycleNumber ?? aktivanCiklus.broj}
                    {aktivanCiklus.name ? ` — ${aktivanCiklus.name}` : ""}
                  </h3>
                  <StatusBadge status={aktivanCiklus.status} />
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground mb-3 w-full">
                  <span>Kemikalija: <strong className="text-foreground">{aktivanCiklus.chemicalProductName ?? aktivanCiklus.kemikalija}</strong></span>
                  <span>Kol.: <strong className="text-foreground">{aktivanCiklus.chemicalAmount} {aktivanCiklus.chemicalUnit}</strong></span>
                  <span>Voda: <strong className="text-foreground">{aktivanCiklus.waterVolumeL ?? aktivanCiklus.volumen_vode} L</strong></span>
                  {aktivanCiklus.totalSolutionVolumeL && (
                    <span>Ukupno: <strong className="text-foreground">{aktivanCiklus.totalSolutionVolumeL.toFixed(1)} L</strong></span>
                  )}
                  {aktivanCiklus.chemicalPercent != null && (
                    <span>Postotak: <strong className="text-foreground">{aktivanCiklus.chemicalPercent.toFixed(2)} %</strong></span>
                  )}
                  {aktivanCiklus.waterPh && (
                    <span>pH vode: <strong className="text-foreground">{aktivanCiklus.waterPh}</strong></span>
                  )}
                  <span>Nadopune: <strong className="text-foreground">{aktivanCiklus.nadopune.length}</strong></span>
                  <span>Mjerenja: <strong className="text-foreground">{aktivanCiklus.mjerenja.length}</strong></span>
                </div>
                {aktivanCiklus.nadopune.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Nadopune:</p>
                    <div className="flex flex-col gap-1.5">
                      {aktivanCiklus.nadopune.map((n) => (
                        <NadopunaRedak key={n.id} nadopuna={n} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Zavrseni ciklusi */}
            {ciklusiBezAktivnog.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Završeni ciklusi
                </h3>
                <div className="flex flex-col gap-2">
                  {ciklusiBezAktivnog.map((c) => (
                    <ZavrsenCiklusKartica key={c.id} ciklus={c} sesija={sesija} />
                  ))}
                </div>
              </div>
            )}

            {/* Mode A — no cycles yet: large empty state */}
            {nemaCiklusa && !jeZavrsena && (
              <div className="bg-primary/8 border-2 border-primary/30 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Spremno za ciscenje jednog uredaja</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Pokrenite prvi ciklus. Ciklus znaci cista voda + novo sredstvo.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModal({ tip: "novi_ciklus" })}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  Pokreni prvi ciklus
                </button>
              </div>
            )}

            {/* Mode A actions */}
            {!jeZavrsena && (
              <div className="flex flex-col gap-2.5 mt-1">
                {nemaCiklusa && (
                  <></>
                )}
                {/* Ceka mjerenje nakon nadopune */}
                {aktivanCiklus?.waitingForTopUpMeasurement && (
                  <div className="bg-primary/8 border-2 border-primary/30 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Sljedeci korak: mjerenje nakon nadopune</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Nakon kratke cirkulacije unesite mjerenje kako bi se utvrdio ucinak nadopune.
                        </p>
                      </div>
                    </div>
                    <ActionButton
                      label="Unesi mjerenje nakon nadopune"
                      variant="primary"
                      onClick={() => setModal({ tip: "mjerenje", measurementType: "after_top_up" })}
                    />
                  </div>
                )}

                {/* Only show standalone action buttons when LiveDashboard is NOT active */}
                {aktivanCiklus && !cekaPocetnoMjerenjeA && aktivanCiklus.mjerenja.length === 0 && (
                  <>
                    <ActionButton
                      label="Unesi mjerenje"
                      variant="primary"
                      onClick={() => setModal({ tip: "mjerenje", measurementType: "regular" })}
                    />
                    <ActionButton
                      label={preporukaA?.recommendedAction === "add_top_up" ? "Nadopuni (preporučeno)" : "Nadopuna kemije"}
                      variant={preporukaA?.recommendedAction === "add_top_up" ? "primary" : "secondary"}
                      onClick={() => setModal({ tip: "nadopuna" })}
                    />
                    <ActionButton
                      label="Pokreni novi ciklus"
                      variant="ghost"
                      onClick={() => setModal({ tip: "novi_ciklus" })}
                    />
                    <ActionButton
                      label={`Završi ciklus #${aktivanCiklus.cycleNumber ?? aktivanCiklus.broj}`}
                      variant="ghost"
                      onClick={() => zavrsiCiklusSesije(sesijaId, aktivanCiklus.id)}
                    />
                  </>
                )}
                {sviZavrseni && (
                  <div className="flex flex-col gap-3">
                    {/* Kartica odluke — preporuka appa */}
                    {(() => {
                      const brCiklusa = (sesija.ciklusi ?? []).length;
                      const sljedeciBroj = brCiklusa + 1;
                      // Preporuka: ako completion faze nisu gotove → ispiranje i završetak, inače → novi ciklus
                      const preporukaNoviCiklus = !zadnjiZavrsenCiklusA?.completionPhases?.ispiranje;
                      return (
                        <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                          <div className="bg-card px-4 pt-4 pb-3 flex flex-col gap-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              Preporuka appa
                            </p>
                            <p className="text-lg font-black text-foreground leading-tight">
                              {preporukaNoviCiklus
                                ? `Pokreni Ciklus #${sljedeciBroj}`
                                : "Ispiranje i završetak sesije"}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {preporukaNoviCiklus
                                ? "Kemijska reakcija je završena. Ispusti otopinu, isperi sustav i pokreni novi ciklus za bolji rezultat."
                                : "Svi ciklusi su završeni. Provedi ispiranje i neutralizaciju, zatim završi sesiju."}
                            </p>
                          </div>
                          <div className="bg-muted/30 px-4 pb-4 pt-3 flex flex-col gap-2">
                            {/* PRIMARNI GUMB — prati preporuku appa */}
                            {preporukaNoviCiklus ? (
                              <button
                                onClick={() => setModal({ tip: "novi_ciklus" })}
                                className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                              >
                                Pokreni Ciklus #{sljedeciBroj}
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const blokatoriTekst: string[] = [];
                                  if (isModeA && !zadnjiZavrsenCiklusA?.completionPhases?.ispiranje)
                                    blokatoriTekst.push("Ispiranje nije potvrđeno");
                                  if (isModeA && !zadnjiZavrsenCiklusA?.completionPhases?.neutralizacija)
                                    blokatoriTekst.push("Neutralizacija nije potvrđena");
                                  if (blokatoriTekst.length > 0) {
                                    setModal({ tip: "prisilni_zavrsetak", blokatoriTekst });
                                  } else {
                                    handleZavrsiSesiju();
                                  }
                                }}
                                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-3.5 text-sm font-bold transition-all"
                              >
                                Završi sesiju
                              </button>
                            )}
                            {/* SEKUNDARNI GUMB — alternativa */}
                            {preporukaNoviCiklus ? (
                              <button
                                onClick={() => {
                                  const blokatoriTekst: string[] = [];
                                  if (isModeA && !zadnjiZavrsenCiklusA?.completionPhases?.ispiranje)
                                    blokatoriTekst.push("Ispiranje nije potvrđeno");
                                  if (isModeA && !zadnjiZavrsenCiklusA?.completionPhases?.neutralizacija)
                                    blokatoriTekst.push("Neutralizacija nije potvrđena");
                                  if (blokatoriTekst.length > 0) {
                                    setModal({ tip: "prisilni_zavrsetak", blokatoriTekst });
                                  } else {
                                    handleZavrsiSesiju();
                                  }
                                }}
                                className="w-full rounded-xl bg-muted border border-border text-foreground py-3 text-sm font-semibold hover:bg-muted/80 active:scale-[0.98] transition-all"
                              >
                                Ispiranje i završetak sesije
                              </button>
                            ) : (
                              <button
                                onClick={() => setModal({ tip: "novi_ciklus" })}
                                className="w-full rounded-xl bg-muted border border-border text-foreground py-3 text-sm font-semibold hover:bg-muted/80 active:scale-[0.98] transition-all"
                              >
                                Pokreni Ciklus #{sljedeciBroj}
                              </button>
                            )}
                            {/* Zatvori bez završetka — uvijek tercijarno */}
                            <button
                              onClick={() => zatvoriSesijuNedovrsenu(sesijaId)}
                              className="w-full rounded-xl bg-transparent border border-amber-500/40 text-amber-600 dark:text-amber-400 py-2.5 text-xs font-semibold hover:bg-amber-500/10 active:scale-[0.98] transition-all"
                            >
                              Zatvori bez završetka
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {/* Reakcija završena banner — shown before ispiranje is started */}
                {sviZavrseni && isModeA && !zadnjiZavrsenCiklusA?.completionPhases?.ispiranje && (
                  <div className="rounded-2xl overflow-hidden border border-green-700 shadow-sm">
                    <div className="bg-green-900 px-5 pt-5 pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-green-300 mb-1.5">Status</p>
                      <p className="text-2xl font-black text-white leading-tight tracking-tight mb-1.5">
                        Kemijska reakcija završena
                      </p>
                      <p className="text-sm text-green-200 leading-relaxed">
                        Nakon ispusta stare otopine: isperi sustav mrežnom vodom, zatim po potrebi provedi neutralizaciju.
                      </p>
                    </div>
                    <div className="bg-green-950 px-5 py-3">
                      <p className="text-xs text-green-300 font-semibold">
                        Sljedeći korak: Ispiranje i neutralizacija
                      </p>
                    </div>
                  </div>
                )}

                {/* Completion phases — prikazati SAMO kad postoji barem jedan završeni ciklus */}
                {sviZavrseni && isModeA && zadnjiZavrsenCiklusA && (
                  <CompletionPhasesPanel
                    phases={zadnjiZavrsenCiklusA?.completionPhases}
                    onIspiranje={() => setModal({ tip: "ispiranje" })}
                    onNeutralizacija={() => setModal({ tip: "neutralizacija" })}
                    onZavrsniPH={() => setModal({ tip: "zavrsni_ph" })}
                    onZavrsiSesiju={handleZavrsiSesiju}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MODE B — Subsession workflow
        ══════════════════════════════════════════════════════════════ */}
        {isModeB && (
          <>
            {/* Podsesija list */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Podsesije ({sesija.podsesije.length})
                </h2>
                {!jeZavrsena && (
                  <button
                    onClick={() => setModal({ tip: "dodaj_podsesiju" })}
                    className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity"
                  >
                    + Dodaj podsesiju
                  </button>
                )}
              </div>

              {sesija.podsesije.length === 0 ? (
                <div className="bg-primary/8 border-2 border-primary/30 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground">Dodajte prvi dio sustava</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Za svaki dio sustava vodit ce se zasebni ciklusi, mjerenja i nadopune.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setModal({ tip: "dodaj_podsesiju" })}
                    className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Dodaj dio sustava
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sesija.podsesije.map((p) => (
                    <PodsesijaKartica
                      key={p.id}
                      podsesija={p}
                      jeZavrsena={jeZavrsena}
                      onOtvori={() =>
                        navigiraj({ ime: "podsesija", sesijaId, podsesijaId: p.id })
                      }
                      onUredi={() => setModal({ tip: "uredi_podsesiju", podsesija: p })}
                      onZavrsi={() => zavrsiPodsesiju(sesijaId, p.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Mode B actions */}
            {!jeZavrsena && sesija.podsesije.length > 0 && (() => {
              const modeBBlockers = mozeLiZavrsitiSesiju(sesija);
              return (
                <div className="flex flex-col gap-2.5">
                  <ActionButton
                    label="Dodaj podsesiju"
                    variant="secondary"
                    onClick={() => setModal({ tip: "dodaj_podsesiju" })}
                  />
                  <div className="border-t border-border pt-2.5 flex flex-col gap-2">
                    {!modeBBlockers.canFinish ? (
                      <div className="bg-muted rounded-xl px-4 py-3 flex flex-col gap-1.5">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Završetak sesije nije moguć</p>
                        {modeBBlockers.blockers.map((b, i) => (
                          <p key={i} className="text-xs text-foreground leading-snug">{b}</p>
                        ))}
                      </div>
                    ) : (
                      <ActionButton
                        label="Završi sesiju"
                        variant="danger"
                        onClick={handleZavrsiSesiju}
                      />
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── Summary card — prikazati samo kada sesija nije aktivna
             (dok je u_radu, Sažetak sesije je dostupan unutar LiveDashboard collapsibled sekcije) */}
        {sesija.status !== "u_radu" && (
          <SummaryCard stat={stat} isModeA={isModeA} />
        )}

        {/* ── Procjena reakcije (sesija) ────────────────────────────────── */}
        <SesijaScaleKartica sesija={sesija} />

        {/* ── Pauza / Nastavak / Zatvaranje ────────────────────────────── */}
        {sesija.status === "u_radu" && (
          <div className="border-t border-border pt-4 mt-2 flex flex-col gap-2">
            <button
              onClick={() => setShowPauzeDialog("pauziraj")}
              className="flex items-center gap-2 w-full rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 font-semibold text-sm py-3 px-4 active:scale-[0.98] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
              </svg>
              Pauziraj sesiju
            </button>
            <button
              onClick={() => setShowPauzeDialog("zatvori_nedovrseno")}
              className="flex items-center gap-2 w-full rounded-xl border border-border text-muted-foreground font-semibold text-sm py-3 px-4 active:scale-[0.98] transition-all hover:border-destructive/40 hover:text-destructive"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Zatvori bez završetka
            </button>
          </div>
        )}
        {sesija.status === "nedovrseno" && (
          <div className="border-t border-border pt-4 mt-2 flex flex-col gap-2">
            {sesija.status === "nedovrseno" && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-300/60 rounded-xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber-600 shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                  Sesija je prethodno bila zatvorena kao nedovršena
                </p>
              </div>
            )}
            <button
              onClick={() => nastaviSesiju(sesijaId)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-primary-foreground font-bold text-base py-4 active:scale-[0.98] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Nastavi sesiju
            </button>
          </div>
        )}

        {/* ── Danger zone ──────────────────────────────────────────────── */}
        <div className="border-t border-border pt-4 mt-2">
          <button
            onClick={() => { setDeleteChecked(false); setShowDeleteDialog(true); }}
            className="flex items-center gap-2 text-xs font-semibold text-destructive/70 hover:text-destructive transition-colors py-1"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Obriši sesiju
          </button>
        </div>

      </main>

      {/* ─��� Delete confirmation dialog ────────────────────────────────────── */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-foreground">Obrisati sesiju?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ova radnja će obrisati sesiju <span className="font-semibold text-foreground">{sesija.naziv_objekta}</span>, sve cikluse, mjerenja, nadopune i izvještaje povezane s ovom sesijom. Radnja se ne može poništiti.
              </p>
            </div>
            {sesija.status === "u_radu" && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold text-destructive">
                  Sesija je još aktivna. Jeste li sigurni da je želite obrisati?
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteChecked}
                    onChange={(e) => setDeleteChecked(e.target.checked)}
                    className="mt-0.5 accent-destructive"
                  />
                  <span className="text-xs text-foreground leading-relaxed">
                    Razumijem da će svi podaci ove sesije biti trajno obrisani.
                  </span>
                </label>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => {
                  obrisiSesiju(sesijaId);
                  setShowDeleteDialog(false);
                  navigiraj({ ime: "povijest" });
                }}
                disabled={sesija.status === "u_radu" && !deleteChecked}
                className="w-full rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm py-3 transition-opacity disabled:opacity-40 active:scale-[0.98]"
              >
                Obriši sesiju
              </button>
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="w-full rounded-xl bg-muted text-foreground font-semibold text-sm py-3 active:scale-[0.98]"
              >
                Odustani
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ����─ Pauziraj / Zatvori bez završetka confirm dialog ─────────────────── */}
      {showPauzeDialog && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-foreground">
                {showPauzeDialog === "pauziraj" ? "Pauzirati sesiju?" : "Zatvoriti bez završetka?"}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {showPauzeDialog === "pauziraj"
                  ? "Svi podaci će biti spremljeni. Možete nastaviti rad u bilo kojem trenutku."
                  : "Sesija će biti označena kao zatvorena (nedovršena). Podaci neće biti izgubljeni."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (showPauzeDialog === "pauziraj") {
                    pauzirajSesiju(sesijaId);
                    idi_na_pocetni();
                  } else {
                    zatvoriSesijuNedovrsenu(sesijaId);
                    idi_na_pocetni();
                  }
                  setShowPauzeDialog(null);
                }}
                className={`w-full rounded-xl font-semibold text-sm py-3 active:scale-[0.98] transition-all ${
                  showPauzeDialog === "pauziraj"
                    ? "bg-amber-500 text-white"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {showPauzeDialog === "pauziraj" ? "Pauziraj sesiju" : "Zatvori bez završetka"}
              </button>
              <button
                onClick={() => setShowPauzeDialog(null)}
                className="w-full rounded-xl bg-muted text-foreground font-semibold text-sm py-3 active:scale-[0.98]"
              >
                Odustani
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service report overlay ─────���──────────────────────────────────── */}
      {showIzvjestaj && (
        <ServisniIzvjestaj
          sesija={sesija}
          onClose={() => setShowIzvjestaj(false)}
        />
      )}

      {/* ── Modals �����───────────────────────────────────────────────────────── */}

      {/* Mode A modals */}
      {/* Fullscreen workflow za novi ciklus */}
      {modal?.tip === "novi_ciklus" && isModeA && (
        <div className="fixed inset-0 z-50 bg-background">
          <NoviCiklusWorkflow
            sesijaId={sesijaId}
            nazivObjekta={sesija.naziv_objekta}
            tipSustava={sesija.systemCategory}
            tipProblema={sesija.cleaningMode}
            procijenjeniVolumenL={prethodniCiklus?.waterVolumeL}
            onComplete={(ciklusId) => {
              // Workflow je završen, ciklus je kreiran s nultim mjerenjem
              // Idi na Live praćenje (LiveDashboard je na "live" tabu)
              setModal(null);
              setWorkTab("live");
            }}
            onCancel={() => setModal(null)}
          />
        </div>
      )}

      {modal?.tip === "mjerenje" && aktivanCiklus && (
        <BrziUnosMjerenja
          ciklus={aktivanCiklus}
          sessionId={sesijaId}
          cleaningMode={sesija.cleaningMode}
          initialType={modal.measurementType}
          nazivObjekta={sesija.naziv_objekta}
          onSave={(m) => {
            dodajMjerenjeSesije(sesijaId, aktivanCiklus.id, m);
            setVoiceInitialValues(undefined);
            setModal(null);
            setSavedMjerenje(m);
          }}
          onClose={() => { setVoiceInitialValues(undefined); setModal(null); }}
        />
      )}

      {savedMjerenje && aktivanCiklus && (
        <RezultatMjerenja
          mjerenje={savedMjerenje}
          referenceTempOutC={pocetnoMjerenjeCiklusa(aktivanCiklus)?.tempOutC ?? null}
          referenceFlowLMin={pocetnoMjerenjeCiklusa(aktivanCiklus)?.flowLMin ?? null}
          onNovoMjerenje={() => {
            setSavedMjerenje(null);
            setModal({ tip: "mjerenje", measurementType: "regular" });
          }}
          onDodajNadopunu={() => {
            setSavedMjerenje(null);
            setModal({ tip: "nadopuna" });
          }}
          onNoviCiklus={() => {
            setSavedMjerenje(null);
            setModal({ tip: "novi_ciklus" });
          }}
          onPrimaryAction={(action: PreporukaAkcija) => {
            setSavedMjerenje(null);
            if (action === "add_top_up") setModal({ tip: "nadopuna" });
            else if (action === "start_new_cycle") setModal({ tip: "novi_ciklus" });
            else setModal(null);
          }}
          onClose={() => setSavedMjerenje(null)}
        />
      )}

      {modal?.tip === "nadopuna" && aktivanCiklus && (
        <NadopunaModal
          ciklus={aktivanCiklus}
          sessionId={sesijaId}
          systemCategory={sesija.systemCategory}
          onSave={(n) => {
            dodajNadopunuSesije(sesijaId, aktivanCiklus.id, n);
            // Immediately prompt for follow-up measurement
            setModal({ tip: "mjerenje", measurementType: "after_top_up" });
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Completion phase modals — Mode A */}
      {modal?.tip === "ispiranje" && isModeA && zadnjiZavrsenCiklusA && (
        <IspiranjeFazaModal
          sessionId={sesijaId}
          systemCategory={sesija.systemCategory}
          onSave={(data: IspiranjeData) => {
            azurirajCompletionPhasesSesije(sesijaId, zadnjiZavrsenCiklusA.id, { ispiranje: data });
            // Skip neutralization modal when rinse pH is acceptable
            if (data.neutralizationRequired === false) {
              setModal({ tip: "zavrsni_ph" });
            } else {
              setModal({ tip: "neutralizacija" });
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tip === "neutralizacija" && isModeA && zadnjiZavrsenCiklusA && (
        <NeutralizacijaFazaModal
          onSave={(data: NeutralizacijaData) => {
            azurirajCompletionPhasesSesije(sesijaId, zadnjiZavrsenCiklusA.id, { neutralizacija: data });
            setModal({ tip: "zavrsni_ph" });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tip === "zavrsni_ph" && isModeA && zadnjiZavrsenCiklusA && (
        <ZavrsniPhCheckModal
          sessionId={sesijaId}
          systemCategory={sesija.systemCategory}
          autoFinalFlowLMin={zadnjiZavrsenCiklusA.finalFlowLMin}
          onSave={(data: ZavrsniPhCheck) => {
            // Compute scale estimate from total product used
            const totalProductKg = (() => {
              const allCycles = sesija.ciklusi ?? [];
              let total = 0;
              for (const c of allCycles) {
                const unit = c.chemicalUnit;
                if (unit === "kg") total += c.chemicalAmount;
                else if (unit === "g") total += c.chemicalAmount / 1000;
                else if (unit === "L") total += c.chemicalAmount * (c.chemicalDensityKgL ?? 1.2);
                else if (unit === "ml") total += (c.chemicalAmount / 1000) * (c.chemicalDensityKgL ?? 1.2);
                for (const n of c.nadopune) {
                  if (n.unit === "kg") total += n.amount;
                  else if (n.unit === "g") total += n.amount / 1000;
                  else if (n.unit === "L") total += n.amount * (n.densityKgL ?? 1.2);
                  else if (n.unit === "ml") total += (n.amount / 1000) * (n.densityKgL ?? 1.2);
                }
              }
              return total > 0 ? total : null;
            })();
            const snap = zadnjiZavrsenCiklusA.productSnapshot;
            // Skupi reakcijske parametre iz svih ciklusa sesije
            const sviCiklusReakcija = (sesija.ciklusi ?? []);
            const svaMjerenjaReakcija = sviCiklusReakcija.flatMap(c => c.mjerenja);
            const prvoMj = svaMjerenjaReakcija[0];
            const zadnjeMj = svaMjerenjaReakcija[svaMjerenjaReakcija.length - 1];
            const peakFoam = svaMjerenjaReakcija.reduce<Mjerenje["foamLevel"]>((peak, m) => {
              const order: Mjerenje["foamLevel"][] = ["nema", "slaba", "srednja", "jaka", "vrlo_jaka"];
              const currIdx = order.indexOf(m.foamLevel ?? "nema");
              const peakIdx = order.indexOf(peak ?? "nema");
              return currIdx > peakIdx ? m.foamLevel : peak;
            }, "nema");
            const totalChem = totalProductKg ?? 0;
            const heuristicEstimate = estimateScaleByReactionParams({
              phStart: prvoMj?.ph ?? null,
              phEnd: zadnjeMj?.ph ?? null,
              flowStart: prvoMj?.flowLMin ?? null,
              flowEnd: zadnjeMj?.flowLMin ?? null,
              tempOutStart: prvoMj?.tempOutC ?? null,
              tempOutEnd: zadnjeMj?.tempOutC ?? null,
              peakFoam,
              brojMjerenja: svaMjerenjaReakcija.length,
              brojCiklusa: sviCiklusReakcija.length,
              totalChem,
              productSnapshot: snap ?? undefined,
            });
            // Pohrani kao ProcjenaKamenca — koristimo sredinu raspona za estimatedKgCaCO3
            const procjena = heuristicEstimate.premaloPodata
              ? {
                  estimatedKgCaCO3: null as number | null,
                  isRoughEstimate: false,
                  basedOnProductData: false,
                  note: heuristicEstimate.napomena,
                  minKg: null as number | null,
                  maxKg: null as number | null,
                }
              : {
                  estimatedKgCaCO3: parseFloat(((heuristicEstimate.minKg + heuristicEstimate.maxKg) / 2).toFixed(2)),
                  isRoughEstimate: true,
                  basedOnProductData: false,
                  note: `Servisna procjena uklonjenog kamenca. Temeljeno na: ${heuristicEstimate.temeljena.join(", ")}.`,
                  minKg: heuristicEstimate.minKg,
                  maxKg: heuristicEstimate.maxKg,
                };
            azurirajCompletionPhasesSesije(sesijaId, zadnjiZavrsenCiklusA.id, {
              zavrsniPH: data,
              procjenaKamenca: procjena,
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Mode B modals */}
      {modal?.tip === "dodaj_podsesiju" && (
        <PodsesijaFormModal
          sesijaId={sesijaId}
          redni_broj_default={(sesija.podsesije.length + 1)}
          onSave={(p) => {
            dodajPodsesiju(sesijaId, p);
            setModal(null);
          }}
          onSaveAndOpen={(p) => {
            dodajPodsesiju(sesijaId, p);
            setModal(null);
            // Navigate after state update — use a short tick
            setTimeout(() => navigiraj({ ime: "podsesija", sesijaId, podsesijaId: p.id }), 50);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tip === "uredi_podsesiju" && (
        <PodsesijaFormModal
          sesijaId={sesijaId}
          editPodsesija={modal.podsesija}
          redni_broj_default={modal.podsesija.redni_broj}
          onSave={(p) => {
            urediPodsesiju(sesijaId, modal.podsesija.id, p);
            setModal(null);
          }}
          onSaveAndOpen={(p) => {
            urediPodsesiju(sesijaId, modal.podsesija.id, p);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Prisilni završetak — warning modal ────────────────────────────────── */}
      {modal?.tip === "prisilni_zavrsetak" && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-8"
          onClick={() => setModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setModal(null)}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-prisilni"
        >
          <div
            className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              const startY = e.touches[0].clientY;
              const el = e.currentTarget;
              const onMove = (ev: TouchEvent) => {
                if (ev.touches[0].clientY - startY > 60) {
                  setModal(null);
                  el.removeEventListener("touchmove", onMove);
                }
              };
              el.addEventListener("touchmove", onMove, { passive: true });
              el.addEventListener("touchend", () => el.removeEventListener("touchmove", onMove), { once: true });
            }}
          >
            {/* Handle bar — swipe down hint */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>
            {/* Header */}
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <h2 id="modal-title-prisilni" className="text-lg font-black text-foreground leading-tight">
                    Sesija nije potpuno dovršena
                  </h2>
                </div>
                {/* X gumb — primarni dismiss */}
                <button
                  onClick={() => setModal(null)}
                  aria-label="Zatvori"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sesiju možete nastaviti ili završiti uz upozorenje:
              </p>
            </div>
            {/* Lista nedostajućih koraka */}
            <div className="px-5 py-4 flex flex-col gap-2">
              {modal.blokatoriTekst.map((b, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5" />
                  <p className="text-sm text-foreground">{b}</p>
                </div>
              ))}
            </div>
            {/* Napomena */}
            <div className="mx-5 mb-4 rounded-xl bg-muted/60 border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground leading-snug">
                Sesija se zatvara i bilježi kao{" "}
                <span className="font-semibold text-amber-600">Završeno uz upozorenje</span>.
                Nedostajući koraci se evidentiraju u servisnom zapisu.
              </p>
            </div>
            {/* Akcije */}
            <div className="flex flex-col gap-2 px-5 pb-5">
              <button
                onClick={handlePrisilniZavrsetak}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white py-3.5 text-sm font-bold transition-all"
              >
                Završi sesiju uz upozorenje
              </button>
              <button
                onClick={() => setModal(null)}
                className="w-full rounded-xl border border-border bg-secondary hover:bg-muted active:scale-[0.98] text-foreground py-3 text-sm font-semibold transition-all"
              >
                Nastavi rad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating LIVE icon — sekundarni, vidljiv samo kad nije na live tabu */}
      {isModeA && !jeZavrsena && workTab !== "live" && (
        <button
          type="button"
          onClick={() => setWorkTab("live")}
          onTouchEnd={(e) => { e.preventDefault(); setWorkTab("live"); }}
          aria-label="LIVE praćenje"
          className="fixed bottom-4 right-4 z-[9999] flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-2xl shadow-lg active:scale-95 transition-all touch-manipulation"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Header meta item ─────��──────────────────────────────────���────────────────

function HeaderMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
  <span className="text-secondary-foreground/50 text-[10px] uppercase tracking-wider">{label}</span>
  <span className="text-secondary-foreground/90 font-medium">{value}</span>
    </div>
  );
}

// ─── Mode selector button ────────────���─��─────���─���──────────────────────────────

function ModeButton({
  active,
  label,
  badge,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  badge: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98] ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      <span className="text-sm font-semibold leading-tight">{label}</span>
      <span
        className={`text-xs rounded-full px-2 py-0.5 font-medium border ${
          active
            ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
            : "bg-muted text-muted-foreground border-border"
        }`}
      >
        {badge}
      </span>
      <span
        className={`text-xs leading-snug ${
          active ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {description}
      </span>
    </button>
  );
}

// ─── Info banner ──────────────────────────────����────────��──────────────────���─��

// ─── Work mode banner ──────────────────────────────��─────────────────────�����────

function WorkModeBanner({
  sesija,
  isModeA,
  jeZavrsena,
  onSwitchMode,
}: {
  sesija: Sesija;
  isModeA: boolean;
  jeZavrsena: boolean;
  onSwitchMode: (mode: WorkMode) => void;
}) {
  const brojCiklusa = (sesija.ciklusi ?? []).length;
  const brojMjerenjaA = (sesija.ciklusi ?? []).reduce((s, k) => s + (k.mjerenja ?? []).length, 0);
  const brojPodsesija = (sesija.podsesije ?? []).length;
  const ukupnoCiklusaB = (sesija.podsesije ?? []).reduce((s, p) => s + (p.ciklusi ?? []).length, 0);
  const ukupnoMjerenjaB = (sesija.podsesije ?? []).reduce(
    (s, p) => s + (p.ciklusi ?? []).reduce((s2, k) => s2 + (k.mjerenja ?? []).length, 0), 0
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Mode badge */}
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${
        isModeA
          ? "bg-blue-400/15 text-blue-300 border border-blue-400/25"
          : "bg-teal-400/15 text-teal-300 border border-teal-400/25"
      }`}>
        {isModeA ? "Jedan uređaj" : "Više dijelova"}
      </span>

      {/* Counts */}
      {isModeA ? (
        <span className="text-xs text-muted-foreground">
          Ciklusa: <span className="font-semibold text-foreground">{brojCiklusa}</span>
          {brojMjerenjaA > 0 && (
            <> · Mjerenja: <span className="font-semibold text-foreground">{brojMjerenjaA}</span></>
          )}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Uređaja: <span className="font-semibold text-foreground">{brojPodsesija}</span>
          {ukupnoCiklusaB > 0 && (
            <> · Ciklusa: <span className="font-semibold text-foreground">{ukupnoCiklusaB}</span></>
          )}
          {ukupnoMjerenjaB > 0 && (
            <> · Mjerenja: <span className="font-semibold text-foreground">{ukupnoMjerenjaB}</span></>
          )}
        </span>
      )}

      {/* Settings icon — umjesto velikog teksta */}
      {!jeZavrsena && (
        <button
          onClick={() => onSwitchMode(isModeA ? "with_subsessions" : "no_subsessions")}
          title="Promijeni način rada"
          className="ml-auto text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <div className="flex gap-3 bg-accent/60 border border-accent rounded-xl px-4 py-3">
      <svg
        className="shrink-0 mt-0.5 text-primary/70"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <p className="text-xs text-foreground/80 leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Podsesija kartica ────────────────────────────────��──────────────────────

function PodsesijaKartica({
  podsesija,
  jeZavrsena,
  onOtvori,
  onUredi,
  onZavrsi,
}: {
  podsesija: Podsesija;
  jeZavrsena: boolean;
  onOtvori: () => void;
  onUredi: () => void;
  onZavrsi: () => void;
}) {
  const akt = aktivniCiklusPodsesije(podsesija);
  const pH = zadnjiPHPodsesije(podsesija);
  const zadnjeMjer = zadnjeMjerenjePodsesije(podsesija);
  const brojCiklusa = podsesija.ciklusi.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Main info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-[10px] font-bold text-primary/60 bg-primary/8 rounded px-1.5 py-0.5">
              #{podsesija.redni_broj}
            </span>
            <span className="font-semibold text-sm text-foreground leading-snug">{podsesija.naziv}</span>
          </div>
          <StatusBadge status={podsesija.status} />
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {podsesija.dio_sustava}
          {podsesija.vrsta_dijela && <> &middot; {podsesija.vrsta_dijela}</>}
          {" "}&middot; {podsesija.materijal} &middot; ~{podsesija.procijenjeni_volumen} L
        </p>
        {podsesija.lokacija_unutar_objekta && (
          <p className="text-xs text-muted-foreground/70 mb-3">{podsesija.lokacija_unutar_objekta}</p>
        )}
        {!podsesija.lokacija_unutar_objekta && <div className="mb-3" />}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
          <span className="text-muted-foreground">
            {brojCiklusa} {brojCiklusa === 1 ? "ciklus" : "ciklusa"}
          </span>
          {pH !== null && (
            <span className="font-medium">
              pH: <span className={pH < 5 ? "text-orange-600" : "text-green-700"}>{pH.toFixed(1)}</span>
            </span>
          )}
          {akt && (
            <span className="text-primary font-medium">Ciklus #{akt.broj} aktivan</span>
          )}
          <StatusBadge status={podsesija.status_reakcije} />
        </div>

        {/* Last measurement */}
        {zadnjeMjer && (
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground mb-3">
            <span className="font-medium text-foreground">Zadnje mjerenje:</span>{" "}
            pH {getMjerenjePH(zadnjeMjer).toFixed(2)}
            {(zadnjeMjer.temperatureC ?? zadnjeMjer.temperatura) ? `, ${zadnjeMjer.temperatureC ?? zadnjeMjer.temperatura} °C` : ""}
            {(zadnjeMjer.note ?? zadnjeMjer.napomena) ? <span className="italic"> — {zadnjeMjer.note ?? zadnjeMjer.napomena}</span> : ""}
            <span className="text-muted-foreground/50 ml-1">({formatTime(getMjerenjeTimestamp(zadnjeMjer))})</span>
          </div>
        )}

        {/* Recommendation */}
        {podsesija.kratka_preporuka && (
          <p className="text-xs text-primary/80 font-medium italic">
            {podsesija.kratka_preporuka}
          </p>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center border-t border-border divide-x divide-border">
        <button
          onClick={onOtvori}
          className="flex-1 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
        >
          Otvori
        </button>
        <button
          onClick={onUredi}
          className="flex-1 py-2.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          Uredi
        </button>
        {!jeZavrsena && podsesija.status !== "zavrseno" && (
          <button
            onClick={onZavrsi}
            className="flex-1 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Završi
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  stat,
  isModeA,
}: {
  stat: ReturnType<typeof izracunajStatistiku>;
  isModeA: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
        Sažetak sesije
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {!isModeA && (
          <>
            <SummaryItem label="Podsesija ukupno" value={String(stat.brojPodsesija)} />
            <SummaryItem label="Aktivnih podsesija" value={String(stat.aktivnePodsesije)} />
            <SummaryItem label="Završenih podsesija" value={String(stat.zavrsenePodsesije)} />
          </>
        )}
        <SummaryItem label="Ciklusa ukupno" value={String(stat.ukupnoCiklusa)} />
        <SummaryItem label="Mjerenja ukupno" value={String(stat.ukupnoMjerenja)} />
        <SummaryItem label="Nadopuna ukupno" value={String(stat.ukupnoNadopuna)} />
        <SummaryItem
          label="Kemikalije ukupno"
          value={`${stat.ukupnoKemikalije.toFixed(1)} ${stat.kemikalijeJedinica}`}
          highlight
        />
      </div>
    </div>
  );
}

// ─── Ukupna procjena kamenca (sesija) ─────────────────────────────────────────

function SesijaScaleKartica({ sesija }: { sesija: Sesija }) {
  const sviCiklusi = [
    ...(sesija.ciklusi ?? []),
    ...(sesija.podsesije ?? []).flatMap((p) => p.ciklusi ?? []),
  ];
  if (sviCiklusi.length === 0) return null;

  // Sva mjerenja sortirana vremenski
  const svaMjerenja = [...sviCiklusi.flatMap((c) => c.mjerenja ?? [])].sort(
    (a, b) => new Date(a.measuredAt ?? a.timestamp ?? "").getTime() - new Date(b.measuredAt ?? b.timestamp ?? "").getTime()
  );
  if (svaMjerenja.length < 2) return null;

  const result = estimatePerSesija(sesija);
  const { estimate, ukupnoCiklusa, flowImprovementPercent, tempOutImprovementC } = result;

  // Kvalitativna ocjena reakcije — uzima u obzir reactionLevel + Δprotok + ΔTemp OUT
  // Ako su poboljšanja velika, override-ati "slaba/iscrpljena" prema gore
  const effectiveLevel = (() => {
    const level = estimate.reactionLevel;
    const fp = flowImprovementPercent ?? 0;
    const tp = tempOutImprovementC ?? 0;

    // Ako protok > 35% I Temp OUT > 3°C → barem "jaka"
    if (fp >= 35 && tp >= 3) return "jaka";
    // Ako protok > 25% ILI Temp OUT > 3°C → barem "srednja"
    if (fp >= 25 || tp >= 3) return level === "slaba" || level === "iscrpljena" ? "srednja" : level;
    // Ako protok > 10% ILI Temp OUT > 1°C → ne može biti "iscrpljena"
    if (fp >= 10 || tp >= 1) return level === "iscrpljena" ? "slaba" : level;

    return level;
  })();

  const reactionLevelLabel = (level: string): string => {
    switch (level) {
      case "jaka":       return "Veća količina kamenca";
      case "srednja":    return "Umjerena količina kamenca";
      case "slaba":      return "Mala količina kamenca";
      case "iscrpljena": return "Zanemariva reakcija";
      default:           return "Umjerena količina kamenca";
    }
  };
  const reactionLevelColor = (level: string): string => {
    switch (level) {
      case "jaka":       return "text-rose-400";
      case "srednja":    return "text-amber-400";
      case "slaba":      return "text-blue-400";
      case "iscrpljena": return "text-muted-foreground";
      default:           return "text-amber-400";
    }
  };

  const ocjena = reactionLevelLabel(effectiveLevel);
  const ocjenaColor = reactionLevelColor(effectiveLevel);

  // Rezultat čišćenja — naslov
  const rezultatCiscenja = (() => {
    const fp = flowImprovementPercent ?? 0;
    const tp = tempOutImprovementC ?? 0;
    if (fp >= 30 && tp >= 3)  return "Izvrsno čišćenje";
    if (fp >= 20 || tp >= 3)  return "Vrlo dobro čišćenje";
    if (fp >= 10 || tp >= 1)  return "Dobro čišćenje";
    if (fp >= 3  || tp >= 0.5) return "Umjereno čišćenje";
    if (fp > 0)               return "Blago poboljšanje";
    return "Bez vidljivog poboljšanja";
  })();

  const rezultatColor = (() => {
    if (rezultatCiscenja.startsWith("Izvrsno"))  return "text-emerald-400";
    if (rezultatCiscenja.startsWith("Vrlo"))     return "text-emerald-400";
    if (rezultatCiscenja.startsWith("Dobro"))    return "text-blue-400";
    if (rezultatCiscenja.startsWith("Umjereno")) return "text-amber-400";
    return "text-muted-foreground";
  })();

  // Kompletni servisni zaključak u rečenicama
  const servisniZakljucak = (() => {
    const dijelovi: string[] = [];
    const fp = flowImprovementPercent;
    const tp = tempOutImprovementC;

    if (fp !== null && fp >= 5)
      dijelovi.push(`Protočnost je poboljšana za ${fp.toFixed(1)}%`);
    else if (fp !== null && fp > 0)
      dijelovi.push(`Blago poboljšanje protočnosti (${fp.toFixed(1)}%)`);
    else if (fp !== null && fp <= 0)
      dijelovi.push("Protočnost se nije poboljšala");

    if (tp !== null && tp >= 0.5)
      dijelovi.push(`Temp OUT je porasla za ${tp.toFixed(1)} °C`);
    else if (tp !== null && tp < -0.5)
      dijelovi.push(`Temp OUT je pala za ${Math.abs(tp).toFixed(1)} °C`);

    const opis = dijelovi.join(". ") + (dijelovi.length > 0 ? ". " : "");

    const preporuka = (() => {
      if ((fp ?? 0) >= 10 || (tp ?? 0) >= 1)
        return "Preporučuje se ispiranje sustava i završetak servisa.";
      if ((fp ?? 0) > 0)
        return "Razmotrite još jedan ciklus ili ispiranje sustava.";
      return "Provjerite ispravnost sustava i cirkulacije. Razmotrite novi pristup čišćenju.";
    })();

    return opis + preporuka;
  })();

  const stat = izracunajStatistiku(sesija);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          Završni servisni zaključak
        </h3>
        <span className="text-[9px] italic text-muted-foreground/50">procjena</span>
      </div>

      {/* Rezultat čišćenja — dominantni naslov */}
      <div className="px-4 py-4 border-b border-border/50 flex flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Rezultat čišćenja</span>
        <span className={`text-xl font-black leading-tight ${rezultatColor}`}>{rezultatCiscenja}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-2">Procjena kamenca</span>
        <span className={`text-sm font-black leading-tight ${ocjenaColor}`}>{ocjena}</span>
      </div>

      {/* Zaključak u rečenicama */}
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-sm text-foreground leading-relaxed">{servisniZakljucak}</p>
      </div>

      {/* Statistika — Protok + Temp OUT + Ciklusi + Kemija */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">Protočnost</span>
          {flowImprovementPercent != null ? (
            <span className={`text-base font-black tabular-nums ${flowImprovementPercent >= 5 ? "text-emerald-400" : flowImprovementPercent > 0 ? "text-blue-400" : "text-rose-400"}`}>
              {flowImprovementPercent > 0 ? "+" : ""}{flowImprovementPercent.toFixed(1)}%
            </span>
          ) : <span className="text-xs text-muted-foreground/40 italic">N/A</span>}
        </div>
        <div className="px-4 py-2.5 flex flex-col gap-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">Temp OUT</span>
          {tempOutImprovementC != null ? (
            <span className={`text-base font-black tabular-nums ${tempOutImprovementC >= 1 ? "text-emerald-400" : tempOutImprovementC > 0 ? "text-orange-300" : "text-rose-400"}`}>
              {tempOutImprovementC > 0 ? "+" : ""}{tempOutImprovementC.toFixed(1)} °C
            </span>
          ) : <span className="text-xs text-muted-foreground/40 italic">N/A</span>}
        </div>
        <div className="px-4 py-2.5 flex flex-col gap-0.5 border-t border-border">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">Ciklusa</span>
          <span className="text-base font-black tabular-nums text-foreground">{stat.ukupnoCiklusa}</span>
        </div>
        <div className="px-4 py-2.5 flex flex-col gap-0.5 border-t border-border">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">Kemije ukupno</span>
          <span className="text-base font-black tabular-nums text-primary">
            {stat.ukupnoKemikalije.toFixed(1)} {stat.kemikalijeJedinica}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5">
        <p className="text-[8px] text-muted-foreground/40 leading-relaxed">
          Procjena. Stvarne vrijednosti ovise o vrsti kamenca, pritisku i konfiguraciji sustava.
        </p>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-base font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatKartica({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={`text-lg font-bold ${highlight ? "text-orange-600" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  onClick: () => void;
}) {
  const classes: Record<string, string> = {
    primary:
      "w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all",
    secondary:
      "w-full bg-secondary text-secondary-foreground rounded-xl py-3.5 font-semibold text-sm hover:bg-secondary/80 active:scale-[0.98] transition-all",
    ghost:
      "w-full border border-border text-foreground rounded-xl py-3.5 font-medium text-sm hover:bg-muted/50 active:scale-[0.98] transition-all",
    danger:
      "w-full border border-destructive text-destructive rounded-xl py-3.5 font-medium text-sm hover:bg-destructive/5 active:scale-[0.98] transition-all",
  };
  return (
    <button onClick={onClick} className={classes[variant]}>
      {label}
    </button>
  );
}

const TYPE_SHORT_SE: Record<string, string> = {
  initial_cycle_measurement: "Poc.",
  regular: "Red.",
  after_top_up: "Nad.",
  final_cycle: "ZavC",
  final_subsession: "ZavP",
  final_session: "ZavS",
};

function MjerenjeRedak({ mjerenje, broj }: { mjerenje: Mjerenje; broj: number }) {
  const ph = getMjerenjePH(mjerenje);
  const ts = getMjerenjeTimestamp(mjerenje);
  return (
    <div className="border border-border rounded-xl p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            #{broj} {TYPE_SHORT_SE[mjerenje.measurementType] ?? "Mj."}
          </span>
          <span className="font-bold text-sm text-foreground">pH {ph.toFixed(2)}</span>
          {mjerenje.phChange !== undefined && (
            <span className={`text-xs font-medium ${mjerenje.phChange > 0 ? "text-orange-600" : mjerenje.phChange < 0 ? "text-green-600" : "text-muted-foreground"}`}>
              {mjerenje.phChange > 0 ? "+" : ""}{mjerenje.phChange.toFixed(2)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/60">{formatTime(ts)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {mjerenje.temperatureC !== undefined && <span>{mjerenje.temperatureC}°C</span>}
        {mjerenje.foamLevel && mjerenje.foamLevel !== "nema" && <span>Pjena: {mjerenje.foamLevel}</span>}
        {mjerenje.flowLMin !== undefined && <span>Protok: {mjerenje.flowLMin} L/min</span>}
        <RateZoneBadge rate={mjerenje.phRatePerMinute} />
      </div>
      {mjerenje.interpretation && (
        <p className="text-xs text-muted-foreground/80 italic leading-relaxed">{mjerenje.interpretation}</p>
      )}
      {(mjerenje.note ?? mjerenje.napomena) && (
        <p className="text-xs text-muted-foreground italic">{mjerenje.note ?? mjerenje.napomena}</p>
      )}
    </div>
  );
}

const RAZLOZI_NADOPUNE_KRATKO_SE: Record<string, string> = {
  ph_previsok: "pH previsok",
  ph_brzo_raste: "pH brzo raste",
  reakcija_traje: "Reakcija traje",
  pjena_prisutna: "Pjena prisutna",
  boja_slabljenje: "Boja slabi",
  protok_nije_poboljsan: "Protok ne poboljsan",
  servisna_odluka: "Servisna odluka",
  drugo: "Drugo",
};

function NadopunaRedak({ nadopuna }: { nadopuna: NadopunaKemikalije }) {
  const ts = nadopuna.addedAt ?? nadopuna.timestamp ?? "";
  const naziv = nadopuna.chemicalProductName ?? nadopuna.kemikalija ?? "Nepoznato";
  const kol = nadopuna.addedChemicalVolumeL != null
    ? `+${nadopuna.addedChemicalVolumeL.toFixed(3)} L`
    : `+${nadopuna.amount ?? nadopuna.kolicina ?? 0} ${nadopuna.unit ?? "L"}`;
  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
            Nadopuna #{nadopuna.topUpNumber}
          </span>
          <span className="text-sm font-semibold text-foreground">{naziv}</span>
          <span className="text-xs font-medium text-amber-700">{kol}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">{ts ? formatTime(ts) : ""}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {nadopuna.reason && (
          <span>Razlog: {RAZLOZI_NADOPUNE_KRATKO_SE[nadopuna.reason] ?? nadopuna.reason}</span>
        )}
        {nadopuna.previousPh !== undefined && (
          <span>pH prije: <strong>{nadopuna.previousPh.toFixed(2)}</strong></span>
        )}
        {nadopuna.newTotalSolutionVolumeL > 0 && (
          <span>Vol: {nadopuna.newTotalSolutionVolumeL.toFixed(1)} L</span>
        )}
        {nadopuna.newChemicalPercent != null && (
          <span>Konc: {nadopuna.newChemicalPercent.toFixed(2)}%</span>
        )}
      </div>
      {(nadopuna.note ?? nadopuna.napomena) && (
        <p className="text-xs text-muted-foreground italic">{nadopuna.note ?? nadopuna.napomena}</p>
      )}
    </div>
  );
}

function CleaningEffectivenessKartica({ eff }: { eff: CleaningEffectiveness }) {
  if (eff.cleaningEffectivenessStatus === null) {
    return (
      <p className="text-xs text-muted-foreground italic">{eff.effectivenessExplanation}</p>
    );
  }

  const statusColors: Record<string, string> = {
    "Vrlo dobar učinak": "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
    "Dobar učinak": "bg-primary/8 border-primary/30 text-primary",
    "Umjeren učinak": "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
    "Slab učinak": "bg-destructive/10 border-destructive/30 text-destructive",
  };
  const colorClass = statusColors[eff.cleaningEffectivenessStatus] ?? "bg-muted border-border text-foreground";

  return (
    <div className={`rounded-xl border px-3 py-2 flex flex-col gap-1 ${colorClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Učinkovitost</span>
        {eff.flowImprovementPercent !== null && (
          <span className="text-sm font-bold leading-none">
            {eff.flowImprovementPercent > 0 ? "+" : ""}{eff.flowImprovementPercent.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-sm font-bold leading-tight">{eff.cleaningEffectivenessStatus}</p>
      <p className="text-[11px] leading-relaxed opacity-80">{eff.effectivenessExplanation}</p>
      {eff.additionalNote && (
        <p className="text-[11px] leading-relaxed opacity-80 italic">{eff.additionalNote}</p>
      )}
      {eff.warning && (
        <p className="text-[11px] font-semibold leading-relaxed">{eff.warning}</p>
      )}
    </div>
  );
}

// ─── Analiza prethodnog ciklusa ���� preporuke za sljedeci ──────────────────────

function AnalizaPrethCiklusa({ ciklus }: { ciklus: Ciklus }) {
  const nonInitial = ciklus.mjerenja.filter(
    (m) => m.measurementType !== "initial_cycle_measurement"
  );
  const baseline = ciklus.mjerenja.find(
    (m) => m.measurementType === "initial_cycle_measurement"
  ) ?? ciklus.mjerenja[0] ?? null;
  const lastMj = nonInitial.length > 0 ? nonInitial[nonInitial.length - 1] : null;

  const phLast = lastMj?.ph ?? null;
  const phRef = baseline?.ph ?? null;
  const flowLast = lastMj?.flowLMin ?? null;
  const flowRef = baseline?.flowLMin ?? null;
  const foamLast = lastMj?.foamLevel ?? null;
  const nadopunaCount = ciklus.nadopune?.length ?? 0;

  type Preporuka = { tip: "ok" | "upozorenje" | "kritično"; tekst: string };
  const preporuke: Preporuka[] = [];

  if (phLast != null) {
    if (phLast < 2.0) {
      preporuke.push({ tip: "kritično", tekst: `Zadnji pH ${phLast.toFixed(2)} — vrlo agresivna zona. Razmotrite kraće trajanje ciklusa ili manju koncentraciju sredstva u sljedećem ciklusu.` });
    } else if (phLast < 3.5) {
      preporuke.push({ tip: "upozorenje", tekst: `pH ${phLast.toFixed(2)} — sredstvo još aktivno pri kraju ciklusa. Doziranje je optimalno.` });
    } else if (phLast >= 5.0) {
      preporuke.push({ tip: "upozorenje", tekst: `pH ${phLast.toFixed(2)} pri kraju — sredstvo je potrošeno. Razmotrite raniju nadopunu ili povećanje početne doze.` });
    } else {
      preporuke.push({ tip: "ok", tekst: `pH ${phLast.toFixed(2)} pri kraju — dobra radna zona, doziranje je odgovarajuće.` });
    }
  }

  if (flowRef != null && flowLast != null) {
    const delta = flowLast - flowRef;
    const pct = (delta / flowRef) * 100;
    if (pct >= 40) {
      preporuke.push({ tip: "ok", tekst: `Protok porastao za ${pct.toFixed(0)}% (${flowRef.toFixed(1)} → ${flowLast.toFixed(1)} L/min) — odličan rezultat čišćenja.` });
    } else if (pct >= 15) {
      preporuke.push({ tip: "ok", tekst: `Protok porastao za ${pct.toFixed(0)}% �� čišćenje je djelotvorno.` });
    } else if (pct > 0) {
      preporuke.push({ tip: "upozorenje", tekst: `Protok porastao samo ${pct.toFixed(0)}% — možda je potreban duži ciklus ili ponavljanje.` });
    } else {
      preporuke.push({ tip: "upozorenje", tekst: `Protok nije porastao — provjeri stanje instalacije ili produlji trajanje.` });
    }
  }

  if (nadopunaCount >= 2) {
    preporuke.push({ tip: "upozorenje", tekst: `${nadopunaCount} nadopune — razmotriti povećanje početnog volumena sredstva u sljedećem ciklusu.` });
  } else if (nadopunaCount === 1) {
    preporuke.push({ tip: "ok", tekst: `1 nadopuna — prihvatljivo, ali pratite jesli li se pattern ponavlja.` });
  }

  if (foamLast === "jaka" || foamLast === "vrlo_jaka") {
    preporuke.push({ tip: "upozorenje", tekst: `Jaka pjena pri kraju ciklusa — provjerite kompatibilnost sredstva s instalacijom i razmotriti ispiranje odmah.` });
  }

  if (phRef != null && phLast != null && phLast - phRef > 3.0) {
    preporuke.push({ tip: "upozorenje", tekst: `pH porastao za ${(phLast - phRef).toFixed(2)} — sredstvo je gotovo potrošeno. Sljedeći ciklus: ranije mjerenje ili nadopuna.` });
  }

  if (preporuke.length === 0) return null;

  const tipBoja: Record<Preporuka["tip"], string> = {
    ok: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
    upozorenje: "bg-amber-500/10 border-amber-400/40 text-amber-300",
    kritično: "bg-red-500/10 border-red-500/40 text-red-300",
  };
  const tipDot: Record<Preporuka["tip"], string> = {
    ok: "bg-emerald-400",
    upozorenje: "bg-amber-400",
    kritično: "bg-red-400",
  };

  return (
    <div className="mt-2 rounded-2xl bg-slate-800/60 border border-slate-700/60 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-700/60">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Analiza ciklusa — Preporuke za sljedeći
        </span>
      </div>
      <div className="flex flex-col divide-y divide-slate-700/40">
        {preporuke.map((p, i) => (
          <div key={i} className={`px-4 py-3 flex items-start gap-3 border-l-2 ${tipBoja[p.tip]}`}>
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tipDot[p.tip]}`} />
            <p className="text-xs leading-relaxed text-slate-200">{p.tekst}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ZavrsenCiklusKartica({ ciklus, sesija }: { ciklus: Ciklus; sesija?: Sesija }) {
  const eff: CleaningEffectiveness =
    ciklus.cleaningEffectiveness ?? calcCleaningEffectiveness(ciklus.mjerenja);
  const [expanded, setExpanded] = React.useState(false);

  // Referentno mjerenje = initial_cycle_measurement (nulto, pocetno stanje)
  const baseline = ciklus.mjerenja.find((m) => m.measurementType === "initial_cycle_measurement") ?? ciklus.mjerenja[0] ?? null;

  // Zadnje mjerenje = zadnji NON-initial element (stvarno zadnje stanje ciklusa)
  const nonInitialMjerenja = ciklus.mjerenja.filter((m) => m.measurementType !== "initial_cycle_measurement");
  const lastMj = nonInitialMjerenja.length > 0
    ? nonInitialMjerenja[nonInitialMjerenja.length - 1]
    : null;

  // pH
  const phRef = baseline?.ph ?? null;
  const phLast = lastMj?.ph ?? null;
  const phDelta = phRef != null && phLast != null ? phLast - phRef : null;

  // Protok
  const flowRef = baseline?.flowLMin ?? null;
  const flowLast = lastMj?.flowLMin ?? null;
  const flowDelta = flowRef != null && flowLast != null ? flowLast - flowRef : null;

  // Temperatura i ostalo iz zadnjeg mjerenja
  const tempRef = baseline?.tempOutC ?? null;
  const tempLast = lastMj?.tempOutC ?? null;
  const foamLast = lastMj?.foamLevel ?? null;
  const colorLast = lastMj?.colorIndicator ?? null;

  // Zaključni trend ciklusa — servisna formulacija
  const trendLabel = (() => {
    const fp = eff.flowImprovementPercent;
    if (fp == null) return "Bez podataka o protoku";
    if (fp >= 20)  return "Protočnost značajno poboljšana";
    if (fp >= 10)  return "Protočnost poboljšana";
    if (fp >= 3)   return "Blago poboljšanje protočnosti";
    if (fp > -3)   return "Protočnost bez promjene";
    return "Protočnost smanjena — provjeriti sustav";
  })();

  return (
    <>
    <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col space-y-0">

      {/* ── Row 1: Naslov + status badge ───────────����─��─────────────────��───�� */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-base font-black text-white leading-tight">
            Ciklus #{ciklus.cycleNumber ?? ciklus.broj}
            {ciklus.name ? (
              <span className="font-semibold text-slate-400 text-sm ml-1">— {ciklus.name}</span>
            ) : null}
          </span>
          <StatusBadge status={ciklus.status ?? "zavrsen"} />
        </div>
      </div>

      {/* ── Row 2: Proizvod ───────────────────────────────────────────────── */}
      {(ciklus.chemicalProductName ?? ciklus.kemikalija) && (
        <div className="px-4 py-2.5 border-t border-slate-700/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Proizvod</span>
          <span className="text-sm font-semibold text-white">
            {ciklus.chemicalProductName ?? ciklus.kemikalija}
            {(ciklus.chemicalAmount ?? ciklus.kolicina_kemikalije) && (
              <span className="font-normal text-slate-400 ml-1.5">
                {ciklus.chemicalAmount ?? ciklus.kolicina_kemikalije} {ciklus.chemicalUnit ?? "L"}
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── Row 3: pH ────────────────────────────────────────────���────────── */}
      {phRef != null && (
        <div className="px-4 py-2.5 border-t border-slate-700/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">pH</span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Ref.</span>
              <span className="text-sm font-black tabular-nums text-white">{phRef.toFixed(2)}</span>
            </div>
            {phLast != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Zadnji</span>
                <span className="text-sm font-black tabular-nums text-white">{phLast.toFixed(2)}</span>
              </div>
            )}
            {phDelta != null && (
              <div className="flex items-center justify-between border-t border-slate-700/40 pt-1 mt-0.5">
                <span className="text-xs text-slate-400">&Delta;</span>
                <span className={`text-sm font-black tabular-nums ${phDelta > 0 ? "text-red-400" : phDelta < 0 ? "text-green-400" : "text-slate-400"}`}>
                  {phDelta > 0 ? "+" : ""}{phDelta.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 4: Protok ────��────────���─────────────────����────────────────── */}
      {flowRef != null && (
        <div className="px-4 py-2.5 border-t border-slate-700/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Protok</span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Ref.</span>
              <span className="text-sm font-black tabular-nums text-white">{flowRef.toFixed(1)} L/min</span>
            </div>
            {flowLast != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Zadnji</span>
                <span className="text-sm font-black tabular-nums text-white">{flowLast.toFixed(1)} L/min</span>
              </div>
            )}
            {flowDelta != null && (
              <div className="flex items-center justify-between border-t border-slate-700/40 pt-1 mt-0.5">
                <span className="text-xs text-slate-400">&Delta;</span>
                <span className={`text-sm font-black tabular-nums ${flowDelta > 0 ? "text-green-400" : flowDelta < 0 ? "text-red-400" : "text-slate-400"}`}>
                  {flowDelta > 0 ? "+" : ""}{flowDelta.toFixed(1)} L/min
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 5: Temperatura + Δ ─────────────────────────────────────────── */}
      {(tempRef != null || tempLast != null) && (
        <div className="px-4 py-2.5 border-t border-slate-700/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Temperatura</span>
          <div className="flex flex-col gap-1">
            {tempRef != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Ref.</span>
                <span className="text-sm font-black tabular-nums text-white">{tempRef.toFixed(1)} °C</span>
              </div>
            )}
            {tempLast != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Zadnja</span>
                <span className="text-sm font-black tabular-nums text-orange-300">{tempLast.toFixed(1)} °C</span>
              </div>
            )}
            {tempRef != null && tempLast != null && (
              <div className="flex items-center justify-between border-t border-slate-700/40 pt-1 mt-0.5">
                <span className="text-xs text-slate-400">&Delta;</span>
                <span className={`text-sm font-black tabular-nums ${tempLast - tempRef > 0 ? "text-green-400" : tempLast - tempRef < 0 ? "text-red-400" : "text-slate-400"}`}>
                  {tempLast - tempRef > 0 ? "+" : ""}{(tempLast - tempRef).toFixed(1)} °C
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 6: Zadnja boja indikatora ────────────────────────────────────── */}
      {colorLast && (
        <div className="px-4 py-2.5 border-t border-slate-700/60">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Zadnja boja indikatora</span>
          <span className="text-sm font-bold text-sky-300">{colorLast}</span>
          {foamLast && (
            <span className="text-xs text-slate-400 ml-2">· Pjena: {foamLast}</span>
          )}
        </div>
      )}

      {/* ── Row 7: Trend ──���──────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-slate-700/60">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Trend</span>
        <span className={`text-sm font-bold ${
          eff.flowImprovementPercent != null && eff.flowImprovementPercent >= 10 ? "text-green-400"
          : eff.flowImprovementPercent != null && eff.flowImprovementPercent >= 3  ? "text-blue-400"
          : eff.flowImprovementPercent != null && eff.flowImprovementPercent < -2  ? "text-red-400"
          : "text-slate-300"
        }`}>
          {trendLabel}
        </span>
      </div>

      {/* ���─ Row 6: Footer — mjerenja count + expand button ────────────────── */}
      <div className="px-4 py-3 border-t border-slate-700/60 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400 tabular-nums">
          {ciklus.mjerenja.length} mjerenja &middot; {ciklus.nadopune.length} nadopuna
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? "Sakrij mjerenja" : "Prikaži mjerenja"}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* ��─ Expandable timeline ───────────────────────────────────────────── */}
      {expanded && (ciklus.mjerenja.length > 0 || ciklus.nadopune.length > 0) && (
        <div className="border-t border-slate-700/60 px-4 py-4">
          <CiklusVremenskiSlijed ciklus={ciklus} sesija={sesija} showTitle={false} />
        </div>
      )}
    </div>
    <AnalizaPrethCiklusa ciklus={ciklus} />
    </>
  );
}

// ─── Reaction stability banner ────────────────────────────────────────────────

function ReakcijaStabilnaBanner({
  stability,
  onZavrsiCiklus,
}: {
  stability: ReactionStabilityResult;
  onZavrsiCiklus: () => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md">
      <div className="bg-teal-600 px-5 pt-5 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1.5">Status reakcije</p>
        <p className="text-3xl font-black text-white leading-tight tracking-tight mb-2">
          {stability.statusLabel}
        </p>
        <p className="text-sm text-white/85 leading-relaxed">{stability.explanation}</p>
      </div>
      <div className="bg-teal-700 px-5 pt-4 pb-5 flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Sljedeći korak</p>
          <p className="text-base font-black text-white tracking-tight">ISPIRANJE + NEUTRALIZACIJA</p>
        </div>
        <p className="text-xs text-white/75 leading-relaxed">{stability.nextStep}</p>
        <button
          onClick={onZavrsiCiklus}
          className="w-full bg-white text-teal-800 rounded-xl py-3.5 font-bold text-sm hover:bg-teal-50 active:scale-[0.98] transition-all"
        >
          Završi kemijsko čišćenje — pokreni ispiranje
        </button>
      </div>
    </div>
  );
}

// ─── Completion phases panel ──────────────────────────────────────────────────

function CompletionPhasesPanel({
  phases,
  onIspiranje,
  onNeutralizacija,
  onZavrsniPH,
  onZavrsiSesiju,
}: {
  phases: CompletionPhases | undefined;
  onIspiranje: () => void;
  onNeutralizacija: () => void;
  onZavrsniPH: () => void;
  onZavrsiSesiju: () => void;
}) {
  const [techConfirmed, setTechConfirmed] = React.useState(false);

  const ispiranjeOk = Boolean(phases?.ispiranje?.systemRinsedWithCleanWater);

  // Neutralization is skipped when rinse pH is acceptable (neutralizationRequired === false)
  const rinsePhAcceptable = phases?.ispiranje?.neutralizationRequired === false;
  const neutralizacijaOk = rinsePhAcceptable || Boolean(phases?.neutralizacija?.neutralizerProductName);

  const zavrsniPhOk = Boolean(
    phases?.zavrsniPH &&
    phases.zavrsniPH.technicianConfirmed &&
    (phases.zavrsniPH.status === "prihvatljiv" || phases.zavrsniPH.status === "potrebna_provjera")
  );
  const allPhasesOk = ispiranjeOk && neutralizacijaOk && zavrsniPhOk;
  const canFinish = allPhasesOk && techConfirmed;

  // Determine blocker message when not yet ready
  const blockerMsg = !ispiranjeOk
    ? "Neutralizacija nije moguća dok ispiranje nije evidentirano."
    : !neutralizacijaOk
    ? "Završni pH nije moguć dok neutralizacija nije provedena."
    : !zavrsniPhOk
    ? "Završni pH nije potvrđen ili je izvan prihvatljivog raspona."
    : null;

  function CheckItem({ label, done }: { label: string; done: boolean }) {
    return (
      <div className="flex items-center gap-2.5">
        <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${done ? "bg-green-500" : "bg-muted border border-border"}`}>
          {done ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30 block" />
          )}
        </span>
        <span className={`text-sm ${done ? "text-green-800 font-medium" : "text-muted-foreground"}`}>{label}</span>
      </div>
    );
  }

  function PhaseRow({
    label,
    done,
    buttonLabel,
    onAction,
    disabled,
  }: {
    label: string;
    done: boolean;
    buttonLabel: string;
    onAction: () => void;
    disabled?: boolean;
  }) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${done ? "bg-green-50 border border-green-200" : "bg-card border border-border"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${done ? "bg-green-500" : "bg-muted"}`}>
            {done ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40 block" />
            )}
          </span>
          <span className={`text-sm font-medium truncate ${done ? "text-green-800" : "text-foreground"}`}>{label}</span>
        </div>
        {!done && (
          <button
            onClick={onAction}
            disabled={disabled}
            className="shrink-0 text-xs font-semibold text-primary hover:opacity-70 transition-opacity disabled:opacity-30 disabled:pointer-events-none"
          >
            {buttonLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-muted px-4 py-3 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Obavezne faze završetka</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">
          Kemijska reakcija završena — slijedi ispiranje i neutralizacija.
        </p>
      </div>

      {/* Phase steps */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <PhaseRow
          label="Ispiranje sustava"
          done={ispiranjeOk}
          buttonLabel="Evidentiraj ispiranje"
          onAction={onIspiranje}
        />
        <PhaseRow
          label={rinsePhAcceptable ? "Neutralizacija — nije potrebna (pH prihvatljiv)" : "Neutralizacija"}
          done={neutralizacijaOk}
          buttonLabel="Evidentiraj neutralizaciju"
          onAction={onNeutralizacija}
          disabled={!ispiranjeOk || rinsePhAcceptable}
        />
        <PhaseRow
          label="Kontrola završnog pH nakon ispiranja"
          done={zavrsniPhOk}
          buttonLabel="Unesi završni pH"
          onAction={onZavrsniPH}
          disabled={!neutralizacijaOk}
        />
      </div>



      {/* Final checklist + confirmation — shown when all phases done */}
      {allPhasesOk && (
        <div className="border-t border-border px-4 py-4 flex flex-col gap-3 bg-green-50/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sažetak završetka</p>
          <div className="flex flex-col gap-2">
            <CheckItem label="Reakcija završena" done={true} />
            <CheckItem label="Ispiranje provedeno" done={ispiranjeOk} />
            <CheckItem
              label={rinsePhAcceptable ? "Neutralizacija — nije potrebna (pH ispiranja prihvatljiv)" : "Neutralizacija provedena"}
              done={neutralizacijaOk}
            />
            <CheckItem
              label={`Kontrola završnog pH — ${phases?.zavrsniPH?.ph1?.toFixed(2) ?? "—"}${phases?.zavrsniPH?.ph2 != null ? ` / ${phases.zavrsniPH.ph2.toFixed(2)}` : ""} (Završno ispiranje)`}
              done={zavrsniPhOk}
            />
          </div>

          {/* Technician confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer bg-card border border-border rounded-xl px-3 py-2.5 mt-1">
            <input
              type="checkbox"
              checked={techConfirmed}
              onChange={(e) => setTechConfirmed(e.target.checked)}
              className="mt-0.5 accent-primary shrink-0 w-4 h-4"
            />
            <span className="text-xs font-semibold text-foreground leading-relaxed">
              Potvrđujem da je posao završen u skladu sa servisnim protokolom.
            </span>
          </label>

          {/* Završi sesiju button */}
          <button
            onClick={onZavrsiSesiju}
            disabled={!canFinish}
            className="w-full py-4 rounded-xl font-bold text-sm bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            Završi sesiju
          </button>
          {!canFinish && !techConfirmed && (
            <p className="text-[10px] text-muted-foreground text-center -mt-1">
              Označite potvrdu servisera za završetak.
            </p>
          )}
        </div>
      )}

      {/* Blocker hint — shown when phases not yet done */}
      {!allPhasesOk && blockerMsg && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{blockerMsg}</p>
        </div>
      )}
    </div>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────���──────���──

function ModalWrapper({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-background rounded-t-2xl p-5 pb-8 flex flex-col gap-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({
  label, name, value, onChange, placeholder, type = "text", step, min, max,
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; step?: string; min?: string; max?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>{label}</label>
      <input
        id={name} name={name} type={type} value={value} onChange={onChange}
        placeholder={placeholder} step={step} min={min} max={max}
        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// MjerenjeModal and NadopunaModal are imported from dedicated files

// ─── Full-screen podsesija form (create + edit) ───────────────────────────────

const VRSTE_DIJELA: VrstaDijela[] = [
  "Spremnik TPV",
  "Spirala TPV",
  "Pločasti izmjenjivač",
  "Cijevni izmjenjivač",
  "Kotlovski krug",
  "Toplinska pumpa",
  "Cjevovod",
  "Drugo",
];

const MATERIJALI: Materijal[] = [
  "Inox",
  "Bakar",
  "Mesing",
  "Čelik",
  "Plastika",
  "Guma/brtve",
  "Kombinirano",
  "Nepoznato",
];

const VRSTE_NASLAGA: VrstaNaslage[] = [
  "Kamenac",
  "Tvrdi kamenac",
  "Miješane naslage",
  "Nepoznato",
];

const JACINE_PROBLEMA: JacinaProblema[] = ["Blago", "Srednje", "Jako", "Kritično"];

const STATUSI_PODSESIJE: { value: string; label: string }[] = [
  { value: "nije_zapoceto", label: "Nije započeto" },
  { value: "u_radu", label: "U radu" },
  { value: "ceka_mjerenje", label: "Čeka mjerenje" },
  { value: "ceka_nadopunu", label: "Čeka nadopunu" },
  { value: "ceka_novi_ciklus", label: "Čeka novi ciklus" },
  { value: "zavrseno", label: "Završeno" },
  { value: "prekinuto", label: "Prekinuto" },
];

interface PodsesijaFormData {
  naziv: string;
  redni_broj: string;
  dio_sustava: string;
  opis_dijela: string;
  lokacija_unutar_objekta: string;
  vrsta_dijela: string;
  materijal: string;
  procijenjeni_volumen: string;
  pocetni_protok_vrijednost: string;
  pocetni_protok_jedinica: JedinicaProtoka;
  napomena_protok: string;
  vrsta_naslage: string;
  jacina_problema: string;
  vizualna_napomena: string;
  servisna_napomena: string;
  status: string;
}

function podsesijaToForm(p: Podsesija): PodsesijaFormData {
  return {
    naziv: p.naziv,
    redni_broj: String(p.redni_broj),
    dio_sustava: p.dio_sustava,
    opis_dijela: p.opis_dijela ?? "",
    lokacija_unutar_objekta: p.lokacija_unutar_objekta ?? "",
    vrsta_dijela: p.vrsta_dijela ?? "",
    materijal: p.materijal,
    procijenjeni_volumen: String(p.procijenjeni_volumen),
    pocetni_protok_vrijednost: p.pocetni_protok_vrijednost ? String(p.pocetni_protok_vrijednost) : "",
    pocetni_protok_jedinica: p.pocetni_protok_jedinica ?? "l_min",
    napomena_protok: p.napomena_protok ?? "",
    vrsta_naslage: p.vrsta_naslage ?? "",
    jacina_problema: p.jacina_problema ?? "",
    vizualna_napomena: p.vizualna_napomena ?? "",
    servisna_napomena: p.servisna_napomena ?? "",
    status: p.status,
  };
}

function defaultForm(redni_broj: number): PodsesijaFormData {
  return {
    naziv: "",
    redni_broj: String(redni_broj),
    dio_sustava: "",
    opis_dijela: "",
    lokacija_unutar_objekta: "",
    vrsta_dijela: "",
    materijal: "Čelik",
    procijenjeni_volumen: "50",
    pocetni_protok_vrijednost: "",
    pocetni_protok_jedinica: "l_min",
    napomena_protok: "",
    vrsta_naslage: "",
    jacina_problema: "",
    vizualna_napomena: "",
    servisna_napomena: "",
    status: "nije_zapoceto",
  };
}

function PodsesijaFormModal({
  sesijaId: _sesijaId,
  redni_broj_default,
  editPodsesija,
  onSave,
  onSaveAndOpen,
  onClose,
}: {
  sesijaId: string;
  redni_broj_default: number;
  editPodsesija?: Podsesija;
  onSave: (p: Podsesija) => void;
  onSaveAndOpen: (p: Podsesija) => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(editPodsesija);
  const [form, setForm] = useState<PodsesijaFormData>(
    editPodsesija ? podsesijaToForm(editPodsesija) : defaultForm(redni_broj_default)
  );
  const [afterAction, setAfterAction] = useState<"none" | "open" | "another">("none");

  function handle(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Derived: calculated flow in L/min
  const protokVal = parseFloat(form.pocetni_protok_vrijednost);
  const protokLMin =
    !isNaN(protokVal) && protokVal > 0
      ? izracunajProtokLMin(protokVal, form.pocetni_protok_jedinica)
      : null;

  // Material warning
  const matUpozorenje = materijalUpozorenje(form.materijal);

  function buildPodsesija(id: string): Podsesija {
    return {
      id,
      naziv: form.naziv.trim(),
      redni_broj: parseInt(form.redni_broj) || redni_broj_default,
      dio_sustava: form.dio_sustava.trim(),
      opis_dijela: form.opis_dijela.trim() || undefined,
      lokacija_unutar_objekta: form.lokacija_unutar_objekta.trim() || undefined,
      vrsta_dijela: (form.vrsta_dijela as VrstaDijela) || undefined,
      materijal: form.materijal as Materijal,
      materijal_upozorenje: matUpozorenje ?? undefined,
      procijenjeni_volumen: parseFloat(form.procijenjeni_volumen) || 0,
      pocetni_protok_vrijednost: protokVal || undefined,
      pocetni_protok_jedinica: form.pocetni_protok_jedinica,
      pocetni_protok_l_min: protokLMin ?? undefined,
      napomena_protok: form.napomena_protok.trim() || undefined,
      vrsta_naslage: (form.vrsta_naslage as VrstaNaslage) || undefined,
      jacina_problema: (form.jacina_problema as JacinaProblema) || undefined,
      vizualna_napomena: form.vizualna_napomena.trim() || undefined,
      servisna_napomena: form.servisna_napomena.trim() || undefined,
      status: (form.status as Podsesija["status"]),
      status_reakcije: editPodsesija?.status_reakcije ?? "nepoznato",
      kratka_preporuka: editPodsesija?.kratka_preporuka,
      ciklusi: editPodsesija?.ciklusi ?? [],
      created_at: editPodsesija?.created_at ?? nowISO(),
      updated_at: nowISO(),
      createdAt: editPodsesija?.createdAt ?? editPodsesija?.created_at ?? nowISO(),
      updatedAt: nowISO(),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.naziv.trim()) return;
    const id = editPodsesija?.id ?? genId("pod");
    const p = buildPodsesija(id);
    if (afterAction === "open") {
      onSaveAndOpen(p);
    } else {
      onSave(p);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Uredi podsesiju" : "Nova podsesija"}
    >
      {/* Fixed header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-border bg-background shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1 -ml-1 hover:opacity-70 transition-opacity"
          aria-label="Zatvori"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
            {isEdit ? "Uredi podsesiju" : "Nova podsesija"}
          </p>
          <h1 className="text-lg font-bold leading-tight text-foreground truncate">
            {form.naziv || (isEdit ? editPodsesija!.naziv : "Bez naziva")}
          </h1>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto">
        <form
          id="podsesija-form"
          onSubmit={handleSubmit}
          className="max-w-lg mx-auto w-full px-4 py-5 flex flex-col gap-6"
        >
          {/* ─── 1. Osnovni podaci ─────────────────────────────────────── */}
          <FormSection title="Osnovni podaci">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FormInputField
                  label="Naziv podsesije *"
                  name="naziv"
                  value={form.naziv}
                  onChange={handle}
                  placeholder="npr. Spremnik 1, Spirala TPV"
                />
              </div>
              <FormInputField
                label="Redni broj"
                name="redni_broj"
                type="number"
                value={form.redni_broj}
                onChange={handle}
                placeholder="1"
              />
            </div>
            <FormInputField
              label="Dio sustava koji se čisti"
              name="dio_sustava"
              value={form.dio_sustava}
              onChange={handle}
              placeholder="npr. Kotao, Primarni krug, Fan coil"
            />
            <FormTextareaField
              label="Opis dijela"
              name="opis_dijela"
              value={form.opis_dijela}
              onChange={handle}
              placeholder="Kratak opis dijela sustava..."
              rows={2}
            />
            <FormInputField
              label="Lokacija unutar objekta"
              name="lokacija_unutar_objekta"
              value={form.lokacija_unutar_objekta}
              onChange={handle}
              placeholder="npr. Podrumska kotlovnica, 2. kat"
            />
          </FormSection>

          {/* ─── 2. Vrsta sustava ───────────────────���────����──���──────────── */}
          <FormSection title="Vrsta dijela / sustava">
            <FormSelectField
              label="Vrsta dijela/sustava"
              name="vrsta_dijela"
              value={form.vrsta_dijela}
              onChange={handle}
              options={["", ...VRSTE_DIJELA]}
              optionLabels={{ "": "— Odaberi vrstu —" }}
            />
          </FormSection>

          {/* ─── 3. Materijal ────────────────���────────────────────────── */}
          <FormSection title="Materijal">
            <FormSelectField
              label="Materijal *"
              name="materijal"
              value={form.materijal}
              onChange={handle}
              options={MATERIJALI}
            />
            {matUpozorenje && (
              <div className="flex gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <svg className="shrink-0 mt-0.5 text-orange-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-xs text-orange-800 leading-relaxed">{matUpozorenje}</p>
              </div>
            )}
          </FormSection>

          {/* ─── 4. Volumen i protok ──────────────────────────────────── */}
          <FormSection title="Volumen i protok">
            <FormInputField
              label="Procijenjeni volumen vode (L)"
              name="procijenjeni_volumen"
              type="number"
              value={form.procijenjeni_volumen}
              onChange={handle}
              placeholder="npr. 80"
            />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Početni protok</p>
              <div className="grid grid-cols-2 gap-3">
                <FormInputField
                  label="Vrijednost"
                  name="pocetni_protok_vrijednost"
                  type="number"
                  step="0.1"
                  value={form.pocetni_protok_vrijednost}
                  onChange={handle}
                  placeholder={form.pocetni_protok_jedinica === "l_min" ? "npr. 15" : "npr. 30"}
                />
                <FormSelectField
                  label="Jedinica"
                  name="pocetni_protok_jedinica"
                  value={form.pocetni_protok_jedinica}
                  onChange={handle}
                  options={["l_min", "sec_10l"]}
                  optionLabels={{ l_min: "L/min", sec_10l: "sek za 10 L" }}
                />
              </div>
              {/* Calculated flow display */}
              {protokLMin !== null && (
                <div className="mt-2 bg-accent/60 rounded-lg px-3 py-2 flex items-center gap-2">
                  <svg className="shrink-0 text-primary/70" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <p className="text-xs text-foreground/80">
                    {form.pocetni_protok_jedinica === "sec_10l"
                      ? <>10 L za <strong>{form.pocetni_protok_vrijednost} sek</strong> = <strong>{protokLMin.toFixed(1)} L/min</strong></>
                      : <><strong>{protokLMin.toFixed(1)} L/min</strong></>
                    }
                  </p>
                </div>
              )}
            </div>
            <FormTextareaField
              label="Napomena o protoku"
              name="napomena_protok"
              value={form.napomena_protok}
              onChange={handle}
              placeholder="Gdje i kako je izmjeren protok..."
              rows={2}
            />
          </FormSection>

          {/* ─── 5. Opis problema ─���───────────���────────────��─────────── */}
          <FormSection title="Opis problema">
            <div className="grid grid-cols-2 gap-3">
              <FormSelectField
                label="Vrsta naslage"
                name="vrsta_naslage"
                value={form.vrsta_naslage}
                onChange={handle}
                options={["", ...VRSTE_NASLAGA]}
                optionLabels={{ "": "— Odaberi —" }}
              />
              <FormSelectField
                label="Jačina problema"
                name="jacina_problema"
                value={form.jacina_problema}
                onChange={handle}
                options={["", ...JACINE_PROBLEMA]}
                optionLabels={{ "": "— Odaberi —" }}
              />
            </div>
            <FormTextareaField
              label="Vizualna napomena"
              name="vizualna_napomena"
              value={form.vizualna_napomena}
              onChange={handle}
              placeholder="Što je vidljivo pri pregledu..."
              rows={2}
            />
            <FormTextareaField
              label="Servisna napomena"
              name="servisna_napomena"
              value={form.servisna_napomena}
              onChange={handle}
              placeholder="Preporuke, upozorenja za servisera..."
              rows={2}
            />
          </FormSection>

          {/* ─── 6. Status ────────────────��───────────��──────────────── */}
          <FormSection title="Status podsesije">
            <FormSelectField
              label="Status"
              name="status"
              value={form.status}
              onChange={handle}
              options={STATUSI_PODSESIJE.map((s) => s.value)}
              optionLabels={Object.fromEntries(STATUSI_PODSESIJE.map((s) => [s.value, s.label]))}
            />
          </FormSection>
        </form>
      </div>

      {/* Fixed footer with action buttons */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-4 flex flex-col gap-2.5 max-w-lg mx-auto w-full">
        {!isEdit && (
          <>
            <button
              type="button"
              onClick={() => {
                setAfterAction("open");
                (document.getElementById("podsesija-form") as HTMLFormElement | null)?.requestSubmit();
              }}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Spremi i otvori podsesiju
            </button>
            <button
              type="submit"
              form="podsesija-form"
              onClick={() => setAfterAction("none")}
              className="w-full bg-secondary text-secondary-foreground rounded-xl py-3.5 font-semibold text-sm hover:bg-secondary/80 active:scale-[0.98] transition-all"
            >
              Spremi i dodaj još jednu
            </button>
          </>
        )}
        {isEdit && (
          <button
            type="submit"
            form="podsesija-form"
            onClick={() => setAfterAction("none")}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Spremi izmjene
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full border border-border text-foreground rounded-xl py-3 font-medium text-sm hover:bg-muted/50 active:scale-[0.98] transition-all"
        >
          Odustani
        </button>
      </div>
    </div>
  );
}

// ──�� Form section wrapper ───────────────────────────────────────────────���─────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b border-border pb-1.5">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FormInputField({
  label, name, value, onChange, placeholder, type = "text", step, min, max,
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; step?: string; min?: string; max?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>{label}</label>
      <input
        id={name} name={name} type={type} value={value} onChange={onChange}
        placeholder={placeholder} step={step} min={min} max={max}
        className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function FormTextareaField({
  label, name, value, onChange, placeholder, rows = 3,
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>{label}</label>
      <textarea
        id={name} name={name} value={value} onChange={onChange}
        placeholder={placeholder} rows={rows}
        className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
      />
    </div>
  );
}

function FormSelectField({
  label, name, value, onChange, options, optionLabels = {},
}: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>{label}</label>
      <select
        id={name} name={name} value={value} onChange={onChange}
        className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{optionLabels[opt] ?? opt}</option>
        ))}
      </select>
    </div>
  );
}
