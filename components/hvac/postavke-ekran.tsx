"use client";

import { useFontScale, FontScale } from "@/hooks/use-font-scale";
import { useApp } from "@/lib/app-state";
import { EngineOrchestrationPanel } from "./engine-orchestration-panel";

const SCALE_OPTIONS: { value: FontScale; label: string; desc: string }[] = [
  { value: "sm",  label: "S",  desc: "Malo"      },
  { value: "md",  label: "M",  desc: "Normalno"  },
  { value: "lg",  label: "L",  desc: "Veće"      },
  { value: "xl",  label: "XL", desc: "Najveće"   },
];

export function PostavkeEkran() {
  const { nazad } = useApp();
  const { scale, setScale } = useFontScale();

  return (
    <div className="flex flex-col gap-0 min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={nazad}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary active:scale-95 transition-all"
          aria-label="Nazad"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-foreground">Postavke</h1>
      </div>

      <div className="flex flex-col gap-6 px-4 py-5">

        {/* Veličina slova */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Veličina slova
            </span>
            <span className="text-xs text-muted-foreground/60">
              Primjenjuje se na cijelu aplikaciju
            </span>
          </div>

          {/* Tipke za odabir */}
          <div className="grid grid-cols-4 gap-2">
            {SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScale(opt.value)}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 px-2 border transition-all active:scale-95 ${
                  scale === opt.value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-foreground border-border hover:bg-secondary"
                }`}
              >
                <span className={`font-black tabular-nums leading-none ${
                  opt.value === "sm" ? "text-sm"  :
                  opt.value === "md" ? "text-base" :
                  opt.value === "lg" ? "text-xl"  :
                  "text-2xl"
                }`}>
                  {opt.label}
                </span>
                <span className={`text-[10px] font-medium ${
                  scale === opt.value ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>

          {/* Preview teksta */}
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold">Pregled</span>
            <p className="text-base font-semibold text-foreground leading-snug">
              pH 1.40 · Protok 12.5 L/min
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Reakcija je aktivna. TEMP OUT: 42.3 °C
            </p>
            <p className="text-xs text-muted-foreground/60">
              Referentno mjerenje · 17:30
            </p>
          </div>
        </section>

        {/* Engine Admin — collapsible, hidden by default */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Engine Dijagnostika
            </span>
            <span className="text-xs text-muted-foreground/60">
              Tehničke informacije — samo za administratore
            </span>
          </div>
          <EngineOrchestrationPanel />
        </section>

      </div>
    </div>
  );
}
