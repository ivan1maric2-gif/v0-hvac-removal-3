"use client";

import { useState, useCallback, useMemo } from "react";
import { useApp } from "@/lib/app-state";
import { genId, nowISO } from "@/lib/utils";
import type { Ciklus, Mjerenje, RazlogCiklusa, JedinicaProtoka, DrainSediment, JedinicaKemikalije } from "@/lib/types";
import { NoviCiklusPrep, type PrepData, type PreviousCycleContext } from "./novi-ciklus-prep";
import { PunjenjeVodom, type WaterFillingData, type CycleReferenceData } from "./punjenje-vodom";
import { DodavanjeKemije, type ChemicalFillingData } from "./dodavanje-kemije";
import { NultoMjerenje, type ZeroMeasurementData } from "./nulto-mjerenje";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStep = 
  | "prep"           // NoviCiklusPrep - zatvaranje starog, ispiranje, početno stanje, razlog
  | "water"          // PunjenjeVodom - unos količine vode
  | "chemical"       // DodavanjeKemije - proizvod, količina, koncentracija
  | "zero"           // NultoMjerenje - pH, protok, temp nakon kemije
  | "done";          // Workflow završen, ciklus spreman za Live praćenje

interface WorkflowState {
  step: WorkflowStep;
  prepData?: PrepData;
  waterData?: WaterFillingData;
  chemicalData?: ChemicalFillingData;
  zeroData?: ZeroMeasurementData;
}

