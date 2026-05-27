"use client";

import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

export class IndexedDbStorageAdapter implements StorageAdapter {
  constructor(
    private readonly databaseName = "financial-assistant",
    private readonly storeName = "key-value"
  ) {}

  async getItem<T>(key: string): Promise<T | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, "readonly").objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve((request.result?.value as T) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readwrite").objectStore(this.storeName).put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readwrite").objectStore(this.storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(this.storeName, "readwrite").objectStore(this.storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
