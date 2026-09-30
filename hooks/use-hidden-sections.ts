"use client";

import { useCallback, useEffect, useState } from "react";

import { encodeHidden, NAV_HIDDEN_EVENT, NAV_HIDDEN_KEY, parseHidden } from "@/lib/nav-visibility";
import { readMine, writeMine } from "@/lib/storage/mine";

/**
 * Скрытые разделы меню этого человека на этом устройстве.
 *
 * Читается после загрузки, а не при первой отрисовке: статическая сборка не
 * знает, что скрыто, и первый кадр обязан совпасть с серверным. Смена из
 * настроек доходит до боковой панели и вкладок событием, без перезагрузки.
 */
export function useHiddenSections(): {
  hidden: ReadonlySet<string>;
  setHidden: (href: string, hide: boolean) => void;
} {
  const [hidden, setHiddenState] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const load = () => setHiddenState(parseHidden(readMine(NAV_HIDDEN_KEY)));
    // На микрозадачу: состояние ставится после отрисовки, а не внутри эффекта.
    void Promise.resolve().then(load);
    window.addEventListener(NAV_HIDDEN_EVENT, load);
    return () => window.removeEventListener(NAV_HIDDEN_EVENT, load);
  }, []);

  const setHidden = useCallback((href: string, hide: boolean) => {
    const next = parseHidden(readMine(NAV_HIDDEN_KEY));
    if (hide) next.add(href);
    else next.delete(href);
    try {
      writeMine(NAV_HIDDEN_KEY, encodeHidden(next));
    } catch {
      /* хранилище недоступно — выбор живёт до перезагрузки */
    }
    setHiddenState(new Set(next));
    window.dispatchEvent(new Event(NAV_HIDDEN_EVENT));
  }, []);

  return { hidden, setHidden };
}
