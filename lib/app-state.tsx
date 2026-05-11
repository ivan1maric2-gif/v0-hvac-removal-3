"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type {
  Sesija,
  Podsesija,
  Ciklus,
  Mjerenje,
  NadopunaKemikalije,
  CycleDecision,
  WorkMode,
  StatusSesije,
  StatusCiklusa,
  CompletionPhases,
} from "./types";
import { DEMO_SESIJE } from "./demo-data";
import { getSesije, spremiSesiju, obrisiSesijuIzPohrane } from "./storage";
import { nowISO } from "./utils";
import { getMjerenjePH } from "./types";

// ─── Helper: automatski izvuci završne vrijednosti iz zadnjeg mjerenja ─────────
// Sortira mjerenja kronološki, uzima zadnje i referentno, računa Δ vrijednosti.
function autoFinalValues(c: Ciklus): Pick<Ciklus, "finalPh" | "finalFlowLMin" | "finalTempOutC" | "deltaPh" | "deltaFlowLMin" | "deltaTempOutC"> {
  const sorted = [...c.mjerenja].sort((a, b) => {
    const ta = a.measuredAt ?? a.timestamp ?? "";
    const tb = b.measuredAt ?? b.timestamp ?? "";
    return ta.localeCompare(tb);
  });
  if (sorted.length === 0) return {};

  const zadnje = sorted[sorted.length - 1];
  // Referentno: nulto mjerenje (initial_cycle_measurement) ili prvo mjerenje
  const referencno = sorted.find((m) => m.measurementType === "initial_cycle_measurement") ?? sorted[0];

  const finalPh      = getMjerenjePH(zadnje) ?? undefined;
  const finalFlow    = zadnje.flowLMin ?? undefined;
  const finalTemp    = zadnje.tempOutC ?? undefined;

  const refPh   = c.zeroMeasurementPh ?? (referencno !== zadnje ? getMjerenjePH(referencno) ?? undefined : undefined);
  const refFlow = c.zeroMeasurementFlowLMin ?? (referencno !== zadnje ? referencno.flowLMin ?? undefined : undefined);
  const refTemp = referencno !== zadnje ? referencno.tempOutC ?? undefined : undefined;

  return {
    ...(finalPh    !== undefined ? { finalPh }                                           : {}),
    ...(finalFlow  !== undefined ? { finalFlowLMin: finalFlow }                           : {}),
    ...(finalTemp  !== undefined ? { finalTempOutC: finalTemp }                           : {}),
    ...(finalPh    !== undefined && refPh    !== undefined ? { deltaPh:       parseFloat((finalPh    - refPh).toFixed(2))  } : {}),
    ...(finalFlow  !== undefined && refFlow  !== undefined ? { deltaFlowLMin: parseFloat((finalFlow  - refFlow).toFixed(2)) } : {}),
    ...(finalTemp  !== undefined && refTemp  !== undefined ? { deltaTempOutC: parseFloat((finalTemp  - refTemp).toFixed(2)) } : {}),
  };
}

// IDs of demo sessions — never persisted to storage
const DEMO_IDS = new Set(DEMO_SESIJE.map((s) => s.id));

// ─── Navigation types ─────────────────────────────────────────────────────────

export type Ekran =
  | { ime: "pocetni" }
  | { ime: "nova_sesija" }
  | { ime: "setup_ciklus"; sesijaId: string }
  | { ime: "sesija"; sesijaId: string }
  | { ime: "podsesija"; sesijaId: string; podsesijaId: string }
  | { ime: "povijest" }
  | { ime: "baza_proizvoda" }
  | { ime: "postavke" };

// ─── Context type ─────────────────────────────────────────────────────────────

