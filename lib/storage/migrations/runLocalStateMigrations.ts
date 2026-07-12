// Stepwise migration runner for the desktop LocalState document.
//
// Each schema bump appends one entry to `localStateMigrations` that transforms a
// state from version N to N+1. The runner applies them in order, so upgrading a
// very old backup is just a chain of small, individually-tested steps. Field
// defaults are handled by the Zod schema at parse time; migrations only carry
// version-specific structural changes.

export type RawLocalState = Record<string, unknown> & { schemaVersion?: number };

export type LocalStateMigration = {
  readonly from: number;
  readonly to: number;
  migrate: (state: RawLocalState) => RawLocalState;
};

export const LATEST_LOCAL_STATE_VERSION = 4;

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
