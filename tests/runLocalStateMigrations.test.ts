import { describe, expect, it } from "vitest";

import {
  LATEST_LOCAL_STATE_VERSION,
  localStateMigrations,
  runLocalStateMigrations,
  type RawLocalState
} from "@/lib/storage/migrations/runLocalStateMigrations";

describe("runLocalStateMigrations", () => {
  it("upgrades a v1 state to the latest version, adding v2 fields", () => {
    const v1: RawLocalState = { schemaVersion: 1, accounts: [], transactions: [] };
    const migrated = runLocalStateMigrations(v1);

    expect(migrated.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    expect(migrated.lastBackupAt).toBeNull();
    expect(migrated.importBatches).toEqual([]);
    // Existing data is preserved.
    expect(migrated.accounts).toEqual([]);
  });

  it("preserves existing v2 fields rather than overwriting them", () => {
    const v1: RawLocalState = {
      schemaVersion: 1,
      lastBackupAt: "2026-01-01T00:00:00.000Z",
      importBatches: [{ id: "b1", importedAt: "2026-01-01", transactionIds: ["t1"] }]
    };
    const migrated = runLocalStateMigrations(v1);

    expect(migrated.lastBackupAt).toBe("2026-01-01T00:00:00.000Z");
    expect(migrated.importBatches).toHaveLength(1);
  });

  it("leaves an already-current state unchanged (idempotent)", () => {
    const current: RawLocalState = {
      schemaVersion: LATEST_LOCAL_STATE_VERSION,
      lastBackupAt: null,
      importBatches: [],
      accounts: [{ id: "a1" }]
    };
    const migrated = runLocalStateMigrations(current);

    expect(migrated.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    expect(migrated.accounts).toEqual([{ id: "a1" }]);
  });

  it("upgrades a v2 state to v3", () => {
    const v2: RawLocalState = { schemaVersion: 2, lastBackupAt: null, importBatches: [] };
    const migrated = runLocalStateMigrations(v2, 3);
    expect(migrated.schemaVersion).toBe(3);
  });

  it("upgrades a v3 state to v4", () => {
    const v3: RawLocalState = { schemaVersion: 3, accounts: [], transactions: [] };
    const migrated = runLocalStateMigrations(v3, 4);
    expect(migrated.schemaVersion).toBe(4);
  });

  it("upgrades a v4 state to v5 (liability auto-payment fields)", () => {
    const v4: RawLocalState = { schemaVersion: 4, liabilities: [] };
    const migrated = runLocalStateMigrations(v4, 5);
    expect(migrated.schemaVersion).toBe(5);
  });

  it("upgrades a v5 state to v6 (the «погашен» marker on liabilities)", () => {
    const v5: RawLocalState = { schemaVersion: 5, liabilities: [] };
    const migrated = runLocalStateMigrations(v5, 6);
    expect(migrated.schemaVersion).toBe(6);
  });

  it("upgrades a v6 state to v7 (purchase lots on portfolio positions)", () => {
    const v6: RawLocalState = {
      schemaVersion: 6,
      investments: { portfolio: [{ ticker: "SBER", quantity: 10, averageBuyPrice: 250 }] }
    };
    const migrated = runLocalStateMigrations(v6, 7);
    expect(migrated.schemaVersion).toBe(7);
    // A position entered before lots existed keeps the average that was typed in.
    expect(migrated.investments).toEqual({
      portfolio: [{ ticker: "SBER", quantity: 10, averageBuyPrice: 250 }]
    });
  });

  it("repaints only the untouched seed colours of categories (v9)", () => {
    const state: RawLocalState = {
      schemaVersion: 8,
      categories: [
        { id: "cat-food", label: "Продукты", color: "#f97316" },
        { id: "cat-own", label: "Своя", color: "#123456" }
      ]
    };
    const migrated = runLocalStateMigrations(state, 9);

    expect(migrated.schemaVersion).toBe(9);
    const categories = migrated.categories as Array<{ id: string; color: string }>;
    // The stock orange becomes the palette's blurple…
    expect(categories[0].color).toBe("#9184d9");
    // …while a colour the owner picked is left exactly as it was.
    expect(categories[1].color).toBe("#123456");
  });

  it("hands the seeded categories an icon and leaves the owner's alone (v10)", () => {
    const state: RawLocalState = {
      schemaVersion: 9,
      categories: [
        { id: "cat-food", label: "Продукты", color: "#9184d9" },
        { id: "cat-own", label: "Своя", color: "#123456" },
        { id: "cat-transport", label: "Транспорт", color: "#7f8fd8", icon: "Plane" }
      ]
    };
    const migrated = runLocalStateMigrations(state, 10);

    expect(migrated.schemaVersion).toBe(10);
    const categories = migrated.categories as Array<{ id: string; icon?: string }>;
    // A category the app created gets the picture a fresh install would show…
    expect(categories[0].icon).toBe("ShoppingCart");
    // …one the owner added stays blank rather than being guessed at…
    expect(categories[1].icon).toBeUndefined();
    // …and a picture already chosen is never overwritten.
    expect(categories[2].icon).toBe("Plane");
  });

  it("puts every operation on the day it is shown on (v13)", () => {
    // What the app used to write for itself: a local midnight serialised into
    // UTC. East of Greenwich that is the evening before, so the row read
    // «1 сентября» in the ledger and was counted in August everywhere else.
    const localMidnight = new Date(2026, 8, 1);
    const state: RawLocalState = {
      schemaVersion: 12,
      transactions: [
        { id: "tx-1", date: localMidnight.toISOString(), amount: 100 },
        { id: "tx-2", date: "2026-09-02T00:00:00.000Z", amount: 200 },
        { id: "tx-3", amount: 300 }
      ]
    };
    const migrated = runLocalStateMigrations(state, 13);

    expect(migrated.schemaVersion).toBe(13);
    const rows = migrated.transactions as Array<{ id: string; date?: string }>;
    // The day a person sees, kept as the day everything counts.
    expect(rows[0].date).toBe("2026-09-01T00:00:00.000Z");
    // A date that was already a plain UTC midnight is left exactly as it was.
    expect(rows[1].date).toBe("2026-09-02T00:00:00.000Z");
    // A row without a date is not invented one.
    expect(rows[2].date).toBeUndefined();
  });

  it("defaults a missing schemaVersion to 1 and migrates from there", () => {
    const legacy: RawLocalState = { accounts: [] };
    const migrated = runLocalStateMigrations(legacy);
    expect(migrated.schemaVersion).toBe(LATEST_LOCAL_STATE_VERSION);
    expect(migrated.importBatches).toEqual([]);
  });

  it("exposes a contiguous, strictly increasing migration chain", () => {
    // Guards against a gap/typo when future migrations are appended.
    let expectedFrom = 1;
    for (const migration of localStateMigrations) {
      expect(migration.from).toBe(expectedFrom);
      expect(migration.to).toBe(migration.from + 1);
      expectedFrom = migration.to;
    }
    expect(expectedFrom).toBe(LATEST_LOCAL_STATE_VERSION);
  });
});
