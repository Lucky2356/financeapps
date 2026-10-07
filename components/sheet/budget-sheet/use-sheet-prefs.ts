"use client";

import { useEffect, useState } from "react";

import {
  COMPARE_KEY,
  DENSITY_KEY,
  HELP_KEY,
  VIEW_KEY,
  type Density,
  type PhoneView
} from "@/components/sheet/budget-sheet/helpers";

/** Что человек выбрал в виде таблицы и что помнится между открытиями. */
export function useSheetPrefs() {
  const [compare, setCompare] = useState(false);
  const [density, setDensity] = useState<Density>("comfort");
  const [view, setView] = useState<PhoneView>("months");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCompare(localStorage.getItem(COMPARE_KEY) === "1");
      if (localStorage.getItem(DENSITY_KEY) === "compact") setDensity("compact");
      if (localStorage.getItem(VIEW_KEY) === "table") setView("table");
      // Справка открыта, пока человек не закрыл её в первый раз. На телефоне —
      // закрыта: она занимала первый экран целиком, и таблица уезжала под сгиб.
      setHelpOpen(
        localStorage.getItem(HELP_KEY) !== "1" && !window.matchMedia("(max-width: 767px)").matches
      );
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, []);

  return { compare, setCompare, density, setDensity, view, setView, helpOpen, setHelpOpen };
}
