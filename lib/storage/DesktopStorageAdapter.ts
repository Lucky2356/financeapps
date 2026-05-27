import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { IndexedDbStorageAdapter } from "@/lib/storage/IndexedDbStorageAdapter";

export class DesktopStorageAdapter implements StorageAdapter {
  private readonly indexedDb = new IndexedDbStorageAdapter("financial-assistant-desktop");

  async getItem<T>(key: string): Promise<T | null> {
    return this.indexedDb.getItem<T>(key);
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.indexedDb.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await this.indexedDb.removeItem(key);
  }

  async clear(): Promise<void> {
    await this.indexedDb.clear();
  }
}
