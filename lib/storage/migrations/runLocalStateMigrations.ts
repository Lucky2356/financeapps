// Stepwise migration runner for the desktop LocalState document.
//
// Each schema bump appends one entry to `localStateMigrations` that transforms a
// state from version N to N+1. The runner applies them in order, so upgrading a
// very old backup is just a chain of small, individually-tested steps. Field
// defaults are handled by the Zod schema at parse time; migrations only carry
// version-specific structural changes.

import { LEGACY_CATEGORY_COLORS } from "@/lib/categories/palette";

export type RawLocalState = Record<string, unknown> & { schemaVersion?: number };

export type LocalStateMigration = {
  readonly from: number;
  readonly to: number;
  migrate: (state: RawLocalState) => RawLocalState;
};

export const LATEST_LOCAL_STATE_VERSION = 9;

export const localStateMigrations: LocalStateMigration[] = [
  {
    from: 1,
    to: 2,
    // v2 introduced explicit backup tracking and CSV import batches (for undo).
    migrate: (state) => ({
      ...state,
      schemaVersion: 2,
      lastBackupAt: state.lastBackupAt ?? null,
      importBatches: Array.isArray(state.importBatches) ? state.importBatches : []
    })
  },
  {
    from: 2,
    to: 3,
    // v3 added a liabilities/debt list. Existing data needs none; the Zod default
    // fills the empty array, so the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 3 })
  },
  {
    from: 3,
    to: 4,
    // v4 added expected-dividend and target-allocation lists (investments). Zod
    // defaults fill the empty arrays, so the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 4 })
  },
  {
    from: 4,
    to: 5,
    // v5 added optional auto-payment fields on liabilities (autoPay, payment
    // account/category, lastPaidMonth). All optional — Zod fills the rest, so
    // the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 5 })
  },
  {
    from: 5,
    to: 6,
    // v6 added the optional settledAt marker on liabilities ("погашен"). Absent
    // means the debt is still owed, which is exactly the pre-v6 behaviour, so
    // the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 6 })
  },
  {
    from: 6,
    to: 7,
    // v7 added the optional list of purchase lots on a portfolio position, from
    // which the average buy price is computed. Positions without it keep the
    // average that was typed in by hand, so the migration only stamps the
    // version.
    migrate: (state) => ({ ...state, schemaVersion: 7 })
  },
  {
    from: 7,
    to: 8,
    // v8 added optional savings terms on an account (annual rate + how often it
    // is capitalised). An account without them earns nothing, which is exactly
    // the pre-v8 behaviour, so the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 8 })
  },
  {
    from: 8,
    to: 9,
    // v9 repaints the seeded categories into the Nocturne palette. A category
    // whose colour was changed by hand keeps it: only the exact stock colours
    // the app shipped with are rewritten.
    migrate: (state) => {
      const categories = Array.isArray(state.categories) ? state.categories : null;
      if (!categories) return { ...state, schemaVersion: 9 };
      return {
        ...state,
        schemaVersion: 9,
        categories: categories.map((category) => {
          if (!category || typeof category !== "object") return category;
          const row = category as Record<string, unknown>;
          const color = typeof row.color === "string" ? row.color.toLowerCase() : null;
          const next = color ? LEGACY_CATEGORY_COLORS[color] : undefined;
          return next ? { ...row, color: next } : row;
        })
      };
    }
  }
];

// Applies migrations in sequence from the state's version up to `target`.
// Unknown/missing versions default to 1. Stops cleanly if no migration covers
// the current version (forward-compatible: a newer state is returned as-is).
export function runLocalStateMigrations(
  state: RawLocalState,
  target: number = LATEST_LOCAL_STATE_VERSION
): RawLocalState {
  let current = typeof state.schemaVersion === "number" ? state.schemaVersion : 1;
  let result = state;

  let guard = 0;
  while (current < target) {
    const migration = localStateMigrations.find((step) => step.from === current);
    if (!migration) break;
    result = migration.migrate(result);
    current = migration.to;
    // Defensive stop against a malformed (cyclic) migration table.
    if (++guard > localStateMigrations.length + 1) break;
  }

  return { ...result, schemaVersion: current };
}