interface AppState {
  sesije: Sesija[];
  ucitavaSe: boolean;
  ekran: Ekran;
  history: Ekran[];
  forwardStack: Ekran[];
  mozeLiNazad: boolean;
  mozeLiNaprijed: boolean;
  navigiraj: (ekran: Ekran) => void;
  nazad: () => void;
  naprijed: () => void;
  /** Idi na pocetni ekran i ocisti history — bez gurkanja u history stack. */
  idi_na_pocetni: () => void;
  getSesija: (id: string) => Sesija | undefined;
  getPodsesija: (sesijaId: string, podsesijaId: string) => Podsesija | undefined;
  dodajSesiju: (sesija: Sesija) => void;
  postaviWorkMode: (sesijaId: string, mode: WorkMode) => void;
  // ── Mode B: Podsesije ──
  dodajPodsesiju: (sesijaId: string, podsesija: Podsesija) => void;
  urediPodsesiju: (sesijaId: string, podsesijaId: string, izmjene: Partial<Podsesija>) => void;
  zavrsiPodsesiju: (sesijaId: string, podsesijaId: string) => void;
  zavrsiPodsesijuUzUpozorenje: (sesijaId: string, podsesijaId: string, blokatoriTekst: string[]) => void;
  pokreniCiklus: (sesijaId: string, podsesijaId: string, ciklus: Ciklus) => void;
  zavrsiCiklus: (sesijaId: string, podsesijaId: string, ciklusId: string) => void;
  prekinutiCiklus: (sesijaId: string, podsesijaId: string, ciklusId: string, drainData: Partial<import("./types").Ciklus>) => void;
  prekinutiCiklusSesije: (sesijaId: string, ciklusId: string, drainData: Partial<import("./types").Ciklus>) => void;
  azurirajStatusCiklusa: (sesijaId: string, podsesijaId: string, ciklusId: string, status: StatusCiklusa) => void;
  azurirajStatusCiklusaSesije: (sesijaId: string, ciklusId: string, status: StatusCiklusa) => void;
  dodajMjerenje: (sesijaId: string, podsesijaId: string, ciklusId: string, mjerenje: Mjerenje) => void;
  dodajNadopunu: (sesijaId: string, podsesijaId: string, ciklusId: string, nadopuna: NadopunaKemikalije) => void;
  dodajOdlukuCiklusa: (sesijaId: string, podsesijaId: string, ciklusId: string, odluka: CycleDecision) => void;
  // ── Mode A: Direct session workflow ──
  pokreniCiklusSesije: (sesijaId: string, ciklus: Ciklus) => void;
  zavrsiCiklusSesije: (sesijaId: string, ciklusId: string) => void;
  dodajMjerenjeSesije: (sesijaId: string, ciklusId: string, mjerenje: Mjerenje) => void;
  dodajNadopunuSesije: (sesijaId: string, ciklusId: string, nadopuna: NadopunaKemikalije) => void;
  /** Update CompletionPhases on a cycle in Mode A (direct session). */
  azurirajCompletionPhasesSesije: (sesijaId: string, ciklusId: string, phases: Partial<CompletionPhases>) => void;
  /** Update CompletionPhases on a cycle in Mode B (with subsessions). */
  azurirajCompletionPhasesCiklusa: (sesijaId: string, podsesijaId: string, ciklusId: string, phases: Partial<CompletionPhases>) => void;
  // ── Session level ──
  postaviStatusSesije: (sesijaId: string, status: StatusSesije) => void;
  zavrsiSesiju: (sesijaId: string) => void;
  pauzirajSesiju: (sesijaId: string) => void;
  nastaviSesiju: (sesijaId: string) => void;
  zatvoriSesijuNedovrsenu: (sesijaId: string) => void;
  obrisiSesiju: (sesijaId: string) => void;
  vratiSesiju: (sesijaId: string) => void;

