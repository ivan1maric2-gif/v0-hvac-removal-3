"use client";

import { useApp } from "@/lib/app-state";
import { NavBar } from "./nav-bar";
import { PocetniEkran } from "./pocetni-ekran";
import { NovaSesijaEkran } from "./nova-sesija-ekran";
import { SesijaEkran } from "./sesija-ekran";
import { PodsesijaEkran } from "./podsesija-ekran";
import { PovijestEkran } from "./povijest-ekran";
import { BazaProizvodaEkran } from "./baza-proizvoda-ekran";
import { PostavkeEkran } from "./postavke-ekran";

export function AppShell() {
  const { ekran } = useApp();

  function renderScreen() {
    switch (ekran.ime) {
      case "pocetni":
        return <PocetniEkran />;
      case "nova_sesija":
        return <NovaSesijaEkran />;
      case "sesija":
        return <SesijaEkran sesijaId={ekran.sesijaId} />;
      case "podsesija":
        return <PodsesijaEkran sesijaId={ekran.sesijaId} podsesijaId={ekran.podsesijaId} />;
      case "povijest":
        return <PovijestEkran />;
      case "baza_proizvoda":
        return <BazaProizvodaEkran />;
      case "postavke":
        return <PostavkeEkran />;
      default:
        return <PocetniEkran />;
    }
  }

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex justify-center">
      <div className="flex flex-col min-h-[100dvh] w-full max-w-lg bg-background shadow-xl">
        <NavBar />
        <main className="flex-1 overflow-y-auto">
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}
