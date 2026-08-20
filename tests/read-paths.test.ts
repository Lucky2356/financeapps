import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Reads hand out the cached document itself instead of a copy — that is what
// keeps a ledger of a few thousand operations quick. The price is a contract: a
// read handler must build new objects and never touch the one it was given.
// Break it and the damage is invisible until the next save writes the corrupted
// cache to disk, which is exactly what this test makes visible.
const STATE_KEY = "localFinanceState_profile-default";

const READ_ROUTES = [
  "/accounts",
  "/transactions",
  "/budgets",
  "/goals",
  "/debts",
  "/rules",
  "/recurring",
  "/forecast",
  "/dashboard",
  "/settings",
  "/import",
  "/backup",
  "/categories",
  "/analytics",
  "/plan",
  "/profiles"
];

describe("read routes leave the stored document alone", () => {
  it("survives every screen being opened", async () => {
    const storage = new MemoryStorageAdapter();
    const client = new LocalApiClient(storage);
    await client.post("/sample");

    const before = structuredClone(await storage.getItem<Record<string, unknown>>(STATE_KEY));

    for (const route of READ_ROUTES) await client.get(route);

    // A write persists whatever the cache holds, so a read that quietly changed
    // it shows up here — in the file, where it would have hurt.
    await client.post("/settings", { theme: "dark" });
    const after = (await storage.getItem<Record<string, unknown>>(STATE_KEY)) ?? {};

    // `theme` is the change we asked for; `lastBackupAt` is /backup recording
    // that an export happened. Everything else must be untouched.
    for (const field of [
      "accounts",
      "categories",
      "transactions",
      "budgets",
      "goals",
      "recurringTransactions",
      "liabilities",
      "plans",
      "planNotes",
      "netWorthSnapshots"
    ]) {
      expect({ field, value: after[field] }).toEqual({
        field,
        value: (before as Record<string, unknown>)[field]
      });
    }
    expect(after.theme).toBe("dark");
  });
});
