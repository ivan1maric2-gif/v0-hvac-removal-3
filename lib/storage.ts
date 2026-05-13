/**
 * lib/storage.ts
 *
 * JEDINO MJESTO za pristup pohrani u cijeloj aplikaciji.
 *
 * Sesije → Supabase (cloud, dostupno na svim uredajima)
 * Proizvodi → localStorage (lokalno, bez potrebe za cloudom)
 */

import { createClient } from "./supabase/client";
import type { Sesija } from "./types";
import type { Product } from "./product-types";
import { nowISO } from "./utils";

/** Returns the Supabase client, or null if env vars are not configured. */
function getSupabase() {
  try {
    return createClient();
  } catch (err) {
    console.warn("[storage] Supabase nije konfiguriran:", (err as Error).message);
    return null;
  }
}

// ─── SESIJE — Supabase ────────────────────────────────────────────────────────

/**
 * Vraca sve sesije iz Supabase baze.
 */
export async function getSesije(): Promise<Sesija[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("sesije")
    .select("podaci")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[storage] getSesije greška:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data.map((r: { podaci: unknown }) => r.podaci as Sesija);
}

/**
 * Sprema cijelu listu sesija — brise sve iz baze i upisuje iznova.
 */
export async function spremiSesije(sesije: Sesija[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Dohvati sve postojece ID-jeve
  const { data: existing } = await supabase.from("sesije").select("id");
  const existingIds: string[] = (existing ?? []).map((r: { id: string }) => r.id);
  const newIds = new Set(sesije.map((s) => s.id));

  // Obrisi one kojih nema u novoj listi
  const toDelete = existingIds.filter((id: string) => !newIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from("sesije").delete().in("id", toDelete);
  }

  // Upsert sesija
  if (sesije.length > 0) {
    const now = nowISO();
    const rows = sesije.map((s) => ({
      id: s.id,
      podaci: { ...s, updatedAt: now },
    }));
    const { error } = await supabase.from("sesije").upsert(rows, { onConflict: "id" });
    if (error) console.warn("[storage] spremiSesije greška:", error.message);
  }
}

/**
 * Upsert jedne sesije — dodaje ili azurira po ID-u.
 */
export async function spremiSesiju(sesija: Sesija): Promise<void> {
  const now = nowISO();
  const stamped: Sesija = {
    ...sesija,
    createdAt: sesija.createdAt ?? now,
    updatedAt: now,
  };
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("sesije")
    .upsert({ id: stamped.id, podaci: stamped }, { onConflict: "id" });
  if (error) console.warn("[storage] spremiSesiju greška:", error.message);
}

/**
 * Brise jednu sesiju iz Supabase po ID-u.
 */
export async function obrisiSesijuIzPohrane(sesijaId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("sesije").delete().eq("id", sesijaId);
  if (error) console.warn("[storage] obrisiSesiju greška:", error.message);
}

/**
 * Brise sve sesije iz baze (reset).
 */
export async function resetirajSesije(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("sesije").delete().neq("id", "");
}

// ─── Sesije — English aliases ─────────────────────────────────────────────────
export const getSessions = getSesije;
export const saveSession = spremiSesiju;
export const updateSession = spremiSesiju;
export const deleteSession = obrisiSesijuIzPohrane;

// ─── Sync initializer za useState ─────────────────────────────────────────────
// useState ne može koristiti async inicijalizator.
// Vraca null — app ce async ucitati sesije nakon mounta.
export function getSesijeSync(): Sesija[] | null {
  return null;
}

// ─── PROIZVODI — localStorage ─────────────────────────────────────────────────

const KLJUC_PROIZVODI = "hvac_proizvodi_v1";

function citaj<T>(kljuc: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const sirovo = localStorage.getItem(kljuc);
    if (!sirovo) return null;
    return JSON.parse(sirovo) as T;
  } catch {
    return null;
  }
}

function pisi<T>(kljuc: string, vrijednost: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(kljuc, JSON.stringify(vrijednost));
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[storage] localStorage greška:", kljuc, err);
    }
  }
}

export async function getProizvodi(): Promise<Product[] | null> {
  return Promise.resolve(citaj<Product[]>(KLJUC_PROIZVODI));
}

export async function spremiProizvode(proizvodi: Product[]): Promise<void> {
  return Promise.resolve(pisi(KLJUC_PROIZVODI, proizvodi));
}

export async function spremiProizvod(proizvod: Product): Promise<void> {
  const now = nowISO();
  const stamped: Product = { ...proizvod, createdAt: proizvod.createdAt ?? now, updatedAt: now };
  const svi = citaj<Product[]>(KLJUC_PROIZVODI) ?? [];
  const idx = svi.findIndex((p) => p.id === stamped.id);
  if (idx >= 0) svi[idx] = stamped; else svi.push(stamped);
  return Promise.resolve(pisi(KLJUC_PROIZVODI, svi));
}

export async function obrisiProizvodIzPohrane(proizvodId: string): Promise<void> {
  const svi = citaj<Product[]>(KLJUC_PROIZVODI) ?? [];
  return Promise.resolve(pisi(KLJUC_PROIZVODI, svi.filter((p) => p.id !== proizvodId)));
}

export async function resetirajProizvode(): Promise<void> {
  if (typeof window !== "undefined") localStorage.removeItem(KLJUC_PROIZVODI);
}

export function getProizvodiSync(): Product[] | null {
  return citaj<Product[]>(KLJUC_PROIZVODI);
}

export const getProducts = getProizvodi;
export const saveProduct = spremiProizvod;
export const updateProduct = spremiProizvod;
export const deleteProduct = obrisiProizvodIzPohrane;
