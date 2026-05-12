"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-state";
import type { Sesija, SystemCategory } from "@/lib/types";
import { genId, nowISO } from "@/lib/utils";

// ─── Konstante ────────────────────────────────────────────────────────────────

// Predmet čišćenja — quick-select
const PREDMET_CISCENJA = [
  "PTV izmjenjivač",
  "Spremnik",
  "Kotao",
  "Cijevni razvod",
  "Solar",
  "Dizalica topline",
  "Ostalo",
] as const;
type PredmetCiscenja = (typeof PREDMET_CISCENJA)[number];

// Vrsta sustava — quick-select (mapira na SystemCategory)
const VRSTA_SUSTAVA: { label: string; id: SystemCategory }[] = [
  { label: "PTV", id: "dhw_potable" },
  { label: "Tehnička voda", id: "technical_water" },
  { label: "Grijanje", id: "technical_water" },
  { label: "Hlađenje", id: "technical_water" },
  { label: "Solar", id: "technical_water" },
];

// Vrsta problema — multiselect
const VRSTA_PROBLEMA_OPCIJE = [
  "Slab protok",
  "Kamenac",
  "Slab prijenos topline",
  "Začepljenje",
  "Preventivno",
  "Ostalo",
] as const;
type VrstaProblema = (typeof VRSTA_PROBLEMA_OPCIJE)[number];

// Volumen — quick buttons
const VOLUMEN_OPCIJE = [10, 25, 50, 100, 250] as const;

// Materijali — multiselect chips
const MATERIJALI_OPCIJE = [
  "Inox",
  "Bakar",
  "Mesing",
  "Čelik",
  "Aluminij",
  "Plastika/guma",
] as const;
type Materijal = (typeof MATERIJALI_OPCIJE)[number];

type WorkMode = "no_subsessions" | "with_subsessions";

// ─── UI Helpers ───────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all";

function Field({
  label,
  optional,
  required,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground/80">
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </span>
        {optional && (
          <span className="text-xs text-muted-foreground/45 font-normal">opcionalno</span>
        )}
      </div>
      {hint && (
        <p className="text-[11px] text-muted-foreground/60 leading-snug -mt-1">{hint}</p>
      )}
      {children}
    </div>
  );
}

