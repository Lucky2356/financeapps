import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, unknown>();

  async getItem<T>(key: string): Promise<T | null> {
    return this.store.has(key) ? (this.store.get(key) as T) : null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
