"use client";

/**
 * In-memory draft store — persists form data across back-navigation.
 *
 * Rule: "Što je uneseno → ostaje uneseno"
 *
 * Each screen writes its draft on every field change and reads it on mount.
 * Draft is cleared only after a successful save action.
 *
 * No React context required — plain module-level Map so it survives
 * component unmount/remount within the same browser session.
 */

// ─── Draft keys ───────────────────────────────────────────────────────────────

export const DRAFT_KEYS = {
  /** Setup ekran — Postavljanje uređaja */
  setupCiklus: (sessionId: string) => `draft_setup_ciklus_${sessionId}`,
  /** Brzi pokretanje ciklusa — Sredstvo, Voda, Količina */
  brziCiklus: (sessionId: string) => `draft_brzi_ciklus_${sessionId}`,
  /** Unos mjerenja — pH, protok, pjena, boja, napomena */
  mjerenje: (cycleId: string) => `draft_mjerenje_${cycleId}`,
  /** Nadopuna */
  nadopuna: (cycleId: string) => `draft_nadopuna_${cycleId}`,
  /** Završni pH check — neutralizacija i ispiranje */
  zavrsniPh: (sessionId: string) => `draft_zavrsni_ph_${sessionId}`,
} as const;

// ─── Storage ──────────────────────────────────────────────────────────────────

// Use sessionStorage for persistence across navigation and page refreshes
// Falls back to in-memory Map for SSR or if sessionStorage is unavailable

const STORAGE_PREFIX = "v0_draft_";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Test if sessionStorage is available
    sessionStorage.setItem("__test__", "1");
    sessionStorage.removeItem("__test__");
    return sessionStorage;
  } catch {
    return null;
  }
}

// Fallback in-memory store for SSR
const fallbackStore = new Map<string, unknown>();

/**
 * Read a draft value. Returns `undefined` if no draft exists for the key.
 */
export function readDraft<T>(key: string): T | undefined {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_PREFIX + key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Parse error — ignore
    }
    return undefined;
  }
  return fallbackStore.get(key) as T | undefined;
}

/**
 * Write (or overwrite) a draft value.
 */
export function writeDraft<T>(key: string, value: T): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or other error — fallback to memory
      fallbackStore.set(key, value);
    }
  } else {
    fallbackStore.set(key, value);
  }
}

/**
 * Merge a partial update into an existing draft object.
 * If no draft exists yet, the partial becomes the initial draft.
 */
export function mergeDraft<T extends object>(key: string, partial: Partial<T>): void {
  const existing = readDraft<T>(key);
  writeDraft(key, { ...(existing ?? {}), ...partial });
}

/**
 * Clear a specific draft (call after successful save).
 */
export function clearDraft(key: string): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(STORAGE_PREFIX + key);
  }
  fallbackStore.delete(key);
}

/**
 * Clear all drafts — use sparingly (e.g. logout / new session).
 */
export function clearAllDrafts(): void {
  const storage = getStorage();
  if (storage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => storage.removeItem(k));
  }
  fallbackStore.clear();
}
