"use client";

/**
 * Product / Chemistry / Material Safety UI cards.
 *
 * UI = display only. Engine = brain.
 * No calculations, no zone inferences, no compatibility logic in this file.
 *
 * Data sources:
 *   - ProductEngine    → getProductEngine(productSnapshot)
 *   - ProductSnapshot  → ciklus.productSnapshot
 *   - Product          → full Product object (when available)
 */

import type { ProductEngine } from "@/lib/product-engine-types";
import type { ProductSnapshot, ProductMaterialCompatibility } from "@/lib/product-types";
import {
  OBLIK_PROIZVODA_LABELS,
  JEDINICA_DOZIRANJA_LABELS,
  APPLICATION_CATEGORY_LABELS,
  APPLICATION_CATEGORY_WARNING,
  KOMPATIBILNOST_LABELS,
  STATUS_PODATAKA_SHORT,
  VERIFICATION_STATUS_LABELS,
  PH_ZONE_STATUS_LABELS,
} from "@/lib/product-types";

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Map engine thermal level → Tailwind color classes */
function thermalLevelBg(level: "slow" | "normal" | "optimal" | "caution" | "warning"): string {
  switch (level) {
    case "slow":    return "bg-slate-100 text-slate-600 border-slate-200";
    case "normal":  return "bg-teal-50 text-teal-700 border-teal-200";
    case "optimal": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "caution": return "bg-amber-50 text-amber-700 border-amber-200";
    case "warning": return "bg-red-50 text-red-700 border-red-200";
  }
}

