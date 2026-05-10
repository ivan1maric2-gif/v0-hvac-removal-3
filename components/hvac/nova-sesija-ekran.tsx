"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/app-state";
import type { Sesija, SystemCategory } from "@/lib/types";
import { genId, nowISO } from "@/lib/utils";

// ─── Konstante ────────────────────────────────────────────────────────────────

const UREDJAJI = [
  "Izmjenjivač",
  "Spiralni izmjenjivač",
  "Pločasti izmjenjivač",
  "Spremnik",
  "Boiler",
  "Kotao",
  "Cjevovod",
  "Solarni krug",
  "Dizalica topline",
  "Drugo",
] as const;

type NazivUredjaja = (typeof UREDJAJI)[number];

const TIP_SUSTAVA: { id: SystemCategory; label: string; helper: string; sublabel: string }[] = [
  {
    id: "dhw_potable",
    label: "PTV / TPV",
    helper: "topla potrošna voda",
    sublabel: "Izmjenjivači, spremnici, bojleri, spirale",
  },
  {
    id: "technical_water",
    label: "Tehnička voda",
    helper: "grijanje / hlađenje / tehnološki sustav",
    sublabel: "Zatvoreni krug, fancoil, chiller, solar",
  },
];

// Automatski tip sustava iz naziva uređaja
function inferTipSustava(uredjaj: NazivUredjaja | null): SystemCategory | null {
  if (!uredjaj) return null;
  if (["Izmjenjivač", "Spiralni izmjenjivač", "Pločasti izmjenjivač", "Spremnik", "Boiler"].includes(uredjaj))
    return "dhw_potable";
  if (["Solarni krug", "Dizalica topline"].includes(uredjaj)) return "technical_water";
  if (uredjaj === "Kotao") return "technical_water";
  return null;
}

const VRSTA_PROBLEMA = ["Kamenac", "Mulj", "Biofilm", "Korozija", "Drugo"] as const;
type VrstaProblema = (typeof VRSTA_PROBLEMA)[number];

type WorkMode = "no_subsessions" | "with_subsessions";
type Korak = "odabir_nacina" | "forma";

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function SekcijaHeader({ label }: { label: string }) {
  return (
    <div className="pt-7 pb-4">
      <h2 className="text-xl font-black text-foreground leading-tight">{label}</h2>
    </div>
  );
}

