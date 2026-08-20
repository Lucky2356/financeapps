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
      const request = db
        .transaction(this.storeName, "readonly")
        .objectStore(this.storeName)
        .get(key);
      request.onsuccess = () => resolve((request.result?.value as T) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    return this.write((store) => store.put({ key, value }));
  }

  async removeItem(key: string): Promise<void> {
    return this.write((store) => store.delete(key));
  }

  async clear(): Promise<void> {
    return this.write((store) => store.clear());
  }

  /**
   * Runs one write and resolves when the TRANSACTION has committed — not when
   * the request reported success.
   *
   * The difference is the whole point. `request.onsuccess` fires while the
   * transaction is still open; the data reaches disk a moment later, at
   * `transaction.oncomplete`. Resolving on the request meant every caller was
   * told "saved" too early, and anything that tore the page down in that
   * gap — `window.location.reload()` after loading the example or restoring a
   * backup, switching profiles, closing the desktop window — could take the
   * write with it. It showed up as an app that came back empty after an
   * operation it had just confirmed.
   */
  private async write(run: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const request = run(transaction.objectStore(this.storeName));
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Запись отменена."));
    });
  }

  /**
   * One connection, opened once and reused.
   *
   * Every read and write used to open its own, and none was ever closed: a
   * session accumulated a connection per operation, each holding the database
   * open. Besides the waste, an open connection blocks a version upgrade — a
   * future schema change would have hung waiting for connections nobody was
   * going to close. The handle is dropped if the browser closes it (a version
   * change elsewhere), so the next call simply opens a fresh one.
   */
  private connection: Promise<IDBDatabase> | null = null;

  private async open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;

    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => (this.connection = null);
        db.onversionchange = () => {
          db.close();
          this.connection = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        this.connection = null;
        reject(request.error);
      };
    });

    return this.connection;
  }
}
