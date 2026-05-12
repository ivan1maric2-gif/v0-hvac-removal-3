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
  { label: "Ostalo", id: "technical_water" },
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

// Materijali — osnovni multiselect chips
const MATERIJALI_OSNOVNI = [
  "Inox",
  "Bakar",
  "Mesing",
  "Čelik",
  "Aluminij",
  "Plastika / guma",
  "Mješoviti materijali",
] as const;
type MaterijalOsnovni = (typeof MATERIJALI_OSNOVNI)[number];

// Materijali — prošireni (prikazuju se kada je odabran "Mješoviti materijali")
const MATERIJALI_PROSIRENI = [
  "Pocinčani čelik",
  "Lijevano željezo",
  "Titan",
  "PEX / PE-X",
  "Alu-PEX",
  "PVC / CPVC",
] as const;
type MaterijalProsireni = (typeof MATERIJALI_PROSIRENI)[number];

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
  const { navigiraj, nazad, dodajSesiju, draftNewSession, updateDraftNewSession, resetDraftNewSession } = useApp();

  // UI-only lokalni state — ne trebaju perzistirati kroz navigaciju
  const [pocetneOtvorene, setPocetneOtvorene] = useState(false);
  const [sesijaPokrenuta, setSesijaPokrenuta] = useState(false);
  const [novaSesijaId, setNovaSesijaId] = useState<string | null>(null);
  const [successNaziv, setSuccessNaziv] = useState("");
  const [successPredmet, setSuccessPredmet] = useState("");
  const [successWorkMode, setSuccessWorkMode] = useState<WorkMode>("no_subsessions");

  // Destrukturiraj draft iz contexta — forma čita odavde
  const {
    workMode,
    nazivSesije,
    adresa,
    narucitelj,
    predmetCiscenja,
    predmetOstaloNaziv,
    odabranaVrstaSustava,
    customSustavaText,
    odabraniProblemi,
    problemOstaloTekst,
    volumen,
    volumenRucni,
    volumenRucnoMode,
    odabraniMaterijali,
    odabraniProsireni,
    materijalOstalo,
    pocetniPh,
    pocetniProtok,
    pocetniTemp,
    napomena,
  } = draftNewSession;

  const tipSustava: SystemCategory =
    VRSTA_SUSTAVA.find((v) => v.label === odabranaVrstaSustava)?.id ?? "dhw_potable";

  // Toggle materijal — osnovni
  function toggleMaterijal(m: MaterijalOsnovni) {
    updateDraftNewSession({
      odabraniMaterijali: odabraniMaterijali.includes(m)
        ? odabraniMaterijali.filter((x) => x !== m)
        : [...odabraniMaterijali, m],
    });
  }

  // Toggle prošireni materijal
  function toggleProsireni(m: MaterijalProsireni) {
    updateDraftNewSession({
      odabraniProsireni: odabraniProsireni.includes(m)
        ? odabraniProsireni.filter((x) => x !== m)
        : [...odabraniProsireni, m],
    });
  }

  // Toggle Ostalo — expand/collapse prošireni materijali
  function toggleMaterijalOstalo() {
    if (materijalOstalo) {
      updateDraftNewSession({ materijalOstalo: false, odabraniProsireni: [] });
    } else {
      updateDraftNewSession({ materijalOstalo: true });
    }
  }

  // Toggle problem
  function toggleProblem(v: VrstaProblema) {
    const already = (odabraniProblemi as VrstaProblema[]).includes(v);
    if (already) {
      updateDraftNewSession({
        odabraniProblemi: odabraniProblemi.filter((x) => x !== v),
        ...(v === "Ostalo" ? { problemOstaloTekst: "" } : {}),
      });
    } else {
      updateDraftNewSession({ odabraniProblemi: [...odabraniProblemi, v] });
    }
  }

  // Validacija — naziv objekta + predmet čišćenja + problem obvezni
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

    const vrstaSustavaFinal =
      odabranaVrstaSustava === "Ostalo" && customSustavaText.trim()
        ? `Ostalo: ${customSustavaText.trim()}`
        : odabranaVrstaSustava;

    const problemiLabel = (odabraniProblemi as VrstaProblema[])
      .map((p) => (p === "Ostalo" && problemOstaloTekst.trim() ? `Ostalo: ${problemOstaloTekst.trim()}` : p))
      .join(", ");

    const sviMaterijali = [...odabraniMaterijali, ...odabraniProsireni];
    const materijaliLabel = sviMaterijali.length > 0
      ? `Materijali: ${sviMaterijali.join(", ")}`
      : null;

    const opisDijelovi = [
      predmetFinal,
      vrstaSustavaFinal,
      problemiLabel,
      materijaliLabel,
      napomena.trim() || null,
    ].filter(Boolean);

    const novaSesija: Sesija = {
      id: genId("ses"),
      naziv_objekta: nazivSesije.trim(),
      adresa: adresa.trim() || undefined,
      narucitelj: narucitelj.trim() || undefined,
      lokacija: [predmetFinal, vrstaSustavaFinal].filter(Boolean).join(" / "),
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
    // Pohrani snapshot za success ekran PRIJE reseta drafta
    setSuccessNaziv(nazivSesije.trim());
    setSuccessPredmet(predmetFinal);
    setSuccessWorkMode(workMode);
    // Reset drafta TEK nakon pohrane snapshota
    resetDraftNewSession();
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
              {successNaziv}
            </p>
            <p className="text-sm text-muted-foreground mb-1">{successPredmet}</p>
            <div className="mt-4 mb-8 bg-muted/30 border border-border/60 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-foreground">Sesija je otvorena.</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Sljedeci korak: Pokreni ciklus #1.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigiraj({ ime: "sesija", sesijaId: novaSesijaId });
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

  // ── Forma ──────────────────────────────────────────────────────────���──────────
  return (
    <div className="flex flex-col flex-1 bg-background">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button
          type="button"
          onClick={nazad}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors -ml-1"
          aria-label="Natrag"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-foreground">Otvaranje sesije</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto w-full px-4 pb-10">

          {/* ── BLOK 1 — OSNOVNI PODACI ───────────────────────────────────── */}
          <div className="pt-6 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Osnovni podaci
            </p>
          </div>
          <div className="flex flex-col gap-4 pb-6">
            <Field label="Naziv sesije / objekta" required>
              <input
                type="text"
                value={nazivSesije}
                onChange={(e) => updateDraftNewSession({ nazivSesije: e.target.value })}
                placeholder="Hotel Osijek"
                autoFocus
                className={inputCls}
              />
            </Field>
            <Field label="Adresa" optional>
              <input
                type="text"
                value={adresa}
                onChange={(e) => updateDraftNewSession({ adresa: e.target.value })}
                placeholder="Ulica i broj, grad"
                className={inputCls}
              />
            </Field>
            <Field label="Investitor / klijent" optional>
              <input
                type="text"
                value={narucitelj}
                onChange={(e) => updateDraftNewSession({ narucitelj: e.target.value })}
                placeholder="Naziv tvrtke ili ime naručitelja"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="h-px bg-border/60" />

          {/* ── BLOK 2 — NAČIN RADA ───────────────────────────────────────── */}
          <div className="pt-5 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Nacin rada
            </p>
          </div>
          <div className="flex flex-col gap-3 pb-6">
            <RadioKartica
              selected={workMode === "no_subsessions"}
              onSelect={() => updateDraftNewSession({ workMode: "no_subsessions" })}
              title="Jedan uredaj"
              description="Ciklusi, mjerenja i nadopune vode se direktno u sesiji."
              items={[
                { label: "Ciklusi i mjerenja direktno u sesiji", ima: true },
                { label: "Nadopune kemije po ciklusima", ima: true },
                { label: "Referentno mjerenje i LIVE pracenje", ima: true },
                { label: "Podsesije po dijelovima sustava", ima: false },
              ]}
            />
            <RadioKartica
              selected={workMode === "with_subsessions"}
              onSelect={() => updateDraftNewSession({ workMode: "with_subsessions" })}
              title="Vise uredaja / podsesije"
              description="Svaki dio sustava je zasebna podsesija s vlastitim ciklusima i kemijom."
              items={[
                { label: "Podsesije po dijelovima sustava", ima: true },
                { label: "Ciklusi i mjerenja po svakom dijelu", ima: true },
                { label: "Referentno mjerenje i LIVE pracenje", ima: true },
                { label: "Zajednicki izvjestaj za cijeli sustav", ima: true },
              ]}
            />
          </div>

          <div className="h-px bg-border/60" />

          {/* ── BLOK 3 — PREDMET ČIŠĆENJA ─────────────────────────────────── */}
          <div className="pt-5 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Predmet ciscenja
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pb-2">
            {PREDMET_CISCENJA.map((p) => (
              <ChipBtn
                key={p}
                label={p}
                selected={predmetCiscenja === p}
                onClick={() => {
                  updateDraftNewSession({
                    predmetCiscenja: p,
                    ...(p !== "Ostalo" ? { predmetOstaloNaziv: "" } : {}),
                  });
                }}
              />
            ))}
          </div>
          {predmetCiscenja === "Ostalo" && (
            <div className="mt-3 mb-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Unesite predmet čišćenja
              </label>
              <input
                type="text"
                value={predmetOstaloNaziv}
                onChange={(e) => updateDraftNewSession({ predmetOstaloNaziv: e.target.value })}
                placeholder="Npr. kondenzator, fan coil, hladnjak, recirkulacijska grana..."
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          <div className="h-px bg-border/60 mt-5" />

          {/* ── BLOK 4 — VRSTA SUSTAVA ────────────────────────────────────── */}
          <div className="pt-5 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Vrsta sustava
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {VRSTA_SUSTAVA.map((v) => (
              <ChipBtn
                key={v.label}
                label={v.label}
                selected={odabranaVrstaSustava === v.label}
                onClick={() => {
                  const next = odabranaVrstaSustava === v.label ? null : v.label;
                  updateDraftNewSession({
                    odabranaVrstaSustava: next,
                    ...(next === null && v.label === "Ostalo" ? { customSustavaText: "" } : {}),
                  });
                }}
                variant="small"
              />
            ))}
          </div>
          {odabranaVrstaSustava === "Ostalo" && (
            <div className="mt-3 mb-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Unesite vrstu sustava
              </label>
              <input
                type="text"
                value={customSustavaText}
                onChange={(e) => updateDraftNewSession({ customSustavaText: e.target.value })}
                placeholder="Npr. rashladni toranj, industrijski krug, bazenski sustav..."
                autoFocus
                className={inputCls}
              />
            </div>
          )}

          <div className="h-px bg-border/60 mt-5" />

          {/* ��─ BLOK 5 — VRSTA PROBLEMA ───────────────────────────────────── */}
          <div className="pt-5 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Vrsta problema
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Može se odabrati više opcija</p>
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
            <div className="mt-3">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Opiši problem
                <span className="font-normal text-muted-foreground/60 ml-1">(opcionalno)</span>
              </label>
              <textarea
                value={problemOstaloTekst}
                onChange={(e) => updateDraftNewSession({ problemOstaloTekst: e.target.value })}
                placeholder="Npr. neugodan miris, buka pumpe, nestabilna temperatura, curenje..."
                rows={2}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none leading-relaxed"
              />
            </div>
          )}

          <div className="h-px bg-border/60 mt-5" />

          {/* ── BLOK 6 — TEHNIČKI PODACI (collapsed) ─────────────────────── */}
          <div className="pt-5 pb-6">
            <CollapsibleSekcija
              label="Tehnicki podaci"
              hint="volumen, materijali, pocetne vrijednosti"
            >
              {/* Procijenjeni volumen vode */}
              <Field label="Procijenjeni volumen vode" optional>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {VOLUMEN_OPCIJE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          updateDraftNewSession({ volumen: v, volumenRucnoMode: false, volumenRucni: "" });
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
                        updateDraftNewSession({ volumenRucnoMode: true, volumen: null });
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
                      onChange={(e) => updateDraftNewSession({ volumenRucni: e.target.value })}
                      placeholder="Upiši volumen u litrama"
                      autoFocus
                      className={inputCls}
                    />
                  )}
                </div>
              </Field>

              {/* Materijali sustava */}
              <Field label="Materijali sustava" optional hint="Odabir utjece na upozorenja o kompatibilnosti kemije.">
                <div className="grid grid-cols-2 gap-2">
                  {MATERIJALI_OSNOVNI.map((m) => (
                    <ChipBtn
                      key={m}
                      label={m}
                      selected={odabraniMaterijali.includes(m)}
                      onClick={() => toggleMaterijal(m)}
                      variant="small"
                    />
                  ))}
                  <ChipBtn
                    label="Ostalo"
                    selected={materijalOstalo}
                    onClick={toggleMaterijalOstalo}
                    variant="small"
                  />
                </div>
                {materijalOstalo && (
                  <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Prosireni materijali
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {MATERIJALI_PROSIRENI.map((m) => (
                        <ChipBtn
                          key={m}
                          label={m}
                          selected={odabraniProsireni.includes(m)}
                          onClick={() => toggleProsireni(m)}
                          variant="small"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Field>

              {/* Početne informativne vrijednosti */}
              <div className="rounded-2xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPocetneOtvorene((p) => !p)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" aria-hidden="true"
                      className={`text-primary transition-transform duration-200 ${pocetneOtvorene ? "rotate-45" : ""}`}
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span className="text-sm font-semibold text-foreground">
                      Pocetne informativne vrijednosti
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">(opcionalno)</span>
                  </span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" aria-hidden="true"
                    className={`text-muted-foreground transition-transform duration-200 ${pocetneOtvorene ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {pocetneOtvorene && (
                  <div className="px-4 pt-1 pb-4 flex flex-col gap-3 border-t border-border/60">
                    <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                      Ovo nije referentno mjerenje ciklusa. Referentno mjerenje radi se tek nakon dodavanja kemije i cca 3 minute cirkulacije.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">pH prije kemije</label>
                      <input
                        type="number" inputMode="decimal" step="0.1" min="0" max="14"
                        value={pocetniPh} onChange={(e) => updateDraftNewSession({ pocetniPh: e.target.value })}
                        placeholder="npr. 7.2"
                        className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">Protok prije kemije</label>
                      <input
                        type="number" inputMode="decimal" step="0.1" min="0"
                        value={pocetniProtok} onChange={(e) => updateDraftNewSession({ pocetniProtok: e.target.value })}
                        placeholder="L/min"
                        className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground font-medium w-28 shrink-0">Temp OUT prije kemije</label>
                      <input
                        type="number" inputMode="decimal" step="0.1"
                        value={pocetniTemp} onChange={(e) => updateDraftNewSession({ pocetniTemp: e.target.value })}
                        placeholder="°C"
                        className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Napomena servisera */}
              <Field label="Napomena servisera" optional>
                <textarea
                  value={napomena}
                  onChange={(e) => updateDraftNewSession({ napomena: e.target.value })}
                  placeholder="Slobodna napomena..."
                  rows={3}
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary resize-none transition-all"
                />
              </Field>
            </CollapsibleSekcija>
          </div>

          {/* ── Submit ────────────────────────────────────────────────────── */}
          <div className="pb-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-primary text-primary-foreground rounded-2xl py-5 font-black text-base tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              OTVORI SESIJU
            </button>
            {validationMsg && (
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                {validationMsg}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/50 text-center mt-3 leading-snug">
              Kemijsko sredstvo odabire se pri pokretanju ciklusa.
            </p>
          </div>

        </form>
      </main>
    </div>
  );
}