function Field({
  label,
  optional,
  required,
  children,
}: {
  label: string;
  optional?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </span>
        {optional && (
          <span className="text-xs text-muted-foreground/45 font-normal">opcionalno</span>
        )}
      </div>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all";

type RadioItem = { label: string; ima: boolean };

function RadioKartica({
  selected,
  onSelect,
  title,
  description,
  items,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  items: RadioItem[];
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 px-4 py-4 transition-all active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/8"
          : "border-border bg-card hover:border-muted-foreground/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground mb-1">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{description}</p>

          {/* Checklist — ima / nema */}
          <div className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.ima ? (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                ) : (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-muted/60 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/40">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </span>
                )}
                <span className={`text-xs ${item.ima ? "text-foreground/80 font-medium" : "text-muted-foreground/50"}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Radio circle */}
        <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/30"
        }`}>
          {selected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NovaSesijaEkran() {
  const { navigiraj, dodajSesiju, sesije } = useApp();

  // ───────────────────────────────────────────────────────────────────────────
  // SEKCIJA 1 — BASIC INFO
  // ───────────────────────────────────────────────────────────────────────────
  const [nazivObjekta, setNazivObjekta] = useState("");
  const [lokacija, setLokacija] = useState("");
  const [tehniker, setTehniker] = useState("");

  // ───────────────────────────────────────────────────────────────────────────
  // SEKCIJA 2 — SYSTEM TYPE
  // ───────────────────────────────────────────────────────────────────────────
  const [tipSustava, setTipSustava] = useState<SystemCategory | null>(null);
  const [cilj, setCilj] = useState<string | null>(null);
  const [ciljOpis, setCiljOpis] = useState("");

  // ───────────────────────────────────────────────────────────────────────────
  // SEKCIJA 3 — TECHNICAL DATA
  // ───────────────────────────────────────────────────────────────────────────
  const [procijenjeniVolumen, setProcijenjeniVolumen] = useState("");
  const [materijali, setMaterijali] = useState<string[]>([]);

  // ───────────────────────────────────────────────────────────────────────────
  // SEKCIJA 4 — INITIAL SYSTEM STATE (optional)
  // ───────────────────────────────────────────────────────────────────────────
  const [protokPrije, setProtokPrije] = useState("");
  const [tempPrije, setTempPrije] = useState("");
  const [phPrije, setPhPrije] = useState("");

  // ───────────────────────────────────────────────────────────────────────────
  // AUTO-PREFILL — svi useState zajedno na vrhu, useEffect ispod
  // ───────────────────────────────────────────────────────────────────────────
  const [autoPopunjeno, setAutoPopunjeno] = useState(false);

  // Auto-prefill — kada serviser upiše naziv objekta i lokaciju, traži prethodnu sesiju
  useEffect(() => {
    const naziv = nazivObjekta.trim().toLowerCase();
    const lok = lokacija.trim().toLowerCase();

    if (naziv.length < 3 && lok.length < 3) {
      setAutoPopunjeno(false);
      return;
    }

    // Traži najnoviju sesiju koja odgovara nazivu objekta ili lokaciji
    const prethodna = sesije
      .filter((s) => !s.isDemo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((s) => {
        const sNaziv = (s.naziv_objekta ?? "").toLowerCase();
        const sLok = (s.lokacija ?? "").toLowerCase();
        return (
          (naziv.length >= 3 && sNaziv.includes(naziv)) ||
          (lok.length >= 3 && sLok.includes(lok))
        );
      });

    if (!prethodna) {
      setAutoPopunjeno(false);
      return;
    }

    // Popuni samo prazna polja — ne prepiši ono što je serviser već upisao
    let popunjeno = false;

    if (!tipSustava && prethodna.systemCategory) {
      setTipSustava(prethodna.systemCategory);
      popunjeno = true;
    }

    if (!cilj && !ciljOpis) {
      // Pokušaj izvući cilj iz opis_problema
      const opisDijelovi = (prethodna.opis_problema ?? "").split(" — ");
      const mogucCilj = opisDijelovi[0]?.trim();
      if (mogucCilj && mogucCilj.length > 0) {
        setCiljOpis(mogucCilj);
        popunjeno = true;
      }
    }

    if (!procijenjeniVolumen) {
      // Pokušaj izvući volumen iz opis_problema (npr. "55 L")
      const volumenMatch = (prethodna.opis_problema ?? "").match(/(\d+(?:\.\d+)?)\s*L/);
      if (volumenMatch) {
        setProcijenjeniVolumen(volumenMatch[1]);
        popunjeno = true;
      }
    }

    if (materijali.length === 0) {
      // Pokušaj izvući materijale iz opis_problema (npr. "Materijali: Bakar, Čelik")
      const materijaliMatch = (prethodna.opis_problema ?? "").match(/Materijali:\s*(.+?)(?:\s*—|$)/);
      if (materijaliMatch) {
        const listaIzPrethodne = materijaliMatch[1].split(",").map((m) => m.trim()).filter(Boolean);
        if (listaIzPrethodne.length > 0) {
          setMaterijali(listaIzPrethodne);
          popunjeno = true;
        }
      }
    }

    setAutoPopunjeno(popunjeno);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nazivObjekta, lokacija]);

  // Validacija
  // cilj je validan ako je odabran iz liste ILI ako je serviser upisao vlastiti opis
  const ciljValidan = cilj !== null || ciljOpis.trim().length > 0;

  const canSubmit =
    nazivObjekta.trim().length > 0 &&
    lokacija.trim().length > 0 &&
    tipSustava !== null &&
    ciljValidan &&
    procijenjeniVolumen.trim().length > 0 &&
    materijali.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !tipSustava || !ciljValidan) return;

    const now = nowISO();

    const novaSesija: Sesija = {
      id: genId("ses"),
      naziv_objekta: nazivObjekta.trim(),
      lokacija: lokacija.trim(),
      datum: new Date().toISOString().slice(0, 10),
      serviser: tehniker.trim(),
      kontakt_osoba: "",
      opis_problema: [cilj, ciljOpis.trim(), `${procijenjeniVolumen} L`, `Materijali: ${materijali.join(", ")}`].filter(Boolean).join(" — "),
      status: "u_radu",
      workMode: "no_subsessions",
      cleaningMode: "descaling",
      systemCategory: tipSustava,
      podsesije: [],
      ciklusi: [],
      createdAt: now,
      updatedAt: now,
    };

    dodajSesiju(novaSesija);
    navigiraj({ ime: "setup_ciklus", sesijaId: novaSesija.id });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // RENDER — 5 SEKCIJA + SUBMIT
  // ──────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 bg-background">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground">Nova sesija</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto w-full px-4 pb-10">

          {/* ───────────────────────────────────────────────────────────────────
              SEKCIJA 1 — BASIC INFO
          ─────────────────────────────────────────────────────────────────── */}
          <SekcijaHeader label="Osnovni podaci" />
          <div className="flex flex-col gap-4 pb-6">
            <Field label="Naziv objekta" required>
              <input
                type="text"
                value={nazivObjekta}
                onChange={(e) => setNazivObjekta(e.target.value)}
                placeholder="npr. Hotel Casino, Plitvička jezera"
                autoFocus
                className={inputCls}
              />
            </Field>
            <Field label="Lokacija" required>
              <input
                type="text"
                value={lokacija}
                onChange={(e) => setLokacija(e.target.value)}
                placeholder="npr. Slavonska, Zagreb"
                className={inputCls}
              />
            </Field>
            <Field label="Tehniker" optional>
              <input
                type="text"
                value={tehniker}
                onChange={(e) => setTehniker(e.target.value)}
                placeholder="npr. Ivan, Marko"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Info poruka za auto-prefill — mala, neutralna, neinvazivna */}
          {autoPopunjeno && (
            <p className="text-xs text-muted-foreground mb-4 px-1 leading-relaxed">
              Podaci su automatski učitani iz prethodne sesije i mogu se promijeniti po potrebi.
            </p>
          )}

          <div className="h-px bg-border/60 mb-1" />

          {/* ───────────────────────────────────────────────────────────────────
              SEKCIJA 2 — SYSTEM TYPE
          ─────────────────────────────────────────────────────────────────── */}
          <SekcijaHeader label="Tip sustava" />
          <div className="flex flex-col gap-4 pb-6">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Vrsta sustava <span className="text-primary">*</span>
              </legend>
              <div className="flex flex-col gap-2">
                {TIP_SUSTAVA.map((tip) => {
                  const selected = tipSustava === tip.id;
                  return (
                    <button
                      key={tip.id}
                      type="button"
                      onClick={() => setTipSustava(tip.id)}
                      className={`w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all active:scale-[0.99] ${
                        selected
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-card text-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight">{tip.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tip.sublabel}</p>
                        </div>
                        <span className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selected ? "border-primary bg-primary" : "border-border"
                        }`}>
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                              <polyline points="2 5 4 7 8 3" />
                            </svg>
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field label="Cilj čišćenja" required>
              <div className="relative">
                <select
                  value={cilj ?? ""}
                  onChange={(e) => setCilj(e.target.value)}
                  className={`w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base appearance-none pr-10 cursor-pointer focus:outline-none focus:border-primary transition-all ${
                    !cilj ? "text-muted-foreground/40" : "text-foreground"
                  }`}
                >
                  <option value="">Odaberi cilj čišćenja...</option>
                  <option value="Heat exchanger">Izmjenjivač topline</option>
                  <option value="Tank">Spremnik / bojler</option>
                  <option value="Installation">Instalacija</option>
                  <option value="DHW installation">Instalacija PTV</option>
                  <option value="Heating system">Grijanje</option>
                  <option value="Underfloor heating">Podno grijanje</option>
                  <option value="Solar system">Solarni sustav</option>
                  <option value="Condenser">Kondenzator</option>
                  <option value="Evaporator">Isparivač</option>
                  <option value="Heat pump">Toplinska pumpa</option>
                  <option value="HVAC system">HVAC sustav</option>
                  <option value="Pipework">Cjevovod</option>
                  <option value="Fan coil">Fan coil</option>
                  <option value="Boiler">Kotao</option>
                  <option value="Multiple components">Više komponenti</option>
                  <option value="Other">Ostalo</option>
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
                  <ChevronDown />
                </span>
              </div>
              {/* Slobodan unos — uvijek vidljiv za dodatni opis */}
              <input
                type="text"
                value={ciljOpis}
                onChange={(e) => setCiljOpis(e.target.value)}
                placeholder="Vlastita napomena (npr. bojler 500L, izmjenjivač pločasti...)"
                className={`${inputCls} mt-2 text-sm`}
              />
            </Field>
          </div>

          <div className="h-px bg-border/60 mb-1" />

          {/* ───────────────────────────────────────────────────────────────────
              SEKCIJA 3 — TECHNICAL DATA
          ─────────────────��───────────────────────────────────────────────── */}
          <SekcijaHeader label="Tehnički podaci" />
          <div className="flex flex-col gap-4 pb-6">
            <Field label="Procijenjeni volumen sustava" required>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={procijenjeniVolumen}
                  onChange={(e) => setProcijenjeniVolumen(e.target.value)}
                  placeholder="npr. 55"
                  min="0"
                  step="0.1"
                  className={`${inputCls} flex-1`}
                />
                <span className="text-sm font-bold text-muted-foreground shrink-0">L</span>
              </div>
            </Field>

            <Field label="Materijali sustava" required>
              <div className="grid grid-cols-2 gap-2">
                {["Nehrđajući čelik", "Bakar", "Mesing", "Čelik", "Aluminij", "Plastika", "Miješani materijali"].map((mat) => {
                  const isSelected = materijali.includes(mat);
                  return (
                    <button
                      key={mat}
                      type="button"
                      onClick={() =>
                        setMaterijali(
                          isSelected
                            ? materijali.filter((m) => m !== mat)
                            : [...materijali, mat]
                        )
                      }
                      className={`rounded-xl border-2 py-2.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                        isSelected
                          ? "border-primary bg-primary/8 text-primary"
                          : "border-border bg-card text-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      {mat}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="h-px bg-border/60 mb-1" />

          {/* ───────────────────────────────────────────────────────────────────
              SEKCIJA 4 — INITIAL SYSTEM STATE (optional)
          ─────────────────────────────────────────────────────────────────── */}
          <SekcijaHeader label="Stanje sustava prije čišćenja (informaciono)" />
          <div className="flex flex-col gap-3 pb-6 bg-muted/10 border border-muted/30 rounded-xl p-4">
            <div className="flex gap-3">
              <Field label="Protok" optional>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={protokPrije}
                    onChange={(e) => setProtokPrije(e.target.value)}
                    placeholder="npr. 15"
                    min="0"
                    step="0.1"
                    className={`${inputCls} flex-1`}
                  />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">L/min</span>
                </div>
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label="Temperatura OUT" optional>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempPrije}
                    onChange={(e) => setTempPrije(e.target.value)}
                    placeholder="npr. 55"
                    min="0"
                    step="0.1"
                    className={`${inputCls} flex-1`}
                  />
                  <span className="text-xs font-bold text-muted-foreground shrink-0">°C</span>
                </div>
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label="pH" optional>
                <input
                  type="number"
                  value={phPrije}
                  onChange={(e) => setPhPrije(e.target.value)}
                  placeholder="npr. 7.2"
                  min="0"
                  max="14"
                  step="0.1"
                  className={`${inputCls} flex-1`}
                />
              </Field>
            </div>
          </div>

          <div className="h-px bg-border/60 mb-1" />

          {/* ───────────────────────────────────────────────────────────────────
              SEKCIJA 5 — STATUS
          ─────────────────────────────────────────────────────────────────── */}
          <SekcijaHeader label="Status" />
          <div className="flex flex-col gap-2 pb-6">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l3 3 5-5" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Sesija je otvorena</p>
                <p className="text-xs text-muted-foreground">Sustav je spreman za pokretanje ciklusa</p>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────────
              BUTTON — START CYCLE
          ─────────────────────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm"
            style={{ minHeight: 56 }}
          >
            Pokreni prvi ciklus
          </button>

        </form>
      </main>
    </div>
  );
}
