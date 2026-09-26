"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Два независимых выбора. Отчёты (план/факт, аналитика) делят один — ответ на
 * «сколько я потратил» не должен зависеть от того, какой отчёт спросил. Главная
 * — свой, из настроек: галка в план/факте молча меняла и цифры на главной.
 */
export type TransfersScope = "reports" | "home";

const KEYS: Record<TransfersScope, string> = {
  reports: "analytics-include-transfers",
  home: "home-include-transfers"
};
const EVENT = "include-transfers-changed";

// Whether the reading screens count transfers between the owner's own accounts.
// Kept in one place, and in localStorage, so ticking the box on one report is
// not undone by walking to the next one — the answer to "what did I spend" must
// not depend on which screen asked.
export function useIncludeTransfers(
  scope: TransfersScope = "reports"
): [boolean, (next: boolean) => void] {
  const KEY = KEYS[scope];
  const [include, setInclude] = useState(false);

  useEffect(() => {
    const read = () => setInclude(localStorage.getItem(KEY) === "1");
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, [KEY]);

  const update = useCallback(
    (next: boolean) => {
      setInclude(next);
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* private mode: the choice simply does not outlive the screen */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [KEY]
  );

  return [include, update];
}

/** Query suffix for the endpoints that honour the setting. */
export function transfersQuery(include: boolean, separator: "?" | "&" = "?"): string {
  return include ? `${separator}transfers=1` : "";
}
