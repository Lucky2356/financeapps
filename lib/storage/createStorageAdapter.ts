"use client";

import { DesktopStorageAdapter } from "@/lib/storage/DesktopStorageAdapter";

// Windows and Android share one storage backend — the IndexedDB database named
// `financial-assistant-desktop`. That name is historic and must stay as it is:
// changing it would orphan the data of every already-installed copy.
export function createStorageAdapter() {
  return new DesktopStorageAdapter();
}
