"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { Product, ProductPhZone, ProductColorIndicator, ProductMaterialCompatibility } from "./product-types";
import { DEMO_PROIZVODI } from "./demo-products";
import { getProizvodiSync, spremiProizvode } from "./storage";
import { nowISO, genId } from "./utils";

// ─── Context type ─────────────────────────────────────────────────────────────

interface ProductState {
  proizvodi: Product[];
  getProizvod: (id: string) => Product | undefined;
  getAktivniProizvodi: () => Product[];
  dodajProizvod: (p: Product) => void;
  urediProizvod: (id: string, izmjene: Partial<Product>) => void;
  duplikajProizvod: (id: string) => void;
  arhivirajProizvod: (id: string) => void;
  urediPhZone: (productId: string, zones: ProductPhZone[]) => void;
  urediColorIndicators: (productId: string, indicators: ProductColorIndicator[]) => void;
  urediMaterialCompatibility: (productId: string, compat: ProductMaterialCompatibility[]) => void;
}

const ProductContext = createContext<ProductState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProductProvider({ children }: { children: React.ReactNode }) {
  // Inicijalizacija: pohrana → demo podaci ako pohrana prazna
  // Koristimo sync varijantu jer useState inicijalizator ne može biti async.
  const [proizvodi, setProizvodi] = useState<Product[]>(() => getProizvodiSync() ?? DEMO_PROIZVODI);

  // Svaka izmjena stanja se automatski sprema u pohranu (fire-and-forget async)
  const updateProizvode = useCallback((updater: (prev: Product[]) => Product[]) => {
    setProizvodi((prev) => {
      const sljedece = updater(prev);
      void spremiProizvode(sljedece);
      return sljedece;
    });
  }, []);

  const getProizvod = useCallback(
    (id: string) => proizvodi.find((p) => p.id === id),
    [proizvodi]
  );

  const getAktivniProizvodi = useCallback(
    () => proizvodi.filter((p) => p.status !== "arhiviran"),
    [proizvodi]
  );

  const dodajProizvod = useCallback((p: Product) => {
    updateProizvode((prev) => [...prev, p]);
  }, [updateProizvode]);

  const urediProizvod = useCallback((id: string, izmjene: Partial<Product>) => {
    updateProizvode((prev) =>
      prev.map((p) =>
        p.id !== id ? p : { ...p, ...izmjene, updatedAt: nowISO() }
      )
    );
  }, [updateProizvode]);

  const duplikajProizvod = useCallback((id: string) => {
    updateProizvode((prev) => {
      const original = prev.find((p) => p.id === id);
      if (!original) return prev;
      const now = nowISO();
      const copy: Product = {
        ...original,
        id: genId("prod"),
        name: `${original.name} (kopija)`,
        status: "aktivan",
        statusPodataka: "potrebna_dopuna",
        isDemo: false,
        createdAt: now,
        updatedAt: now,
        phZones: original.phZones.map((z) => ({ ...z, id: genId("z") })),
        indicatorZones: (original.indicatorZones ?? []).map((iz) => ({ ...iz, id: genId("iz") })),
        colorIndicators: original.colorIndicators.map((c) => ({ ...c, id: genId("ci") })),
        materialCompatibility: original.materialCompatibility.map((m) => ({ ...m, id: genId("mat") })),
      };
      return [...prev, copy];
    });
  }, [updateProizvode]);

  const arhivirajProizvod = useCallback((id: string) => {
    updateProizvode((prev) =>
      prev.map((p) =>
        p.id !== id ? p : { ...p, status: "arhiviran" as const, updatedAt: nowISO() }
      )
    );
  }, [updateProizvode]);

  const urediPhZone = useCallback((productId: string, zones: ProductPhZone[]) => {
    updateProizvode((prev) =>
      prev.map((p) =>
        p.id !== productId ? p : { ...p, phZones: zones, updatedAt: nowISO() }
      )
    );
  }, [updateProizvode]);

  const urediColorIndicators = useCallback((productId: string, indicators: ProductColorIndicator[]) => {
    updateProizvode((prev) =>
      prev.map((p) =>
        p.id !== productId ? p : { ...p, colorIndicators: indicators, updatedAt: nowISO() }
      )
    );
  }, [updateProizvode]);

  const urediMaterialCompatibility = useCallback((productId: string, compat: ProductMaterialCompatibility[]) => {
    updateProizvode((prev) =>
      prev.map((p) =>
        p.id !== productId ? p : { ...p, materialCompatibility: compat, updatedAt: nowISO() }
      )
    );
  }, [updateProizvode]);

  return (
    <ProductContext.Provider
      value={{
        proizvodi,
        getProizvod,
        getAktivniProizvodi,
        dodajProizvod,
        urediProizvod,
        duplikajProizvod,
        arhivirajProizvod,
        urediPhZone,
        urediColorIndicators,
        urediMaterialCompatibility,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts(): ProductState {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProducts mora biti unutar ProductProvider-a");
  return ctx;
}