  // ── Clean English API (Step 5) ────────────────────────────────────────────
  /** Create and persist a new session. Alias: dodajSesiju */
  createSession: (sesija: Sesija) => void;
  /** Patch top-level session fields (status, workMode, etc). */
  updateSession: (sesijaId: string, izmjene: Partial<Sesija>) => void;
  /** Soft-delete a session. Alias: obrisiSesiju */
  deleteSession: (sesijaId: string) => void;
  /** Start a new cycle on a direct-mode session. Alias: pokreniCiklusSesije */
  createCycle: (sesijaId: string, ciklus: Ciklus) => void;
  /** Patch a cycle on a direct-mode session. */
  updateCycle: (sesijaId: string, ciklusId: string, izmjene: Partial<Ciklus>) => void;
  /** Mark a cycle finished on a direct-mode session. Alias: zavrsiCiklusSesije */
  closeCycle: (sesijaId: string, ciklusId: string) => void;
  /** Add a measurement to a cycle on a direct-mode session. Alias: dodajMjerenjeSesije */
  addMeasurement: (sesijaId: string, ciklusId: string, mjerenje: Mjerenje) => void;
  /** Add a top-up to a cycle on a direct-mode session. Alias: dodajNadopunuSesije */
  addTopUp: (sesijaId: string, ciklusId: string, nadopuna: NadopunaKemikalije) => void;
  /** Record rinsing completion on a cycle in a direct-mode session. */
  completeRinsing: (sesijaId: string, ciklusId: string, data: import("./types").IspiranjeData) => void;
  /** Record neutralization completion on a cycle in a direct-mode session. */
  completeNeutralization: (sesijaId: string, ciklusId: string, data: import("./types").NeutralizacijaData) => void;
  /** Mark a session as completed. Alias: zavrsiSesiju */
  completeSession: (sesijaId: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Pocinjemo s demo sesijama kao placeholder dok se Supabase ne ucita.
  const [sesije, setSesije] = useState<Sesija[]>(DEMO_SESIJE);
  const [ucitavaSe, setUcitavaSe] = useState(true);
  // ── Navigation state ─────────────────────────────────────────────────────────
  // VAŽNO: uvijek počinjemo s { ime: "pocetni" } da server i klijent
  // renderiraju identično (izbjegavamo hydration mismatch).
  // localStorage se čita tek u useEffect (client-only, nakon hydratacije).
  const NAV_KEY = "hvac_nav_state";

  const [ekran, setEkran] = useState<Ekran>({ ime: "pocetni" });
  const [history, setHistory] = useState<Ekran[]>([]);
  const [forwardStack, setForwardStack] = useState<Ekran[]>([]);

  // Ref-ovi moraju biti IZNAD effecta koji ih koristi
  const ekranRef = React.useRef<Ekran>({ ime: "pocetni" });
  React.useLayoutEffect(() => { ekranRef.current = ekran; }, [ekran]);

  const historyRef = React.useRef<Ekran[]>([]);
  React.useLayoutEffect(() => { historyRef.current = history; }, [history]);

  const forwardRef = React.useRef<Ekran[]>([]);
  React.useLayoutEffect(() => { forwardRef.current = forwardStack; }, [forwardStack]);

  // Učitaj pohranjeno navigacijsko stanje iz localStorage — samo na klijentu.
  // navSaveEnabled postaje true tek NAKON što restore završi (sljedeći tick).
  const navSaveEnabled = React.useRef(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ekran) setEkran(parsed.ekran);
        if (parsed.back) setHistory(parsed.back);
      }
    } catch { /* ignore */ }
    // Dozvoli save tek u sljedećem tick-u — nakon što su setState pozivi aplicirani
    setTimeout(() => { navSaveEnabled.current = true; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spremi navigacijsko stanje u localStorage — samo kada je restore završen
  React.useEffect(() => {
    if (!navSaveEnabled.current) return;
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify({ ekran, back: history }));
    } catch { /* ignore quota errors */ }
  }, [ekran, history]);

  // Async ucitavanje sesija iz Supabase nakon mounta.
  // Demo sesije su UVIJEK prisutne — realne se dodaju uz njih.
  React.useEffect(() => {
    getSesije().then((stored) => {
      const realneSesije = stored && stored.length > 0 ? stored : [];
      const sveSesije = [...realneSesije, ...DEMO_SESIJE];
      if (realneSesije.length > 0) {
        setSesije(sveSesije);
      }
      setUcitavaSe(false);

      // Validiraj pohranjeni ekran — ako referirana sesija ne postoji, idi na pocetni
      const currentEkran = ekranRef.current;
      const trebaSesijaId = currentEkran.ime === "sesija"
        || currentEkran.ime === "setup_ciklus"
        || currentEkran.ime === "podsesija";

      if (trebaSesijaId) {
        const sesijaId = (currentEkran as any).sesijaId;
        const postoji = sveSesije.some((x) => x.id === sesijaId && !x.isDeleted);
        if (!postoji) {
          setEkran({ ime: "pocetni" });
          setHistory([]);
          setForwardStack([]);
        }
      }
    }).catch(() => {
      setUcitavaSe(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigiraj = useCallback((noviEkran: Ekran) => {
    // Push trenutni ekran na back stack, očisti forward stack
    setHistory((prev) => [...prev, ekranRef.current]);
    setForwardStack([]); // svaka nova navigacija briše forward
    setEkran(noviEkran);
  }, []);

  // sesijeRef — uvijek aktualne sesije za use u callbackima bez stale closure
  const sesijeRef = React.useRef<Sesija[]>(sesije);
  React.useLayoutEffect(() => { sesijeRef.current = sesije; }, [sesije]);

  /** Provjeri je li ekran validan (sesija/podsesija i dalje postoji) */
  const isEkranValidan = useCallback((e: Ekran): boolean => {
    if (e.ime === "sesija" || e.ime === "setup_ciklus") {
      const s = sesijeRef.current.find((x) => x.id === e.sesijaId);
      return !!s && !s.isDeleted;
    }
    if (e.ime === "podsesija") {
      const s = sesijeRef.current.find((x) => x.id === e.sesijaId);
      return !!s && !s.isDeleted;
    }
    return true;
  }, []);

  /**
   * Pronalazi najrelevantiniji "radni" ekran na koji treba ići
   * kada nema history-ja. Prioritet:
   * 1. Aktivni ciklus (setup_ciklus ekran za Mode A)
   * 2. Aktivna sesija (sesija ekran)
   * 3. Početni ekran
   */
  const getAktivniRadniEkran = useCallback((): Ekran => {
    const sveSesije = sesijeRef.current.filter((s) => !s.isDeleted && !DEMO_IDS.has(s.id));

    // Traži sesiju koja je u tijeku
    const aktivnaSesija = sveSesije.find((s) =>
      s.status === "u_radu" || s.status === "aktivna_reakcija" || s.status === "ciklus_zavrsen"
    );
    if (!aktivnaSesija) return { ime: "pocetni" };

    // Provjeri ima li aktivni ciklus (Mode A)
    if (aktivnaSesija.workMode === "no_subsessions" || !aktivnaSesija.workMode) {
      const aktivniCiklus = (aktivnaSesija.ciklusi ?? []).find(
        (c) => c.status === "aktivan" || c.status === "ceka_pocetno_mjerenje" || c.status === "ceka_redovno_mjerenje"
      );
      if (aktivniCiklus) {
        return { ime: "setup_ciklus", sesijaId: aktivnaSesija.id };
      }
    }

    // Idi na sesiju ekran
    return { ime: "sesija", sesijaId: aktivnaSesija.id };
  }, []);

  const nazad = useCallback(() => {
    setHistory((prev) => {
      const next = [...prev];
      // Skipaj sve ekrane koji više nisu valjani (obrisana sesija)
      let prethodni: Ekran | undefined;
      while (next.length > 0) {
        const kandidat = next.pop()!;
        if (isEkranValidan(kandidat)) {
          prethodni = kandidat;
          break;
        }
      }
      // Ako history prazan — pametno se vrati na aktivni radni ekran
      const cilj = prethodni ?? getAktivniRadniEkran();
      // Push trenutni ekran na forward stack prije odlaska
      setForwardStack((fwd) => [ekranRef.current, ...fwd]);
      setEkran(cilj);
      return next;
    });
  }, [isEkranValidan, getAktivniRadniEkran]);

  const naprijed = useCallback(() => {
    setForwardStack((prev) => {
      const next = [...prev];
      // Skipaj nevaljane ekrane
      let sljedeci: Ekran | undefined;
      while (next.length > 0) {
        const kandidat = next.shift()!;
        if (isEkranValidan(kandidat)) {
          sljedeci = kandidat;
          break;
        }
      }
      if (!sljedeci) return prev; // nema kamo naprijed
      // Push trenutni ekran na back stack
      setHistory((h) => [...h, ekranRef.current]);
      setEkran(sljedeci);
      return next;
    });
  }, [isEkranValidan]);

  const idi_na_pocetni = useCallback(() => {
    setEkran({ ime: "pocetni" });
    setHistory([]);
    setForwardStack([]);
  }, []);

  const getSesija = useCallback(
    (id: string) => sesije.find((s) => s.id === id),
    [sesije]
  );

  const getPodsesija = useCallback(
    (sesijaId: string, podsesijaId: string) =>
      sesije.find((s) => s.id === sesijaId)?.podsesije.find((p) => p.id === podsesijaId),
    [sesije]
  );

  // Svaka izmjena stanja se automatski sprema u Supabase.
  // Demo sesije se NIKAD ne zapisuju u Supabase — uvijek ostaju u state-u.
  const updateSesije = useCallback((updater: (prev: Sesija[]) => Sesija[]) => {
    setSesije((prev) => {
      const sljedece = updater(prev);
      const prevMap = new Map(prev.filter((s) => !DEMO_IDS.has(s.id)).map((s) => [s.id, s]));
      const realneSesije = sljedece.filter((s) => !DEMO_IDS.has(s.id));
      const demoSesije = DEMO_SESIJE; // uvijek drzimo demo u state-u

      // Upsert promijenjenih/novih realnih sesija u Supabase
      for (const s of realneSesije) {
        if (prevMap.get(s.id) !== s) {
          void spremiSesiju(s);
        }
      }
      // Obrisi realne sesije koje su uklonjene
      const sljedeceIds = new Set(realneSesije.map((s) => s.id));
      for (const [id] of prevMap) {
        if (!sljedeceIds.has(id)) void obrisiSesijuIzPohrane(id);
      }

      // State = realne + demo (uvijek zajedno)
      return [...realneSesije, ...demoSesije];
    });
  }, []);

  const dodajSesiju = useCallback(
    (sesija: Sesija) => updateSesije((prev) => [sesija, ...prev]),
    [updateSesije]
  );

  const postaviWorkMode = useCallback(
    (sesijaId: string, mode: WorkMode) =>
      updateSesije((prev) =>
        prev.map((s) => (s.id === sesijaId ? { ...s, workMode: mode, updatedAt: nowISO() } : s))
      ),
    [updateSesije]
  );

  // ── Shared cycle helpers (declared early to avoid TDZ) ───────────────────

  const mapCiklusSesije = useCallback(
    (
      prev: Sesija[],
      sesijaId: string,
      ciklusId: string,
      updater: (c: Ciklus) => Ciklus
    ): Sesija[] =>
      prev.map((s) =>
        s.id !== sesijaId
          ? s
          : {
              ...s,
              ciklusi: (s.ciklusi ?? []).map((c) =>
                c.id !== ciklusId ? c : updater(c)
              ),
            }
      ),
    []
  );

  // ── Mode B helpers ────────────────────────────────────────────────────────

  const mapPodsesija = useCallback(
    (
      prev: Sesija[],
      sesijaId: string,
      podsesijaId: string,
      updater: (p: Podsesija) => Podsesija
    ): Sesija[] =>
      prev.map((s) =>
        s.id !== sesijaId
          ? s
          : {
              ...s,
              podsesije: s.podsesije.map((p) =>
                p.id !== podsesijaId ? p : updater(p)
              ),
            }
      ),
    []
  );

  const mapCiklusPodsesije = useCallback(
    (
      prev: Sesija[],
      sesijaId: string,
      podsesijaId: string,
      ciklusId: string,
      updater: (c: Ciklus) => Ciklus
    ): Sesija[] =>
      mapPodsesija(prev, sesijaId, podsesijaId, (p) => ({
        ...p,
        ciklusi: p.ciklusi.map((c) => (c.id !== ciklusId ? c : updater(c))),
      })),
    [mapPodsesija]
  );

  const dodajPodsesiju = useCallback(
    (sesijaId: string, podsesija: Podsesija) =>
      updateSesije((prev) =>
        prev.map((s) =>
          s.id === sesijaId
            ? { ...s, podsesije: [...s.podsesije, podsesija] }
            : s
        )
      ),
    [updateSesije]
  );

  const urediPodsesiju = useCallback(
    (sesijaId: string, podsesijaId: string, izmjene: Partial<Podsesija>) =>
      updateSesije((prev) =>
        mapPodsesija(prev, sesijaId, podsesijaId, (p) => ({
          ...p,
          ...izmjene,
          // Never overwrite cycles, measurements or top-ups from basic edits
          ciklusi: p.ciklusi,
          createdAt: p.createdAt,
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapPodsesija]
  );

  const zavrsiPodsesiju = useCallback(
    (sesijaId: string, podsesijaId: string) =>
      updateSesije((prev) =>
        mapPodsesija(prev, sesijaId, podsesijaId, (p) => ({
          ...p,
          status: "zavrseno" as const,
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapPodsesija]
  );

  const zavrsiPodsesijuUzUpozorenje = useCallback(
    (sesijaId: string, podsesijaId: string, blokatoriTekst: string[]) =>
      updateSesije((prev) =>
        mapPodsesija(prev, sesijaId, podsesijaId, (p) => ({
          ...p,
          status: "zavrseno" as const,
          completionStatus: "uz_upozorenje" as const,
          blokatoriTekst,
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapPodsesija]
  );

  const pokreniCiklus = useCallback(
    (sesijaId: string, podsesijaId: string, ciklus: Ciklus) =>
      updateSesije((prev) =>
        mapPodsesija(prev, sesijaId, podsesijaId, (p) => ({
          ...p,
          status: "u_radu" as const,
          ciklusi: [...p.ciklusi, ciklus],
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapPodsesija]
  );

  const zavrsiCiklus = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => ({
          ...c,
          ...autoFinalValues(c),
          status: "zavrsen" as const,
          endDateTime: nowISO(),
          timestamp_zavrsetka: nowISO(),
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  const prekinutiCiklus = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, drainData: Partial<Ciklus>) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => ({
          ...c,
          ...drainData,
          status: "prekinut" as const,
          closedAsStatus: "prekinut" as const,
          endDateTime: nowISO(),
          timestamp_zavrsetka: nowISO(),
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  const prekinutiCiklusSesije = useCallback(
    (sesijaId: string, ciklusId: string, drainData: Partial<Ciklus>) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          ...drainData,
          status: "prekinut" as const,
          closedAsStatus: "prekinut" as const,
          endDateTime: nowISO(),
          timestamp_zavrsetka: nowISO(),
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const azurirajStatusCiklusa = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, status: StatusCiklusa) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => ({
          ...c,
          status,
          updatedAt: nowISO(),
          ...(status === "zavrsen" || status === "prekinut"
            ? { endDateTime: nowISO(), timestamp_zavrsetka: nowISO() }
            : {}),
        }))
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  const azurirajStatusCiklusaSesije = useCallback(
    (sesijaId: string, ciklusId: string, status: StatusCiklusa) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          status,
          updatedAt: nowISO(),
          ...(status === "zavrsen" || status === "prekinut"
            ? { endDateTime: nowISO(), timestamp_zavrsetka: nowISO() }
            : {}),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const dodajMjerenje = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, mjerenje: Mjerenje) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => {
          const isInitial = mjerenje.measurementType === "initial_cycle_measurement";
          // Automatski poredak po measuredAt (unos tehničara) — ne po redoslijedu unosa
          const sortedMjerenja = [...c.mjerenja, mjerenje].sort(
            (a, b) =>
              new Date(a.measuredAt ?? a.timestamp ?? 0).getTime() -
              new Date(b.measuredAt ?? b.timestamp ?? 0).getTime()
          );
          return {
            ...c,
            updatedAt: nowISO(),
            mjerenja: sortedMjerenja,
            ...(isInitial
              ? {
                  status: "aktivan" as const,
                  hasInitialMeasurement: true,
                  // Spremi nulto mjerenje vrijednosti za delta kalkulacije
                  zeroMeasurementPh: mjerenje.ph ?? mjerenje.pH,
                  zeroMeasurementFlowLMin: mjerenje.flowLMin,
                  zeroMeasurementAt: mjerenje.measuredAt ?? mjerenje.timestamp ?? nowISO(),
                }
              : {}),
          };
        })
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  const dodajNadopunu = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, nadopuna: NadopunaKemikalije) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => {
          const noveNadopune = [...c.nadopune, nadopuna];
          return {
            ...c,
            nadopune: noveNadopune,
            totalTopUps: noveNadopune.length,
            currentTotalSolutionVolumeL: nadopuna.newTotalSolutionVolumeL,
            currentChemicalPercent: nadopuna.newChemicalPercent ?? c.currentChemicalPercent,
            totalChemicalAddedL: (c.totalChemicalAddedL ?? 0) + (nadopuna.addedChemicalVolumeL ?? 0),
            waitingForTopUpMeasurement: true,
            // ⚠️ VAŽNO: status ostaje 'aktivan' — nadopuna nije novi ciklus
            // Nadopuna je dio postojećeg ciklusa. Delate se nastavljaju od istog baseline-a.
            // status se NE mijenja
            updatedAt: nowISO(),
          };
        })
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  const dodajOdlukuCiklusa = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, odluka: CycleDecision) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => ({
          ...c,
          decisions: [...(c.decisions ?? []), odluka],
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  // ── Mode A helpers ────────────────────────────────────────────────────────

  const pokreniCiklusSesije = useCallback(
    (sesijaId: string, ciklus: Ciklus) =>
      updateSesije((prev) =>
        prev.map((s) =>
          s.id !== sesijaId
            ? s
            : { ...s, status: "u_radu" as const, ciklusi: [...(s.ciklusi ?? []), ciklus], updatedAt: nowISO() }
        )
      ),
    [updateSesije]
  );

  const zavrsiCiklusSesije = useCallback(
    (sesijaId: string, ciklusId: string) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          ...autoFinalValues(c),
          status: "zavrsen" as const,
          endDateTime: nowISO(),
          timestamp_zavrsetka: nowISO(),
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const dodajMjerenjeSesije = useCallback(
    (sesijaId: string, ciklusId: string, mjerenje: Mjerenje) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => {
          const isInitial = mjerenje.measurementType === "initial_cycle_measurement";
          return {
            ...c,
            updatedAt: nowISO(),
            mjerenja: [...c.mjerenja, mjerenje],
            ...(isInitial
              ? {
                  status: "aktivan" as const,
                  hasInitialMeasurement: true,
                  // Spremi nulto mjerenje vrijednosti za delta kalkulacije
                  zeroMeasurementPh: mjerenje.ph ?? mjerenje.pH,
                  zeroMeasurementFlowLMin: mjerenje.flowLMin,
                  zeroMeasurementAt: mjerenje.measuredAt ?? mjerenje.timestamp ?? nowISO(),
                }
              : {}),
          };
        })
      ),
    [updateSesije, mapCiklusSesije]
  );

  const dodajNadopunuSesije = useCallback(
    (sesijaId: string, ciklusId: string, nadopuna: NadopunaKemikalije) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => {
          const noveNadopune = [...c.nadopune, nadopuna];
          return {
            ...c,
            nadopune: noveNadopune,
            totalTopUps: noveNadopune.length,
            currentTotalSolutionVolumeL: nadopuna.newTotalSolutionVolumeL,
            currentChemicalPercent: nadopuna.newChemicalPercent ?? c.currentChemicalPercent,
            totalChemicalAddedL: (c.totalChemicalAddedL ?? 0) + (nadopuna.addedChemicalVolumeL ?? 0),
            waitingForTopUpMeasurement: true,
            // ⚠️ VAŽNO: status ostaje 'aktivan' — nadopuna nije novi ciklus
            // Nadopuna je dio postojećeg ciklusa. Delate se nastavljaju od istog baseline-a.
            // status se NE mijenja
            updatedAt: nowISO(),
          };
        })
      ),
    [updateSesije, mapCiklusSesije]
  );

  const azurirajCompletionPhasesSesije = useCallback(
    (sesijaId: string, ciklusId: string, phases: Partial<CompletionPhases>) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          completionPhases: { ...(c.completionPhases ?? {}), ...phases },
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const azurirajCompletionPhasesCiklusa = useCallback(
    (sesijaId: string, podsesijaId: string, ciklusId: string, phases: Partial<CompletionPhases>) =>
      updateSesije((prev) =>
        mapCiklusPodsesije(prev, sesijaId, podsesijaId, ciklusId, (c) => ({
          ...c,
          completionPhases: { ...(c.completionPhases ?? {}), ...phases },
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusPodsesije]
  );

  // ── Clean English API — useCallback implementations (Step 5) ────────────

  const updateSession = useCallback(
    (sesijaId: string, izmjene: Partial<Sesija>) =>
      updateSesije((prev) =>
        prev.map((s) =>
          s.id === sesijaId ? { ...s, ...izmjene, id: s.id, updatedAt: nowISO() } : s
        )
      ),
    [updateSesije]
  );

  const updateCycle = useCallback(
    (sesijaId: string, ciklusId: string, izmjene: Partial<Ciklus>) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          ...izmjene,
          id: c.id,
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const completeRinsing = useCallback(
    (sesijaId: string, ciklusId: string, data: import("./types").IspiranjeData) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          completionPhases: {
            ...(c.completionPhases ?? {}),
            ispiranje: data,
          },
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  const completeNeutralization = useCallback(
    (sesijaId: string, ciklusId: string, data: import("./types").NeutralizacijaData) =>
      updateSesije((prev) =>
        mapCiklusSesije(prev, sesijaId, ciklusId, (c) => ({
          ...c,
          completionPhases: {
            ...(c.completionPhases ?? {}),
            neutralizacija: data,
          },
          updatedAt: nowISO(),
        }))
      ),
    [updateSesije, mapCiklusSesije]
  );

  // ── Session level ─────────────────────────────────��───────────────────────

  const postaviStatusSesije = useCallback(
    (sesijaId: string, status: StatusSesije) =>
      updateSesije((prev) =>
        prev.map((s) => (s.id === sesijaId ? { ...s, status, updatedAt: nowISO() } : s))
      ),
    [updateSesije]
  );

  const zavrsiSesiju = useCallback(
    (sesijaId: string) =>
      updateSesije((prev) =>
        prev.map((s) => {
          if (s.id !== sesijaId) return s;

          // Automatski završni podaci sesije:
          // - referentno: prvo mjerenje prvog ciklusa
          // - završno: zadnje mjerenje zadnjeg ciklusa
          const sveCiklusi = (s.ciklusi ?? [])
            .filter((c) => c.mjerenja.length > 0)
            .sort((a, b) => (a.startDateTime ?? "").localeCompare(b.startDateTime ?? ""));

          let sessionFinalValues: Partial<typeof s> = {};
          if (sveCiklusi.length > 0) {
            const prviCiklus  = sveCiklusi[0];
            const zadnjiCiklus = sveCiklusi[sveCiklusi.length - 1];

            const sortedPrvi   = [...prviCiklus.mjerenja].sort((a, b) => (a.measuredAt ?? a.timestamp ?? "").localeCompare(b.measuredAt ?? b.timestamp ?? ""));
            const sortedZadnji = [...zadnjiCiklus.mjerenja].sort((a, b) => (a.measuredAt ?? a.timestamp ?? "").localeCompare(b.measuredAt ?? b.timestamp ?? ""));

            const refM   = sortedPrvi.find((m) => m.measurementType === "initial_cycle_measurement") ?? sortedPrvi[0];
            const finalM = sortedZadnji[sortedZadnji.length - 1];

            if (refM && finalM && refM !== finalM) {
              const refFlow = prviCiklus.zeroMeasurementFlowLMin ?? refM.flowLMin;
              const refPh   = prviCiklus.zeroMeasurementPh ?? getMjerenjePH(refM);
              const refTemp = refM.tempOutC;

              const finFlow = finalM.flowLMin;
              const finPh   = getMjerenjePH(finalM);
              const finTemp = finalM.tempOutC;

              sessionFinalValues = {
                ...(finPh    != null ? { sessionFinalPh:      finPh }    : {}),
                ...(finFlow  != null ? { sessionFinalFlowLMin: finFlow }  : {}),
                ...(finTemp  != null ? { sessionFinalTempOutC: finTemp }  : {}),
                ...(finPh    != null && refPh   != null ? { sessionDeltaPh:       parseFloat((finPh    - refPh).toFixed(2))   } : {}),
                ...(finFlow  != null && refFlow != null ? { sessionDeltaFlowLMin: parseFloat((finFlow  - refFlow).toFixed(2)) } : {}),
                ...(finTemp  != null && refTemp != null ? { sessionDeltaTempOutC: parseFloat((finTemp  - refTemp).toFixed(2)) } : {}),
              };
            }
          }

          // Auto-detektiraj: "zavrseno" ili "uz_upozorenje" ovisno o completion phases
          // Mode A: completionPhases je na zadnjem završenom ciklusu (ne na Sesiji)
          // Mode B: completionPhases je na podsesiji
          const imaisiranje =
            s.workMode === "with_subsessions"
              ? (s.podsesije ?? []).some((p) => p.completionPhases?.ispiranje != null)
              : (() => {
                  const zavrsenCiklusi = (s.ciklusi ?? []).filter((c) => c.status === "zavrsen" || c.status === "prekinut");
                  const zadnji = zavrsenCiklusi[zavrsenCiklusi.length - 1];
                  return zadnji?.completionPhases?.ispiranje != null;
                })();
          const imaNeutralizaciju =
            s.workMode === "with_subsessions"
              ? (s.podsesije ?? []).some((p) => p.completionPhases?.neutralizacija != null)
              : (() => {
                  const zavrsenCiklusi = (s.ciklusi ?? []).filter((c) => c.status === "zavrsen" || c.status === "prekinut");
                  const zadnji = zavrsenCiklusi[zavrsenCiklusi.length - 1];
                  return zadnji?.completionPhases?.neutralizacija != null;
                })();

          const finalStatus: StatusSesije =
            imaisiranje && imaNeutralizaciju ? "zavrseno" : "uz_upozorenje";

          return {
            ...s,
            ...sessionFinalValues,
            status: finalStatus,
            ...(s.reopenedAt ? { completedAt: nowISO() } : {}),
            updatedAt: nowISO(),
          };
        })
      ),
    [updateSesije]
  );

  const pauzirajSesiju = useCallback(
    (sesijaId: string) => postaviStatusSesije(sesijaId, "u_radu"),
    [postaviStatusSesije]
  );

  const nastaviSesiju = useCallback(
    (sesijaId: string) =>
      updateSesije((prev) =>
        prev.map((s) =>
          s.id === sesijaId
            ? {
                ...s,
                previousStatus: s.status,
                reopenedAt: nowISO(),
                status: "u_radu" as const,
                updatedAt: nowISO(),
              }
            : s
        )
      ),
    [updateSesije]
  );

  const zatvoriSesijuNedovrsenu = useCallback(
    (sesijaId: string) => postaviStatusSesije(sesijaId, "nedovrseno"),
    [postaviStatusSesije]
  );

  const obrisiSesiju = useCallback(
    (sesijaId: string) => {
      // Hard-delete: ukloni iz state-a i iz Supabase-a odmah
      updateSesije((prev) => prev.filter((s) => s.id !== sesijaId));
      // Direktno briši iz Supabase (ne čeka updateSesije diff)
      if (!DEMO_IDS.has(sesijaId)) {
        void obrisiSesijuIzPohrane(sesijaId);
      }
      // Očisti history od svih ekrana koji se odnose na obrisanu sesiju
      setHistory((prev) =>
        prev.filter((e) => {
          if (e.ime === "sesija" || e.ime === "setup_ciklus") return e.sesijaId !== sesijaId;
          if (e.ime === "podsesija") return e.sesijaId !== sesijaId;
          return true;
        })
      );
      // Ako je trenutni ekran ta sesija — vrati na povijest
      setEkran((current) => {
        if (
          (current.ime === "sesija" || current.ime === "setup_ciklus") &&
          current.sesijaId === sesijaId
        ) return { ime: "povijest" };
        if (current.ime === "podsesija" && current.sesijaId === sesijaId)
          return { ime: "povijest" };
        return current;
      });
    },
    [updateSesije]
  );

  // ── Simple aliases (declared after all dependencies are in scope) ───────��─
  const createSession = dodajSesiju;
  const deleteSession = obrisiSesiju;
  const createCycle = pokreniCiklusSesije;
  const closeCycle = zavrsiCiklusSesije;
  const addMeasurement = dodajMjerenjeSesije;
  const addTopUp = dodajNadopunuSesije;
  const completeSession = zavrsiSesiju;

  const vratiSesiju = useCallback(
    (sesijaId: string) =>
      updateSesije((prev) =>
        prev.map((s) =>
          s.id === sesijaId
            ? { ...s, isDeleted: false, deletedAt: undefined, updatedAt: nowISO() }
            : s
        )
      ),
    [updateSesije]
  );

  return (
    <AppContext.Provider
      value={{
        sesije,
        ucitavaSe,
        ekran,
        history,
        forwardStack,
        mozeLiNazad: history.length > 0,
        mozeLiNaprijed: forwardStack.length > 0,
        navigiraj,
        nazad,
        naprijed,
        idi_na_pocetni,
        getSesija,
        getPodsesija,
        dodajSesiju,
        postaviWorkMode,
        dodajPodsesiju,
        urediPodsesiju,
        zavrsiPodsesiju,
        zavrsiPodsesijuUzUpozorenje,
        pokreniCiklus,
        zavrsiCiklus,
        prekinutiCiklus,
        prekinutiCiklusSesije,
        azurirajStatusCiklusa,
        azurirajStatusCiklusaSesije,
        dodajMjerenje,
        dodajNadopunu,
        dodajOdlukuCiklusa,
        pokreniCiklusSesije,
        zavrsiCiklusSesije,
        dodajMjerenjeSesije,
        dodajNadopunuSesije,
        azurirajCompletionPhasesSesije,
        azurirajCompletionPhasesCiklusa,
        postaviStatusSesije,
        zavrsiSesiju,
        pauzirajSesiju,
        nastaviSesiju,
        zatvoriSesijuNedovrsenu,
        obrisiSesiju,
        vratiSesiju,
        // English API
        createSession,
        updateSession,
        deleteSession,
        createCycle,
        updateCycle,
        closeCycle,
        addMeasurement,
        addTopUp,
        completeRinsing,
        completeNeutralization,
        completeSession,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp mora biti unutar AppProvider-a");
  return ctx;
}
