"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  type Accent,
  applyAccent,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  readStoredAccent
} from "@/lib/appearance";

// Client hook backing the accent picker. The initial DOM attribute is stamped by
// the anti-FOUC inline script (see lib/appearance + layout.tsx); this hook
// exposes the stored value to React via useSyncExternalStore (so the server
// snapshot is the default and there is no hydration mismatch) and
// persists/applies changes.

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCENT_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppearance() {
  const accent = useSyncExternalStore<Accent>(subscribe, readStoredAccent, () => DEFAULT_ACCENT);

  const setAccent = useCallback((next: Accent) => {
    applyAccent(next);
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
    for (const listener of listeners) listener();
  }, []);

  return { accent, setAccent };
}
