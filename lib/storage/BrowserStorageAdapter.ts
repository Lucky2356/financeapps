"use client";

import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

export class BrowserStorageAdapter implements StorageAdapter {
  constructor(private readonly namespace = "finance-assistant") {}

  async getItem<T>(key: string): Promise<T | null> {
    const raw = window.localStorage.getItem(this.key(key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(this.key(key), JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    window.localStorage.removeItem(this.key(key));
  }

  async clear(): Promise<void> {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(`${this.namespace}:`)) {
        window.localStorage.removeItem(key);
      }
    }
  }

  private key(key: string) {
    return `${this.namespace}:${key}`;
  }
}
