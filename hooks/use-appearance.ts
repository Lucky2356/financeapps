"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  type Accent,
  type Density,
  applyAccent,
  applyDensity,
  ACCENT_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_DENSITY,
  readStoredAccent,
  readStoredDensity
} from "@/lib/appearance";

// Client hook backing the appearance controls. The initial DOM attributes are
// stamped by the anti-FOUC inline script (see lib/appearance + layout.tsx); this
// hook exposes the stored values to React via useSyncExternalStore (so the
// server snapshot is the default and there is no hydration mismatch) and
// persists/applies changes.

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Reflect changes made in other tabs/windows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCENT_STORAGE_KEY || e.key === DENSITY_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function useAppearance() {
  const accent = useSyncExternalStore<Accent>(subscribe, readStoredAccent, () => DEFAULT_ACCENT);
  const density = useSyncExternalStore<Density>(
    subscribe,
    readStoredDensity,
    () => DEFAULT_DENSITY
  );

  const setAccent = useCallback((next: Accent) => {
    applyAccent(next);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
    notify();
  }, []);

  const setDensity = useCallback((next: Density) => {
    applyDensity(next);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
    notify();
  }, []);

  return { accent, density, setAccent, setDensity };
}
