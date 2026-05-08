"use client";

import { useState } from "react";
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
  const { navigiraj, dodajSesiju } = useApp();

  const [korak, setKorak] = useState<Korak>("odabir_nacina");
  const [workMode, setWorkMode] = useState<WorkMode>("no_subsessions");

  // Zajednička polja
  const [nazivSesije, setNazivSesije] = useState("");
  const [lokacija, setLokacija] = useState("");

  // Uređaj & problem — zajednički
  const [odabraniUredjaj, setOdabraniUredjaj] = useState<NazivUredjaja | null>(null);
  const [drugiUredjajNaziv, setDrugiUredjajNaziv] = useState("");
  const [vrstaProblema, setVrstaProblema] = useState<VrstaProblema | null>(null);

  // Tip sustava — automatski iz uređaja, ali mo��e se promijeniti
  const [tipSustavaOverride, setTipSustavaOverride] = useState<SystemCategory | null>(null);
  const tipSustava = tipSustavaOverride ?? inferTipSustava(odabraniUredjaj);

  // Samo za with_subsessions — detaljni podaci
  const [adresa, setAdresa] = useState("");
  const [narucitelj, setNarucitelj] = useState("");
  const [serviser, setServiser] = useState("");
  const [opisProblema, setOpisProblema] = useState("");
  const [showNapredno, setShowNapredno] = useState(false);

  const nazivUredjajaFinal =
    odabraniUredjaj === "Drugo" ? drugiUredjajNaziv.trim() : odabraniUredjaj ?? "";

  // Validacija — minimalni (no_subsessions)
  const canSubmitJedni =
    nazivSesije.trim().length > 0 &&
    odabraniUredjaj !== null &&
    (odabraniUredjaj !== "Drugo" || drugiUredjajNaziv.trim().length > 0) &&
    vrstaProblema !== null;

  // Validacija — detaljni (with_subsessions)
  const canSubmitVise =
    canSubmitJedni &&
    tipSustava !== null;

  const canSubmit = workMode === "no_subsessions" ? canSubmitJedni : canSubmitVise;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !vrstaProblema) return;

    const now = nowISO();
    const resolvedTip: SystemCategory = tipSustava ?? "dhw_potable";

    const novaSesija: Sesija = {
      id: genId("ses"),
      naziv_objekta: nazivSesije.trim(),
      adresa: adresa.trim() || undefined,
      narucitelj: narucitelj.trim() || undefined,
      lokacija: lokacija.trim(),
      datum: new Date().toISOString().slice(0, 10),
      serviser: serviser.trim(),
      kontakt_osoba: "",
      opis_problema: [nazivUredjajaFinal, opisProblema.trim() || vrstaProblema]
        .filter(Boolean)
        .join(" — "),
      status: "u_radu",
      workMode,
      cleaningMode: "descaling",
      systemCategory: resolvedTip,
      podsesije: [],
      ciklusi: [],
      createdAt: now,
      updatedAt: now,
    };

    dodajSesiju(novaSesija);

    if (workMode === "no_subsessions") {
      navigiraj({ ime: "setup_ciklus", sesijaId: novaSesija.id });
    } else {
      navigiraj({ ime: "sesija", sesijaId: novaSesija.id });
    }
  }

  // ── Korak 1 — Odabir načina rada ─────────────────────────────────────────────
  if (korak === "odabir_nacina") {
    return (
      <div className="flex flex-col flex-1 bg-background">
        <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Nova sesija</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto w-full px-4 pb-10">

            {/* Podaci sesije — odmah na prvom koraku */}
            <SekcijaHeader label="Podaci sesije" />
            <div className="flex flex-col gap-4 pb-6">
              <Field label="Naziv sesije" required>
                <input
                  type="text"
                  value={nazivSesije}
                  onChange={(e) => setNazivSesije(e.target.value)}
                  placeholder="npr. Boiler PTV, Auto kamp Plitvice..."
                  autoFocus
                  className={inputCls}
                />
              </Field>
              <Field label="Lokacija / objekt" optional>
                <input
                  type="text"
                  value={lokacija}
                  onChange={(e) => setLokacija(e.target.value)}
                  placeholder="npr. PTV kotlovnica, Objekt A, 3. kat"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="h-px bg-border/60 mb-1" />
            <SekcijaHeader label="Što čistite?" />

            <div className="flex flex-col gap-3">
              <RadioKartica
                selected={workMode === "no_subsessions"}
                onSelect={() => setWorkMode("no_subsessions")}
                title="Jedan uređaj"
                description="Posao se vodi direktno u sesiji. Ciklusi, mjerenja i nadopune pripadaju ovom uređaju."
                items={[
                  { label: "Ciklusi i mjerenja direktno u sesiji", ima: true },
                  { label: "Nadopune kemije po ciklusima", ima: true },
                  { label: "Referentno mjerenje i LIVE praćenje", ima: true },
                  { label: "Dijelovi sustava (podsesije)", ima: false },
                ]}
              />
              <RadioKartica
                selected={workMode === "with_subsessions"}
                onSelect={() => setWorkMode("with_subsessions")}
                title="Više uređaja / podsesije"
                description="Svaki uređaj je zasebna podsesija sa vlastitim ciklusima, mjerenjima i volumenom kemije."
                items={[
                  { label: "Dijelovi sustava (podsesije)", ima: true },
                  { label: "Ciklusi i mjerenja po svakom dijelu", ima: true },
                  { label: "Referentno mjerenje i LIVE praćenje", ima: true },
                  { label: "Zajednički izvještaj za cijeli sustav", ima: true },
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() => setKorak("forma")}
              className="mt-8 w-full bg-primary text-primary-foreground rounded-xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Nastavi
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Korak 2 — Forma ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-background">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button
          type="button"
          onClick={() => setKorak("odabir_nacina")}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors -ml-1"
          aria-label="Natrag"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight">
            {workMode === "no_subsessions" ? "Jedan uređaj" : "Više uređaja"}
          </h1>
          <p className="text-xs text-muted-foreground">Nova sesija</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto w-full px-4 pb-10">

          {/* ─────────────────────────────────────────────────────────────────
              SAŽETAK SESIJE — podaci uneseni u koraku 1
          ───────────────────────────────────────────────────────────────── */}
          <div className="py-4 px-4 mb-2 bg-muted/30 rounded-2xl border border-border/60 flex flex-col gap-0.5 mt-5">
            <p className="text-xs text-muted-foreground font-medium">Sesija</p>
            <p className="text-base font-bold text-foreground leading-snug">
              {nazivSesije || <span className="text-muted-foreground/40 font-normal italic">bez naziva</span>}
            </p>
            {lokacija && (
              <p className="text-xs text-muted-foreground">{lokacija}</p>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              DODATNA POLJA — samo za with_subsessions
          ───────────────────────────────────────────────────────────���───── */}
          {workMode === "with_subsessions" && (
            <div className="flex flex-col gap-5 pb-6 border-t border-border/60 pt-6">
              <Field label="Adresa" optional>
                <input
                  type="text"
                  value={adresa}
                  onChange={(e) => setAdresa(e.target.value)}
                  placeholder="npr. Plitvička jezera 12"
                  className={inputCls}
                />
              </Field>

              <Field label="Naručitelj radova" optional>
                <input
                  type="text"
                  value={narucitelj}
                  onChange={(e) => setNarucitelj(e.target.value)}
                  placeholder="npr. Hotel Plitvice d.o.o."
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              UREĐAJ & PROBLEM
          ───────────────────────────────────────────────────────────────── */}
          <div className="border-t border-border/60 pt-2">
            <SekcijaHeader label="Uređaj & problem" />
          </div>

          <div className="flex flex-col gap-6 pb-6">
            {/* Naziv uređaja — dropdown */}
            <Field label="Naziv uređaja" required>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <select
                    value={odabraniUredjaj ?? ""}
                    onChange={(e) => {
                      const val = e.target.value as NazivUredjaja | "";
                      setOdabraniUredjaj(val === "" ? null : val);
                      setTipSustavaOverride(null); // resetiraj override
                      if (val !== "Drugo") setDrugiUredjajNaziv("");
                    }}
                    className={`w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base appearance-none pr-10 cursor-pointer focus:outline-none focus:border-primary transition-all ${
                      !odabraniUredjaj ? "text-muted-foreground/40" : "text-foreground"
                    }`}
                  >
                    <option value="" disabled>Odaberi uređaj...</option>
                    {UREDJAJI.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none">
                    <ChevronDown />
                  </span>
                </div>

                {odabraniUredjaj === "Drugo" && (
                  <input
                    type="text"
                    value={drugiUredjajNaziv}
                    onChange={(e) => setDrugiUredjajNaziv(e.target.value)}
                    placeholder="Upiši naziv uređaja..."
                    autoFocus
                    className={inputCls}
                  />
                )}
              </div>
            </Field>

            {/* Vrsta problema */}
            <Field label="Vrsta problema" required>
              <div className="grid grid-cols-2 gap-2">
                {VRSTA_PROBLEMA.map((v) => {
                  const isSelected = vrstaProblema === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVrstaProblema(v)}
                      className={`rounded-xl border-2 py-3.5 text-sm font-semibold transition-all active:scale-[0.98] ${
                        isSelected
                          ? "border-primary bg-primary/8 text-primary"
                          : "border-border bg-card text-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Tip sustava — automatski + override */}
            <Field
              label="Tip sustava"
              required={workMode === "with_subsessions"}
            >
              {/* Automatski zaključen */}
              {tipSustava && !tipSustavaOverride && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border mb-2">
                  <span className="text-xs text-muted-foreground">
                    Automatski zaključeno:
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {TIP_SUSTAVA.find((t) => t.id === tipSustava)?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTipSustavaOverride(tipSustava === "dhw_potable" ? "dhw_potable" : "technical_water")}
                    className="ml-auto text-[11px] text-primary underline underline-offset-2"
                  >
                    Promijeni
                  </button>
                </div>
              )}

              {/* Odabir — prikaži ako nema auto zaključka ili ako korisnik želi promijeniti */}
              {(!tipSustava || tipSustavaOverride !== null) && (
                <div className="flex flex-col gap-2">
                  {TIP_SUSTAVA.map((tip) => {
                    const isSelected = tipSustava === tip.id;
                    return (
                      <button
                        key={tip.id}
                        type="button"
                        onClick={() => setTipSustavaOverride(tip.id)}
                        className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all active:scale-[0.99] ${
                          isSelected
                            ? "border-primary bg-primary/8"
                            : "border-border bg-card hover:border-muted-foreground/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-sm font-bold text-foreground">{tip.label}</span>
                              <span className="text-[11px] text-muted-foreground">— {tip.helper}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/55 mt-0.5">{tip.sublabel}</p>
                          </div>
                          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                          }`}>
                            {isSelected && <Check />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              NAPREDNE POSTAVKE (collapsed) — serviser, napomene
          ───────────────────────────────────────────────────────────────── */}
          <div className="border-t border-border/60 py-5">
            <button
              type="button"
              onClick={() => setShowNapredno((v) => !v)}
              className="flex items-center gap-3 w-full text-left group"
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                className={`shrink-0 text-muted-foreground transition-transform ${showNapredno ? "rotate-90" : ""}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-base font-bold text-foreground">Napredne postavke</span>
              <span className="text-xs text-muted-foreground/50 font-normal">serviser, napomene</span>
            </button>

            {showNapredno && (
              <div className="mt-4 flex flex-col gap-4">
                <Field label="Serviser" optional>
                  <input
                    type="text"
                    value={serviser}
                    onChange={(e) => setServiser(e.target.value)}
                    placeholder="Ime i prezime"
                    className={inputCls}
                  />
                </Field>

                <Field label="Tehničke napomene" optional>
                  <textarea
                    value={opisProblema}
                    onChange={(e) => setOpisProblema(e.target.value)}
                    placeholder="Materijal sustava, procijenjeni volumen, dodatne napomene..."
                    rows={3}
                    className="w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary resize-none transition-all"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* ─── Submit ───────────────────────────────────────────────────────── */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Pokreni sesiju
            </button>
            {!canSubmit && (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                {!nazivSesije.trim()
                  ? "Upiši naziv sesije"
                  : !odabraniUredjaj
                  ? "Odaberi uređaj"
                  : odabraniUredjaj === "Drugo" && !drugiUredjajNaziv.trim()
                  ? "Upiši naziv uređaja"
                  : !vrstaProblema
                  ? "Odaberi vrstu problema"
                  : workMode === "with_subsessions" && !tipSustava
                  ? "Odaberi tip sustava"
                  : "Popuni obavezna polja"}
              </p>
            )}
          </div>

        </form>
      </main>
    </div>
  );
}
