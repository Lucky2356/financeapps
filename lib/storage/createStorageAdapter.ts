"use client";

import { vaultStorage } from "@/lib/vault/runtime";

// Windows and Android share one storage backend — the IndexedDB database named
// `financial-assistant-desktop`. That name is historic and must stay as it is:
// changing it would orphan the data of every already-installed copy.
//
// Поверх него стоит замок (см. lib/vault/runtime): книга ложится на диск
// зашифрованной, и пока её не отперли паролем, читать её нельзя. Для
// LocalApiClient это по-прежнему обычный StorageAdapter из пяти методов — он
// про замок не знает и не должен.
export function createStorageAdapter() {
  return vaultStorage;
}
