"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";

import { PREFERENCES_CHANGED } from "@/lib/preferences";

/**
 * Перерисовать экраны, когда поменялся вид сумм.
 *
 * Суммы печатает formatCurrency, а не компонент, и сам он перерисовки не
 * вызовет. Поэтому при смене настройки дерево экранов собирается заново: одно
 * нажатие, и спрятаны все суммы на экране, включая подписи графиков, а не
 * только те, что случайно перерисовались.
 */
export function PreferencesRoot({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(PREFERENCES_CHANGED, bump);
    return () => window.removeEventListener(PREFERENCES_CHANGED, bump);
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
}