/** Map KompatibilnostStatus → Tailwind color classes */
function compatBg(status: string): string {
  switch (status) {
    case "compatible":       return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "caution":          return "bg-amber-50 text-amber-700 border-amber-200";
    case "not_recommended":  return "bg-red-50 text-red-700 border-red-200";
    default:                 return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

/** Map pH zone status → Tailwind color for badge */
function phZoneBg(status: string): string {
  switch (status) {
    case "too_strong":  return "bg-red-100 text-red-700 border-red-200";
    case "active":      return "bg-orange-100 text-orange-700 border-orange-200";
    case "optimal":     return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "weakening":   return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "exhausted":   return "bg-slate-100 text-slate-600 border-slate-200";
    case "neutralized": return "bg-sky-100 text-sky-700 border-sky-200";
    default:            return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

/** Map chemical strength → badge classes */
function strengthBg(strength: string): string {
  switch (strength) {
    case "maksimalno":    return "bg-red-100 text-red-700 border-red-200";
    case "aktivno":       return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "slabi":         return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "iscrpljeno":    return "bg-slate-100 text-slate-600 border-slate-200";
    case "neutralizirano":return "bg-sky-100 text-sky-700 border-sky-200";
    default:              return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

// Section header sub-component
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
      {children}
    </p>
  );
}

// Badge sub-component
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block text-[11px] font-bold border rounded-full px-2.5 py-0.5 leading-tight ${className}`}>
      {label}
    </span>
  );
}

// ─── 1. PRODUCT CARD ──────────────────────────────────────────────────────────

interface ProductCardProps {
  productSnapshot: ProductSnapshot | null | undefined;
  engine: ProductEngine;
}

export function ProductCard({ productSnapshot, engine }: ProductCardProps) {
  if (!productSnapshot) return null;

  const appWarning = APPLICATION_CATEGORY_WARNING[productSnapshot.applicationCategory];
  const isUnverified = productSnapshot.verificationStatus === "unverified";
  const statusPodatakaLabel = productSnapshot.statusPodataka
    ? STATUS_PODATAKA_SHORT[productSnapshot.statusPodataka]
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <SectionLabel>Odabrani proizvod</SectionLabel>
          <h3 className="text-base font-black text-slate-800 leading-tight">{productSnapshot.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{productSnapshot.brand}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <Badge
            label={APPLICATION_CATEGORY_LABELS[productSnapshot.applicationCategory]}
            className="bg-teal-50 text-teal-700 border-teal-200"
          />
          {isUnverified && (
            <Badge
              label="Nije potvrđeno iz TDS-a"
              className="bg-amber-50 text-amber-700 border-amber-200"
            />
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4">

        {/* Application warning */}
        {appWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-800 leading-relaxed">{appWarning}</p>
          </div>
        )}

        {/* Dosing */}
        <div>
          <SectionLabel>Doziranje</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-500">Min: </span>
              <strong className="text-slate-800">{productSnapshot.dosageMin}</strong>
              <span className="text-slate-500 ml-1">{productSnapshot.dosageUnit}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-500">Max: </span>
              <strong className="text-slate-800">{productSnapshot.dosageMax}</strong>
              <span className="text-slate-500 ml-1">{productSnapshot.dosageUnit}</span>
            </div>
            {productSnapshot.dosageNote && (
              <p className="w-full text-xs text-slate-500 mt-0.5">{productSnapshot.dosageNote}</p>
            )}
          </div>
        </div>

        {/* Safe for / Not for */}
        {((productSnapshot.safeFor?.length ?? 0) > 0 || (productSnapshot.notFor?.length ?? 0) > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {(productSnapshot.safeFor?.length ?? 0) > 0 && (
              <div>
                <SectionLabel>Sigurno za</SectionLabel>
                <div className="flex flex-col gap-1">
                  {productSnapshot.safeFor!.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                      <span className="text-xs text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(productSnapshot.notFor?.length ?? 0) > 0 && (
              <div>
                <SectionLabel>Nije za</SectionLabel>
                <div className="flex flex-col gap-1">
                  {productSnapshot.notFor!.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                      <span className="text-xs text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rinse + Neutralization requirements from engine */}
        <div className="flex flex-wrap gap-2">
          <Badge
            label={engine.compatibility.rinseRequired ? "Ispiranje obavezno" : "Ispiranje nije obavezno"}
            className={engine.compatibility.rinseRequired ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"}
          />
          <Badge
            label={engine.compatibility.neutralizationRequired ? "Neutralizacija obavezna" : "Neutralizacija nije obavezna"}
            className={engine.compatibility.neutralizationRequired ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"}
          />
        </div>

        {/* Source document */}
        {statusPodatakaLabel && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400">
              Podaci: <span className="font-medium text-slate-500">{statusPodatakaLabel}</span>
              {productSnapshot.applicationSourceDocument && (
                <span className="ml-1">· {productSnapshot.applicationSourceDocument}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2. CHEMISTRY INTERPRETATION CARD ────────────────────────────────────────

interface ChemistryCardProps {
  engine: ProductEngine;
  currentPh: number | null | undefined;
  /** Current indicator color name from measurement (e.g. "Žuta", "Zelena") */
  currentColorName?: string | null;
}

export function ChemistryCard({ engine, currentPh, currentColorName }: ChemistryCardProps) {
  // Find active pH zone from engine — no UI logic, just match
  const activePhZone = currentPh != null
    ? engine.phZones.find((z) => {
        const above = z.phMin == null || currentPh >= z.phMin;
        const below = z.phMax == null || currentPh < z.phMax;
        return above && below;
      }) ?? null
    : null;

  // Find active color zone from engine — match by colorName
  const activeColorZone = currentColorName
    ? engine.colorZones.find((z) => z.colorName.toLowerCase() === currentColorName.toLowerCase()) ?? null
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <SectionLabel>Interpretacija kemije</SectionLabel>
        <h3 className="text-base font-black text-slate-800">{engine.productName}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{engine.brand} · {engine.indicatorModel}</p>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4">

        {/* Current pH zone */}
        {activePhZone ? (
          <div>
            <SectionLabel>Trenutna pH zona</SectionLabel>
            <div className={`rounded-lg border px-3 py-2.5 ${phZoneBg(activePhZone.status)}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-black leading-tight">{activePhZone.label}</p>
                <Badge
                  label={PH_ZONE_STATUS_LABELS[activePhZone.status] ?? activePhZone.status}
                  className={phZoneBg(activePhZone.status)}
                />
              </div>
              <p className="text-xs leading-relaxed opacity-80">{activePhZone.description}</p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-slate-500">pH nije dostupan — zona se ne može odrediti.</p>
          </div>
        )}

        {/* Color zone */}
        {activeColorZone ? (
          <div>
            <SectionLabel>Indikator boje</SectionLabel>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                <div
                  className="w-5 h-5 rounded-full border border-white/60 shadow-sm shrink-0"
                  style={{ backgroundColor: activeColorZone.colorHex }}
                  aria-hidden="true"
                />
                <p className="text-sm font-black text-slate-800">{activeColorZone.colorName} — {activeColorZone.label}</p>
                <Badge
                  label={activeColorZone.chemicalStrength}
                  className={strengthBg(activeColorZone.chemicalStrength)}
                />
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-slate-600 leading-relaxed mb-1.5">{activeColorZone.description}</p>
                <p className="text-xs font-bold text-slate-700">{activeColorZone.action}</p>
              </div>
            </div>
          </div>
        ) : engine.colorZones.length > 0 ? (
          <div>
            <SectionLabel>Sve zone indikatora</SectionLabel>
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {engine.colorZones.map((zone, i) => (
                <div key={i} className="px-3 py-2 flex items-center gap-2.5">
                  <div
                    className="w-4 h-4 rounded-full border border-white/60 shadow-sm shrink-0"
                    style={{ backgroundColor: zone.colorHex }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700">{zone.colorName} — {zone.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{zone.description}</p>
                  </div>
                  <Badge label={zone.chemicalStrength} className={strengthBg(zone.chemicalStrength)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Foam logic */}
        {engine.foamLogic && (
          <div>
            <SectionLabel>Pjena — interpretacija</SectionLabel>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" aria-hidden="true" />
                <p className="text-xs text-slate-600 leading-relaxed">{engine.foamLogic.whiteFoamMeaning}</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" aria-hidden="true" />
                <p className="text-xs text-slate-600 leading-relaxed">{engine.foamLogic.noFoamMeaning}</p>
              </div>
              {engine.foamLogic.darkFoamMeaning && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" aria-hidden="true" />
                  <p className="text-xs text-slate-600 leading-relaxed">{engine.foamLogic.darkFoamMeaning}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Finish cycle criteria */}
        {engine.finishCycleCriteria.criteria.length > 0 && (
          <div>
            <SectionLabel>Kriteriji za završetak ciklusa</SectionLabel>
            <div className="flex flex-col gap-1">
              {engine.finishCycleCriteria.criteria.map((criterion, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded border border-slate-200 bg-slate-50 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-slate-700 leading-relaxed">{criterion}</p>
                </div>
              ))}
            </div>
            {engine.finishCycleCriteria.note && (
              <p className="text-xs text-slate-500 italic mt-1.5 leading-relaxed">{engine.finishCycleCriteria.note}</p>
            )}
          </div>
        )}

        {/* Thermal model */}
        {engine.thermalModel.length > 0 && (
          <div>
            <SectionLabel>Toplinska učinkovitost</SectionLabel>
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {engine.thermalModel.map((row, i) => (
                <div key={i} className={`px-3 py-2 flex items-center justify-between gap-3 ${thermalLevelBg(row.level)}`}>
                  <span className="text-xs font-black tabular-nums shrink-0">{row.rangeLabel}</span>
                  <span className="text-xs leading-relaxed text-right">{row.efficiency}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3. MATERIAL SAFETY CARD ──────────────────────────────────────────────────

interface MaterialSafetyCardProps {
  productSnapshot: ProductSnapshot | null | undefined;
  engine: ProductEngine;
}

export function MaterialSafetyCard({ productSnapshot, engine }: MaterialSafetyCardProps) {
  if (!productSnapshot) return null;

  const materialCompat = productSnapshot.materialCompatibility ?? [];
  const hasCritical = materialCompat.some((m) => m.compatibilityStatus === "not_recommended");
  const hasCaution  = materialCompat.some((m) => m.compatibilityStatus === "caution");

  const headerBg = hasCritical ? "bg-red-600 border-red-500" :
                   hasCaution  ? "bg-amber-500 border-amber-400" :
                   "bg-slate-700 border-slate-600";

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Priority header */}
      <div className={`px-4 py-3 border-b ${headerBg}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-0.5">
          Sigurnost materijala
        </p>
        <h3 className="text-sm font-black text-white leading-tight">
          {hasCritical ? "Upozorenje — neke kombinacije nisu preporučene" :
           hasCaution  ? "Oprez — pratiti određene materijale" :
           "Materijalna kompatibilnost"}
        </h3>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4">

        {/* Material compatibility list */}
        {materialCompat.length > 0 ? (
          <div>
            <SectionLabel>Kompatibilnost materijala</SectionLabel>
            <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {materialCompat.map((m, i) => (
                <MaterialCompatRow key={i} item={m} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-slate-500">Nema podataka o materijalnoj kompatibilnosti.</p>
          </div>
        )}

        {/* Compatibility limits from engine */}
        <div>
          <SectionLabel>Ograničenja iz enginea</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Maks. temperatura</p>
              <p className="text-sm font-black text-slate-800">{engine.compatibility.maxTempC} °C</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Maks. trajanje</p>
              <p className="text-sm font-black text-slate-800">{engine.compatibility.maxCycleDurationMinutes} min</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Maks. koncentracija</p>
              <p className="text-sm font-black text-slate-800">{engine.compatibility.maxConcentration}%</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Min. temperatura</p>
              <p className="text-sm font-black text-slate-800">{engine.compatibility.minTempC} °C</p>
            </div>
          </div>
          {engine.compatibility.note && (
            <p className="text-xs text-slate-500 italic mt-2 leading-relaxed">{engine.compatibility.note}</p>
          )}
        </div>

        {/* Potable water warning */}
        {productSnapshot.potableWaterWarning && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <div className="shrink-0 w-4 h-4 rounded-full bg-red-100 border border-red-300 flex items-center justify-center mt-0.5">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-700" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="15"/><line x1="12" y1="19" x2="12.01" y2="19"/>
              </svg>
            </div>
            <p className="text-xs text-red-800 leading-relaxed">{productSnapshot.potableWaterWarning}</p>
          </div>
        )}

        {/* Technical water warning */}
        {productSnapshot.technicalWaterWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-amber-800 leading-relaxed">{productSnapshot.technicalWaterWarning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Material compat row sub-component
function MaterialCompatRow({ item }: { item: ProductMaterialCompatibility }) {
  const bg = compatBg(item.compatibilityStatus);
  const label = KOMPATIBILNOST_LABELS[item.compatibilityStatus] ?? item.compatibilityStatus;

  return (
    <div className="px-3 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-bold text-slate-800">{item.material}</p>
          {item.maxContactTimeMinutes != null && (
            <span className="text-[10px] text-slate-400">maks. {item.maxContactTimeMinutes} min</span>
          )}
        </div>
        {item.warning && (
          <p className="text-xs text-slate-500 leading-relaxed">{item.warning}</p>
        )}
      </div>
      <Badge label={label} className={`shrink-0 ${bg}`} />
    </div>
  );
}

// ─── 4. COMPATIBILITY WARNING BANNERS ─────────────────────────────────────────

interface CompatibilityWarningsProps {
  productSnapshot: ProductSnapshot | null | undefined;
  engine: ProductEngine;
  /** Current temperature OUT (°C) */
  currentTempC?: number | null;
  /** Current concentration (%) */
  currentConcentration?: number | null;
  /** Subsystem / part type label (e.g. "Spirala TPV") */
  partType?: string | null;
}

export function CompatibilityWarnings({
  productSnapshot,
  engine,
  currentTempC,
  currentConcentration,
  partType,
}: CompatibilityWarningsProps) {
  if (!productSnapshot) return null;

  // Collect warnings — no logic, just display engine-derived facts
  const warnings: Array<{ level: "critical" | "warn" | "info"; message: string }> = [];

  // Temperature warning — compare against engine compatibility
  if (currentTempC != null && currentTempC > engine.compatibility.maxTempC) {
    warnings.push({
      level: "critical",
      message: `Temperatura ${currentTempC.toFixed(1)} °C prelazi maksimalnu preporučenu vrijednost (${engine.compatibility.maxTempC} °C).`,
    });
  }

  // Concentration warning
  if (currentConcentration != null && currentConcentration > engine.compatibility.maxConcentration) {
    warnings.push({
      level: "warn",
      message: `Koncentracija ${currentConcentration.toFixed(1)}% prelazi maksimalnu preporučenu vrijednost (${engine.compatibility.maxConcentration}%).`,
    });
  }

  // Application category warning — from productSnapshot directly
  const appWarning = APPLICATION_CATEGORY_WARNING[productSnapshot.applicationCategory];
  if (appWarning) {
    warnings.push({ level: "warn", message: appWarning });
  }

  // TPV part type warning — from productSnapshot.potableWaterWarning
  if (partType && productSnapshot.potableWaterWarning) {
    warnings.push({ level: "critical", message: productSnapshot.potableWaterWarning });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 ${
            w.level === "critical" ? "bg-red-50 border-red-200" :
            w.level === "warn"     ? "bg-amber-50 border-amber-200" :
            "bg-sky-50 border-sky-200"
          }`}
        >
          <div className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${
            w.level === "critical" ? "bg-red-100 border border-red-300" :
            w.level === "warn"     ? "bg-amber-100 border border-amber-300" :
            "bg-sky-100 border border-sky-300"
          }`}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              className={w.level === "critical" ? "text-red-700" : w.level === "warn" ? "text-amber-700" : "text-sky-700"}
              aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="15"/><line x1="12" y1="19" x2="12.01" y2="19"/>
            </svg>
          </div>
          <p className={`text-xs leading-relaxed ${
            w.level === "critical" ? "text-red-800" :
            w.level === "warn"     ? "text-amber-800" :
            "text-sky-800"
          }`}>{w.message}</p>
        </div>
      ))}
    </div>
  );
}