function ChipBtn({
  label,
  selected,
  onClick,
  variant = "default",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  variant?: "default" | "small";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 font-semibold transition-all active:scale-[0.97] text-left ${
        variant === "small" ? "px-3 py-2.5 text-sm" : "px-4 py-3.5 text-sm"
      } ${
        selected
          ? "border-primary bg-primary/8 text-primary"
          : "border-border bg-card text-foreground hover:border-muted-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

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
        <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/30"
        }`}>
          {selected && <Check />}
        </div>
      </div>
    </button>
  );
}

// ─── Collapsible sekcija ──────────────────────────────────────────────────────

function CollapsibleSekcija({
  label,
  hint,
  children,
  defaultOpen = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/60 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 w-full text-left px-4 py-4 bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm font-bold text-foreground">{label}</span>
        {hint && (
          <span className="text-xs text-muted-foreground/50 font-normal">{hint}</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground/40">
          {open ? "zatvori" : "otvori"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-5 pt-4 flex flex-col gap-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NovaSesijaEkran() {
  const { navigiraj, dodajSesiju } = useApp();

  const [workMode, setWorkMode] = useState<WorkMode>("no_subsessions");

  // 1. Naziv sesije / objekta
  const [nazivSesije, setNazivSesije] = useState("");

  // 2. Adresa
  const [adresa, setAdresa] = useState("");

  // 3. Investitor / klijent
  const [narucitelj, setNarucitelj] = useState("");

  // 4. Predmet čišćenja
  const [predmetCiscenja, setPredmetCiscenja] = useState<PredmetCiscenja | null>(null);
  const [predmetOstaloNaziv, setPredmetOstaloNaziv] = useState("");

  // 5. Vrsta sustava
  const [odabranaVrstaSustava, setOdabranaVrstaSustava] = useState<string | null>(null);
  const tipSustava: SystemCategory =
    VRSTA_SUSTAVA.find((v) => v.label === odabranaVrstaSustava)?.id ?? "dhw_potable";

  // 6. Vrsta problema — multiselect
  const [odabraniProblemi, setOdabraniProblemi] = useState<VrstaProblema[]>([]);
  const [problemOstaloTekst, setProblemOstaloTekst] = useState("");

  // 7. Volumen vode
  const [volumen, setVolumen] = useState<number | null>(null);
  const [volumenRucni, setVolumenRucni] = useState("");
  const [volumenRucnoMode, setVolumenRucnoMode] = useState(false);

  // 8. Materijali
  const [odabraniMaterijali, setOdabraniMaterijali] = useState<Materijal[]>([]);

  // 9. Početne informativne vrijednosti
  const [pocetniPh, setPocetniPh] = useState("");
  const [pocetniProtok, setPocetniProtok] = useState("");
  const [pocetniTemp, setPocetniTemp] = useState("");

  // 10. Napomena servisera
  const [napomena, setNapomena] = useState("");

  // Završeno stanje — prikaži poruku
  const [sesijaPokrenuta, setSesijaPokrenuta] = useState(false);
  const [novaSesijaId, setNovaSesijaId] = useState<string | null>(null);

  // Toggle materijal
  function toggleMaterijal(m: Materijal) {
    setOdabraniMaterijali((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  // Toggle problem
  function toggleProblem(v: VrstaProblema) {
    setOdabraniProblemi((prev) => {
      const already = prev.includes(v);
      if (already && v === "Ostalo") setProblemOstaloTekst("");
      return already ? prev.filter((x) => x !== v) : [...prev, v];
    });
  }

  // Validacija — naziv objekta + predmet čišćenja obvezni
  const canSubmit =
    nazivSesije.trim().length > 0 &&
    predmetCiscenja !== null &&
    (predmetCiscenja !== "Ostalo" || predmetOstaloNaziv.trim().length > 0) &&
    odabraniProblemi.length > 0;

  const validationMsg = !nazivSesije.trim()
    ? "Upiši naziv objekta"
    : !predmetCiscenja
    ? "Odaberi predmet čišćenja"
    : predmetCiscenja === "Ostalo" && !predmetOstaloNaziv.trim()
    ? "Upiši naziv predmeta čišćenja"
    : odabraniProblemi.length === 0
    ? "Odaberi vrstu problema"
    : null;

  const predmetFinal =
    predmetCiscenja === "Ostalo"
      ? predmetOstaloNaziv.trim()
      : predmetCiscenja ?? "";

  const volumenFinal = volumenRucnoMode
    ? parseFloat(volumenRucni) || null
    : volumen;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const now = nowISO();
    const problemiLabel = odabraniProblemi
      .map((p) => (p === "Ostalo" && problemOstaloTekst.trim() ? `Ostalo: ${problemOstaloTekst.trim()}` : p))
      .join(", ");

    const opisDijelovi = [
      predmetFinal,
      odabranaVrstaSustava,
      problemiLabel,
      napomena.trim() || null,
    ].filter(Boolean);

    const novaSesija: Sesija = {
      id: genId("ses"),
      naziv_objekta: nazivSesije.trim(),
      adresa: adresa.trim() || undefined,
      narucitelj: narucitelj.trim() || undefined,
      lokacija: [predmetFinal, odabranaVrstaSustava].filter(Boolean).join(" / "),
      datum: new Date().toISOString().slice(0, 10),
      serviser: "",
      kontakt_osoba: "",
      opis_problema: opisDijelovi.join(" — "),
      status: "u_radu",
      workMode,
      cleaningMode: "descaling",
      systemCategory: tipSustava,
      podsesije: [],
      ciklusi: [],
      createdAt: now,
      updatedAt: now,
    };

    dodajSesiju(novaSesija);
    setNovaSesijaId(novaSesija.id);
    setSesijaPokrenuta(true);
  }

  // ── Poruka nakon otvaranja sesije ─────────────────────────────────────────────
  if (sesijaPokrenuta && novaSesijaId) {
    return (
      <div className="flex flex-col flex-1 bg-background">
        <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Nova sesija</h1>
        </header>
        <main className="flex-1 overflow-y-auto flex items-center justify-center px-6">
          <div className="max-w-sm w-full text-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="text-xl font-black text-foreground mb-2 leading-snug break-words">
              {nazivSesije}
            </p>
            <p className="text-sm text-muted-foreground mb-1">{predmetFinal}</p>
            <div className="mt-4 mb-8 bg-muted/30 border border-border/60 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-foreground">Sesija je otvorena.</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Sljedeci korak: Pokreni ciklus #1.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (workMode === "no_subsessions") {
                  navigiraj({ ime: "setup_ciklus", sesijaId: novaSesijaId });
                } else {
                  navigiraj({ ime: "sesija", sesijaId: novaSesijaId });
                }
              }}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Pokreni ciklus #1
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Forma ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-background">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button
          type="button"
          onClick={() => navigiraj({ ime: "pocetni" })}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors -ml-1"
          aria-label="Natrag"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-foreground">Nova sesija</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto w-full px-4 pb-10">

          {/* ── 1. NAZIV SESIJE / OBJEKTA ─────────────────────────────────── */}
          <div className="pt-6 pb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Objekt
            </h2>
          </div>
          <div className="flex flex-col gap-4 pb-6">
            <Field label="Naziv objekta" required>
              <input
                type="text"
                value={nazivSesije}
                onChange={(e) => setNazivSesije(e.target.value)}
                placeholder="Hotel Osijek"
                autoFocus
                className={inputCls}
              />
            </Field>

            {/* ── 2. Adresa ──���──────────────────────────────────────────── */}
            <Field label="Adresa" optional>
              <input
                type="text"
                value={adresa}
                onChange={(e) => setAdresa(e.target.value)}
                placeholder="Ulica i broj, grad"
                className={inputCls}
              />
            </Field>

            {/* ── 3. Investitor / klijent ───────────────────────────────── */}
            <Field label="Investitor / klijent" optional>
              <input
                type="text"
                value={narucitelj}
                onChange={(e) => setNarucitelj(e.target.value)}
                placeholder="Naziv tvrtke ili ime naručitelja"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="h-px bg-border/60" />

          {/* ── ODABIR NAČINA RADA ─────────────────────────────────────────── */}
          <div className="pt-5 pb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Nacin rada
            </h2>
            <p className="text-base font-black text-foreground mt-1">Koliko uredaja cistite?</p>
          </div>
          <div className="flex flex-col gap-3 pb-6">
            <RadioKartica
              selected={workMode === "no_subsessions"}
              onSelect={() => setWorkMode("no_subsessions")}
              title="Jedan uredaj"
              description="Posao se vodi direktno u sesiji. Ciklusi, mjerenja i nadopune pripadaju ovom uredaju."
              items={[
                { label: "Ciklusi i mjerenja direktno u sesiji", ima: true },
                { label: "Nadopune kemije po ciklusima", ima: true },
                { label: "Referentno mjerenje i LIVE pracenje", ima: true },
                { label: "Dijelovi sustava (podsesije)", ima: false },
              ]}
            />
            <RadioKartica
              selected={workMode === "with_subsessions"}
              onSelect={() => setWorkMode("with_subsessions")}
              title="Vise uredaja / podsesije"
              description="Svaki uredaj je zasebna podsesija sa vlastitim ciklusima, mjerenjima i volumenom kemije."
              items={[
                { label: "Dijelovi sustava (podsesije)", ima: true },
                { label: "Ciklusi i mjerenja po svakom dijelu", ima: true },
                { label: "Referentno mjerenje i LIVE pracenje", ima: true },
                { label: "Zajednicki izvjestaj za cijeli sustav", ima: true },
              ]}
            />
          </div>

          <div className="h-px bg-border/60" />

          {/* ── 4. PREDMET ČIŠĆENJA ────────────────────────────────────────── */}
          <div className="pt-5 pb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Predmet ciscenja
            </h2>
            <p className="text-base font-black text-foreground mt-1">Sto cistite?</p>
          </div>
          <div className="grid grid-cols-2 gap-2 pb-4">
            {PREDMET_CISCENJA.map((p) => (
              <ChipBtn
                key={p}
                label={p}
                selected={predmetCiscenja === p}
                onClick={() => {
                  setPredmetCiscenja(p);
                  if (p !== "Ostalo") setPredmetOstaloNaziv("");
                }}
              />
            ))}
          </div>
          {predmetCiscenja === "Ostalo" && (
            <div className="mb-4">
              <input
                type="text"
                value={predmetOstaloNaziv}
                onChange={(e) => setPredmetOstaloNaziv(e.target.value)}
                placeholder="Upiši naziv predmeta..."
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          <div className="h-px bg-border/60" />

          {/* ── 5. VRSTA SUSTAVA ──────────────────────────────────────────── */}
          <div className="pt-5 pb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Vrsta sustava
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2 pb-6">
            {VRSTA_SUSTAVA.map((v) => (
              <ChipBtn
                key={v.label}
                label={v.label}
                selected={odabranaVrstaSustava === v.label}
                onClick={() => setOdabranaVrstaSustava(
                  odabranaVrstaSustava === v.label ? null : v.label
                )}
                variant="small"
              />
            ))}
          </div>

          <div className="h-px bg-border/60" />

          {/* ── 6. VRSTA PROBLEMA — multiselect ──────────────────────────── */}
          <div className="pt-5 pb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Vrsta problema
            </h2>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Mogu se odabrati vise opcija</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VRSTA_PROBLEMA_OPCIJE.map((v) => (
              <ChipBtn
                key={v}
                label={v}
                selected={odabraniProblemi.includes(v)}
                onClick={() => toggleProblem(v)}
              />
            ))}
          </div>

          {odabraniProblemi.includes("Ostalo") && (
            <div className="mt-3 pb-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Opiši problem
                <span className="font-normal text-muted-foreground/60 ml-1">(opcionalno)</span>
              </label>
              <textarea
                value={problemOstaloTekst}
                onChange={(e) => setProblemOstaloTekst(e.target.value)}
                placeholder="Npr. neugodan miris, buka pumpe, nestabilna temperatura..."
                rows={2}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none leading-relaxed"
              />
            </div>
          )}

          <div className="h-px bg-border/60 mt-4" />

          {/* ── 7–10. TEHNIČKI PODACI — collapsed ────────────────────────── */}
          <div className="pt-5 pb-6">
            <CollapsibleSekcija
              label="Tehnicki podaci"
              hint="volumen, materijali, pocetne vrijednosti"
            >
              {/* 7. Procijenjeni volumen vode */}
              <Field label="Procijenjeni volumen vode" optional>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {VOLUMEN_OPCIJE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setVolumen(v);
                          setVolumenRucnoMode(false);
                          setVolumenRucni("");
                        }}
                        className={`rounded-xl border-2 py-3 text-sm font-semibold transition-all active:scale-[0.97] ${
                          !volumenRucnoMode && volumen === v
                            ? "border-primary bg-primary/8 text-primary"
                            : "border-border bg-card text-foreground hover:border-muted-foreground/40"
                        }`}
                      >
                        {v} L
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setVolumenRucnoMode(true);
                        setVolumen(null);
                      }}
                      className={`rounded-xl border-2 py-3 text-sm font-semibold transition-all active:scale-[0.97] ${
                        volumenRucnoMode
                          ? "border-primary bg-primary/8 text-primary"
                          : "border-border bg-card text-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      Rucni unos
                    </button>
                  </div>
                  {volumenRucnoMode && (
                    <input
                      type="number"
                      inputMode="numeric"
                      value={volumenRucni}
                      onChange={(e) => setVolumenRucni(e.target.value)}
                      placeholder="Upiši volumen u litrama"
                      autoFocus
                      className={inputCls}
                    />
                  )}
                </div>
              </Field>

              {/* 8. Materijali sustava */}
              <Field label="Materijali sustava" optional hint="Odabir utjece na upozorenja o kompatibilnosti kemije">
                <div className="grid grid-cols-2 gap-2">
                  {MATERIJALI_OPCIJE.map((m) => (
                    <ChipBtn
                      key={m}
                      label={m}
                      selected={odabraniMaterijali.includes(m)}
                      onClick={() => toggleMaterijal(m)}
                      variant="small"
                    />
                  ))}
                </div>
              </Field>

              {/* 9. Početne informativne vrijednosti */}
              <Field
                label="Pocetne informativne vrijednosti"
                optional
                hint="Vrijednosti prije dodavanja kemije — nisu referentne vrijednosti ciklusa. Referentno mjerenje radi se nakon cca 3 min cirkulacije s kemijom."
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">pH prije kemije</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      max="14"
                      value={pocetniPh}
                      onChange={(e) => setPocetniPh(e.target.value)}
                      placeholder="npr. 7.2"
                      className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">Protok prije kemije</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={pocetniProtok}
                      onChange={(e) => setPocetniProtok(e.target.value)}
                      placeholder="L/min"
                      className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">Temp OUT prije kemije</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={pocetniTemp}
                      onChange={(e) => setPocetniTemp(e.target.value)}
                      placeholder="°C"
                      className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>
              </Field>

              {/* 10. Napomena servisera */}
              <Field label="Napomena servisera" optional>
                <textarea
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="Slobodna napomena..."
                  rows={3}
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary resize-none transition-all"
                />
              </Field>
            </CollapsibleSekcija>
          </div>

          {/* ── Submit ────────────────────────────────────────────────────── */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Pokreni sesiju
            </button>
            {validationMsg && (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                {validationMsg}
              </p>
            )}
          </div>

        </form>
      </main>
    </div>
  );
}