interface Props {
  sesijaId: string;
  /** Naziv objekta za prikaz u headeru */
  nazivObjekta?: string;
  /** Tip sustava (TPV, tehnicka_voda) */
  tipSustava?: string;
  /** Tip problema (kamenac, mulj, biofilm) */
  tipProblema?: string;
  /** Procijenjeni volumen sustava u litrama */
  procijenjeniVolumenL?: number;
  /** Auto-prefill iz session setup-a — temperatura vode */
  setupWaterTempC?: number;
  /** Auto-prefill iz session setup-a — pH mrežne vode */
  setupWaterPh?: number;
  /** Auto-prefill iz session setup-a — TDS */
  setupWaterTds?: string;
  /** Callback kad je workflow završen i ciklus pokrenut */
  onComplete: (ciklusId: string) => void;
  /** Callback za odustajanje */
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NoviCiklusWorkflow({
  sesijaId,
  nazivObjekta,
  tipSustava,
  tipProblema,
  procijenjeniVolumenL,
  setupWaterTempC,
  setupWaterPh,
  setupWaterTds,
  onComplete,
  onCancel,
}: Props) {
  const { 
    getSesija, 
    createCycle, 
    updateCycle, 
    addMeasurement,
    closeCycle,
  } = useApp();

  const sesija = getSesija(sesijaId);

  // ─── Workflow State ─────────────────────────────────────────────────────────
  // Ciklus #1: preskačemo "prep" i "water" — direktno na "chemical"
  //   Volumen se uzima iz session setup-a (procijenjeniVolumenL)
  // Ciklus #2+: puni workflow prep → water → chemical → zero
  const sesijaPrvotna = getSesija(sesijaId);
  const _isFirstInit = (sesijaPrvotna?.ciklusi ?? []).length === 0;
  const inicialniStep: WorkflowStep = _isFirstInit ? "chemical" : "prep";
  const [state, setState] = useState<WorkflowState>({ step: inicialniStep });

  // ─── Derived: Previous cycle context ────────────────────────────────────────
  const { previousCycle, previousCycleNotClosed, cycleNumber, isFirst } = useMemo(() => {
    if (!sesija) {
      return { 
        previousCycle: undefined, 
        previousCycleNotClosed: false, 
        cycleNumber: 1, 
        isFirst: true 
      };
    }

    const ciklusi = sesija.ciklusi || [];
    const aktivni = ciklusi.filter(c => c.status === "aktivan");
    const zavrseni = ciklusi.filter(c => c.status === "zavrsen" || c.status === "prekinut");
    
    // Prethodni ciklus = zadnji završeni ili aktivni
    const prethodni = aktivni[0] || zavrseni[zavrseni.length - 1];
    
    let prevContext: PreviousCycleContext | undefined;
    if (prethodni) {
      const lastMjerenje = prethodni.mjerenja?.[prethodni.mjerenja.length - 1];
      prevContext = {
        endPh: lastMjerenje?.ph ?? lastMjerenje?.pH,
        endFlow: lastMjerenje?.flowLMin,
        flowUnit: "l_min" as JedinicaProtoka, // default
        status: prethodni.status as "zavrsen" | "prekinut" | "aktivan",
        reason: prethodni.reason,
        timestamp: prethodni.endDateTime ?? prethodni.startDateTime,
      };
    }

    return {
      previousCycle: prevContext,
      previousCycleNotClosed: aktivni.length > 0,
      cycleNumber: ciklusi.length + 1,
      isFirst: ciklusi.length === 0,
    };
  }, [sesija]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  /** Zatvori prethodni aktivni ciklus */
  const handleClosePreviousCycle = useCallback(() => {
    if (!sesija) return;
    const aktivni = (sesija.ciklusi || []).find(c => c.status === "aktivan");
    if (aktivni && closeCycle) {
      closeCycle(sesijaId, aktivni.id);
    }
    // Refresh state
    setState(prev => ({ ...prev }));
  }, [sesija, sesijaId, closeCycle]);

  /** Step 1: Prep completed → go to water fill */
  const handlePrepComplete = useCallback((data: PrepData) => {
    setState(prev => ({
      ...prev,
      step: "water",
      prepData: data,
    }));
  }, []);

  /** Step 2: Water fill completed → go to chemical */
  const handleWaterComplete = useCallback((data: WaterFillingData) => {
    setState(prev => ({
      ...prev,
      step: "chemical",
      waterData: data,
    }));
  }, []);

  /** Step 3: Chemical added → go to zero measurement */
  const handleChemicalComplete = useCallback((data: ChemicalFillingData) => {
    setState(prev => ({
      ...prev,
      step: "zero",
      chemicalData: data,
    }));
  }, []);

  /** Step 4: Zero measurement completed → create cycle and finish workflow */
  const handleZeroComplete = useCallback((data: ZeroMeasurementData) => {
    // Ciklus #1: waterData nije u state — koristimo session volumen + eventualnu korekciju iz kemije
    // Ciklus #2+: waterData mora postojati
    if (!isFirst && !state.waterData) return;
    if (!state.chemicalData) return;

    // Volumen za ciklus #1: iz kemije (volumeCorrection) ili iz sesije
    const effectiveVolumeL = isFirst
      ? (state.chemicalData.waterVolumeL || procijenjeniVolumenL || 0)
      : (state.waterData?.waterVolumeL || 0);

    // Za ciklus #1, prepData nije obavezan — koristimo prazne defaultove
    const prep = state.prepData ?? {
      cycleName: "",
      cycleTimestamp: new Date().toISOString(),
      reason: "prvi_ciklus" as const,
      rinsed: false,
      rinseMethod: "nije_ispirano" as const,
      rinsePhAfter: "",
      rinseTds: "",
      drainTimestamp: "",
      drainAppearance: "nije_evidentirano" as const,
      drainSediment: "nema" as const,
    };
    const water = state.waterData;
    const chem = state.chemicalData;
    const now = nowISO();

    // ─── Create new cycle object ──────────────────────────────────────────────
    const ciklusId = genId("cik");
    const newCiklus: Partial<Ciklus> & Pick<Ciklus, "id" | "sessionId" | "cycleNumber" | "startDateTime" | "status" | "mjerenja" | "nadopune"> = {
      id: ciklusId,
      sessionId: sesijaId,
      cycleNumber: cycleNumber,
      name: prep.cycleName || undefined,
      startDateTime: now,
      status: "aktivan",
      reason: prep.reason as RazlogCiklusa,
      
      // Drain/rinse flags
      previousSolutionDrained: !isFirst,
      systemRinsed: prep.rinsed,
      cleanWaterAdded: true,
      
      // Drain data (from previous cycle closing)
      drainConfirmedAt: prep.drainTimestamp,
      drainAppearance: prep.drainAppearance,
      drainSediment: prep.drainSediment as DrainSediment,
      
      // Rinse data
      rinsed: prep.rinsed,
      rinseMethod: prep.rinseMethod,
      rinsePhAfter: prep.rinsePhAfter ? parseFloat(prep.rinsePhAfter) : undefined,
      rinseTdsAfter: prep.rinseTds || undefined,
      
      // Volumen — ciklus #1: iz sesije/korekcije | ciklus #2+: iz water step-a
      waterVolumeL: effectiveVolumeL,
      waterTempC: isFirst ? setupWaterTempC : water?.waterTempC,
      waterPh: isFirst ? setupWaterPh : water?.waterPh,
      waterTds: isFirst ? setupWaterTds : water?.waterTds?.toString(),
      
      // Kemija
      productId: chem.productId,
      chemicalProductName: chem.productName,
      chemicalAmount: chem.chemicalAmount,
      chemicalUnit: chem.chemicalUnit as JedinicaKemikalije,
      selectedConcentrationPercent: chem.concentrationPercent,
      chemicalAddedAt: chem.addedAt,
      
      // Nulto mjerenje NAKON kemije
      zeroMeasurementPh: data.ph,
      zeroMeasurementFlowLMin: data.flowLMin || undefined,
      zeroMeasurementAt: data.measuredAt,
      
      // Required arrays
      mjerenja: [],
      nadopune: [],
    };

    // ─── Create the cycle in state ────────────────────────────────────────────
    createCycle(sesijaId, newCiklus as Ciklus);

    // ─── Add zero measurement as initial_cycle_measurement ────────────────────
    const zeroMjerenje = {
      id: genId("mj"),
      measurementType: "initial_cycle_measurement" as const,
      ph: data.ph,
      flowLMin: data.flowLMin,
      temperatureC: data.tempInC ?? data.temperatureC,
      tempInC: data.tempInC,
      tempOutC: data.tempOutC,
      deltaTC: data.deltaTempC,
      measuredAt: data.measuredAt,
      timestamp: now,
      note: data.note || undefined,
      // Reakcija indikatori
      foamLevel: data.foamLevel,
      colorIndicator: data.colorIndicator,
      visibleReaction: data.visibleReaction,
    } satisfies Partial<Mjerenje>;

    // Small delay to ensure cycle is created first
    setTimeout(() => {
      addMeasurement(sesijaId, ciklusId, zeroMjerenje as Mjerenje);
    }, 100);

    // ─── Complete workflow ────────────────────────────────────────────────────
    setState(prev => ({
      ...prev,
      step: "done",
      zeroData: data,
    }));

    onComplete(ciklusId);
  }, [state, cycleNumber, isFirst, sesijaId, createCycle, addMeasurement, onComplete]);

  /** Go back one step */
  const handleBack = useCallback(() => {
    setState(prev => {
      switch (prev.step) {
        case "water":
          return { ...prev, step: "prep" };
        case "chemical":
          // Ciklus #1: nema "water" ekrana — natrag = odustani
          if (isFirst) { onCancel(); return prev; }
          return { ...prev, step: "water" };
        case "zero": return { ...prev, step: "chemical" };
        default: return prev;
      }
    });
  }, [isFirst, onCancel]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!sesija) {
    return (
      <div className="flex items-center justify-center flex-1 h-full px-6">
        <div className="rounded-2xl border border-border bg-card px-6 py-8 flex flex-col items-center gap-2 text-center max-w-xs w-full">
          <p className="text-sm font-bold text-foreground">Sesija nije pronađena</p>
          <p className="text-xs text-muted-foreground">Pokušajte ponovo ili se vratite na početak.</p>
        </div>
      </div>
    );
  }



  switch (state.step) {
    case "prep":
      return (
        <NoviCiklusPrep
          cycleNumber={cycleNumber}
          isFirst={isFirst}
          previousCycle={previousCycle}
          previousCycleNotClosed={previousCycleNotClosed}
          onClosePreviousCycle={handleClosePreviousCycle}
          onContinue={handlePrepComplete}
          onCancel={onCancel}
        />
      );

    case "water":
      const refData: CycleReferenceData = {
        cycleNumber,
        cycleName: state.prepData?.cycleName,
        timestamp: state.prepData?.cycleTimestamp || new Date().toISOString(),
      };
      return (
        <PunjenjeVodom
          referenceData={refData}
          isFirst={isFirst}
          defaultValues={{
            waterVolumeL: procijenjeniVolumenL ? String(procijenjeniVolumenL) : "",
            waterTempC: setupWaterTempC ? String(setupWaterTempC) : "",
            waterPh: setupWaterPh ? String(setupWaterPh) : "",
            waterTds: setupWaterTds ?? "",
          }}
          onContinue={handleWaterComplete}
          onBack={handleBack}
        />
      );

    case "chemical":
      return (
        <DodavanjeKemije
          cycleNumber={cycleNumber}
          cycleName={state.prepData?.cycleName}
          // Ciklus #1: volumen iz sesije, korigirati unutar komponente
          // Ciklus #2+: volumen iz water step-a
          waterVolumeL={isFirst ? (procijenjeniVolumenL ?? 0) : (state.waterData?.waterVolumeL || 0)}
          isFirst={isFirst}
          defaultVolumeL={isFirst ? procijenjeniVolumenL : undefined}
          onContinue={handleChemicalComplete}
          onBack={handleBack}
        />
      );

    case "zero":
      return (
        <NultoMjerenje
          cycleNumber={cycleNumber}
          cycleName={state.prepData?.cycleName}
          waterVolumeL={
            isFirst
              ? (state.chemicalData?.waterVolumeL || procijenjeniVolumenL || 0)
              : (state.waterData?.waterVolumeL || 0)
          }
          chemicalProductName={state.chemicalData?.productName || ""}
          concentrationPercent={state.chemicalData?.concentrationPercent}
          onComplete={handleZeroComplete}
          onBack={handleBack}
        />
      );

    case "done":
      // This should not render - onComplete redirects
      return null;

    default:
      return null;
  }
}
