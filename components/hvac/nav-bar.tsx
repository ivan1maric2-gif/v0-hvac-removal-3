"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/app-state";
import type { Ekran } from "@/lib/app-state";




// ─── Helpers ─────────────────────────────────────────────────────────────────

function screenTitle(ekran: Ekran): string {
  switch (ekran.ime) {
    case "pocetni":       return "HVAC Descaling";
    case "nova_sesija":   return "Nova sesija";
    case "sesija":        return "Sesija";
    case "podsesija":     return "Dio sustava";
    case "povijest":      return "Povijest";
    case "baza_proizvoda":return "Baza proizvoda";
    case "postavke":      return "Postavke";
    default:              return "";
  }
}

// ─── Breadcrumb item type ─────────────────────────────────────────────────────

interface BreadcrumbItem {
  label: string;
  ekran?: Ekran;
}

function buildBreadcrumbs(
  ekran: Ekran,
  sesije: ReturnType<typeof useApp>["sesije"]
): BreadcrumbItem[] {
  const home: BreadcrumbItem = { label: "HVAC Descaling", ekran: { ime: "pocetni" } };

  switch (ekran.ime) {
    case "pocetni":
      return [{ label: "HVAC Descaling" }];

    case "nova_sesija":
      return [home, { label: "Nova sesija" }];

    case "povijest":
      return [home, { label: "Povijest" }];

    case "baza_proizvoda":
      return [home, { label: "Baza proizvoda" }];

    case "postavke":
      return [home, { label: "Postavke" }];

    case "sesija": {
      const sesija = sesije.find((s) => s.id === ekran.sesijaId);
      const modeLabel = sesija?.workMode === "no_subsessions" ? "Jedan uredaj" : "Vise dijelova";
      return [
        home,
        { label: `Sesija: ${sesija?.naziv_objekta ?? "…"}` },
        { label: modeLabel },
      ];
    }

    case "podsesija": {
      const sesija = sesije.find((s) => s.id === ekran.sesijaId);
      const podsesija = sesija?.podsesije?.find((p) => p.id === ekran.podsesijaId);
      const modeLabel = "Vise dijelova";
      return [
        home,
        {
          label: `Sesija: ${sesija?.naziv_objekta ?? "…"}`,
          ekran: { ime: "sesija", sesijaId: ekran.sesijaId },
        },
        { label: modeLabel },
        { label: `${podsesija?.naziv ?? "…"}` },
      ];
    }

    default:
      return [home];
  }
}

// ─── Shared icon buttons ──────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Prebaci na svjetlu temu" : "Prebaci na tamnu temu"}
      className="w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-95 text-muted-foreground bg-muted hover:text-foreground"
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function MicButton() {
  const [active, setActive] = useState(false);

  const handleClick = () => {
    // Dispatch a custom event that any active screen can listen to
    window.dispatchEvent(new CustomEvent("hvac:toggle-voice"));
    setActive((v) => !v);
  };

  // Sync state when voice panel closes externally
  useEffect(() => {
    const off = () => setActive(false);
    window.addEventListener("hvac:voice-closed", off);
    return () => window.removeEventListener("hvac:voice-closed", off);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Glasovni unos"
      className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
        active
          ? "text-white bg-red-500 shadow-sm shadow-red-500/40"
          : "text-muted-foreground bg-muted hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-300 animate-ping" />
      )}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NavBar() {
  const { ekran, sesije, nazad, naprijed, idi_na_pocetni, mozeLiNazad, mozeLiNaprijed } = useApp();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Sve dok nije mountano na klijentu, uvijek renderiramo "pocetni" stanje
  // kako bismo izbjegli hydration mismatch (SSR nema localStorage).
  const isPocetni = !mounted || ekran.ime === "pocetni";

  return (
    <div className="sticky top-0 z-50 border-b border-border shadow-sm bg-background">
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center px-3 py-2 gap-1 min-h-[48px]">

        {/* LEFT: brand name on pocetni / back+forward na ostalim ekranima */}
        {isPocetni ? (
          <span className="text-sm font-bold text-foreground tracking-tight shrink-0">
            HVAC Descaling
          </span>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {/* Nazad */}
            <button
              onClick={nazad}
              disabled={!mozeLiNazad}
              aria-label="Natrag"
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95 shrink-0 ${
                mozeLiNazad
                  ? "bg-muted hover:bg-primary/10 hover:text-primary text-foreground"
                  : "bg-muted/40 text-muted-foreground/30 cursor-not-allowed"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>

            {/* Naprijed — vidljiv samo ako ima ekrana naprijed */}
            {mozeLiNaprijed && (
              <button
                onClick={naprijed}
                aria-label="Naprijed"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted hover:bg-primary/10 hover:text-primary text-foreground active:scale-95 transition-all shrink-0"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* MIDDLE: spacer */}
        <div className="flex-1" />

        {/* RIGHT: home + theme + mic */}
        <div className="flex items-center gap-1 shrink-0">
          {!isPocetni && (
            <button
              onClick={idi_na_pocetni}
              aria-label="Pocetna"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                <path d="M9 21V12h6v9" />
              </svg>
            </button>
          )}
          <ThemeToggle />
          <MicButton />
        </div>
      </div>
    </div>
  );
}
