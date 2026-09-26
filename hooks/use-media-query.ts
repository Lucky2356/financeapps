"use client";

import { useSyncExternalStore } from "react";

/**
 * Совпадает ли медиа-запрос прямо сейчас. Нужен там, где телефону и
 * компьютеру показываются разные вещи, а не одна и та же вёрстка: спрятанная
 * CSS-ом копия оставалась бы в документе и путала бы поиск по экрану.
 * На сборке страницы окна нет — там ответ «нет», то есть вид для компьютера.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false
  );
}
