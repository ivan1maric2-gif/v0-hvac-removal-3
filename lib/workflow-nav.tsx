"use client";

/**
 * WorkflowNav — globalni context za override navigacijskih strelica
 *
 * Dok je aktivan multi-step workflow (NoviCiklusWorkflow, PokreniCiklusModal, itd.),
 * NavBar strelice MORAJU kontrolirati korake unutar workflowa — a ne ekran-level navigaciju.
 *
 * Kako koristiti:
 *   1. Workflow komponenta poziva useRegisterWorkflowNav({ onBack, onForward, canGoBack, canGoForward })
 *      čim se mountira, i automatski deregistrira kad se unmountira.
 *   2. NavBar čita useWorkflowNav() i ako je registrirano, koristi workflow handlere.
 *      Inače koristi globalni nazad/naprijed iz app-state.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface WorkflowNavHandlers {
  onBack: () => void;
  onForward?: () => void;
  canGoBack: boolean;
  canGoForward?: boolean;
}

interface WorkflowNavContextValue {
  /** Trenutno registrirani workflow handler, ili null ako nije aktivan workflow */
  active: WorkflowNavHandlers | null;
  register: (handlers: WorkflowNavHandlers) => void;
  unregister: () => void;
  /** Ažuriraj samo canGoBack/canGoForward bez ponovnog registriranja */
  update: (patch: Partial<Pick<WorkflowNavHandlers, "canGoBack" | "canGoForward">>) => void;
}

const WorkflowNavContext = createContext<WorkflowNavContextValue | null>(null);

export function WorkflowNavProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<WorkflowNavHandlers | null>(null);

  const register = useCallback((handlers: WorkflowNavHandlers) => {
    setActive(handlers);
  }, []);

  const unregister = useCallback(() => {
    setActive(null);
  }, []);

  const update = useCallback((patch: Partial<Pick<WorkflowNavHandlers, "canGoBack" | "canGoForward">>) => {
    setActive((prev) => prev ? { ...prev, ...patch } : null);
  }, []);

  return (
    <WorkflowNavContext.Provider value={{ active, register, unregister, update }}>
      {children}
    </WorkflowNavContext.Provider>
  );
}

export function useWorkflowNav() {
  const ctx = useContext(WorkflowNavContext);
  if (!ctx) throw new Error("useWorkflowNav mora biti unutar WorkflowNavProvider");
  return ctx;
}

/**
 * Hook za workflow komponente.
 * Automatski registrira handlere pri mountu i deregistrira pri unmountu.
 * handlers objekt mora biti stabilan (memoriziran) da ne uzrokuje beskonačne re-registracije.
 */
export function useRegisterWorkflowNav(handlers: WorkflowNavHandlers) {
  const { register, unregister, update } = useWorkflowNav();

  // Registriraj pri mountu
  useEffect(() => {
    register(handlers);
    return () => {
      unregister();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ažuriraj canGoBack/canGoForward kada se promijene — bez ponovnog registriranja
  useEffect(() => {
    update({ canGoBack: handlers.canGoBack, canGoForward: handlers.canGoForward });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.canGoBack, handlers.canGoForward]);

  // Ažuriraj handlere kada se promijene (npr. novi step)
  useEffect(() => {
    register(handlers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers.onBack, handlers.onForward]);
}
