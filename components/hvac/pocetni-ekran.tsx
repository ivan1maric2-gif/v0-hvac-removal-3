"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/app-state";
import { toast } from "sonner";
import { StatusBadge } from "./status-badge";
import { MjerenjeTimer } from "./mjerenje-timer";
import { getMjerenjePH, getMjerenjeTimestamp, pocetnoMjerenjeCiklusa, izracunajStatusSesije, getUzUpozorenjeLabel } from "@/lib/types";
import type { Sesija, Mjerenje, Ciklus } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────


function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Compute visual reaction status from last measurement + pH change */
type ReactionStatus =
  | { key: "aktivna";   label: "Aktivna reakcija";    color: "green"  }
  | { key: "slabi";     label: "Sredstvo slabi";       color: "yellow" }
  | { key: "pri_kraju"; label: "Sredstvo pri kraju";   color: "orange" }
  | { key: "nadopuna";  label: "Potrebna nadopuna";    color: "red"    }
  | { key: "stabilna";  label: "Reakcija stabilna";    color: "blue"   };

function izracunajStatus(ciklus: Ciklus): ReactionStatus | null {
  const mj = ciklus.mjerenja;
  if (!mj.length) return null;
  const sorted = [...mj].sort(
    (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
  );
  const last = sorted[sorted.length - 1];
  const ph = getMjerenjePH(last);
  if (ph === null) return null;

  const phChange = last.phChange ?? (sorted.length > 1 ? ph - getMjerenjePH(sorted[sorted.length - 2])! : null);
  const phRate = last.phRatePerMinute ?? null;

  if (ph > 6.5)              return { key: "nadopuna",  label: "Potrebna nadopuna",    color: "red"    };
  if (ph > 5.5 && ph <= 6.5) return { key: "pri_kraju", label: "Sredstvo pri kraju",   color: "orange" };
  if (phChange !== null && phChange < 0.05 && ph <= 5)
                              return { key: "stabilna",  label: "Reakcija stabilna",    color: "blue"   };
  if (phRate !== null && phRate > 0.15)
                              return { key: "slabi",     label: "Sredstvo slabi",       color: "yellow" };
  // pH 3.0–4.0 MUST show "Sredstvo slabi" regardless of rate
  if (ph >= 3.0 && ph < 4.0)  return { key: "slabi",     label: "Sredstvo slabi",       color: "yellow" };
  return                             { key: "aktivna",  label: "Aktivna reakcija",     color: "green"  };
}

const STATUS_COLOR: Record<string, string> = {
  green:  "bg-green-900/60 text-green-300 border-green-600/50",
  yellow: "bg-yellow-900/60 text-yellow-300 border-yellow-600/50",
  orange: "bg-orange-900/60 text-orange-300 border-orange-600/50",
  red:    "bg-red-900/60 text-red-300 border-red-500/60",
  blue:   "bg-blue-900/60 text-blue-300 border-blue-600/50",
};

// ─── BrzoMjerenjeModal ───────────────────────────────────────────────────────

interface BrzoMjerenjeProps {
  sesija: Sesija;
  ciklus: Ciklus;
  isModeA: boolean;         // no podsesije → dodajMjerenjeSesije
  podsesijaId?: string;
  onClose: () => void;
}

function BrzoMjerenjeModal({ sesija, ciklus, isModeA, podsesijaId, onClose }: BrzoMjerenjeProps) {
  const { dodajMjerenjeSesije, dodajMjerenje } = useApp();
  const [ph, setPh] = useState("");
  const [protok, setProtok] = useState("");
  const [boja, setBoja] = useState<"zuta" | "narandzasta" | "bezbojna" | "">("");
  const [pjena, setPjena] = useState<"nema" | "slaba" | "srednja" | "jaka" | "">("");
  const [saving, setSaving] = useState(false);

  const canSave = ph !== "" && !isNaN(Number(ph));

  function handleSave() {
    if (!canSave) return;
    setSaving(true);

    const now = new Date().toISOString();
    const prevMj = [...ciklus.mjerenja].sort(
      (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
    );
    const prevLast = prevMj.length > 0 ? prevMj[prevMj.length - 1] : undefined;
    const prevPh = prevLast ? getMjerenjePH(prevLast) : undefined;
    const phNum = parseFloat(ph);

    const mjerenje: Mjerenje = {
      id: `mj-brzo-${Date.now()}`,
      sessionId: sesija.id,
      subsessionId: podsesijaId,
      cycleId: ciklus.id,
      measurementType: "regular",
      measuredAt: now,
      ph: phNum,
      previousPh: prevPh ?? undefined,
      phChange: prevPh !== undefined ? phNum - prevPh : undefined,
      ...(protok !== "" && !isNaN(Number(protok)) ? { flowInputValue: parseFloat(protok), flowInputUnit: "l_min" as const, flowLMin: parseFloat(protok) } : {}),
      ...(boja !== "" ? { colorIndicator: boja as Mjerenje["colorIndicator"] } : {}),
      ...(pjena !== "" ? { foamLevel: pjena as Mjerenje["foamLevel"] } : {}),
    };

    if (isModeA) {
      dodajMjerenjeSesije(sesija.id, ciklus.id, mjerenje);
    } else if (podsesijaId) {
      dodajMjerenje(sesija.id, podsesijaId, ciklus.id, mjerenje);
    }

    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl w-full max-w-lg p-5 pb-8 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Brzo mjerenje</h2>
          <button onClick={onClose} className="text-muted-foreground text-sm px-2 py-1">Odustani</button>
        </div>

        {/* pH — required */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">pH *</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="14"
            value={ph}
            onChange={(e) => setPh(e.target.value)}
            placeholder="npr. 4.2"
            autoFocus
            className="bg-secondary border border-border rounded-xl px-4 py-3 text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Protok — optional */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Protok (l/min)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={protok}
            onChange={(e) => setProtok(e.target.value)}
            placeholder="npr. 12.5"
            className="bg-secondary border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Boja + Pjena — optional row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Boja sredstva</label>
            <select
              value={boja}
              onChange={(e) => setBoja(e.target.value as typeof boja)}
              className="bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— nije uneseno</option>
              <option value="bezbojna">Bezbojna</option>
              <option value="zuta">Zuta</option>
              <option value="narandzasta">Narancasta</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Pjena</label>
            <select
              value={pjena}
              onChange={(e) => setPjena(e.target.value as typeof pjena)}
              className="bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— nije uneseno</option>
              <option value="nema">Nema</option>
              <option value="slaba">Slaba</option>
              <option value="srednja">Srednja</option>
              <option value="jaka">Jaka</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {saving ? "Sprema..." : "Spremi mjerenje"}
        </button>
      </div>
    </div>
  );
}

// ─── AktivnaSesijaKartica ────────────────────────────────────────────────────

function AktivnaSesijaKartica({ sesija }: { sesija: Sesija }) {
  const { navigiraj, zavrsiSesiju, zatvoriSesijuNedovrsenu, zavrsiCiklusSesije, zavrsiCiklus } = useApp();
  const [showBrzoMjerenje, setShowBrzoMjerenje] = useState(false);

  // Find active cycle: check direct ciklusi (Mode A) then podsesije (Mode B)
  const sviCiklusiModeA = sesija.ciklusi ?? [];
  const aktivanCiklusA = sviCiklusiModeA.find((c) => c.status === "aktivan") ?? null;

  const podsesijeAkt = sesija.podsesije.flatMap((p) => p.ciklusi.map((c) => ({ ciklus: c, podsesijaId: p.id })));
  const aktivanCiklusB = podsesijeAkt.find(({ ciklus }) => ciklus.status === "aktivan") ?? null;

  const aktivanCiklus = aktivanCiklusA ?? aktivanCiklusB?.ciklus ?? null;
  const aktivanPodsesijaId = aktivanCiklusB?.podsesijaId;
  const isModeA = !!aktivanCiklusA;

  // Referentno (nulto) mjerenje aktivnog ciklusa = initial_cycle_measurement
  // Fallback: ako nema initial_cycle_measurement, uzmi prvo mjerenje ciklusa
  const refMjerenje = aktivanCiklus
    ? (pocetnoMjerenjeCiklusa(aktivanCiklus) ?? aktivanCiklus.mjerenja?.[0] ?? null)
    : null;
  const refPH = refMjerenje ? getMjerenjePH(refMjerenje) : null;
  const refProtok = refMjerenje?.flowLMin ?? refMjerenje?.flowInputValue ?? null;
  const refTempOut = refMjerenje?.tempOutC ?? null;

  // Zadnje mjerenje — SAMO iz aktivnog ciklusa (ne iz svih ciklusa sesije)
  const mjerenjaAktivnogCiklusa = aktivanCiklus?.mjerenja ?? [];
  const zadnjeMjerenje = mjerenjaAktivnogCiklusa.length > 0
    ? [...mjerenjaAktivnogCiklusa].sort(
        (a, b) => new Date(getMjerenjeTimestamp(b)).getTime() - new Date(getMjerenjeTimestamp(a)).getTime()
      )[0]
    : null;

  const zadnjiPH = zadnjeMjerenje ? getMjerenjePH(zadnjeMjerenje) : null;
  const zadnjiProtok = zadnjeMjerenje?.flowLMin ?? zadnjeMjerenje?.flowInputValue ?? null;
  const zadnjiTempOut = zadnjeMjerenje?.tempOutC ?? null;
  const zadnjiTS = zadnjeMjerenje ? getMjerenjeTimestamp(zadnjeMjerenje) : null;

  // Reaction status
  const reactionStatus = aktivanCiklus ? izracunajStatus(aktivanCiklus) : null;

  // Conditions
  const hasAktivniCiklus = !!aktivanCiklus;
  const sviCiklusiSesije = [
    ...(sesija.ciklusi ?? []),
    ...sesija.podsesije.flatMap((p) => p.ciklusi),
  ];
  const imaCiklusa = sviCiklusiSesije.length > 0;
  const sviZavrseniKartica = imaCiklusa && !hasAktivniCiklus &&
    sviCiklusiSesije.every((c) => c.status === "zavrsen" || c.status === "prekinut");
  const hasPocetnoMjerenje = aktivanCiklus ? aktivanCiklus.hasInitialMeasurement === true || aktivanCiklus.mjerenja.length > 0 : false;
  const canBrzoMjerenje = hasAktivniCiklus && hasPocetnoMjerenje;

  // Cycle state message when no initial measurement yet
  let cycleStateMsg: string | null = null;
  if (!hasAktivniCiklus) {
    cycleStateMsg = "Pokrenite ciklus";
  } else if (!hasPocetnoMjerenje) {
    cycleStateMsg = "Unesite referentno mjerenje nakon ulijevanja sredstva (~3 min)";
  }

  return (
    <>
      <div className="bg-card border border-primary/30 rounded-2xl overflow-hidden flex flex-col">
        {/* Primary accent bar */}
        <div className="h-0.5 bg-primary w-full" />

        <div className="p-4 flex flex-col gap-3">
          {/* Top row — name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-bold text-foreground text-base leading-snug break-words">{sesija.naziv_objekta}</p>
              </div>
              {sesija.lokacija && (
                <p className="text-xs text-muted-foreground mt-0.5">{sesija.lokacija}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <StatusBadge
                status={
                  sesija.status === "zavrseno" || sesija.status === "uz_upozorenje" || sesija.status === "nedovrseno"
                    ? sesija.status
                    : izracunajStatusSesije(sesija)
                }
              />
              {sesija.status === "uz_upozorenje" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 text-right leading-tight max-w-[140px]">
                  {getUzUpozorenjeLabel(sesija).replace("Završeno — ", "")}
                </p>
              )}
            </div>
          </div>

          {/* Reaction status pill */}
          {reactionStatus && (
            <div className={`inline-flex items-center gap-1.5 self-start text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLOR[reactionStatus.color]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
              {reactionStatus.label}
            </div>
          )}

          {/* Cycle state hint */}
          {cycleStateMsg && (
            <p className="text-xs text-amber-400 font-medium">{cycleStateMsg}</p>
          )}

          {/* Mjerenja — referentno (baseline) + zadnje (dominantno) + Δ */}
          {(() => {
            const hasZadnje = zadnjeMjerenje && zadnjeMjerenje.id !== refMjerenje?.id;

            // Δ izračun — zadnje vs referentno
            const dPH =
              zadnjiPH !== null && refPH !== null ? zadnjiPH - refPH : null;
            const dProtok =
              zadnjiProtok !== null && refProtok !== null ? zadnjiProtok - refProtok : null;
            const dTemp =
              zadnjiTempOut !== null && refTempOut !== null ? zadnjiTempOut - refTempOut : null;

            const fmtDelta = (v: number | null, decimals = 2, unit = "") => {
              if (v === null) return null;
              return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}${unit ? " " + unit : ""}`;
            };
            const deltaColor = (v: number | null) =>
              v === null ? "" : Math.abs(v) < 0.05 ? "text-muted-foreground/50" : v > 0 ? "text-emerald-400" : "text-rose-400";

            return (
              <div className="flex flex-col gap-2">

                {/* REFERENTNO — vizualno sekundarno / baseline */}
                {refMjerenje ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 block mb-1.5">
                      Referentno mjerenje — početak ciklusa
                    </span>
                    <div className="flex items-center gap-5">
                      {refPH !== null && refPH !== 0 && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">pH</span>
                          <span className="text-sm font-bold tabular-nums text-muted-foreground">{refPH.toFixed(2)}</span>
                        </div>
                      )}
                      {refProtok !== null && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Protok</span>
                          <span className="text-sm font-bold tabular-nums text-muted-foreground">{refProtok.toFixed(1)} L/min</span>
                        </div>
                      )}
                      {refTempOut !== null && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Temp OUT</span>
                          <span className="text-sm font-bold tabular-nums text-muted-foreground">{refTempOut.toFixed(1)} °C</span>
                        </div>
                      )}
                      {refPH === null && refProtok === null && refTempOut === null && (
                        <span className="text-xs text-muted-foreground/40 italic">Nema podataka</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground/40 italic">
                    Referentno mjerenje nije uneseno
                  </div>
                )}

                {/* ZADNJE MJERENJE — vizualno dominantno + Δ */}
                {hasZadnje && (
                  <div className="rounded-xl border border-primary/25 bg-card px-3 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-foreground/70">
                        Trenutno mjerenje (aktivni ciklus)
                      </span>
                      {zadnjiTS && (
                        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{formatTime(zadnjiTS)}</span>
                      )}
                    </div>
                    <div className="flex items-start gap-4">
                      {/* pH */}
                      {zadnjiPH !== null && zadnjiPH !== 0 && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">pH</span>
                          <span className={`text-xl font-black tabular-nums leading-tight ${
                            zadnjiPH < 2 ? "text-green-400" : zadnjiPH < 4 ? "text-amber-400" : "text-rose-400"
                          }`}>{zadnjiPH.toFixed(2)}</span>
                          {dPH !== null && (
                            <span className={`text-[10px] font-bold tabular-nums ${deltaColor(dPH)}`}>
                              {fmtDelta(dPH)}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Protok */}
                      {zadnjiProtok !== null && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Protok</span>
                          <span className="text-xl font-black tabular-nums leading-tight text-foreground">{zadnjiProtok.toFixed(1)}<span className="text-xs font-semibold text-muted-foreground ml-0.5">L/min</span></span>
                          {dProtok !== null && (
                            <span className={`text-[10px] font-bold tabular-nums ${deltaColor(dProtok)}`}>
                              {fmtDelta(dProtok, 1, "L/min")}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Temp OUT */}
                      {zadnjiTempOut !== null && (
                        <div className="flex flex-col gap-0">
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Temp OUT</span>
                          <span className="text-xl font-black tabular-nums leading-tight text-orange-300">{zadnjiTempOut.toFixed(1)}<span className="text-xs font-semibold text-muted-foreground ml-0.5">°C</span></span>
                          {dTemp !== null && (
                            <span className={`text-[10px] font-bold tabular-nums ${deltaColor(dTemp)}`}>
                              {fmtDelta(dTemp, 1, "°C")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            );
          })()}

          {/* Timer */}
          {canBrzoMjerenje && (
            <MjerenjeTimer
              lastMjerenjeAt={zadnjiTS}
              onAlarm={() => setShowBrzoMjerenje(true)}
              paused={!hasAktivniCiklus}
            />
          )}

          {/* CTAs */}
          {sviZavrseniKartica ? (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-[11px] text-muted-foreground text-center font-semibold uppercase tracking-widest">
                Sesija nema aktivnih ciklusa
              </p>
              {/* PRIMARY — uspješan završetak */}
              <button
                onClick={() => {
                  zavrsiSesiju(sesija.id);
                  const label = getUzUpozorenjeLabel(sesija);
                  const imaUpozorenje = label !== "Završeno uz upozorenje";
                  if (imaUpozorenje) {
                    toast.warning(label, { description: "Evidentirana u servisnom zapisu.", duration: 5000 });
                  } else {
                    toast.success("Sesija završena", { description: "Servis uspješno dokumentiran.", duration: 4000 });
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl py-3 text-sm font-bold transition-all"
              >
                Završi sesiju
              </button>
              {/* SECONDARY — nedovršena */}
              <button
                onClick={() => zatvoriSesijuNedovrsenu(sesija.id)}
                className="w-full rounded-xl bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.98] border border-amber-500/40 text-amber-600 dark:text-amber-400 py-2.5 text-sm font-semibold transition-all"
              >
                Zatvori bez završetka
              </button>
              <button
                onClick={() => navigiraj({ ime: "sesija", sesijaId: sesija.id })}
                className="w-full bg-secondary border border-border text-foreground rounded-xl py-2.5 text-sm font-semibold hover:bg-muted active:scale-[0.98] transition-all"
              >
                Pokreni novi ciklus
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {/* Red 1: Nastavi rad + Brzo mjerenje */}
              <div className="flex gap-2">
                <button
                  onClick={() => navigiraj({ ime: "sesija", sesijaId: sesija.id })}
                  className="flex-1 bg-secondary border border-border text-foreground rounded-xl py-2.5 text-sm font-semibold hover:bg-muted active:scale-[0.98] transition-all"
                >
                  Nastavi rad
                </button>
                {canBrzoMjerenje && (
                  <button
                    onClick={() => setShowBrzoMjerenje(true)}
                    className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Brzo mjerenje
                  </button>
                )}
              </div>

              {/* Red 2: Završi ciklus + Završi sesiju — prikazuje se samo ako ima aktivni ciklus */}
              {hasAktivniCiklus && aktivanCiklus && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isModeA) {
                        zavrsiCiklusSesije(sesija.id, aktivanCiklus.id);
                      } else if (aktivanPodsesijaId) {
                        zavrsiCiklus(sesija.id, aktivanPodsesijaId, aktivanCiklus.id);
                      }
                    }}
                    className="flex-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.98] border border-amber-500/40 text-amber-600 dark:text-amber-400 py-2 text-xs font-semibold transition-all"
                  >
                    Završi ciklus
                  </button>
                  <button
                    onClick={() => zatvoriSesijuNedovrsenu(sesija.id)}
                    className="flex-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] border border-rose-500/40 text-rose-600 dark:text-rose-400 py-2 text-xs font-semibold transition-all"
                  >
                    Zatvori sesiju
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showBrzoMjerenje && aktivanCiklus && (
        <BrzoMjerenjeModal
          sesija={sesija}
          ciklus={aktivanCiklus}
          isModeA={isModeA}
          podsesijaId={aktivanPodsesijaId}
          onClose={() => setShowBrzoMjerenje(false)}
        />
      )}
    </>
  );
}

// ─����������������������������─ SesijaKartica ─────��─���───────────────────────────────────────────────────

/** Sva mjerenja sesije — iz sesija.ciklusi i podsesija.ciklusi, sortirana po vremenu */
function svaMjerenjaSesije(sesija: Sesija): Mjerenje[] {
  const iz_sesije = (sesija.ciklusi ?? []).flatMap((c) => c.mjerenja ?? []);
  const iz_podsesija = sesija.podsesije.flatMap((p) =>
    p.ciklusi.flatMap((c) => c.mjerenja ?? [])
  );
  return [...iz_sesije, ...iz_podsesija].sort(
    (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
  );
}

/** Delta T_izlaz = zadnja - prva. Ako samo jedno mjerenje — vraca apsolutnu vrijednost T_izlaz. */
function tempPodaciSesije(sesija: Sesija): { vrijednost: number; jeDelta: boolean } | null {
  const mj = svaMjerenjaSesije(sesija).filter((m) => m.tempOutC != null);
  if (mj.length === 0) return null;
  if (mj.length === 1) return { vrijednost: mj[0].tempOutC!, jeDelta: false };
  return {
    vrijednost: parseFloat(((mj[mj.length - 1].tempOutC ?? 0) - (mj[0].tempOutC ?? 0)).toFixed(1)),
    jeDelta: true,
  };
}

function SesijaKartica({ sesija }: { sesija: Sesija }) {
  const { navigiraj } = useApp();
  const svaCiklusi = [
    ...(sesija.ciklusi ?? []),
    ...sesija.podsesije.flatMap((p) => p.ciklusi ?? []),
  ];
  const svaMj = svaCiklusi.flatMap((c) => c.mjerenja ?? []);

  // Sva mjerenja sortirana po vremenu
  const sortedMj = [...svaMj].sort(
    (a, b) => new Date(getMjerenjeTimestamp(a)).getTime() - new Date(getMjerenjeTimestamp(b)).getTime()
  );
  const prvoMj   = sortedMj[0] ?? null;
  const zadnjiMj = sortedMj[sortedMj.length - 1] ?? null;
  const zadnjiPH = zadnjiMj ? getMjerenjePH(zadnjiMj) : null;

  // Δ protok od ref. do zadnjeg (samo za završene sesije)
  const refFlow  = prvoMj?.flowLMin ?? null;
  const lastFlow = zadnjiMj?.flowLMin ?? null;
  const deltaFlowPct =
    refFlow && lastFlow && refFlow > 0
      ? Math.round(((lastFlow - refFlow) / refFlow) * 100)
      : null;

  // Kvalitativni rezultat čišćenja za završenu sesiju
  const rezultatLabel =
    deltaFlowPct !== null && deltaFlowPct >= 30 ? "Izvrsno čišćenje"
    : deltaFlowPct !== null && deltaFlowPct >= 15 ? "Dobro čišćenje"
    : deltaFlowPct !== null && deltaFlowPct >= 5  ? "Umjereno čišćenje"
    : deltaFlowPct !== null && deltaFlowPct > 0   ? "Blago poboljšanje"
    : null;

  const rezultatColor =
    deltaFlowPct !== null && deltaFlowPct >= 15 ? "text-emerald-400"
    : deltaFlowPct !== null && deltaFlowPct >= 5 ? "text-blue-400"
    : deltaFlowPct !== null && deltaFlowPct > 0  ? "text-amber-400"
    : "text-muted-foreground";

  return (
    <button
      onClick={() => navigiraj({ ime: "sesija", sesijaId: sesija.id })}
      className="w-full text-left bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 active:scale-[0.99] transition-all"
    >
      {/* Top accent line for active sessions */}
      {sesija.status === "u_radu" && (
        <div className="h-0.5 w-full bg-primary" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-bold text-foreground text-sm leading-snug break-words">{sesija.naziv_objekta}</span>
            </div>
            {sesija.lokacija && (
              <p className="text-xs text-muted-foreground">{sesija.lokacija}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <div className="flex flex-col items-end gap-0.5">
              <StatusBadge
                status={
                  sesija.status === "zavrseno" || sesija.status === "uz_upozorenje" || sesija.status === "nedovrseno"
                    ? sesija.status
                    : izracunajStatusSesije(sesija)
                }
              />
              {sesija.status === "uz_upozorenje" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 text-right leading-tight max-w-[130px]">
                  {getUzUpozorenjeLabel(sesija).replace("Završeno — ", "")}
                </p>
              )}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{sesija.datum}</span>
            {sesija.serviser && <span className="text-muted-foreground/60">·</span>}
            {sesija.serviser && <span>{sesija.serviser}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {svaCiklusi.length > 0 && (
              <span className="text-muted-foreground">
                {svaCiklusi.length} {svaCiklusi.length === 1 ? "ciklus" : "ciklusa"}
                {svaMj.length > 0 && ` · ${svaMj.length} mj.`}
              </span>
            )}

            {/* AKTIVNA sesija → prikaži LIVE pH */}
            {sesija.status === "u_radu" && zadnjiPH !== null && (
              <span className={`font-bold tabular-nums ${
                zadnjiPH < 3.5 ? "text-green-400" :
                zadnjiPH < 5.5 ? "text-amber-400" : "text-red-400"
              }`}>
                pH {zadnjiPH.toFixed(1)}
              </span>
            )}

            {/* ZAVRŠENA sesija → prikaži rezultat čišćenja */}
            {sesija.status !== "u_radu" && (
              deltaFlowPct !== null && deltaFlowPct > 0 ? (
                <span className={`font-bold tabular-nums ${rezultatColor}`}>
                  {rezultatLabel
                    ? rezultatLabel
                    : `Protok +${deltaFlowPct}%`}
                </span>
              ) : deltaFlowPct !== null && deltaFlowPct === 0 ? (
                <span className="text-muted-foreground/60 font-medium">Bez promjene</span>
              ) : svaMj.length === 0 ? (
                <span className="text-muted-foreground/40 italic text-[10px]">Bez mjerenja</span>
              ) : null
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ���── SecondaryButton ──────────────────────────────────────���──────────────────

interface SecondaryButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}

function SecondaryButton({ label, onClick, disabled, variant = "default", icon }: SecondaryButtonProps & { icon?: React.ReactNode }) {
  const cls = variant === "primary"
    ? "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
    : "bg-card text-foreground hover:bg-muted border-border hover:border-primary/30";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${cls} border rounded-2xl px-3 py-3.5 text-center flex flex-col items-center gap-1.5 active:scale-[0.97] transition-all disabled:opacity-35 disabled:cursor-not-allowed`}
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

// ─── PocetniEkran ─────────────────────────────────────────────────────────────

export function PocetniEkran() {
  const { sesije, navigiraj, loadError } = useApp();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme !== "light" : false;

  const realneSesije = [...sesije]
    .filter((s) => !s.isDeleted)
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime());

  const sveSesije = realneSesije;

  const istaknuta = sesije
    .filter((s) => !s.isDeleted && s.status === "u_radu")
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())[0] ?? null;

  if (loadError) {
    // loadError is already sanitized in app-state.tsx — safe to render directly
    return (
      <div className="flex flex-col flex-1 bg-background items-center justify-center px-6 text-center">
        <div className="w-12 h-12 mb-5 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p className="text-base font-bold text-foreground mb-2 leading-snug">Greška pri učitavanju podataka</p>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed break-words overflow-hidden">
          {loadError}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-foreground rounded-xl px-5 py-3 font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Osvježi stranicu
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-background">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border px-4 py-4 flex items-center justify-between gap-2 overflow-hidden">
        {/* Lijevo: logo + naslov */}
        <div className="flex flex-col gap-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/miloc-logo-bijelo-crveno.png"
            alt="Miloc d.o.o."
            fetchPriority="high"
            decoding="sync"
            style={{ height: 52, width: "auto", maxWidth: 180 }}
            className="object-contain object-left"
          />
          <p className="text-muted-foreground text-xs font-normal leading-snug">
            HVAC vodič za uklanjanje kamenca
          </p>
        </div>

        {/* Desno: Rectorko maskota */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/rectorko-logo.png"
          alt="Rectorko"
          fetchPriority="high"
          decoding="sync"
          style={{ height: 110, width: "auto", flexShrink: 0 }}
          className="object-contain"
        />
      </header>

      <main className="flex-1 px-4 py-5 flex flex-col gap-5 max-w-lg mx-auto w-full">

        {/* ── Nova sesija — primary CTA ────────────────────────────────────── */}
        <button
          onClick={() => navigiraj({ ime: "nova_sesija" })}
          className="w-full bg-primary text-primary-foreground rounded-2xl px-5 py-4 flex items-center justify-center gap-2 font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Nova sesija</span>
        </button>

        {/* ── Quick actions grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5">
          <SecondaryButton
            label="Sesije"
            onClick={() => navigiraj({ ime: "povijest" })}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          />
          <SecondaryButton
            label="Proizvodi"
            onClick={() => navigiraj({ ime: "baza_proizvoda" })}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
          />
          <SecondaryButton
            label="Postavke"
            onClick={() => navigiraj({ ime: "postavke" })}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
          />
        </div>

        {/* ── Divider ────────────────────────────────��─────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Aktivna sesija ───────────────────────────────────────────────── */}
        {istaknuta && (
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
              Aktivna sesija
            </h2>
            <AktivnaSesijaKartica sesija={istaknuta} />
          </section>
        )}

        {/* ── Sve sesije ───────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Sesije {realneSesije.length > 0 && <span className="text-muted-foreground/50">({realneSesije.length})</span>}
            </h2>
            {realneSesije.length > 3 && (
              <button
                onClick={() => navigiraj({ ime: "povijest" })}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Sve
              </button>
            )}
          </div>

          {realneSesije.length > 0 ? (
            <div className="flex flex-col gap-2">
              {realneSesije.slice(0, 5).map((s) => (
                <SesijaKartica key={s.id} sesija={s} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center bg-card border border-dashed border-border rounded-2xl">
              <p className="text-sm font-semibold text-muted-foreground">Nema sesija</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Kreiraj prvu sesiju za pocetak rada</p>
            </div>
          )}
        </section>

        {/* Bottom spacing */}
        <div className="h-2" />
      </main>
    </div>
  );
}
