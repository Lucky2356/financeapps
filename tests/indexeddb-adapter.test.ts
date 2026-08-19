// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { IndexedDbStorageAdapter } from "@/lib/storage/IndexedDbStorageAdapter";

// IndexedDB reports a write twice: once when the request succeeds, and once —
// later — when the transaction commits. Only the second one means the data
// survives the page going away, and the app reloads itself right after writing
// (loading the example, restoring a backup, switching profiles). Resolving on
// the first signal is how a confirmed save could come back empty.
//
// The fake below keeps that order honest: request first, commit a tick later.
const order: string[] = [];

function fakeDatabase() {
  return {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => {
      const transaction: Record<string, unknown> = { error: null };
      const request: Record<string, unknown> = { error: null };

      const schedule = () => {
        queueMicrotask(() => {
          order.push("request");
          (request.onsuccess as (() => void) | undefined)?.();
        });
        setTimeout(() => {
          order.push("commit");
          (transaction.oncomplete as (() => void) | undefined)?.();
        }, 5);
        return request;
      };

      transaction.objectStore = () => ({ put: schedule, delete: schedule, clear: schedule });
      return transaction;
    }
  };
}

function installFakeIndexedDb() {
  const database = fakeDatabase();
  (globalThis as unknown as Record<string, unknown>).indexedDB = {
    open: () => {
      const request: Record<string, unknown> = { result: database };
      setTimeout(() => (request.onsuccess as (() => void) | undefined)?.(), 0);
      return request;
    }
  };
}

describe("IndexedDbStorageAdapter", () => {
  afterEach(() => {
    order.length = 0;
  });

  it("reports a write as done only once the transaction has committed", async () => {
    installFakeIndexedDb();
    const adapter = new IndexedDbStorageAdapter();

    await adapter.setItem("state", { hello: "world" });
    order.push("resolved");

    expect(order).toEqual(["request", "commit", "resolved"]);
  });

  it("waits for the commit when removing and when clearing too", async () => {
    installFakeIndexedDb();
    const adapter = new IndexedDbStorageAdapter();

    await adapter.removeItem("state");
    order.push("resolved");
    await adapter.clear();
    order.push("resolved");

    expect(order).toEqual(["request", "commit", "resolved", "request", "commit", "resolved"]);
  });
});
