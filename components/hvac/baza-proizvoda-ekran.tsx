"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/lib/app-state";
import { useProducts } from "@/lib/product-state";
import type { Product, ProductPhZone, ProductColorIndicator, ProductMaterialCompatibility, StatusPodataka } from "@/lib/product-types";
import {
  TIP_PROIZVODA_LABELS,
  OBLIK_PROIZVODA_LABELS,
  STATUS_PROIZVODA_LABELS,
  STATUS_PODATAKA_LABELS,
  STATUS_PODATAKA_SHORT,
  SOURCE_DOCUMENT_TYPE_LABELS,
  PH_ZONE_STATUS_LABELS,
  PH_ZONE_STATUS_COLORS,
  CHEMICAL_STATUS_LABELS,
  KOMPATIBILNOST_LABELS,
  KOMPATIBILNOST_COLORS,
  JEDINICA_DOZIRANJA_LABELS,
} from "@/lib/product-types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "osnovno" | "doziranje" | "ph_zone" | "indikator_boje" | "materijali" | "sigurnost";

const TABS: { id: Tab; label: string }[] = [
  { id: "osnovno", label: "Osnovno" },
  { id: "doziranje", label: "Doziranje" },
  { id: "ph_zone", label: "pH zone" },
  { id: "indikator_boje", label: "Indikator boje" },
  { id: "materijali", label: "Materijali" },
  { id: "sigurnost", label: "Sigurnost" },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export function BazaProizvodaEkran() {
  const { navigiraj, nazad } = useApp();
  const { proizvodi, duplikajProizvod, arhivirajProizvod } = useProducts();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"sve" | "aktivan" | "arhiviran">("aktivan");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return proizvodi.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.brand.toLowerCase().includes(search.toLowerCase()) ||
        TIP_PROIZVODA_LABELS[p.productType].toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filterStatus === "sve" || p.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [proizvodi, search, filterStatus]);

  const selected = selectedId ? proizvodi.find((p) => p.id === selectedId) : null;

  if (selected) {
    return (
      <ProizvodDetalj
        product={selected}
        onBack={() => setSelectedId(null)}
        onDuplicate={() => { duplikajProizvod(selected.id); setSelectedId(null); }}
        onArchive={() => { arhivirajProizvod(selected.id); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-slate-50">
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-5">
        <div className="flex items-center gap-3">
          <button
            onClick={nazad}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0"
            aria-label="Natrag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-0.5">Katalog</p>
            <h1 className="text-xl font-black leading-tight">Baza proizvoda</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 flex flex-col gap-4 max-w-lg mx-auto w-full">
        {/* Search */}
        <div className="relative">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Pretraži proizvode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["aktivan", "arhiviran", "sve"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                filterStatus === f
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {f === "sve" ? "Svi" : STATUS_PROIZVODA_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Product list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
                <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" /><path d="M16 3H8L4 7h16l-4-4Z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Nema pronađenih proizvoda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <ProizvodKartica key={p.id} product={p} onClick={() => setSelectedId(p.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProizvodKartica({ product, onClick }: { product: Product; onClick: () => void }) {
  const mainWarning = product.materialCompatibility.find(
    (m) => m.compatibilityStatus === "not_recommended"
  );

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-teal-300 hover:shadow-md active:scale-[0.99] transition-all"
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-black text-slate-900 text-base leading-snug">{product.name}</span>
            {product.isDemo && (
              <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 rounded-md px-1.5 py-0.5">
                DEMO
              </span>
            )}
          </div>
          {product.brand !== "—" && (
            <p className="text-xs text-slate-500 mb-1.5">{product.brand}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-widest bg-teal-100 text-teal-800 rounded-full px-2.5 py-0.5">
              {TIP_PROIZVODA_LABELS[product.productType]}
            </span>
            <span className="text-[10px] text-slate-500">{OBLIK_PROIZVODA_LABELS[product.form]}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadgeP status={product.status} />
          <StatusPodatakaBadge statusPodataka={product.statusPodataka} />
        </div>
      </div>

      {/* Warnings */}
      {product.isDemo && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-bold text-amber-800 leading-snug">
            Demo vrijednosti — provjeriti prema tehničkom listu proizvođača.
          </p>
        </div>
      )}
      {!product.isDemo && product.statusPodataka === "potrebna_dopuna" && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-bold text-amber-700 leading-snug">
            Neki podaci još nisu uneseni iz tehničkog lista proizvođača.
          </p>
        </div>
      )}
      {mainWarning && (
        <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[10px] font-bold text-red-700 leading-snug">
            Nije kompatibilno s: {mainWarning.material}
          </p>
        </div>
      )}

      {product.purpose && (
        <p className="px-4 text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">{product.purpose}</p>
      )}

      {/* Footer info bar */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span className="text-slate-500">
          Doziranje: <strong className="text-slate-800 font-bold tabular-nums">{product.dosageMin}–{product.dosageMax} {JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}</strong>
        </span>
        {product.hasColorIndicator && (
          <span className="font-bold text-teal-700">Indikator boje</span>
        )}
        <span className={`font-bold ${product.topUpAllowed ? "text-emerald-700" : "text-red-600"}`}>
          Nadopuna: {product.topUpAllowed ? "DA" : "NE"}
        </span>
      </div>
    </button>
  );
}

// ─── Product detail ───────────────────────────────────────────────────────────

function ProizvodDetalj({
  product,
  onBack,
  onDuplicate,
  onArchive,
}: {
  product: Product;
  onBack: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const [tab, setTab] = useState<Tab>("osnovno");
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="flex flex-col flex-1 bg-slate-50">
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0"
              aria-label="Natrag"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                {product.isDemo && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-amber-400 text-amber-900 rounded-md px-1.5 py-0.5">
                    DEMO
                  </span>
                )}
                {product.indicatorType === "color+foam+sludge" && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-red-700 text-white rounded-md px-1.5 py-0.5">
                    DESCALER / SLUDGE CLEANER
                  </span>
                )}
                {product.indicatorType === "color+bubbles+pH" && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-yellow-600 text-white rounded-md px-1.5 py-0.5">
                    DESCALER / GEL S.p.A.
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black leading-tight truncate">{product.name}</h1>
              <p className="text-xs text-white/60 mt-0.5">{product.brand}</p>
              {product.indicatorType === "color+foam+sludge" && (
                <p className="text-[11px] text-white/50 mt-0.5">
                  Citric acid based descaler &amp; cleaner
                </p>
              )}
              {product.indicatorType === "color+bubbles+pH" && (
                <p className="text-[11px] text-white/50 mt-0.5">
                  Boiler Cleaner P Descaler — GEL S.p.A.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <StatusBadgeP status={product.status} />
              <StatusPodatakaBadge statusPodataka={product.statusPodataka} />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                aria-label="Akcije"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
                </svg>
              </button>
              {showActions && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-40 overflow-hidden">
                  <button
                    onClick={() => { setShowActions(false); onDuplicate(); }}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Dupliciraj proizvod
                  </button>
                  <button
                    onClick={() => { setShowActions(false); onArchive(); }}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
                  >
                    Arhiviraj proizvod
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {/* Data completeness warning strip — real products with incomplete data */}
      {!product.isDemo && product.statusPodataka === "potrebna_dopuna" && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              Neki podaci još nisu uneseni iz tehničkog lista proizvođača. Proizvod je aktivan — za nepotpuna polja aplikacija koristi op��u logiku dok se ne dopune podaci.
            </p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-white shadow-sm shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
              tab === t.id
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
        {tab === "osnovno" && <TabOsnovno product={product} />}
        {tab === "doziranje" && <TabDoziranje product={product} />}
        {tab === "ph_zone" && <TabPhZone product={product} />}
        {tab === "indikator_boje" && <TabIndikatorBoje product={product} />}
        {tab === "materijali" && <TabMaterijali product={product} />}
        {tab === "sigurnost" && <TabSigurnost product={product} />}
      </main>
    </div>
  );
}

// ─── Tab: Osnovno ────────────────────────────���─────────────────────���──────────

function TabOsnovno({ product }: { product: Product }) {
  const sp: StatusPodataka = product.statusPodataka ?? "potrebna_dopuna";

  const statusPodatakaStyle: Record<string, string> = {
    iz_tds:            "bg-emerald-50 border-emerald-200 text-emerald-800",
    djelomicno_iz_tds: "bg-amber-50  border-amber-200  text-amber-800",
    potrebna_dopuna:   "bg-red-50    border-red-200    text-red-800",
  };

  // Determine which "important" fields are entered vs. missing for the TDS section
  const uneseniPodaci: string[] = [];
  const nedostajuPodaci: string[] = [];

  if (product.dosageMin && product.dosageMax) uneseniPodaci.push("Raspon doziranja");
  else nedostajuPodaci.push("Raspon doziranja");

  if (product.applicationCategory !== "unverified") uneseniPodaci.push("Primjena (tip sustava)");
  else nedostajuPodaci.push("Primjena (tip sustava)");

  if (product.phZones && product.phZones.length > 0) uneseniPodaci.push("pH zone");
  else nedostajuPodaci.push("pH zone");

  if (product.materialCompatibility && product.materialCompatibility.length > 0) uneseniPodaci.push("Kompatibilnost materijala");
  else nedostajuPodaci.push("Kompatibilnost materijala");

  if (product.neutralizationRequired !== undefined) uneseniPodaci.push("Neutralizacija");
  else nedostajuPodaci.push("Neutralizacija");

  if (product.densityKgL) uneseniPodaci.push("Gustoća");
  else nedostajuPodaci.push("Gustoća");

  return (
    <div className="flex flex-col gap-4">
      <InfoGroup label="Naziv proizvoda" value={product.name} />
      <InfoGroup label="Brend / proizvođač" value={product.brand} />
      <InfoGroup label="Tip proizvoda" value={TIP_PROIZVODA_LABELS[product.productType]} />
      <InfoGroup label="Oblik" value={OBLIK_PROIZVODA_LABELS[product.form]} />

      {/* Status row */}
      <div className="flex gap-3">
        <div className="flex-1 border border-slate-200 rounded-xl px-4 py-3 bg-white shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Status proizvoda</p>
          <p className="text-sm font-bold text-slate-800">{STATUS_PROIZVODA_LABELS[product.status]}</p>
        </div>
        <div className={`flex-1 border rounded-xl px-4 py-3 shadow-sm ${statusPodatakaStyle[sp]}`}>
          <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Status podataka</p>
          <p className="text-sm font-bold">
            {STATUS_PODATAKA_LABELS[sp]}
          </p>
        </div>
      </div>

      <InfoGroup label="Osnovna namjena" value={product.purpose} multiline />
      {product.note && <InfoGroup label="Napomena" value={product.note} multiline />}

      <div className="flex gap-3 text-xs">
        <div className={`flex-1 rounded-2xl px-3 py-3.5 text-center font-bold border-2 ${
          product.topUpAllowed
            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          Nadopuna {product.topUpAllowed ? "dozvoljena" : "nije preporučena"}
        </div>
        <div className={`flex-1 rounded-xl px-3 py-3.5 text-center font-bold border-2 ${
          product.hasColorIndicator
            ? "bg-teal-50 border-teal-300 text-teal-800"
            : "bg-slate-100 border-slate-200 text-slate-500"
        }`}>
          {product.hasColorIndicator ? "Ima indikator boje" : "Bez indikatora boje"}
        </div>
      </div>

      {/* TDS source section */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Podaci iz tehničkog lista proizvođača</p>
          <div className={`inline-flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusPodatakaStyle[sp]}`}>
            {sp === "iz_tds" && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
            )}
            {STATUS_PODATAKA_LABELS[sp]}
          </div>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Source document */}
          {product.sourceDocumentName && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Naziv dokumenta</p>
              <p className="text-sm text-slate-800">{product.sourceDocumentName}</p>
              <div className="flex gap-3 mt-0.5 flex-wrap">
                {product.sourceDocumentType && (
                  <span className="text-[10px] text-slate-500">
                    {SOURCE_DOCUMENT_TYPE_LABELS[product.sourceDocumentType]}
                  </span>
                )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500">
                    Ažurirano: {product.sourceUpdatedAt ? new Date(product.sourceUpdatedAt).toLocaleDateString("hr-HR") : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-500">
                    Verzija: {product.sourceVersion ?? "—"}
                  </span>
                </div>
                {product.sourceNote && (
                  <p className="text-[10px] text-slate-400 italic mt-0.5">{product.sourceNote}</p>
              )}
            </div>
          )}

          {/* Entered fields */}
          {uneseniPodaci.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Uneseni podaci</p>
              <div className="flex flex-wrap gap-1.5">
                {uneseniPodaci.map((f) => (
                  <span key={f} className="text-[10px] font-medium bg-green-50 border border-green-200 text-green-800 rounded-full px-2 py-0.5">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing fields */}
          {nedostajuPodaci.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Podaci koje treba dopuniti</p>
              <div className="flex flex-wrap gap-1.5">
                {nedostajuPodaci.map((f) => (
                  <span key={f} className="text-[10px] font-medium bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Doziranje ───────────────────────────────────────────────────────────

function TabDoziranje({ product }: { product: Product }) {
  const isDS40Style    = product.indicatorType === "color+foam+sludge";   // Fernox DS-40 — prah
  const isRectorStyle  = product.indicatorType === "color+bubbles+pH";    // Rector BCP — prah descaler
  const isDS3Style     = !isDS40Style && !isRectorStyle && (product.dosageUnit === "g_per_L" || product.hasMassBasedDosing);
  const isFXStyle      = product.indicatorType === "color+bubbles";       // Scalebreaker FX — percent based

  // Per-product optimal temperature range string
  const optimalTempLabel = isRectorStyle ? "35–40 °C" : (isFXStyle || isDS40Style) ? "40–50 °C" : "40–60 °C";

  return (
    <div className="flex flex-col gap-4">
      {/* DS-40: pakiranje / tablica doziranja (prah) */}
      {isDS40Style && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Pakiranje i doziranje</p>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { label: "Standardni kućni CH sustav",  dose: "1.5 kg",      desc: "1 pakiranje DS-40 (iz 2 kg sustava)" },
              { label: "Veliki ili jako prljavi sustav", dose: "3.0 kg +",  desc: "Dodati dodatni prah po potrebi" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-600">{row.label}</span>
                  <span className="text-[10px] text-slate-400">{row.desc}</span>
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{row.dose}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-500 leading-relaxed">
              2 kg sustav uključuje: <strong className="text-slate-800">1.5 kg DS-40</strong> + <strong className="text-slate-800">500 ml System Neutraliser</strong>
            </p>
          </div>
        </div>
      )}

      {/* Rector BCP: powder descaler — tablica doziranja */}
      {isRectorStyle && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Tablica doziranja — prah</p>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { label: "Standardna primjena",  dose: "5–10%",  desc: "Lagane do srednje naslage" },
              { label: "Teže naslage",         dose: "10–15%", desc: "Povećane naslage kamenca" },
              { label: "Intenzivno čišćenje",  dose: "max 15%", desc: "Limitirana koncentracija" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-600">{row.label}</span>
                  <span className="text-[10px] text-slate-400">{row.desc}</span>
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{row.dose}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
              <span className="text-xs font-semibold text-amber-800">Maksimalna koncentracija</span>
              <span className="text-sm font-bold text-amber-900">15%</span>
            </div>
          </div>
        </div>
      )}

      {/* ScaleBreaker FX: tablica doziranja (%) */}
      {isFXStyle && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Tablica doziranja</p>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { label: "Standardna primjena",   dose: "5%",     desc: "Normalne naslage" },
              { label: "Teže naslage",          dose: "10%",    desc: "Povećane naslage kamenca" },
              { label: "Jako zaprljanje",       dose: "10–20%", desc: "Intenzivne naslage" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-600">{row.label}</span>
                  <span className="text-[10px] text-slate-400">{row.desc}</span>
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{row.dose}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
              <span className="text-xs font-semibold text-amber-800">Maksimalna koncentracija</span>
              <span className="text-sm font-bold text-amber-900">20%</span>
            </div>
          </div>
        </div>
      )}

      {/* DS-3 style: tablica doziranja (g/L) */}
      {isDS3Style && !isFXStyle && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Tablica doziranja</p>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { label: "Lagano zaprljanje", dose: "250 g", per: "10 L" },
              { label: "Srednje zaprljanje", dose: "500 g", per: "10 L" },
              { label: "Jako zaprljanje",   dose: "1 kg",  per: "10 L" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-600">{row.label}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {row.dose} / {row.per}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
              <span className="text-xs font-semibold text-amber-800">Maksimalna koncentracija</span>
              <span className="text-sm font-bold text-amber-900">10%</span>
            </div>
          </div>
        </div>
      )}

      {/* Generic % dosage for other products */}
      {!isDS3Style && !isFXStyle && !isRectorStyle && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Preporučeni raspon doziranja</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{product.dosageMin}–{product.dosageMax}</span>
            <span className="text-sm text-slate-500">{JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}</span>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>Početna doza: <strong className="text-slate-800">{product.defaultStartingDose} {JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}</strong></span>
            <span>Max: <strong className="text-slate-800">{product.maxRecommendedDose} {JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}</strong></span>
          </div>
        </div>
      )}

      {/* Temperatura */}
      {(product.safetyNotes?.maxTemperatureC !== undefined || product.safetyNotes?.minTemperatureC !== undefined) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Temperatura rada</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="px-4 py-3 flex flex-col gap-0.5">
              <p className="text-[10px] text-slate-500">Optimalno</p>
              <p className="text-lg font-bold text-slate-800">{optimalTempLabel}</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-0.5">
              <p className="text-[10px] text-slate-500">Maksimalno</p>
              <p className="text-lg font-bold text-slate-800">{product.safetyNotes.maxTemperatureC} °C</p>
            </div>
          </div>
        </div>
      )}

      {product.densityKgL !== undefined && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Gustoća</p>
          <p className="text-sm font-bold text-slate-800">{product.densityKgL} kg/L</p>
          {product.densityNote && <p className="text-xs text-slate-400 italic">{product.densityNote}</p>}
        </div>
      )}

      {product.dosageNote && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-xs text-slate-600">{product.dosageNote}</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: pH zone ─────────────────────────────────�����───────────────────────────

function TabPhZone({ product }: { product: Product }) {
  const STATUS_BG: Record<string, string> = {
    too_strong: "bg-red-50 border-red-200 text-red-800",
    active: "bg-orange-50 border-orange-200 text-orange-800",
    optimal: "bg-green-50 border-green-200 text-green-800",
    weakening: "bg-yellow-50 border-yellow-200 text-yellow-800",
    exhausted: "bg-red-50 border-red-200 text-red-900",
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        pH zone su specifične za ovaj proizvod i koriste se u motoru preporuka.
        Vrijednosti su editable.
      </p>
      {product.phZones.map((zone) => (
        <div key={zone.id} className={`border rounded-xl p-4 ${STATUS_BG[zone.status] ?? "bg-slate-50 border-slate-200"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm">{zone.label}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              {PH_ZONE_STATUS_LABELS[zone.status]}
            </span>
          </div>
          <p className="text-xs font-mono mb-1">
            pH{" "}
            {zone.phMin !== undefined ? `≥ ${zone.phMin}` : "—"}{" "}
            {zone.phMax !== undefined ? `— < ${zone.phMax}` : "i više"}
          </p>
          <p className="text-xs opacity-80 leading-relaxed">{zone.description}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Indikator boje ──────────────────────────────────────────────────────

function TabIndikatorBoje({ product }: { product: Product }) {
  if (!product.hasColorIndicator) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <p className="text-sm text-slate-500">Nije primjenjivo</p>
        <p className="text-xs text-slate-400">Ovaj proizvod nema indikator boje.</p>
      </div>
    );
  }

  const isColorFoam        = product.indicatorType === "color+foam";
  const isColorBubbles     = product.indicatorType === "color+bubbles";
  const isColorFoamSludge  = product.indicatorType === "color+foam+sludge";  // DS-40
  const isColorBubblesPH   = product.indicatorType === "color+bubbles+pH";   // Rector BCP

  const STATUS_BG: Record<string, string> = {
    fresh:     "bg-blue-50 border-blue-200",
    active:    "bg-yellow-50 border-yellow-200",
    weakening: "bg-green-50 border-green-200",
    exhausted: "bg-blue-100 border-blue-300",
    unknown:   "bg-slate-50 border-slate-200",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tip indikatora */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Tip indikatora reakcije</p>
          <p className="text-sm font-semibold text-slate-800">
            {isColorFoam       ? "Boja + pjena (CO₂ reakcija)" :
             isColorBubbles    ? "Boja + mjehurići (CO₂ reakcija)" :
             isColorFoamSludge ? "Boja + pjena + black sludge" :
             isColorBubblesPH  ? "Boja + CO₂ bubbling + pH" :
             "Samo promjena boje"}
          </p>
        </div>
      </div>

      {/* Mapa boja */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Indikatori reakcije</p>
        <div className="flex flex-col gap-2">
          {product.colorIndicators.map((ci) => (
            <div key={ci.id} className={`border rounded-xl p-4 ${STATUS_BG[ci.chemicalStatus] ?? "bg-slate-50 border-slate-200"}`}>
              <div className="flex items-center gap-3 mb-1.5">
                {ci.colorHex && (
                  <span
                    className="w-6 h-6 rounded-full border-2 border-white shadow-sm shrink-0"
                    style={{ backgroundColor: ci.colorHex }}
                  />
                )}
                <span className="font-bold text-sm">{ci.colorName}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {CHEMICAL_STATUS_LABELS[ci.chemicalStatus]}
                </span>
              </div>
              <p className="text-xs opacity-80 leading-relaxed">{ci.meaning}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CO��� reakcija (pjena) — za DS-3 i slične */}
      {isColorFoam && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">CO₂ reakcija (pjena)</p>
          <div className="flex flex-col gap-2">
            {[
              { icon: "●●●", label: "Jaka pjena",  desc: "Aktivno otapanje kamenca",                color: "bg-green-50 border-green-200 text-green-800" },
              { icon: "●●○", label: "Slaba pjena",  desc: "Reakcija slabi — pratiti stanje",         color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
              { icon: "○○○", label: "Nema pjene + Žuta", desc: "Kamenac uklonjen — ispiranje",        color: "bg-amber-50 border-amber-200 text-amber-800" },
              { icon: "○○○", label: "Nema pjene + Plava", desc: "Kemija potrošena — novi ciklus",     color: "bg-blue-50 border-blue-200 text-blue-800" },
            ].map((row) => (
              <div key={row.label} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${row.color}`}>
                <span className="text-base font-black tracking-tighter w-8 shrink-0">{row.icon}</span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold">{row.label}</span>
                  <span className="text-xs opacity-80">{row.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scalebreaker FX — zasebni prikaz indikatora aktivnosti */}
      {isColorBubbles && (
        <div className="flex flex-col gap-4">

          {/* 1. Mapa boja — pH */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Indikator aktivnosti — mapa boja</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Tamno crvena",        ph: "pH < 1.0",    desc: "Koncentrat — ultra jaka reakcija. Pratiti materijale.", dot: "#991b1b", bg: "bg-red-50 border-red-200 text-red-900" },
                { label: "Intenzivno ružičasta", ph: "pH 1.0–2.0", desc: "Optimalna zona. Mjehurići = aktivno otapanje kamenca.",  dot: "#ec4899", bg: "bg-pink-50 border-pink-200 text-pink-900" },
                { label: "Narančasto-crvena",    ph: "pH 2.0–2.8", desc: "Oslabljeno — još radi, blizu zasićenja.",               dot: "#f97316", bg: "bg-orange-50 border-orange-200 text-orange-900" },
                { label: "Žuto-narančasta",      ph: "pH 3.0–3.5", desc: "Kritično — otapanje gotovo staje. Dodati FX odmah.",    dot: "#f59e0b", bg: "bg-amber-50 border-amber-300 text-amber-900" },
                { label: "Žuta / jantar",        ph: "pH 3.5–5.0", desc: "Iscrpljeno — kemija mrtva. Zamijeniti otopinu.",        dot: "#eab308", bg: "bg-yellow-50 border-yellow-200 text-yellow-900" },
                { label: "Zelena / prljava",     ph: "pH > 5.5",   desc: "Neutralizirano — bez učinka. Sigurno za ispuštanje.",   dot: "#65a30d", bg: "bg-teal-50 border-teal-200 text-teal-900" },
              ].map((row) => (
                <div key={row.label} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${row.bg}`}>
                  <span className="w-4 h-4 rounded-full shrink-0 border border-white/50 shadow-sm" style={{ backgroundColor: row.dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{row.label}</span>
                      <span className="text-[10px] font-mono font-semibold opacity-60 shrink-0">{row.ph}</span>
                    </div>
                    <span className="text-xs opacity-75">{row.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Kritična točka — info box */}
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Kritična granica — pH 3.0</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Iznad pH 3.0 sposobnost otapanja kamenca naglo pada. Ne čekati promjenu boje u žutu — dodati svježi FX odmah pri žuto-narančastoj boji.
            </p>
          </div>

          {/* 3. CO₂ bubbling */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">CO₂ bubbling</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Bubbling prisutan",          desc: "Aktivno otapanje kamenca.",                                             color: "bg-green-50 border-green-200 text-green-900" },
                { label: "Jaka reakcija",              desc: "Puno kamenca — reakcija intenzivna.",                                    color: "bg-green-50 border-green-200 text-green-900" },
                { label: "Nema bubblinga + ružičasta", desc: "Kamenac uklonjen — sustav je čist. Ciklus završen.",                    color: "bg-blue-50 border-blue-200 text-blue-900" },
                { label: "Nema bubblinga + žuta",      desc: "Kemija potrošena — dodati svježi FX ili završiti ciklus.",              color: "bg-amber-50 border-amber-200 text-amber-900" },
              ].map((row) => (
                <div key={row.label} className={`border rounded-xl px-4 py-3 flex flex-col gap-0.5 ${row.color}`}>
                  <span className="text-xs font-bold">{row.label}</span>
                  <span className="text-xs opacity-75">{row.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Završetak čišćenja */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">Čišćenje je završeno kada</p>
            <ul className="flex flex-col gap-1">
              {[
                "Nema bubblinga",
                "Boja ostaje ružičasta",
                "Stanje stabilno najmanje 20 minuta",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-blue-800">
                  <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 5. Magnetit upozorenje */}
          <div className="bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs font-bold text-stone-800 uppercase tracking-wide">Upozorenje — magnetit</p>
            <p className="text-xs text-stone-700 leading-relaxed">
              Tamna, smeđa ili prljava otopina ukazuje na prisutnost magnetita ili korozije. Vizualni indikator boje može biti nepouzdan — koristiti pH mjerni papir za potvrdu.
            </p>
          </div>

        </div>
      )}

      {/* DS-40: puna sekcija indikatora */}
      {isColorFoamSludge && (
        <div className="flex flex-col gap-4">

          {/* 1. Mapa boja — pH */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Status kemije — mapa boja
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                {
                  dot: "#b91c1c",
                  label: "Deep Red",
                  ph: "pH 1.5–2.5",
                  desc: "Svježa otopina — maksimalna snaga. Intenzivno otapanje kamenca i black sludge.",
                  bg: "bg-red-50 border-red-200 text-red-900",
                },
                {
                  dot: "#db2777",
                  label: "Pink / Magenta",
                  ph: "pH ~3.0",
                  desc: "Radna zona — aktivna reakcija. Kiselina je još učinkovita.",
                  bg: "bg-pink-50 border-pink-200 text-pink-900",
                },
                {
                  dot: "#ea580c",
                  label: "Orange",
                  ph: "pH 3.5–4.5",
                  desc: "Kritična zona — kiselina slabi. Dodati DS-40 ako je sustav još prljav.",
                  bg: "bg-orange-50 border-orange-200 text-orange-900",
                },
                {
                  dot: "#ca8a04",
                  label: "Yellow / Dirty Green",
                  ph: "pH >5.0",
                  desc: "Iscrpljeno — bez daljnjeg učinka. Dodati DS-40 ili neutralizirati i isprati.",
                  bg: "bg-yellow-50 border-yellow-200 text-yellow-900",
                },
              ].map((row) => (
                <div key={row.label} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${row.bg}`}>
                  <span
                    className="w-4 h-4 rounded-full shrink-0 border border-white/50 shadow-sm"
                    style={{ backgroundColor: row.dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{row.label}</span>
                      <span className="text-[10px] font-mono font-semibold opacity-60 shrink-0">{row.ph}</span>
                    </div>
                    <span className="text-xs opacity-75">{row.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Kritična zona info box */}
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Kritična zona — pH 3.5–4.5</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              pH 3.5–4.5 označava saturation zone. Ako je sustav još prljav, dodati novi DS-40.
            </p>
          </div>

          {/* 3. Reakcija i kontaminacija */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Reakcija i kontaminacija
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                {
                  label: "Intenzivno mjehurićanje",
                  desc: "Aktivno otapanje kamenca — nastaviti čišćenje.",
                  color: "bg-green-50 border-green-200 text-green-900",
                },
                {
                  label: "Prestanak mjehurića + crvena/pink",
                  desc: "Kamenac uklonjen — čišćenje je završeno.",
                  color: "bg-blue-50 border-blue-200 text-blue-900",
                },
                {
                  label: "Bijela pjena",
                  desc: "CO₂ iz karbonata/kamenca — normalna reakcija.",
                  color: "bg-gray-50 border-gray-200 text-gray-900",
                },
                {
                  label: "Smeđa ili prljava pjena",
                  desc: "Korozija, ulja ili magnetit — razmotriti powerflushing.",
                  color: "bg-amber-50 border-amber-200 text-amber-900",
                },
              ].map((row) => (
                <div key={row.label} className={`border rounded-xl px-4 py-3 flex flex-col gap-0.5 ${row.color}`}>
                  <span className="text-xs font-bold">{row.label}</span>
                  <span className="text-xs opacity-75">{row.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Magnetit / Black Sludge upozorenje */}
          <div className="bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 flex flex-col gap-2">
            <p className="text-xs font-bold text-stone-800 uppercase tracking-wide">
              Magnetit / Black Sludge
            </p>
            <p className="text-xs text-stone-700 leading-relaxed">
              Ako je otopina vrlo tamna ili crna, indikator boje može biti nepouzdan zbog magnetita.
            </p>
            <div className="flex flex-col gap-1 mt-0.5">
              <p className="text-[10px] font-semibold text-stone-600 uppercase tracking-wide">Tada koristiti:</p>
              {["pH papir ili uređaj", "Stanje magnetskog filtera", "Promjenu protoka"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-stone-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* 5. Kapacitet otapanja */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Kapacitet otapanja
              </p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">250–300 g</span>
                <span className="text-sm text-slate-500">CaCO₃ / kg DS-40</span>
              </div>
              <p className="text-[11px] text-slate-500">Servisna procjena — okvirna vrijednost.</p>
            </div>
          </div>

          {/* 6. Završetak čišćenja */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">Čišćenje je završeno kada</p>
            <ul className="flex flex-col gap-1">
              {[
                "Boja ostaje stabilno crvena/pink",
                "Nema CO₂ reakcije",
                "Stanje stabilno najmanje 20 minuta",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-blue-800">
                  <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 7. Neutralizacija i ispiranje */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Neutralizacija i ispiranje
              </p>
            </div>
            <div className="flex flex-col divide-y divide-slate-100">
              {[
                { step: "1", text: "Dodati System Neutraliser — dodavati dok se otopina ne okrene u žutu." },
                { step: "2", text: "Ispirati više puta svježom vodom dok voda na ispustu ne bude bistra." },
                { step: "3", text: "Preporučeno: dodati Fernox Protector F1 nakon završnog ispiranja." },
              ].map((row) => (
                <div key={row.step} className="flex items-start gap-3 px-4 py-3">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-600">{row.step}</span>
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">{row.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 8. Nije za */}
          <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500 shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[9px] font-black uppercase tracking-widest text-red-800">Nije za</p>
            </div>
            <ul className="flex flex-col gap-1">
              {[
                "Single feed indirect cylinders",
                "Primatic ili slične sustave",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs font-medium text-red-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* ── Rector / Miloc — Status kemije (vlastiti yellow→red indicator model) ── */}
      {isColorBubblesPH && (
        <div className="flex flex-col gap-5">

          {/* Status kemije — header sekcije */}
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-yellow-500 shrink-0" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-800">Status kemije</p>
          </div>

          {/* Mapa boja — 3 zone */}
          <div className="flex flex-col gap-2">
            {/* Žuta — maksimalna snaga */}
            <div className="rounded-2xl border-2 border-yellow-400 overflow-hidden">
              <div className="bg-yellow-400 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-yellow-900/20 border-2 border-yellow-900/30 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wide text-yellow-900">Žuta</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-yellow-900 bg-white/40 px-2 py-0.5 rounded-full">
                  {'pH <1.5'}
                </span>
              </div>
              <div className="bg-yellow-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-yellow-900">Maksimalna snaga</p>
                <p className="text-[11px] text-yellow-700">Aktivna otopina</p>
              </div>
            </div>

            {/* Narančasta — slabljenje */}
            <div className="rounded-2xl border-2 border-orange-400 overflow-hidden">
              <div className="bg-orange-400 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-orange-900/20 border-2 border-orange-900/30 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wide text-orange-900">Narančasta</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-orange-900 bg-white/40 px-2 py-0.5 rounded-full">
                  pH 1.5–3.5
                </span>
              </div>
              <div className="bg-orange-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-orange-900">Slabljenje</p>
                <p className="text-[11px] text-orange-700">Sredstvo se troši</p>
              </div>
            </div>

            {/* Crvena / Ljubičasta — iscrpljeno */}
            <div className="rounded-2xl border-2 border-red-400 overflow-hidden">
              <div className="bg-red-400 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-red-900/20 border-2 border-red-900/30 shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wide text-red-900">Crvena / Ljubičasta</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-red-900 bg-white/40 px-2 py-0.5 rounded-full">
                  {'pH >4.0'}
                </span>
              </div>
              <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-red-900">Iscrpljeno</p>
                <p className="text-[11px] text-red-700">Nema snage otapanja</p>
              </div>
            </div>
          </div>

          {/* Saturation info box */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2.5" className="shrink-0 mt-0.5">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
            <p className="text-xs text-amber-900 leading-relaxed">
              Kada pH prijeđe 4.0, kiselina više nema dovoljno slobodne energije za učinkovito otapanje kamenca.
            </p>
          </div>

          {/* Reakcija kamenca — CO₂ / bubbling */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1 h-5 rounded-full bg-green-500 shrink-0" />
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-800">Reakcija kamenca</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Bubbling",                       desc: "Aktivno otapanje kamenca.",           bg: "bg-green-50 border-green-300",  text: "text-green-900", sub: "text-green-700" },
                { label: "Jaka reakcija",                  desc: "Velika količina karbonata u sustavu.", bg: "bg-yellow-50 border-yellow-300", text: "text-yellow-900", sub: "text-yellow-700" },
                { label: "Nema bubblinga + stabilna žuta", desc: "Sustav je čist — čišćenje završeno.", bg: "bg-blue-50 border-blue-300",    text: "text-blue-900",  sub: "text-blue-700"  },
              ].map((row) => (
                <div key={row.label} className={`border rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 ${row.bg}`}>
                  <p className={`text-xs font-bold ${row.text}`}>{row.label}</p>
                  <p className={`text-[11px] ${row.sub} text-right`}>{row.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Kapacitet otapanja */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Kapacitet otapanja</p>
            </div>
            <div className="px-4 py-4 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-900 tabular-nums">0.5–0.6</span>
                  <span className="text-sm font-bold text-slate-700">kg CaCO₃</span>
                </div>
                <span className="text-[11px] text-slate-500">po 1 kg proizvoda</span>
              </div>
              <span className="text-[10px] text-slate-400 text-right leading-relaxed max-w-28">
                Servisna procjena u optimalnim uvjetima
              </span>
            </div>
          </div>

          {/* Temperatura reakcije */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Temperatura reakcije</p>
            </div>
            <div className="divide-y divide-slate-100">
              {([
                { range: "10 °C",    label: "Vrlo spora reakcija",             bar: "w-[15%]", barColor: "bg-blue-400",  labelColor: "text-blue-700"   },
                { range: "20–30 °C", label: "Normalna reakcija",               bar: "w-[40%]", barColor: "bg-sky-400",   labelColor: "text-sky-700"    },
                { range: "35–40 °C", label: "Optimalna učinkovitost",          bar: "w-[90%]", barColor: "bg-green-500", labelColor: "text-green-700"  },
                { range: "45–50 °C", label: "Povećan rizik za inhibitore",     bar: "w-[55%]", barColor: "bg-amber-500", labelColor: "text-amber-700"  },
                { range: ">50 °C",   label: "Upozorenje",                      bar: "w-[25%]", barColor: "bg-red-500",   labelColor: "text-red-700"    },
              ] as const).map((row) => (
                <div key={row.range} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold tabular-nums text-slate-800 w-16 shrink-0">{row.range}</span>
                    <span className={`text-[11px] font-medium ${row.labelColor}`}>{row.label}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.bar} ${row.barColor}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cirkulacija */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-2.5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cirkulacija</p>
            <div className="flex items-start gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600 shrink-0 mt-0.5">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <p className="text-xs text-slate-700 leading-relaxed">
                Stalna cirkulacija značajno povećava učinkovitost sredstva.
              </p>
            </div>
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2.5" className="shrink-0 mt-0.5">
                <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                Statičko namakanje smanjuje brzinu otapanja kamenca.
              </p>
            </div>
          </div>

          {/* Završetak čišćenja */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-blue-600 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white">Čišćenje završeno kada</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {[
                "Boja ostaje stabilno žuta",
                "Nema bubblinga",
                "Protok stabilan",
                "Stanje stabilno najmanje 20 minuta",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-600 shrink-0" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="text-xs text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Neutralizacija */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Neutralizacija</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {[
                "Obavezna nakon čišćenja",
                "Potpuno isprati sustav",
                "Provjeriti završni pH",
                "Preporučena pasivizacija sustava",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-xs text-slate-700">{item}</span>
                </div>
              ))}
              <div className="mt-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Kompatibilno uz preporučenu koncentraciju, kontrolirano vrijeme rada i obaveznu neutralizaciju.
                </p>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

// ─── Tab: Materijali ───────────────────────────────��──────────────────────────

function TabMaterijali({ product }: { product: Product }) {
  const compatible    = product.materialCompatibility.filter((m) => m.compatibilityStatus === "compatible");
  const caution       = product.materialCompatibility.filter((m) => m.compatibilityStatus === "caution");
  const notRecommended = product.materialCompatibility.filter((m) => m.compatibilityStatus === "not_recommended");

  return (
    <div className="flex flex-col gap-4">
      {/* Sigurno za */}
      {compatible.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Sigurno za</p>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {compatible.map((m) => (
              <span key={m.id} className="text-xs font-bold bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1">
                {m.material}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Oprez */}
      {caution.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Oprez</p>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {caution.map((m) => (
              <div key={m.id} className="px-4 py-3 flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-800">{m.material}</span>
                {m.warning && <span className="text-xs text-slate-500 leading-relaxed">{m.warning}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nije za — always visible, never collapsed */}
      {notRecommended.length > 0 && (
        <div className="bg-white border-2 border-red-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-[9px] font-black uppercase tracking-widest text-red-700">Nije preporučeno za</p>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {notRecommended.map((m) => (
              <span key={m.id} className="text-xs font-bold bg-red-100 border border-red-200 text-red-700 rounded-full px-3 py-1">
                {m.material}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Sigurnost ───────────────────────────────────────────────────────────

function TabSigurnost({ product }: { product: Product }) {
  const s = product.safetyNotes;
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-rose-500/8 border-2 border-rose-500/30 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-500 shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[9px] font-black uppercase tracking-widest text-red-800">Uvijek</p>
        </div>
        <p className="text-sm font-semibold text-red-900 leading-relaxed">{s.generalNote}</p>
      </div>
      <InfoGroup label="Osobna zaštita" value={s.personalProtection} multiline />
      <InfoGroup label="Ventilacija" value={s.ventilation} multiline />
      <div className="flex gap-3">
        {s.maxTemperatureC !== undefined && (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Max temp</p>
            <p className="text-2xl font-black tabular-nums text-slate-900">{s.maxTemperatureC} °C</p>
          </div>
        )}
        {s.minTemperatureC !== undefined && (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Min temp</p>
            <p className="text-2xl font-black tabular-nums text-slate-900">{s.minTemperatureC} °C</p>
          </div>
        )}
      </div>
      {s.mixingProhibitions && (
        <InfoGroup label="Zabrana miješanja" value={s.mixingProhibitions} multiline />
      )}
      <InfoGroup label="Napomena o ispiranju" value={s.rinseNote} multiline />
      <InfoGroup label="Napomena o neutralizaciji" value={s.neutralizationNote} multiline />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoGroup({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      {multiline
        ? <p className="text-sm text-slate-700 leading-relaxed">{value}</p>
        : <p className="text-sm font-bold text-slate-800">{value}</p>
      }
    </div>
  );
}

function StatusBadgeP({ status }: { status: Product["status"] }) {
  const styles: Record<string, string> = {
    aktivan:   "bg-emerald-100 text-emerald-800 border-emerald-200",
    arhiviran: "bg-slate-100   text-slate-500   border-slate-200",
    testni:    "bg-amber-100   text-amber-800   border-amber-200",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${styles[status] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {STATUS_PROIZVODA_LABELS[status]}
    </span>
  );
}

function StatusPodatakaBadge({ statusPodataka }: { statusPodataka: StatusPodataka | undefined }) {
  if (!statusPodataka || statusPodataka === "iz_tds") return null;
  const styles: Record<string, string> = {
    djelomicno_iz_tds: "bg-amber-100 text-amber-700 border-amber-200",
    potrebna_dopuna:   "bg-red-100   text-red-700   border-red-200",
  };
  return (
    <span className={`text-[8px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 ${styles[statusPodataka] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
      {STATUS_PODATAKA_SHORT[statusPodataka]}
    </span>
  );
}
