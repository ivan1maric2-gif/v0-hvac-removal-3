"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useApp } from "@/lib/app-state";
import type { SystemCategory } from "@/lib/types";
import { BrziPokreniCiklus } from "./brzi-pokreni-ciklus";
import { DRAFT_KEYS, readDraft, writeDraft, clearDraft } from "@/lib/draft-state";

// ─── Options ──────────────────────────────────────────────────────────────────

const TIP_SUSTAVA_OPTIONS: { value: string; label: string }[] = [
  { value: "TPV", label: "PTV / TPV — topla potrošna voda" },
  { value: "tehnicka_voda", label: "Tehnička voda" },
];

const VRSTA_PROBLEMA_OPTIONS: { value: string; label: string; disabled?: boolean }[] = [
  { value: "kamenac", label: "Kamenac" },
  { value: "mulj", label: "Mulj" },
  { value: "biofilm", label: "Biofilm" },
  { value: "drugo", label: "Drugo" },
];

const NACIN_RADA_OPTIONS: { value: string; label: string; opis: string }[] = [
  { value: "jedan_uredaj", label: "Jedan uređaj", opis: "Čišćenje jednog zatvorenog sustava" },
  { value: "vise_dijelova", label: "Više dijelova sustava", opis: "Više zona ili podsustava u jednoj sesiji" },
];

