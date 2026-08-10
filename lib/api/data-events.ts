"use client";

// One signal for "the stored data changed".
//
// Every screen reads its numbers through useApiPageData, which fetches on mount.
// Mutations used to call router.refresh() and stop there — but this app is a
// static export: refreshing re-renders the EMPTY server shell, and the real
// figures come from IndexedDB on the client. So adding an operation from the
// quick-add button left every already-mounted screen showing yesterday's totals
// until it was navigated away from and back.
//
// Rather than teach each screen which mutations concern it, the API wrapper
// announces every write and each mounted screen re-reads itself. One choke
// point, no per-screen wiring, nothing to forget when a new screen is added.

const EVENT = "app-data-changed";

/** Announce that stored data changed. Called by the API wrapper, not by screens. */
export function emitDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribe to data changes; returns the unsubscribe function. */
export function onDataChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
