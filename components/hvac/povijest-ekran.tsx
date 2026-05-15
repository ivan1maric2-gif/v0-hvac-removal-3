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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="dialog-title" className="text-base font-bold text-foreground">
            Obrisati sesiju?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ova radnja će obrisati sesiju <span className="font-semibold text-foreground">{potvrda.naziv}</span>, sve cikluse, mjerenja, nadopune i izvještaje povezane s ovom sesijom. Radnja se ne može poništiti.
          </p>
        </div>

        {potvrda.jeAktivna && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-sm font-semibold text-destructive">
              Sesija je još aktivna. Jeste li sigurni da je želite obrisati?
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
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
            onClick={onPotvrdi}
            disabled={!mozeObrisati}
            className="w-full rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm py-3 transition-opacity disabled:opacity-40 active:scale-[0.98]"
          >
            Obriši sesiju
          </button>
          <button
            onClick={onOdustani}
            className="w-full rounded-xl bg-muted text-foreground font-semibold text-sm py-3 active:scale-[0.98]"
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
    <div className="flex flex-col flex-1 bg-background">
      <header className="bg-primary text-primary-foreground px-4 py-5">
        <h1 className="text-xl font-bold">Povijest sesija</h1>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {prikazane.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-sm text-muted-foreground text-center">Nema spremljenih sesija.</p>
            <button
              onClick={() => navigiraj({ ime: "nova_sesija" })}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
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
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">

      {/* 1. Title + status badge */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold text-lg text-white leading-snug break-words flex-1">
          {sesija.naziv_objekta}
        </p>
        <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
          <StatusBadge status={sesija.status} />
          {sesija.status === "uz_upozorenje" && (
            <p className="text-[10px] text-amber-400 text-right leading-tight max-w-[130px]">
              {getUzUpozorenjeLabel(sesija).replace("Završeno — ", "")}
            </p>
          )}
        </div>
      </div>

      {/* 2. Location */}
      {sesija.lokacija && (
        <p className="text-slate-300 text-sm break-words leading-snug">
          {sesija.lokacija}
        </p>
      )}

      {/* 5. Date + technician + parts */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-400">
        <span>{sesija.datum}</span>
        {sesija.serviser && <span>{sesija.serviser}</span>}
        {sesija.podsesije.length > 0 && (
          <span>{sesija.podsesije.length} {sesija.podsesije.length === 1 ? "podsesija" : "podsesije"}</span>
        )}
      </div>

      {/* 6. Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
        <button
          onClick={() => navigiraj({ ime: "sesija", sesijaId: sesija.id })}
          className="flex-1 text-center text-sm font-bold bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all"
        >
          Otvori
        </button>
        <button
          onClick={onObriši}
          className="flex items-center gap-1.5 text-sm font-semibold text-red-400 py-2 px-3 rounded-xl hover:bg-red-500/10 active:scale-[0.98] transition-all"
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
