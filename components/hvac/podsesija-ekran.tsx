"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-state";
import { StatusBadge } from "./status-badge";
import { PokreniCiklusModal } from "./pokreni-ciklus-modal";
import { MjerenjeModal } from "./mjerenje-modal";
import { NadopunaModal } from "./nadopuna-modal";
import { PreporukaKartica, PreporukaRedak } from "./preporuka-kartica";
import { generirajPreporuku, CYCLE_DECISION_LABELS, calcCleaningEffectiveness } from "@/lib/preporuka";
import type { CleaningEffectiveness } from "@/lib/preporuka";
import { RateZoneBadge } from "./rate-zone-badge";
import { LiveTimer } from "./live-timer";
import { MjerenjeLogTabela } from "./mjerenje-log-tabela";
import { LiveDashboard } from "./live-dashboard";
import { CiklusVremenskiSlijed } from "./ciklus-vremenski-slijed";
import {
  IspiranjeFazaModal,
  NeutralizacijaFazaModal,
  ZavrsniPhCheckModal,
} from "./completion-phases-modal";
import type { Ciklus, Mjerenje, NadopunaKemikalije, MeasurementType, CycleDecision, CycleDecisionType, IspiranjeData, NeutralizacijaData, ZavrsniPhCheck, Sesija } from "@/lib/types";
import {
  aktivniCiklus,
  zadnjiPH,
  zadnjeMjerenje,
  zadnjeMjerenjeCiklusa,
  pocetnoMjerenjeCiklusa,
  getMjerenjePH,
  getMjerenjeTimestamp,
  CLEANING_MODE_LABELS,
} from "@/lib/types";
import { generirajPreporuku as _generirajPreporuku, analyseReactionStability, getCompletionBlockers, calcScaleEstimate } from "@/lib/preporuka";

import { genId, nowISO } from "@/lib/utils";
import { CycleStatusKartica, BlockedNewCycleBanner } from "./session-cycle-status";
import { ProductCard, ChemistryCard, MaterialSafetyCard, CompatibilityWarnings } from "./product-chemistry-safety-cards";
import { getProductEngine } from "@/lib/product-engine";
import { AlertsCompliancePanel } from "./alerts-compliance-panel";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface Props {
  sesijaId: string;
  podsesijaId: string;
}

type Modal =
  | null
  | { tip: "mjerenje"; type: MeasurementType }
  | { tip: "nadopuna"; prefilledAmountL?: number }
  | { tip: "novi_ciklus" }
  | { tip: "ispiranje" }
  | { tip: "neutralizacija" }
  | { tip: "zavrsni_ph" };

