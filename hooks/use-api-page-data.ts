"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import { readPageData, writePageData } from "@/lib/api/page-data-cache";

// The server-rendered shell is always empty (see lib/data.ts), so every screen
// loads its real numbers here, from the device's IndexedDB through
// LocalApiClient. `initialData` is only the fallback for a failed read.
//
// Экран, который уже открывали, рисуется сразу теми числами, что показывал в
// прошлый раз, — и обновляется в место, когда придёт свежий ответ. Без этого
// каждый переход начинался с пустой оболочки: числа появлялись через кадр, и
// возврат туда, где только что был, снова показывал нули. Считается всё быстро,
// но пустой кадр от этого не перестаёт быть пустым.
export function useApiPageData<T>(initialData: T, path: string) {
  const [data, setData] = useState<T>(() => readPageData<T>(path) ?? initialData);
  // Track the latest initialData for error fallback without adding it to
  // effect/callback dependency arrays — avoids a double-fetch on every
  // router.refresh() because that call creates a new object reference even
  // when the server data has not actually changed.
  const initialDataRef = useRef(initialData);
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  // Смена маршрута в том же смонтированном экране (например, другой месяц в
  // лимитах) — это другие числа. Их надо взять до отрисовки, иначе на кадр
  // покажутся числа прежнего маршрута, что хуже пустоты: пустота видна, а
  // чужая сумма выглядит как своя. Инициализатор useState здесь не поможет —
  // он отработал один раз при монтировании.
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    // initialData, а не ref: во время отрисовки берём то, что пришло в неё.
    setData(readPageData<T>(path) ?? initialData);
  }

  const load = useCallback(async () => {
    try {
      const next = await apiClient.get<T>(path);
      writePageData(path, next);
      return next;
    } catch {
      // Неудачное чтение не должно стирать память: показанные числа были
      // настоящими, а вот initialData — пустая оболочка сборки.
      return readPageData<T>(path) ?? initialDataRef.current;
    }
  }, [path]);

  const reload = useCallback(async () => {
    setData(await load());
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await load();
      if (!cancelled) setData(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Re-read whenever anything writes to storage. Without this a screen only
  // learns about a change by being unmounted and mounted again, so adding an
  // operation from the quick-add button left the totals and charts on screen
  // showing the figures from before the write.
  useEffect(() => onDataChanged(() => void reload()), [reload]);

  return { data, reload, setData };
}
