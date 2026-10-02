"use client";

import { useEffect } from "react";

import { pickSafeTop, rememberSafeTop, SAFE_TOP_KEY } from "@/lib/platform/safe-area";

/**
 * Держит `--fa-safe-top` — отступ под строкой состояния, который не пропадает,
 * если WebView на миг сообщил про нулевой `env(safe-area-inset-top)`.
 */
export function useSafeTop() {
  useEffect(() => {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
    document.body.appendChild(probe);

    function read(): number {
      try {
        return Number(window.localStorage.getItem(SAFE_TOP_KEY)) || 0;
      } catch {
        return 0;
      }
    }

    function apply() {
      const measured = probe.getBoundingClientRect().height;
      const portrait = window.innerHeight >= window.innerWidth;
      const remembered = read();
      const next = rememberSafeTop(measured, remembered, portrait);
      if (next !== remembered) {
        try {
          window.localStorage.setItem(SAFE_TOP_KEY, String(next));
        } catch {
          /* без памяти — просто без запасного значения */
        }
      }
      const use = pickSafeTop(measured, next, portrait);
      document.documentElement.style.setProperty("--fa-safe-top", `${use}px`);
    }

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("focus", apply);
    document.addEventListener("visibilitychange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("focus", apply);
      document.removeEventListener("visibilitychange", apply);
      probe.remove();
    };
  }, []);
}
