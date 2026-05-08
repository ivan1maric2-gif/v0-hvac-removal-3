"use client";

import { useState } from "react";
import { useProducts } from "@/lib/product-state";
import type { Product, ApplicationCategory } from "@/lib/product-types";
import {
  TIP_PROIZVODA_LABELS,
  OBLIK_PROIZVODA_LABELS,
  KOMPATIBILNOST_LABELS,
  KOMPATIBILNOST_COLORS,
  JEDINICA_DOZIRANJA_LABELS,
  APPLICATION_CATEGORY_LABELS,
  STATUS_PODATAKA_SHORT,
} from "@/lib/product-types";
import type { CleaningMode, SystemCategory } from "@/lib/types";
import { CLEANING_MODE_LABELS, SYSTEM_CATEGORY_SHORT_LABELS } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductPickerProps {
  /** Currently selected product id */
  selectedProductId?: string;
  /** Material from the subsession / session (for compatibility warning) */
  materialName?: string;
  /** Free-text name entered for the chemical (kept for backward compat) */
  manualChemicalName?: string;
  /**
   * Cleaning mode from the session — used to filter products to only
   * show those with a matching allowedCleaningModes entry.
   */
  cleaningMode?: CleaningMode;
  /**
   * System category from the session — used to filter products by applicationCategory.
   * Products not confirmed for this system are shown under "Potrebna provjera".
   */
  systemCategory?: SystemCategory;
  onSelectProduct: (product: Product) => void;
  onClearProduct: () => void;
  onClose: () => void;
}

// ─── Picker sheet ─────────────────────────────────────────────────────────────