export function PodsesijaEkran({ sesijaId, podsesijaId }: Props) {
  const {
    getPodsesija,
    getSesija,
    navigiraj,
    pokreniCiklus,
    zavrsiCiklus,
    prekinutiCiklus,
    azurirajStatusCiklusa,
    dodajMjerenje,
    dodajNadopunu,
    dodajOdlukuCiklusa,
    zavrsiPodsesiju,
    zavrsiPodsesijuUzUpozorenje,
    azurirajCompletionPhasesCiklusa,
  } = useApp();

  const podsesija = getPodsesija(sesijaId, podsesijaId);
  const sesija = getSesija(sesijaId);
  const [modal, setModal] = useState<Modal>(null);
  const [showDecisionSheet, setShowDecisionSheet] = useState(false);

  if (!sesija) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
        <p className="text-base font-semibold text-slate-800">Sesija više ne postoji.</p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Sesija je obrisana ili nije dostupna.
        </p>
        <button
          onClick={() => navigiraj({ ime: "povijest" })}
          className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          Povratak na povijest
        </button>
      </div>
    );
  }

  if (!podsesija) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
        <p className="text-base font-semibold text-slate-800">Sesija više ne postoji.</p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Podsesija nije pronađena.
        </p>
        <button
          onClick={() => navigiraj({ ime: "povijest" })}
          className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          Povratak na povijest
        </button>
      </div>
    );
  }

  const akt = aktivniCiklus(podsesija);
  const pH = zadnjiPH(podsesija);
  const zadnjeMjer = zadnjeMjerenje(podsesija);
  const nema_ciklusa = podsesija.ciklusi.length === 0;
  const sve_zavrseno = podsesija.ciklusi.length > 0 && !akt;
  const cekaPocetnoMjerenje =
    akt?.status === "ceka_pocetno_mjerenje" &&
    !pocetnoMjerenjeCiklusa(akt);

  // pH value from last measurement (used in preporuka fallback)
  const zadnjiPHVal = zadnjeMjer ? getMjerenjePH(zadnjeMjer) : null;

  // Last measurement of the active cycle sorted chronologically
  const zadnjeMjerAkt = akt && akt.mjerenja.length > 0
    ? [...akt.mjerenja].sort(
        (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
      ).at(-1) ?? null
    : null;

  // Preporuka computed from last measurement of active cycle — used for cycle with measurements
  const preporukaB = (() => {
    if (!akt || !zadnjeMjerAkt) return null;
    // Prefer saved preporuka on the measurement
    if (zadnjeMjerAkt.preporuka) return zadnjeMjerAkt.preporuka;
    // Fallback: compute on-the-fly
    try {
      const sortedMj = [...akt.mjerenja].sort(
        (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
      );
      const prev = sortedMj.length > 1 ? sortedMj[sortedMj.length - 2] : undefined;
      return generirajPreporuku({
        mjerenje: zadnjeMjerAkt,
        ciklus: akt,
        previousMjerenje: prev,
        sessionId: sesijaId,
        subsessionId: podsesijaId,
        materialWarning: podsesija.materijal_upozorenje ?? null,
        product: akt.productSnapshot ?? null,
        materialName: typeof podsesija.materijal === "string" ? podsesija.materijal : null,
        cleaningMode: sesija.cleaningMode,
      });
    } catch {
      return null;
    }
  })();

  // Reaction stability for Mode B cycle
  const stabilityB = (() => {
    if (!akt || akt.mjerenja.length < 2) return null;
    const sorted = [...akt.mjerenja].sort(
      (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
    );
    return analyseReactionStability(sorted, akt);
  })();
  const reakcijaStabilnaB = stabilityB?.status === "stable";

  // Last finished cycle (for completion phases)
  const zadnjiZavrsenCiklus = [...podsesija.ciklusi]
    .reverse()
    .find((c) => c.status === "zavrsen" || c.status === "prekinut") ?? null;

  // Completion blockers for "Završi podsesiju"
  const completionBlockersB = sesija
    ? getCompletionBlockers(sesija, akt ?? null)
    : null;

  return (
    <div className="flex flex-col flex-1 bg-white">
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/60 uppercase tracking-widest font-medium truncate">
              {sesija.naziv_objekta}
            </p>
            <h1 className="text-xl font-bold leading-tight truncate">{podsesija.naziv}</h1>
          </div>
          <StatusBadge status={podsesija.status} size="md" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/80">
          <MetaItem label="Dio sustava" value={podsesija.dio_sustava} />
          <MetaItem label="Materijal" value={podsesija.materijal} />
          <MetaItem label="Vol." value={`~${podsesija.procijenjeni_volumen} L`} />
          <MetaItem label="Ciklusa" value={`${podsesija.ciklusi.length}`} />
          {sesija.cleaningMode && (
            <div className="col-span-2 flex items-center gap-2 pt-0.5">
              <span className="text-white/60 uppercase tracking-widest font-medium">Vrsta:</span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg px-2 py-0.5 bg-white/15 text-white border border-white/25">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2C12 2 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-7-12-7-12z" />
                </svg>
                {CLEANING_MODE_LABELS[sesija.cleaningMode]}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full flex flex-col gap-5">

        {/* Status kartica — hidden when LiveDashboard is active */}
        {!(akt && akt.mjerenja.length > 0) && (
          <TrenutniStatusKartica
            pH={pH}
            ciklus={akt ?? null}
            zadnjeMjerenje={zadnjeMjer ?? null}
            statusReakcije={podsesija.status_reakcije}
            onDecision={akt ? () => setShowDecisionSheet(true) : undefined}
          />
        )}

        {/* Live timer — visible when a cycle is active */}
        {akt && podsesija.status !== "zavrseno" && (
          <LiveTimer />
        )}

        {/* Alerts + Compliance Panel — engine output display */}
        <AlertsCompliancePanel
          sesija={sesija}
          allCiklusi={podsesija.ciklusi}
          podsesija={podsesija}
        />

        {/* Cycle status card — engine output display */}
        {akt && (
          <CycleStatusKartica
            ciklus={akt}
            isActive={true}
            cycleNumber={akt.cycleNumber}
          />
        )}

        {/* Blocked new cycle banner — shown when engine blockers exist */}
        {completionBlockersB && !completionBlockersB.canFinishJob && completionBlockersB.blockers.length > 0 && (sve_zavrseno) && (
          <BlockedNewCycleBanner message={completionBlockersB.blockers[0]} />
        )}

        {/* CTA: Početno mjerenje */}
        {cekaPocetnoMjerenje && akt && (
          <div className="bg-teal-500/10 border-2 border-teal-500/40 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-teal-500">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">
                  Referentno mjerenje (nakon ~3 min cirkulacije)
                </p>
                <details className="mt-1 group">
                  <summary className="text-xs text-teal-700 cursor-pointer list-none flex items-center gap-1">
                    <span>Upute</span>
                    <svg className="w-3 h-3 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </summary>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Pokrenite cirkulaciju i pričekajte približno 3 minute da se sredstvo ravnomjerno izmiješa. Zatim unesite referentno mjerenje.
                  </p>
                </details>
              </div>
            </div>
            <button
              onClick={() => setModal({ tip: "mjerenje", type: "initial_cycle_measurement" })}
              className="w-full bg-violet-600 text-white rounded-xl py-3 font-bold text-sm hover:bg-violet-700 active:scale-[0.98] transition-all"
              style={{ minHeight: 48, maxHeight: 52 }}
            >
              Unesi referentno mjerenje
            </button>
          </div>
        )}

        {/* Preporuka card — shown only when LiveDashboard is NOT active (no measurements yet) */}
        {zadnjeMjer && akt && !cekaPocetnoMjerenje && akt.mjerenja.length === 0 && (() => {
          const handleTopUp = (amountL: number) =>
            setModal({ tip: "nadopuna", prefilledAmountL: amountL });
          const savedPreporuka = zadnjeMjer.preporuka;
          if (savedPreporuka) {
            return (
              <PreporukaKartica
                preporuka={savedPreporuka}
                onTopUp={savedPreporuka.recommendedAction === "add_top_up" ? handleTopUp : undefined}
              />
            );
          }
          // Fallback: compute on-the-fly for legacy measurements without saved preporuka
          if (zadnjiPHVal !== null) {
            const computed = generirajPreporuku({
              mjerenje: zadnjeMjer,
              ciklus: akt,
              sessionId: sesijaId,
              subsessionId: podsesijaId,
              materialWarning: podsesija.materijal_upozorenje ?? null,
              product: akt.productSnapshot ?? null,
              materialName: typeof podsesija.materijal === "string" ? podsesija.materijal : null,
              cleaningMode: sesija.cleaningMode,
            });
            return (
              <PreporukaKartica
                preporuka={computed}
                onTopUp={computed.recommendedAction === "add_top_up" ? handleTopUp : undefined}
              />
            );
          }
          return null;
        })()}

        {/* REAKCIJA STABILNA banner — only when stability engine says "stable" */}
        {reakcijaStabilnaB && akt && stabilityB && (
          <ReakcijaStabilnaBannerB
            stability={stabilityB}
            onZavrsiCiklus={() => {
              zavrsiCiklus(sesijaId, podsesijaId, akt.id);
              setModal({ tip: "ispiranje" });
            }}
          />
        )}

        {/* Live visual dashboard — shown when active cycle has measurements */}
        {akt && akt.mjerenja.length > 0 && (
          <LiveDashboard
            ciklus={akt}
            stability={stabilityB}
            callbacks={{
              objekt: sesija?.naziv_objekta,
              sredstvo: akt.chemicalProductName ?? akt.kemikalija,
              nadacinRada: podsesija.naziv,
              onMjerenje: () => setModal({ tip: "mjerenje", type: "regular" }),
              onNadopuna: () => setModal({ tip: "nadopuna" }),
              onNoviCiklus: () => setModal({ tip: "novi_ciklus" }),
              onZavrsiCiklus: () => zavrsiCiklus(sesijaId, podsesijaId, akt.id),
            }}
          />
        )}

        {/* Preporuka — shown when active cycle has measurements */}
        {akt && akt.mjerenja.length > 0 && preporukaB && (
          <PreporukaKartica
            preporuka={preporukaB}
            onTopUp={
              preporukaB.recommendedAction === "add_top_up"
                ? () => setModal({ tip: "nadopuna" })
                : undefined
            }
          />
        )}

        {/* Full measurement log — shown when active cycle has measurements */}
        {akt && akt.mjerenja.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-0.5">
              Log mjerenja — Ciklus #{akt.cycleNumber ?? akt.broj}
            </p>
            <MjerenjeLogTabela ciklus={akt} />
          </div>
        )}

        {/* Aktivni ciklus detalji — hidden when LiveDashboard is active */}
        {akt && akt.mjerenja.length === 0 && (
          <CiklusKarticaAktivna ciklus={akt} sesija={sesija} />
        )}

        {/* Product / Chemistry / Material Safety kartice — prikazati kad je productSnapshot dostupan */}
        {akt?.productSnapshot && (() => {
          const engine = getProductEngine(akt.productSnapshot);
          const zadnjiPh = getMjerenjePH(zadnjeMjerenjeCiklusa(akt) ?? null);
          const zadnjaMjerenja = zadnjeMjerenjeCiklusa(akt) ?? null;
          const currentColor = zadnjaMjerenja && "colorIndicator" in zadnjaMjerenja ? (zadnjaMjerenja as { colorIndicator?: string }).colorIndicator : undefined;
          return (
            <div className="flex flex-col gap-3">
              <CompatibilityWarnings
                productSnapshot={akt.productSnapshot}
                engine={engine}
                currentTempC={zadnjaMjerenja && "tOut" in zadnjaMjerenja ? (zadnjaMjerenja as { tOut?: number }).tOut : undefined}
                currentConcentration={akt.chemicalPercent ?? undefined}
              />
              <MaterialSafetyCard productSnapshot={akt.productSnapshot} engine={engine} />
              <ChemistryCard engine={engine} currentPh={zadnjiPh} currentColorName={currentColor} />
              <ProductCard productSnapshot={akt.productSnapshot} engine={engine} />
            </div>
          );
        })()}

        {/* Prekinut ciklus */}
        {sve_zavrseno && podsesija.ciklusi.some(c => c.status === "prekinut") && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs text-red-700 font-medium">Jedan ili vise ciklusa je prekinuto. Provjerite povijest.</p>
          </div>
        )}

        {/* Povijest zavrsenih ciklusa */}
        {podsesija.ciklusi.filter((c) => c.status === "zavrsen" || c.status === "prekinut").length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Povijest ciklusa
            </h3>
            <div className="flex flex-col gap-3">
              {podsesija.ciklusi
                .filter((c) => c.status === "zavrsen" || c.status === "prekinut")
                .map((c) => (
                  <ZavrsenCiklusKartica key={c.id} ciklus={c} />
                ))}
            </div>
          </div>
        )}

        {/* Missing product warning — shown on active cycle with no productSnapshot */}
        {akt && !akt.productSnapshot && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <svg className="shrink-0 mt-0.5 text-amber-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-900 leading-relaxed">
              Ciklus nema definirano sredstvo. Pokreni novi ciklus i odaberi sredstvo.
            </p>
          </div>
        )}

        {/* Actions */}
        {podsesija.status !== "zavrseno" && (
          <div className="flex flex-col gap-3">
            {(nema_ciklusa || sve_zavrseno) && (
              <button
                onClick={() => setModal({ tip: "novi_ciklus" })}
                className="w-full bg-teal-700 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-teal-800 active:scale-[0.98] transition-all"
              >
                {nema_ciklusa ? "Pokreni ciklus" : "Pokreni novi ciklus"}
              </button>
            )}

            {/* Ceka mjerenje nakon nadopune — shown even when LiveDashboard is active */}
            {akt?.waitingForTopUpMeasurement && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Sljedeci korak: mjerenje nakon nadopune</p>
                    <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                      Nakon kratke cirkulacije unesite mjerenje kako bi se utvrdio ucinak nadopune.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModal({ tip: "mjerenje", type: "after_top_up" })}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
                >
                  Unesi mjerenje nakon nadopune
                </button>
              </div>
            )}

            {/* Only show standalone cycle action buttons when LiveDashboard is NOT active */}
            {akt && !cekaPocetnoMjerenje && akt.mjerenja.length === 0 && (
              <button
                onClick={() => setModal({ tip: "mjerenje", type: "regular" })}
                className="w-full bg-teal-700 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-teal-800 active:scale-[0.98] transition-all"
              >
                Unesi mjerenje
              </button>
            )}

            {akt && akt.mjerenja.length === 0 && (
              <>
                <button
                  onClick={() => setModal({ tip: "nadopuna" })}
                  className="w-full bg-slate-100 text-slate-700 rounded-xl py-3.5 font-semibold text-sm hover:bg-slate-200 active:scale-[0.98] transition-all"
                >
                  Dodaj nadopunu sredstva
                </button>
                <button
                  onClick={() => setModal({ tip: "novi_ciklus" })}
                  className="w-full border border-slate-200 rounded-xl py-3.5 font-medium text-sm text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all"
                >
                  Pokreni novi ciklus
                </button>
                <button
                  onClick={() => zavrsiCiklus(sesijaId, podsesijaId, akt.id)}
                  className="w-full border border-slate-200 rounded-xl py-3 font-medium text-sm text-slate-500 hover:bg-slate-50 active:scale-[0.98] transition-all"
                >
                  Završi ciklus #{akt.cycleNumber ?? akt.broj}
                </button>
              </>
            )}

            {/* Completion phases — shown when all cycles done */}
            {(nema_ciklusa === false && sve_zavrseno) && zadnjiZavrsenCiklus && (
              <CompletionPhasesPanelB
                phases={zadnjiZavrsenCiklus.completionPhases}
                onIspiranje={() => setModal({ tip: "ispiranje" })}
                onNeutralizacija={() => setModal({ tip: "neutralizacija" })}
                onZavrsniPH={() => setModal({ tip: "zavrsni_ph" })}
              />
            )}

            {completionBlockersB && !completionBlockersB.canFinishJob ? (
              <div className="flex flex-col gap-3">
                {/* Upozorenje — što nedostaje */}
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Podsesija nije potpuno dovršena
                  </p>
                  {completionBlockersB.blockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5" />
                      <p className="text-xs text-slate-700 leading-snug">{b}</p>
                    </div>
                  ))}
                </div>
                {/* Gumbi */}
                <button
                  onClick={() => {
                    zavrsiPodsesijuUzUpozorenje(sesijaId, podsesijaId, completionBlockersB.blockers);
                  }}
                  className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white py-3.5 text-sm font-bold transition-all"
                >
                  Završi podsesiju uz upozorenje
                </button>
              </div>
            ) : (
              <button
                onClick={() => zavrsiPodsesiju(sesijaId, podsesijaId)}
                className="w-full border border-red-400 text-red-600 rounded-xl py-3.5 font-medium text-sm hover:bg-red-50 active:scale-[0.98] transition-all"
              >
                Završi podsesiju
              </button>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {modal?.tip === "mjerenje" && akt && (
        <MjerenjeModal
          ciklus={akt}
          sessionId={sesijaId}
          subsessionId={podsesijaId}
          initialType={modal.type}
          initialFlowLMin={podsesija.pocetni_protok_l_min}
          materijal={typeof podsesija.materijal === "string" ? podsesija.materijal : undefined}
          cleaningMode={sesija.cleaningMode}
          onSave={(m) => {
            dodajMjerenje(sesijaId, podsesijaId, akt.id, m);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tip === "nadopuna" && akt && (
        <NadopunaModal
          ciklus={akt}
          sessionId={sesijaId}
          subsessionId={podsesijaId}
          materialName={typeof podsesija.materijal === "string" ? podsesija.materijal : undefined}
          systemCategory={sesija.systemCategory}
          prefilledAmountL={modal.prefilledAmountL}
          onSave={(n) => {
            dodajNadopunu(sesijaId, podsesijaId, akt.id, n);
            // Immediately prompt for follow-up measurement
            setModal({ tip: "mjerenje", type: "after_top_up" });
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.tip === "novi_ciklus" && (
        <PokreniCiklusModal
          sessionId={sesijaId}
          subsessionId={podsesijaId}
          cycleNumber={podsesija.ciklusi.length + 1}
          hasActiveCycle={Boolean(akt)}
          activeCycle={akt}
          defaultWaterVolumeL={podsesija.procijenjeni_volumen}
          defaultChemicalName={akt?.chemicalProductName ?? akt?.kemikalija}
          cleaningMode={sesija.cleaningMode}
          systemCategory={sesija.systemCategory}
          onOpenTopUp={() => setModal({ tip: "nadopuna" })}
          onSave={(c) => {
            // Close previous active cycle using drain data embedded in new cycle form
            if (akt) {
              const drainData = {
                drainConfirmedAt: c.drainConfirmedAt,
                drainVolumeL: c.drainVolumeL,
                drainAppearance: c.drainAppearance,
                drainSediment: c.drainSediment,
                drainNote: c.drainNote,
              };
              if ((c as { _closedAsPrekinut?: boolean })._closedAsPrekinut) {
                prekinutiCiklus(sesijaId, podsesijaId, akt.id, drainData);
              } else {
                zavrsiCiklus(sesijaId, podsesijaId, akt.id);
              }
            }
            pokreniCiklus(sesijaId, podsesijaId, c);
            // Immediately prompt for initial cycle measurement
            setModal({ tip: "mjerenje", type: "initial_cycle_measurement" });
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Completion phase modals — Mode B */}
      {modal?.tip === "ispiranje" && zadnjiZavrsenCiklus && (
        <IspiranjeFazaModal
          onSave={(data: IspiranjeData) => {
            azurirajCompletionPhasesCiklusa(sesijaId, podsesijaId, zadnjiZavrsenCiklus.id, { ispiranje: data });
            setModal({ tip: "neutralizacija" });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tip === "neutralizacija" && zadnjiZavrsenCiklus && (
        <NeutralizacijaFazaModal
          onSave={(data: NeutralizacijaData) => {
            azurirajCompletionPhasesCiklusa(sesijaId, podsesijaId, zadnjiZavrsenCiklus.id, { neutralizacija: data });
            setModal({ tip: "zavrsni_ph" });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tip === "zavrsni_ph" && zadnjiZavrsenCiklus && sesija && (
        <ZavrsniPhCheckModal
          systemCategory={sesija.systemCategory}
          autoFinalFlowLMin={zadnjiZavrsenCiklus.finalFlowLMin}
          onSave={(data: ZavrsniPhCheck) => {
            const totalKg = (() => {
              let t = 0;
              for (const c of podsesija.ciklusi) {
                const u = c.chemicalUnit;
                if (u === "kg") t += c.chemicalAmount;
                else if (u === "g") t += c.chemicalAmount / 1000;
                else if (u === "L") t += c.chemicalAmount * (c.chemicalDensityKgL ?? 1.2);
                else if (u === "ml") t += (c.chemicalAmount / 1000) * (c.chemicalDensityKgL ?? 1.2);
                for (const n of c.nadopune) {
                  if (n.unit === "kg") t += n.amount;
                  else if (n.unit === "g") t += n.amount / 1000;
                  else if (n.unit === "L") t += n.amount * (n.densityKgL ?? 1.2);
                  else if (n.unit === "ml") t += (n.amount / 1000) * (n.densityKgL ?? 1.2);
                }
              }
              return t > 0 ? t : null;
            })();
            const snap = zadnjiZavrsenCiklus.productSnapshot;
            const procjena = calcScaleEstimate({
              totalProductUsedKg: totalKg,
              scaleDissolvingCapacityCaCO3: snap?.scaleDissolvingCapacityCaCO3,
              scaleDissolvingCapacityUnit: snap?.scaleDissolvingCapacityUnit,
            });
            azurirajCompletionPhasesCiklusa(sesijaId, podsesijaId, zadnjiZavrsenCiklus.id, {
              zavrsniPH: data,
              procjenaKamenca: procjena,
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Operator decision override sheet */}
      {showDecisionSheet && akt && (() => {
        const zadnjiMjer = zadnjeMjer;
        const suggestedDecision = zadnjiMjer?.preporuka?.cycleDecisionType ?? null;

        const options: { type: CycleDecisionType; label: string; description: string; color: string }[] = [
          {
            type: "nastavi_ciklus",
            label: CYCLE_DECISION_LABELS["nastavi_ciklus"],
            description: "Cirkulacija teče, reakcija je prisutna.",
            color: "text-green-700 bg-green-50 border-green-200",
          },
          {
            type: "nadopuni_sredstvo",
            label: CYCLE_DECISION_LABELS["nadopuni_sredstvo"],
            description: "Dodaj kemijsko sredstvo u postojeću otopinu.",
            color: "text-amber-700 bg-amber-50 border-amber-200",
          },
          {
            type: "zavrsi_i_isperi",
            label: CYCLE_DECISION_LABELS["zavrsi_i_isperi"],
            description: "Ciklus je gotov. Isperi sustav čistom vodom.",
            color: "text-blue-700 bg-blue-50 border-blue-200",
          },
          {
            type: "zavrsi_i_novi_ciklus",
            label: CYCLE_DECISION_LABELS["zavrsi_i_novi_ciklus"],
            description: "Sredstvo je iscrpljeno. Pokreni novi ciklus.",
            color: "text-orange-700 bg-orange-50 border-orange-200",
          },
          {
            type: "zavrsi_posao",
            label: CYCLE_DECISION_LABELS["zavrsi_posao"],
            description: "Sav posao je završen na ovom dijelu sustava.",
            color: "text-slate-800 bg-white border-slate-200",
          },
        ];

        const handleDecisionSelect = (type: CycleDecisionType) => {
          const opt = options.find((o) => o.type === type);
          const odluka: CycleDecision = {
            id: genId("odluka"),
            timestamp: new Date().toISOString(),
            decision: type,
            decisionLabel: opt?.label ?? type,
            reason: opt?.description ?? "",
            basedOnMeasurementId: zadnjiMjer?.id,
            operatorOverride: type !== suggestedDecision,
          };
          dodajOdlukuCiklusa(sesijaId, podsesijaId, akt.id, odluka);
          setShowDecisionSheet(false);
          // Route operator to the appropriate action
          if (type === "nadopuni_sredstvo") setModal({ tip: "nadopuna" });
          else if (type === "zavrsi_i_novi_ciklus" || type === "zavrsi_i_isperi") setModal({ tip: "novi_ciklus" });
        };

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Zatvori"
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowDecisionSheet(false)}
            />
            <div className="relative bg-white rounded-t-3xl px-4 pt-5 flex flex-col gap-3 shadow-xl max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "max(40px, env(safe-area-inset-bottom, 40px))" }}>
              <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-1" />
              <div className="mb-1">
                <h2 className="text-base font-bold text-slate-900">Odabir odluke o ciklusu</h2>
                {suggestedDecision && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Preporučeno: <strong>{CYCLE_DECISION_LABELS[suggestedDecision]}</strong>
                  </p>
                )}
              </div>
              {options.map((opt) => {
                const isSuggested = opt.type === suggestedDecision;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleDecisionSelect(opt.type)}
                    className={`w-full text-left border rounded-2xl px-4 py-3.5 flex items-start gap-3 transition-all active:scale-[0.98] ${opt.color}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold leading-tight">{opt.label}</p>
                        {isSuggested && (
                          <span className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-teal-700 text-white">
                            Preporučeno
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">{opt.description}</p>
                    </div>
                    <svg className="shrink-0 mt-0.5 opacity-50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowDecisionSheet(false)}
                className="w-full text-center text-sm text-slate-500 py-2 mt-1"
              >
                Odustani
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrenutniStatusKartica({
  pH,
  ciklus,
  zadnjeMjerenje,
  statusReakcije,
  onDecision,
}: {
  pH: number | null;
  ciklus: Ciklus | null;
  zadnjeMjerenje: Mjerenje | null;
  statusReakcije: string;
  onDecision?: () => void;
}) {
  const flowLMin = zadnjeMjerenje?.flowLMin ?? null;
  const kemijskiStatus = ciklus
    ? `${ciklus.chemicalProductName ?? ciklus.kemikalija ?? "—"}${ciklus.chemicalPercent != null ? ` · ${ciklus.chemicalPercent.toFixed(1)}%` : ""}`
    : "—";
  const phHighlight = pH !== null && pH < 5;
  const phChange = zadnjeMjerenje?.phChange;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Top row — 4 metrics */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-200">
        {/* pH */}
        <div className="p-3 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">pH</span>
          <span className={`text-xl font-bold leading-none ${phHighlight ? "text-orange-600" : "text-slate-900"}`}>
            {pH !== null ? pH.toFixed(1) : "—"}
          </span>
          {phChange !== undefined && (
            <span className={`text-[10px] font-medium ${phChange > 0 ? "text-orange-500" : phChange < 0 ? "text-green-600" : "text-slate-400"}`}>
              {phChange > 0 ? "+" : ""}{phChange.toFixed(2)}
            </span>
          )}
        </div>

        {/* Reaction */}
        <div className="p-3 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Reakcija</span>
          <StatusBadge status={statusReakcije} size="sm" />
        </div>

        {/* Flow */}
        <div className="p-3 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Protok</span>
          <span className="text-sm font-bold text-slate-800 leading-tight">
            {flowLMin !== null ? `${flowLMin} L/m` : "—"}
          </span>
        </div>

        {/* Cycle */}
        <div className="p-3 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Ciklus</span>
          <span className="text-sm font-bold text-slate-800 leading-tight">
            {ciklus ? `#${ciklus.cycleNumber ?? ciklus.broj}` : "—"}
          </span>
        </div>
      </div>

      {/* Scale status row */}
      {zadnjeMjerenje?.preporuka?.scaleStatus && (() => {
        const prp = zadnjeMjerenje.preporuka!;
        const badgeColors: Record<string, string> = {
          "Nastavi": "bg-green-100 text-green-800",
          "Dodaj kemiju": "bg-amber-100 text-amber-800",
          "Ispiranje": "bg-blue-100 text-blue-800",
          "Novi ciklus": "bg-orange-100 text-orange-800",
          "Gotovo": "bg-slate-100 text-slate-600",
        };
        const badgeClass = prp.scaleBadge ? (badgeColors[prp.scaleBadge] ?? "bg-slate-100 text-slate-600") : null;
        return (
          <div className="px-3 py-2 border-b border-slate-200 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Stanje kamenca</span>
              {badgeClass && prp.scaleBadge && (
                <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${badgeClass}`}>{prp.scaleBadge}</span>
              )}
            </div>
            <span className="text-xs font-semibold text-slate-800">{prp.scaleStatus}</span>
            {prp.scaleAddWarning && (
              <span className="text-[10px] text-red-600 font-semibold leading-tight">{prp.scaleAddWarning}</span>
            )}
            {prp.scaleAddNote && !prp.scaleAddWarning && (
              <span className="text-[10px] text-green-700 leading-tight">{prp.scaleAddNote}</span>
            )}
          </div>
        );
      })()}

      {/* Chemical status row */}
      <div className="px-3 py-2 border-b border-slate-200">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Kemijsko sredstvo</span>
        <p className="text-xs font-medium text-slate-800 mt-0.5 truncate">{kemijskiStatus}</p>
      </div>

      {/* Cycle decision banner */}
      {zadnjeMjerenje?.preporuka?.cycleDecision && (
        <div className="px-3 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="shrink-0 text-teal-700" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
            </svg>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Preporučena odluka</p>
              <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                {zadnjeMjerenje.preporuka.cycleDecision}
              </p>
              {zadnjeMjerenje.preporuka.cycleDecisionReason && (
                <p className="text-[10px] text-slate-500 leading-tight">
                  {zadnjeMjerenje.preporuka.cycleDecisionReason}
                </p>
              )}
            </div>
          </div>
          {onDecision && (
            <button
              type="button"
              onClick={onDecision}
              className="shrink-0 text-xs font-semibold text-teal-700 border border-teal-300 rounded-lg px-2.5 py-1.5 hover:bg-teal-50 transition-colors"
            >
              Odaberi
            </button>
          )}
        </div>
      )}

      {/* Recommendation inline */}
      {zadnjeMjerenje?.preporuka && (
        <div className="px-3 py-2.5">
          <PreporukaRedak preporuka={zadnjeMjerenje.preporuka} />
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-white/50">{label}: </span>
      <span>{value}</span>
    </div>
  );
}



function CiklusKarticaAktivna({ ciklus, sesija }: { ciklus: Ciklus; sesija: Sesija | undefined }) {
  const pocetno = pocetnoMjerenjeCiklusa(ciklus);
  const zadnjiPHval = ciklus.mjerenja.length > 0
    ? getMjerenjePH(ciklus.mjerenja[ciklus.mjerenja.length - 1])
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Ciklus #{ciklus.cycleNumber ?? ciklus.broj}
          {ciklus.name ? ` — ${ciklus.name}` : ""}
        </h3>
        <StatusBadge status={ciklus.status} />
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-500 mb-3">
        <span>Voda: <strong className="text-slate-800">{ciklus.waterVolumeL ?? ciklus.volumen_vode} L</strong></span>
        <span>Sredstvo: <strong className="text-slate-800">{ciklus.chemicalProductName ?? ciklus.kemikalija}</strong></span>
        <span>
          Količina: <strong className="text-slate-800">
            {ciklus.chemicalAmount} {ciklus.chemicalUnit}
          </strong>
        </span>
        {ciklus.totalSolutionVolumeL && (
          <span>Ukupno: <strong className="text-slate-800">{ciklus.totalSolutionVolumeL.toFixed(1)} L</strong></span>
        )}
        {ciklus.chemicalPercent != null && (
          <span>Postotak: <strong className="text-slate-800">{ciklus.chemicalPercent.toFixed(2)} %</strong></span>
        )}
        {ciklus.waterPh && (
          <span>pH vode: <strong className="text-slate-800">{ciklus.waterPh}</strong></span>
        )}
        <span>Nadopune: <strong className="text-slate-800">{ciklus.nadopune.length}</strong></span>
        <span>Mjerenja: <strong className="text-slate-800">{ciklus.mjerenja.length}</strong></span>
      </div>

      {/* Initial measurement */}
      {pocetno && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs font-medium text-violet-700 mb-0.5">Referentno mjerenje ciklusa</p>
          <div className="flex gap-3 text-xs text-violet-800">
            <span className="font-bold">pH {getMjerenjePH(pocetno).toFixed(2)}</span>
            {(pocetno.temperatureC ?? pocetno.temperatura) !== undefined && (
              <span>{pocetno.temperatureC ?? pocetno.temperatura} °C</span>
            )}
            <span className="text-violet-500 ml-auto">{formatTime(getMjerenjeTimestamp(pocetno))}</span>
          </div>
          {(pocetno.note ?? pocetno.napomena) && (
            <p className="text-xs text-violet-600 mt-0.5 italic">{pocetno.note ?? pocetno.napomena}</p>
          )}
        </div>
      )}

      {/* Unified measurement + top-up timeline */}
      {(ciklus.mjerenja.length > 0 || ciklus.nadopune.length > 0) && (
        <div className="border-t border-slate-100 pt-3 mt-1">
          <CiklusVremenskiSlijed ciklus={ciklus} sesija={sesija} showTitle={false} />
        </div>
      )}

      {/* Legacy nadopune fallback — hidden when timeline is shown, kept for type safety */}
      {false && ciklus.nadopune.length > 0 && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          <p className="text-xs text-slate-500 font-medium mb-2">Nadopune:</p>
          <div className="flex flex-col gap-1.5">
            {ciklus.nadopune.map((n) => (
              <NadopunaRedak key={n.id} nadopuna={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FOAM_SHORT: Record<string, string> = {
  nema: "Nema", slaba: "Slaba", srednja: "Srednja", jaka: "Jaka", vrlo_jaka: "V.Jaka"
};
const TYPE_SHORT: Record<string, string> = {
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
    <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
            #{broj} {TYPE_SHORT[mjerenje.measurementType] ?? "Mj."}
          </span>
          <span className="font-bold text-sm text-slate-800">pH {ph.toFixed(2)}</span>
          {mjerenje.phChange !== undefined && (
            <span className={`text-xs font-medium ${mjerenje.phChange > 0 ? "text-orange-600" : mjerenje.phChange < 0 ? "text-green-600" : "text-slate-400"}`}>
              {mjerenje.phChange > 0 ? "+" : ""}{mjerenje.phChange.toFixed(2)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">{formatTime(ts)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {mjerenje.temperatureC !== undefined && <span>{mjerenje.temperatureC}°C</span>}
        {mjerenje.foamLevel && mjerenje.foamLevel !== "nema" && (
          <span>Pjena: {FOAM_SHORT[mjerenje.foamLevel]}</span>
        )}
        {mjerenje.flowLMin !== undefined && <span>Protok: {mjerenje.flowLMin} L/min</span>}
        <RateZoneBadge rate={mjerenje.phRatePerMinute} />
        {mjerenje.minutesFromCycleStart !== undefined && (
          <span>+{mjerenje.minutesFromCycleStart} min od poc.</span>
        )}
      </div>
      {mjerenje.interpretation && (
        <p className="text-xs text-slate-500 italic leading-relaxed">
          {mjerenje.interpretation}
        </p>
      )}
      {(mjerenje.note ?? mjerenje.napomena) && (
        <p className="text-xs text-slate-400 italic">{mjerenje.note ?? mjerenje.napomena}</p>
      )}
    </div>
  );
}

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
          <span className="text-sm font-semibold text-slate-800">{naziv}</span>
          <span className="text-xs font-medium text-amber-700">{kol}</span>
        </div>
        <span className="text-[10px] text-slate-400">{ts ? formatTime(ts) : ""}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {nadopuna.reason && (
          <span>Razlog: {RAZLOZI_NADOPUNE_KRATKO[nadopuna.reason] ?? nadopuna.reason}</span>
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
        <p className="text-xs text-slate-400 italic">{nadopuna.note ?? nadopuna.napomena}</p>
      )}
    </div>
  );
}

// Short labels for inline display
const RAZLOZI_NADOPUNE_KRATKO: Record<string, string> = {
  ph_previsok: "pH previsok",
  ph_brzo_raste: "pH brzo raste",
  reakcija_traje: "Reakcija traje",
  pjena_prisutna: "Pjena prisutna",
  boja_slabljenje: "Boja slabi",
  protok_nije_poboljsan: "Protok ne poboljsan",
  servisna_odluka: "Servisna odluka",
  drugo: "Drugo",
};

function CleaningEffectivenessKartica({ eff }: { eff: CleaningEffectiveness }) {
  if (eff.cleaningEffectivenessStatus === null) {
    return (
      <p className="text-xs text-slate-500 italic">{eff.effectivenessExplanation}</p>
    );
  }

  const statusColors: Record<string, string> = {
    "Vrlo dobar učinak": "bg-green-50 border-green-200 text-green-800",
    "Dobar učinak": "bg-blue-50 border-blue-200 text-blue-800",
    "Umjeren učinak": "bg-amber-50 border-amber-200 text-amber-800",
    "Slab učinak": "bg-red-50 border-red-200 text-red-800",
  };
  const colorClass = statusColors[eff.cleaningEffectivenessStatus] ?? "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 ${colorClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Učinkovitost čišćenja</span>
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
      {(eff.firstFlowLMin !== null || eff.latestFlowLMin !== null) && (
        <div className="flex gap-4 text-[10px] pt-1.5 border-t border-current/20">
          {eff.firstFlowLMin !== null && (
            <span>Poc. protok: <strong>{eff.firstFlowLMin} L/min</strong></span>
          )}
          {eff.latestFlowLMin !== null && (
            <span>Zadnji: <strong>{eff.latestFlowLMin} L/min</strong></span>
          )}
        </div>
      )}
    </div>
  );
}

function ZavrsenCiklusKartica({ ciklus }: { ciklus: Ciklus }) {
  const pocetno = pocetnoMjerenjeCiklusa(ciklus);
  const zadnjiPHval =
    ciklus.mjerenja.length > 0
      ? getMjerenjePH(ciklus.mjerenja[ciklus.mjerenja.length - 1])
      : null;

  // Use stored effectiveness if available, otherwise calculate on the fly
  const eff: CleaningEffectiveness =
    ciklus.cleaningEffectiveness ?? calcCleaningEffectiveness(ciklus.mjerenja);

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 flex flex-col gap-3 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-slate-800">
            Ciklus #{ciklus.cycleNumber ?? ciklus.broj}
          </span>
          {ciklus.name && (
            <span className="text-xs text-slate-500 ml-2">{ciklus.name}</span>
          )}
        </div>
        <StatusBadge status={ciklus.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          {ciklus.chemicalProductName ?? ciklus.kemikalija}{" "}
          <strong className="text-slate-800">
            {ciklus.chemicalAmount} {ciklus.chemicalUnit}
          </strong>
        </span>
        <span>Voda: <strong className="text-slate-800">{ciklus.waterVolumeL ?? ciklus.volumen_vode} L</strong></span>
        {ciklus.chemicalPercent != null && (
          <span>Postotak: <strong className="text-slate-800">{ciklus.chemicalPercent.toFixed(2)} %</strong></span>
        )}
        <span>{ciklus.mjerenja.length} mjerenja · {ciklus.nadopune.length} nadopuna</span>
      </div>

      <div className="flex gap-4 text-xs pt-2 border-t border-slate-100">
        {pocetno && (
          <span className="text-violet-600">
            Poc. pH: <strong>{getMjerenjePH(pocetno).toFixed(2)}</strong>
          </span>
        )}
        {zadnjiPHval !== null && (
          <span className="text-slate-500">
            Zadnji pH: <strong className="text-slate-800">{zadnjiPHval.toFixed(2)}</strong>
          </span>
        )}
      </div>

      {/* Cleaning effectiveness */}
      <CleaningEffectivenessKartica eff={eff} />

      {ciklus.recommendation && (
        <p className="text-xs text-slate-500 italic pt-2 border-t border-slate-100">
          {ciklus.recommendation}
        </p>
      )}
    </div>
  );
}

// ─── Completion helpers ────────────────────────────────────────────��──────────

import type { ReactionStabilityResult, CompletionPhases } from "@/lib/types";

function ReakcijaStabilnaBannerB({
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
        <p className="text-3xl font-black text-white leading-tight tracking-tight mb-2">{stability.statusLabel}</p>
        <p className="text-sm text-white/85 leading-relaxed">{stability.explanation}</p>
      </div>
      <div className="bg-teal-700 px-5 pt-4 pb-5 flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Sljedeci korak</p>
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

function CompletionPhasesPanelB({
  phases,
  onIspiranje,
  onNeutralizacija,
  onZavrsniPH,
}: {
  phases: CompletionPhases | undefined;
  onIspiranje: () => void;
  onNeutralizacija: () => void;
  onZavrsniPH: () => void;
}) {
  const ispiranjeOk = Boolean(phases?.ispiranje?.systemRinsedWithCleanWater);
  const neutralizacijaOk = Boolean(phases?.neutralizacija?.neutralizerProductName);
  const zavrsniPhOk = Boolean(phases?.zavrsniPH?.technicianConfirmed);

  function PhaseRow({
    label, done, buttonLabel, onAction, disabled,
  }: {
    label: string; done: boolean; buttonLabel: string; onAction: () => void; disabled?: boolean;
  }) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${done ? "bg-green-50 border border-green-200" : "bg-white border border-slate-200"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${done ? "bg-green-500" : "bg-slate-100"}`}>
            {done ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-400 block" />
            )}
          </span>
          <span className={`text-sm font-medium truncate ${done ? "text-green-800" : "text-slate-700"}`}>{label}</span>
        </div>
        {!done && (
          <button onClick={onAction} disabled={disabled}
            className="shrink-0 text-xs font-semibold text-teal-700 hover:opacity-70 transition-opacity disabled:opacity-30">
            {buttonLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Obavezne faze završetka</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">Kemijsko čišćenje završeno — slijedi ispiranje i neutralizacija.</p>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
        <PhaseRow label="Ispiranje sustava" done={ispiranjeOk} buttonLabel="Evidentiraj ispiranje" onAction={onIspiranje} />
        <PhaseRow label="Neutralizacija" done={neutralizacijaOk} buttonLabel="Evidentiraj neutralizaciju" onAction={onNeutralizacija} disabled={!ispiranjeOk} />
        <PhaseRow label="Završni pH" done={zavrsniPhOk} buttonLabel="Unesi završni pH" onAction={onZavrsniPH} disabled={!neutralizacijaOk} />
        {phases?.procjenaKamenca != null && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">Procjena količine kamenca</p>
            {(() => {
              const rl = phases.procjenaKamenca.reactionLevel;
              const kolicina =
                rl === "jaka"        ? "Veća količina kamenca"
                : rl === "srednja"   ? "Umjerena količina kamenca"
                : rl === "slaba"     ? "Mala količina kamenca"
                : rl === "iscrpljena" ? "Zanemariva količina kamenca"
                : null;
              return kolicina ? (
                <>
                  <p className="text-sm font-bold text-amber-900">{kolicina}</p>
                  {phases.procjenaKamenca.note && (
                    <p className="text-[10px] text-amber-600 mt-0.5 leading-snug">{phases.procjenaKamenca.note}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-amber-700">
                  {phases.procjenaKamenca.note ?? "Nema dovoljno podataka za procjenu."}
                </p>
              );
            })()}
            <p className="text-[10px] text-amber-500/70 mt-0.5 italic">Procjena intenziteta reakcije. Nije laboratorijski dokaz.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modals ─────��─────��────────────────────────────────────────────────���──────

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl p-5 flex flex-col gap-4 shadow-xl" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom, 32px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
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

// MjerenjeModal and NadopunaModal are imported from dedicated files

function ModalField({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
      />
    </div>
  );
}
