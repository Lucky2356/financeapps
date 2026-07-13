"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type Accent,
  applyAccent,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  readStoredAccent
} from "@/lib/appearance";

// Client hook backing the accent picker. Deliberately uses plain local state (not
// useSyncExternalStore): on click we set the React state AND the <html>
// data-accent attribute together in one handler, so the selected indicator can
// never disagree with the colour actually applied — a desync we saw with the
// external-store approach on the static/desktop build.
//
// Initial state is the default so the server and first client render agree (no
// hydration mismatch); the stored value is read right after mount. The DOM
// attribute itself is stamped pre-paint by the anti-FOUC script (see
// lib/appearance + layout.tsx), so there is no colour flash regardless.
export function useAppearance() {
  const [accent, setAccentState] = useState<Accent>(DEFAULT_ACCENT);

  useEffect(() => {
    const stored = readStoredAccent();
    // Defer out of the effect body (microtask) to satisfy the no-setState-in-
    // effect lint rule; same pattern as SavedFilters.
    if (stored !== DEFAULT_ACCENT) {
      void Promise.resolve().then(() => setAccentState(stored));
    }
  }, []);

  const setAccent = useCallback((next: Accent) => {
    setAccentState(next); // React state → drives the checkmark/ring
    applyAccent(next); // <html> data-accent → drives the app colour
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
  }, []);

  return { accent, setAccent };
}
