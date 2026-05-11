"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-state";
import { StatusBadge } from "./status-badge";
import type { Sesija, StatusSesije } from "@/lib/types";
import { getUzUpozorenjeLabel } from "@/lib/types";

// ─── Active session statuses that require extra confirmation ──────────────────

const AKTIVNI_STATUSI: StatusSesije[] = ["u_radu"];

// ─── Confirmation dialog ──────────────────────────────────────────────────────

interface Potvrda {
  sesijaId: string;
  naziv: string;
  jeAktivna: boolean;
}

function DijalogBrisanja({
  potvrda,
  onOdustani,
  onPotvrdi,
}: {
  potvrda: Potvrda;
  onOdustani: () => void;
  onPotvrdi: () => void;
}) {
  const [checked, setChecked] = useState(false);

  const mozeObrisati = !potvrda.jeAktivna || checked;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-safe-area-inset-bottom pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-600" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <h2 id="dialog-title" className="text-base font-bold text-slate-900">
              Obrisati sesiju?
            </h2>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed pl-10">
            Sesija <span className="font-semibold text-slate-700">{potvrda.naziv}</span> i svi njeni podaci bit će trajno obrisani.
          </p>
        </div>

        {potvrda.jeAktivna && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm font-bold text-red-700">
              Sesija je još aktivna. Jeste li sigurni?
            </p>
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? "bg-red-100 border-red-300" : "border-slate-200 hover:bg-slate-50"}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 accent-red-600 shrink-0"
              />
              <span className="text-sm font-medium text-slate-700 leading-relaxed">
                Razumijem da će svi podaci ove sesije biti trajno obrisani.
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            onClick={onPotvrdi}
            disabled={!mozeObrisati}
            className="w-full rounded-xl bg-red-600 text-white font-bold text-sm py-3.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm"
            style={{ minHeight: 52 }}
          >
            Obriši sesiju
          </button>
          <button
            onClick={onOdustani}
            className="w-full rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm py-3 hover:bg-slate-50 active:scale-[0.98] transition-all"
            style={{ minHeight: 44 }}
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function PovijestEkran() {
  const { sesije, navigiraj, obrisiSesiju } = useApp();
  const [potvrda, setPotvrda] = useState<Potvrda | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleObriši = (sesija: Sesija) => {
    const jeAktivna = AKTIVNI_STATUSI.includes(sesija.status);
    setPotvrda({ sesijaId: sesija.id, naziv: sesija.naziv_objekta, jeAktivna });
  };

  const handlePotvrdiObriši = () => {
    if (!potvrda) return;
    obrisiSesiju(potvrda.sesijaId);
    setPotvrda(null);
    showToast("Sesija je trajno obrisana.");
  };

  const prikazane = [...sesije]
    .filter((s) => !s.isDeleted)
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime());

  return (
    <div className="flex flex-col flex-1 bg-slate-50">
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-5">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-1">Arhiva</p>
        <h1 className="text-2xl font-black tracking-tight">Povijest sesija</h1>
        {prikazane.length > 0 && (
          <p className="text-sm text-white/70 mt-1">{prikazane.length} {prikazane.length === 1 ? "sesija" : "sesije"}</p>
        )}
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {prikazane.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-20">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="text-center flex flex-col gap-1.5">
              <p className="text-base font-bold text-slate-800">Nema spremljenih sesija</p>
              <p className="text-sm text-slate-500">Pokrenite prvu servisnu sesiju da biste je ovdje vidjeli.</p>
            </div>
            <button
              onClick={() => navigiraj({ ime: "nova_sesija" })}
              className="px-6 py-3.5 rounded-xl bg-teal-600 text-white text-sm font-bold shadow-sm active:scale-[0.98] transition-transform"
              style={{ minHeight: 48 }}
            >
              Nova sesija
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {prikazane.map((s) => (
              <SesijaRedak
                key={s.id}
                sesija={s}
                onObriši={() => handleObriši(s)}
              />
            ))}
          </div>
        )}
      </main>

      {potvrda && (
        <DijalogBrisanja
          potvrda={potvrda}
          onOdustani={() => setPotvrda(null)}
          onPotvrdi={handlePotvrdiObriši}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SesijaRedak({
  sesija,
  onObriši,
}: {
  sesija: Sesija;
  onObriši: () => void;
}) {
  const { navigiraj } = useApp();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

      {/* Card body */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-2.5">

        {/* 1. Title + status badge */}
        <div className="flex items-start justify-between gap-3">
          <p className="font-black text-base text-slate-900 leading-snug break-words flex-1 text-balance">
            {sesija.naziv_objekta}
          </p>
          <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
            <StatusBadge status={sesija.status} />
          </div>
        </div>

        {/* uz_upozorenje inline warning */}
        {sesija.status === "uz_upozorenje" && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
            <p className="text-xs font-bold text-amber-700 leading-snug">
              {getUzUpozorenjeLabel(sesija).replace("Završeno — ", "")}
            </p>
          </div>
        )}

        {/* 2. Location */}
        {sesija.lokacija && (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <p className="text-slate-500 text-xs break-words leading-snug">{sesija.lokacija}</p>
          </div>
        )}

        {/* 3. Demo notice */}
        {sesija.isDemo && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 rounded-md px-1.5 py-0.5">DEMO</span>
            <p className="text-xs text-amber-700">Ovo su demo podaci za testiranje.</p>
          </div>
        )}

        {/* 4. Date + technician + parts row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-0.5">
          <span className="font-medium text-slate-700">{sesija.datum}</span>
          {sesija.serviser && (
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {sesija.serviser}
            </span>
          )}
          {sesija.podsesije.length > 0 && (
            <span className="bg-slate-100 rounded-full px-2 py-0.5 font-medium text-slate-600">
              {sesija.podsesije.length} {sesija.podsesije.length === 1 ? "podsesija" : "podsesije"}
            </span>
          )}
        </div>

      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/80">
        <button
          onClick={() => navigiraj({ ime: "sesija", sesijaId: sesija.id })}
          className="flex-1 text-center text-sm font-bold bg-teal-600 text-white py-2.5 rounded-xl hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm"
          style={{ minHeight: 44 }}
        >
          Otvori sesiju
        </button>
        <button
          onClick={onObriši}
          className="flex items-center gap-1.5 text-sm font-semibold text-red-600 py-2.5 px-3 rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all"
          style={{ minHeight: 44 }}
          aria-label={`Obriši sesiju ${sesija.naziv_objekta}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          Obriši
        </button>
      </div>
    </div>
  );
}
