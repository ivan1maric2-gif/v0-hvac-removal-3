"use client";

import { useEffect, useState } from "react";

export type FontScale = "sm" | "md" | "lg" | "xl";

const STORAGE_KEY = "hvac-font-scale";
const DEFAULT: FontScale = "md";

export function useFontScale() {
  const [scale, setScaleState] = useState<FontScale>(DEFAULT);

  // Inicijalno učitavanje iz localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontScale | null;
    if (saved && ["sm", "md", "lg", "xl"].includes(saved)) {
      setScaleState(saved);
      document.documentElement.setAttribute("data-font-scale", saved);
    } else {
      document.documentElement.setAttribute("data-font-scale", DEFAULT);
    }
  }, []);

  const setScale = (s: FontScale) => {
    setScaleState(s);
    localStorage.setItem(STORAGE_KEY, s);
    document.documentElement.setAttribute("data-font-scale", s);
  };

  return { scale, setScale };
}