// Accordion kartica za odabir nacina rada
function NacinRadaField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-800">Način rada *</span>
      <div className="flex flex-col gap-2">
        {NACIN_RADA_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          const open = expanded === opt.value;

          return (
            <div
              key={opt.value}
              className={`rounded-xl border-2 overflow-hidden transition-all duration-200 shadow-sm ${
                selected
                  ? "border-teal-500 bg-teal-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {/* Gornji red — uvijek vidljiv, klik = odabir */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                onClick={() => onChange(opt.value)}
              >
                <input
                  type="radio"
                  name="nacinRada"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className="sr-only"
                />
                {/* Radio circle */}
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected ? "border-teal-600 bg-teal-600" : "border-slate-300 bg-white"
                }`}>
                  {selected && <div className="w-2 h-2 rounded-full bg-white" aria-hidden="true" />}
                </div>
                <div className="flex flex-col gap-0 flex-1 min-w-0">
                  <span className={`text-sm font-bold leading-tight ${selected ? "text-teal-800" : "text-slate-800"}`}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">{opt.opis}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : opt.value); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  aria-label={open ? "Sakrij detalje" : "Prikaži detalje"}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>

              {/* Expand sadrzaj */}
              {open && (
                <div className="px-4 pb-3.5 pt-0 border-t border-slate-100">
                  <p className="text-xs text-slate-600 leading-relaxed pt-3">
                    {opt.opis}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MATERIJAL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Nije odabrano" },
  { value: "bakar", label: "Bakar" },
  { value: "aluminij", label: "Aluminij" },
  { value: "nehrdjajuci_celik", label: "Nehrđajući čelik" },
  { value: "galvanizirani_celik", label: "Galvanizirani čelik" },
  { value: "plastika", label: "Plastika / PVC" },
  { value: "mesing", label: "Mjed (mesing)" },
  { value: "kombinacija", label: "Kombinacija materijala" },
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface SetupForm {
  nazivUredaja: string;
  tipSustava: string;
  vrstaProblem: string;
  nacinRada: string;
  // Optional
  materijal: string;
  procijenjeniVolumenL: string;
}

const DEFAULT_FORM: SetupForm = {
  nazivUredaja: "",
  tipSustava: "",
  vrstaProblem: "kamenac",
  nacinRada: "jedan_uredaj",
  materijal: "",
  procijenjeniVolumenL: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  sesijaId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

type View = "form" | "zapoceto" | "ciklus";

export function SetupCiklusEkran({ sesijaId }: Props) {
  const { getSesija, navigiraj, nazad, pokreniCiklusSesije } = useApp();
  const sesija = getSesija(sesijaId);

  // ── Draft — restore form on back-navigation ──────────────────────────────
  const draftKey = DRAFT_KEYS.setupCiklus(sesijaId);
  const savedDraft = readDraft<SetupForm>(draftKey);

  const [form, setForm] = useState<SetupForm>(savedDraft ?? DEFAULT_FORM);
  const [view, setView] = useState<View>("form");
  const [touched, setTouched] = useState(false);

  // Persist draft on every change
  useEffect(() => {
    writeDraft<SetupForm>(draftKey, form);
  }, [draftKey, form]);

  // Map tipSustava to systemCategory — mora biti ispred svakog conditional returna
  const systemCategoryForModal: SystemCategory = useMemo(() => {
    if (form.tipSustava === "TPV") return "dhw_potable";
    if (form.tipSustava === "tehnicka_voda") return "technical_water";
    return "unknown";
  }, [form.tipSustava]);

  if (!sesija) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-slate-500 text-sm">Sesija nije pronađena.</p>
      </div>
    );
  }

  function setField<K extends keyof SetupForm>(key: K, value: SetupForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isValid =
    form.nazivUredaja.trim() !== "" &&
    form.tipSustava !== "" &&
    form.vrstaProblem !== "" &&
    form.nacinRada !== "";

  function handleProceed(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setView("zapoceto");
  }

  // ── Cycle screen view ─────────────────────────────────────────────────────
  if (view === "ciklus") {
    const tipSustavaLabel =
      form.tipSustava === "TPV" ? "PTV / TPV" : "Tehnička voda";
    const tipProblemaLabel =
      VRSTA_PROBLEMA_OPTIONS.find((o) => o.value === form.vrstaProblem)?.label ??
      form.vrstaProblem;

    return (
      <BrziPokreniCiklus
        sessionId={sesijaId}
        nazivObjekta={sesija.naziv_objekta}
        dioSustava={form.nazivUredaja || undefined}
        tipSustava={tipSustavaLabel}
        tipProblema={tipProblemaLabel}
        procijenjeniVolumenL={
          form.procijenjeniVolumenL ? parseFloat(form.procijenjeniVolumenL) : undefined
        }
        cleaningMode={sesija.cleaningMode}
        systemCategory={systemCategoryForModal}
        onSave={(ciklus) => {
          clearDraft(draftKey);
          pokreniCiklusSesije(sesijaId, ciklus);
          navigiraj({ ime: "sesija", sesijaId });
        }}
        onBack={() => setView("zapoceto")}
      />
    );
  }

  // ── "Sesija zapoceta" confirmation view ───────────────────────────────────
  if (view === "zapoceto") {
    return (
      <div className="flex flex-col flex-1 bg-slate-50">
        <header className="bg-teal-700 text-white px-4 py-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
            {sesija.naziv_objekta}
          </p>
          <h1 className="text-xl font-black">{form.nazivUredaja}</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full flex flex-col gap-4">
          {/* Status card */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-700">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">Sesija je započeta.</p>
                <p className="text-xs text-emerald-700">{form.tipSustava === "TPV" ? "PTV / TPV" : "Tehnička voda"} — {VRSTA_PROBLEMA_OPTIONS.find(o => o.value === form.vrstaProblem)?.label}</p>
              </div>
            </div>

            <div className="border-t border-emerald-200 pt-3 flex flex-col gap-1.5">
              <SummaryRow label="Uređaj" value={form.nazivUredaja} />
              <SummaryRow label="Način rada" value={NACIN_RADA_OPTIONS.find(o => o.value === form.nacinRada)?.label ?? form.nacinRada} />
              {form.materijal && (
                <SummaryRow label="Materijal" value={MATERIJAL_OPTIONS.find(o => o.value === form.materijal)?.label ?? form.materijal} />
              )}
              {form.procijenjeniVolumenL && (
                <SummaryRow label="Volumen" value={`${form.procijenjeniVolumenL} L`} />
              )}
            </div>
          </div>

          {/* Next step card */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 flex flex-col gap-1.5 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Sljedeći korak
            </p>
            <p className="text-sm font-bold text-slate-800 leading-snug">
              Pokreni ciklus i odaberi kemijsko sredstvo.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sredstvo se odabire prilikom pokretanja ciklusa.
            </p>
          </div>

          {/* Action buttons */}
          <button
            type="button"
            onClick={() => setView("ciklus")}
            className="w-full bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm"
            style={{ minHeight: 52, paddingTop: 14, paddingBottom: 14 }}
          >
            Pokreni ciklus
          </button>

          <button
            type="button"
            onClick={nazad}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors py-2"
          >
            Natrag na početak
          </button>
        </main>
      </div>
    );
  }

  // ── Setup form view ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 bg-slate-50">
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-5">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">
          {sesija.naziv_objekta}
        </p>
        <h1 className="text-xl font-black">Postavljanje uređaja</h1>
        <p className="text-sm text-white/70 mt-1">
          Unesite podatke o poslu. Kemijsko sredstvo odabirete pri pokretanju ciklusa.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        <form onSubmit={handleProceed} className="flex flex-col gap-5">

          {/* 1. Naziv uređaja */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-1.5">
            <label className="text-sm font-bold text-slate-800" htmlFor="nazivUredaja">
              Naziv objekta / uređaja *
            </label>
            <p className="text-xs text-slate-500">
              npr. Izmjenjivač, Spiralni izmjenjivač, Spremnik 1
            </p>
            <input
              id="nazivUredaja"
              type="text"
              value={form.nazivUredaja}
              onChange={(e) => setField("nazivUredaja", e.target.value)}
              placeholder="npr. Spremnik TPV – 3. kat"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
            />
            {touched && !form.nazivUredaja.trim() && (
              <p className="text-xs text-red-600 font-medium">Naziv je obavezan.</p>
            )}
          </div>

          {/* 2. Tip sustava */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-800">
              Tip sustava *
            </label>
            <div className="flex flex-col gap-1.5">
              {TIP_SUSTAVA_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                    form.tipSustava === opt.value
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="tipSustava"
                    value={opt.value}
                    checked={form.tipSustava === opt.value}
                    onChange={() => setField("tipSustava", opt.value)}
                    className="accent-teal-600"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
            {touched && !form.tipSustava && (
              <p className="text-xs text-red-600 font-medium">Odaberite tip sustava.</p>
            )}
          </div>

          {/* 3. Vrsta problema */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-800">
              Vrsta problema *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VRSTA_PROBLEMA_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-3 cursor-pointer transition-colors ${
                    form.vrstaProblem === opt.value
                      ? "border-teal-500 bg-teal-50 text-teal-800"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="vrstaProblem"
                    value={opt.value}
                    checked={form.vrstaProblem === opt.value}
                    onChange={() => setField("vrstaProblem", opt.value)}
                    className="accent-teal-600"
                  />
                  <span className="text-sm font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 4. Nacin rada */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <NacinRadaField
              value={form.nacinRada}
              onChange={(v) => setField("nacinRada", v)}
            />
          </div>

          {/* 5. Opcijalna polja */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Opcijalni podaci</p>

            {/* Materijal */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-800" htmlFor="materijal">
                Materijal sustava
              </label>
              <select
                id="materijal"
                value={form.materijal}
                onChange={(e) => setField("materijal", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
              >
                {MATERIJAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Volumen */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-800" htmlFor="procijenjeniVolumenL">
                Procijenjeni volumen sustava
              </label>
              <p className="text-xs text-slate-500">
                Okvirni volumen za planiranje količine sredstva.
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="procijenjeniVolumenL"
                  type="number"
                  min={1}
                  max={10000}
                  step={0.5}
                  value={form.procijenjeniVolumenL}
                  onChange={(e) => setField("procijenjeniVolumenL", e.target.value)}
                  placeholder="npr. 80"
                  className="w-32 border border-slate-200 rounded-xl px-3.5 py-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors tabular-nums"
                />
                <span className="text-sm font-medium text-slate-500">L</span>
              </div>
            </div>
          </div>

          {/* Helper */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500 leading-relaxed">
              Kemijsko sredstvo se odabire pri pokretanju ciklusa.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={touched && !isValid}
            className="w-full bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            style={{ minHeight: 52, paddingTop: 14, paddingBottom: 14 }}
          >
            Pokreni sesiju
          </button>

          <button
            type="button"
            onClick={nazad}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors py-2"
          >
            Nazad
          </button>

        </form>
      </main>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs text-emerald-700/70 shrink-0">{label}</span>
      <span className="text-xs font-bold text-emerald-900 text-right">{value}</span>
    </div>
  );
}
