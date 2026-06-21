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
    const migrated = runLocalStateMigrations(v2);
    expect(migrated.schemaVersion).toBe(3);
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