export function ProductPickerSheet({
  selectedProductId,
  materialName,
  cleaningMode,
  systemCategory,
  onSelectProduct,
  onClearProduct,
  onClose,
}: ProductPickerProps) {
  const { getAktivniProizvodi } = useProducts();
  const aktivni = getAktivniProizvodi();
  const [search, setSearch] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [showUnverified, setShowUnverified] = useState(false);

  /**
   * Three-way split based on systemCategory + cleaningMode:
   * - compatible: matches systemCategory (or both/no category) AND cleaningMode
   * - unverified: applicationCategory === "unverified" AND cleaningMode matches
   * - incompatible: cleaningMode mismatch (regardless of systemCategory)
   */
  const isSystemMatch = (p: Product): boolean => {
    if (!systemCategory || systemCategory === "unknown") return true;
    const ac = p.applicationCategory;
    return ac === "both" || ac === systemCategory;
  };

  const isModeMatch = (p: Product): boolean => {
    if (!cleaningMode) return true;
    const modes = p.allowedCleaningModes ?? [];
    return modes.length === 0 || modes.includes(cleaningMode);
  };

  const { compatible, unverified, incompatible } = aktivni.reduce<{
    compatible: Product[];
    unverified: Product[];
    incompatible: Product[];
  }>(
    (acc, p) => {
      if (!isModeMatch(p)) {
        acc.incompatible.push(p);
      } else if (p.applicationCategory === "unverified" && p.verificationStatus !== "verified") {
        // Only put in unverified bucket when explicitly NOT verified
        acc.unverified.push(p);
      } else if (isSystemMatch(p)) {
        acc.compatible.push(p);
      } else {
        // system mismatch (e.g. dhw product in technical_water session)
        acc.incompatible.push(p);
      }
      return acc;
    },
    { compatible: [], unverified: [], incompatible: [] }
  );

  const filterBySearch = (list: Product[]) => {
    const q = search.toLowerCase();
    return !q
      ? list
      : list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q)
        );
  };

  const filteredCompat = filterBySearch(compatible);
  const filteredUnverified = filterBySearch(unverified);
  const filteredIncompat = filterBySearch(incompatible);

  return (
    <div
      className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-background rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-foreground">Odaberi proizvod</h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              placeholder="Pretraži..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {filteredCompat.length === 0 && filteredUnverified.length === 0 && filteredIncompat.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Nema pronađenih proizvoda.</p>
          )}

          {/* Compatible products */}
          {filteredCompat.length > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 pb-1">
              {systemCategory && systemCategory !== "unknown"
                ? `Potvrđeno za: ${SYSTEM_CATEGORY_SHORT_LABELS[systemCategory]}`
                : cleaningMode
                  ? `Preporučeno za: ${CLEANING_MODE_LABELS[cleaningMode]}`
                  : "Proizvodi"}
            </p>
          )}
          {filteredCompat.map((p) => (
            <ProductPickerItem
              key={p.id}
              product={p}
              isSelected={p.id === selectedProductId}
              materialName={materialName}
              systemCategory={systemCategory}
              onSelect={() => { onSelectProduct(p); onClose(); }}
            />
          ))}

          {/* Unverified products — "Potrebna provjera" section */}
          {filteredUnverified.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowUnverified((v) => !v)}
                className="flex items-center justify-between px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-700 hover:text-amber-900 transition-colors"
              >
                <span>Potrebna provjera ({filteredUnverified.length})</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${showUnverified ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showUnverified && (
                <>
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 mb-1">
                    <svg className="shrink-0 mt-0.5 text-amber-600" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      Primjena ovih sredstava nije potvrđena prema tehničkom listu proizvođača. Provjeriti TDS/SDS dokumentaciju.
                    </p>
                  </div>
                  {filteredUnverified.map((p) => (
                    <ProductPickerItem
                      key={p.id}
                      product={p}
                      isSelected={p.id === selectedProductId}
                      materialName={materialName}
                      systemCategory={systemCategory}
                      isUnverified
                      onSelect={() => { onSelectProduct(p); onClose(); }}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Incompatible products — collapsible */}
          {filteredIncompat.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowIncompatible((v) => !v)}
                className="flex items-center justify-between px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Nije preporučeno za ovu vrstu ({filteredIncompat.length})</span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${showIncompatible ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showIncompatible && filteredIncompat.map((p) => (
                <ProductPickerItem
                  key={p.id}
                  product={p}
                  isSelected={p.id === selectedProductId}
                  materialName={materialName}
                  incompatibleWithMode={cleaningMode}
                  systemCategory={systemCategory}
                  onSelect={() => { onSelectProduct(p); onClose(); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Clear button */}
        {selectedProductId && (
          <div className="px-4 pb-6 pt-2 border-t border-border shrink-0">
            <button
              onClick={() => { onClearProduct(); onClose(); }}
              className="w-full border border-border text-muted-foreground rounded-xl py-2.5 text-sm font-medium hover:bg-muted/50 transition-all"
            >
              Ukloni odabir (unesi naziv ručno)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single item ──────────────────────────────────────────────────────────────

function ProductPickerItem({
  product,
  isSelected,
  materialName,
  incompatibleWithMode,
  systemCategory,
  isUnverified,
  onSelect,
}: {
  product: Product;
  isSelected: boolean;
  materialName?: string;
  incompatibleWithMode?: CleaningMode;
  systemCategory?: SystemCategory;
  isUnverified?: boolean;
  onSelect: () => void;
}) {
  const matCompat = materialName
    ? product.materialCompatibility.find((m) => m.material === materialName)
    : null;

  const COMPAT_STYLE: Record<string, string> = {
    compatible: "bg-green-50 border-green-200 text-green-700",
    caution: "bg-yellow-50 border-yellow-200 text-yellow-700",
    not_recommended: "bg-red-50 border-red-200 text-red-700",
    unknown: "bg-secondary border-border text-muted-foreground",
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-all active:scale-[0.99] ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <span className="font-semibold text-sm text-foreground">{product.name}</span>
          {product.brand !== "—" && (
            <span className="text-xs text-muted-foreground ml-2">{product.brand}</span>
          )}
        </div>
        {isSelected && (
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
        <span className="text-muted-foreground">{TIP_PROIZVODA_LABELS[product.productType]}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{OBLIK_PROIZVODA_LABELS[product.form]}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {product.dosageMin}–{product.dosageMax} {JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}
        </span>
        {product.hasColorIndicator && (
          <span className="text-blue-600 font-medium">Indikator boje</span>
        )}
        <span className={product.topUpAllowed ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          Nadopuna: {product.topUpAllowed ? "DA" : "NE"}
        </span>
        {/* Application category badge */}
        <span className={`px-1.5 py-0.5 rounded font-semibold ${
          product.applicationCategory === "unverified"
            ? "bg-amber-100 text-amber-700"
            : product.applicationCategory === "both"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
        }`}>
          {APPLICATION_CATEGORY_LABELS[product.applicationCategory]}
        </span>
        {/* Status podataka badge */}
        {(() => {
          const sp = product.statusPodataka ?? "potrebna_dopuna";
          const cls = sp === "iz_tds"
            ? "bg-green-50 text-green-700"
            : sp === "djelomicno_iz_tds"
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-700";
          return (
            <span className={`px-1.5 py-0.5 rounded font-semibold ${cls}`}>
              {STATUS_PODATAKA_SHORT[sp]}
            </span>
          );
        })()}
      </div>

      {/* Cycle warning for active product with incomplete data */}
      {isSelected && product.statusPodataka === "potrebna_dopuna" && (
        <div className="mt-2 text-[10px] px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 bg-amber-50 border-amber-300 text-amber-800">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="font-medium leading-tight">
            Proizvod je aktivan. Za nepotpuna polja aplikacija koristi opću logiku dok se ne dopune podaci iz tehničkog lista proizvođača.
          </span>
        </div>
      )}

      {isUnverified && (
        <div className="mt-2 text-[10px] px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 bg-amber-50 border-amber-300 text-amber-800">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="font-medium leading-tight">
            Primjena nije potvrđena za odabrani tip sustava. Provjeriti tehnički list proizvođača.
          </span>
        </div>
      )}

      {incompatibleWithMode && (
        <div className="mt-2 text-[10px] px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 bg-red-50 border-red-200 text-red-700">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="font-medium leading-tight">
            Nije preporučeno za: {CLEANING_MODE_LABELS[incompatibleWithMode]}
          </span>
        </div>
      )}
      {matCompat && matCompat.compatibilityStatus !== "compatible" && (
        <div className={`mt-2 text-[10px] px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 ${COMPAT_STYLE[matCompat.compatibilityStatus]}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="font-medium leading-tight">
            {materialName}: {KOMPATIBILNOST_LABELS[matCompat.compatibilityStatus]}{matCompat.warning ? ` — ${matCompat.warning}` : ""}
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Inline "selected product" summary chip ───────────────────────────────────

interface SelectedProductChipProps {
  product: Product;
  materialName?: string;
  onClear: () => void;
  onView: () => void;
}

export function SelectedProductChip({ product, materialName, onClear, onView }: SelectedProductChipProps) {
  const matCompat = materialName
    ? product.materialCompatibility.find((m) => m.material === materialName)
    : null;

  const hasWarning = matCompat && matCompat.compatibilityStatus !== "compatible";

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
        hasWarning ? "bg-amber-50 border-amber-300" : "bg-primary/5 border-primary/30"
      }`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {OBLIK_PROIZVODA_LABELS[product.form]} · {product.dosageMin}–{product.dosageMax} {JEDINICA_DOZIRANJA_LABELS[product.dosageUnit]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onView} className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
            Info
          </button>
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50 transition-colors" aria-label="Ukloni odabir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {hasWarning && matCompat && (
        <div className="text-[10px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-800 leading-relaxed">
          <strong>{materialName}:</strong> {KOMPATIBILNOST_LABELS[matCompat.compatibilityStatus]}{matCompat.warning ? ` — ${matCompat.warning}` : ""}
        </div>
      )}
      {product.topUpAllowed === false && (
        <div className="text-[10px] bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-800 leading-relaxed">
          Ovaj proizvod nije označen kao prikladan za nadopunu.
        </div>
      )}
      {product.statusPodataka !== "iz_tds" && (
        <div className="text-[10px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-800 leading-relaxed">
          Preporuka koristi podatke iz tehničkog lista proizvođača i opću logiku za nepotpuna polja.
        </div>
      )}
    </div>
  );
}
