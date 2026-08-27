// Stepwise migration runner for the desktop LocalState document.
//
// Each schema bump appends one entry to `localStateMigrations` that transforms a
// state from version N to N+1. The runner applies them in order, so upgrading a
// very old backup is just a chain of small, individually-tested steps. Field
// defaults are handled by the Zod schema at parse time; migrations only carry
// version-specific structural changes.

import { SEED_CATEGORY_ICONS } from "@/lib/categories/icons";
import { storedTransactionDate } from "@/lib/transactions/date";
import { LEGACY_CATEGORY_COLORS } from "@/lib/categories/palette";

export type RawLocalState = Record<string, unknown> & { schemaVersion?: number };

export type LocalStateMigration = {
  readonly from: number;
  readonly to: number;
  migrate: (state: RawLocalState) => RawLocalState;
};

export const LATEST_LOCAL_STATE_VERSION = 14;

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
  },
  {
    from: 9,
    to: 10,
    // v10 gave categories a picture as well as a colour. The ones the app
    // created for you get theirs here, so an install made before the picker
    // existed looks the same as a fresh one; anything the owner added stays
    // blank until they choose, because guessing from a name would be wrong
    // about as often as it was right.
    migrate: (state) => {
      const categories = Array.isArray(state.categories) ? state.categories : null;
      if (!categories) return { ...state, schemaVersion: 10 };
      return {
        ...state,
        schemaVersion: 10,
        categories: categories.map((category) => {
          if (!category || typeof category !== "object") return category;
          const row = category as Record<string, unknown>;
          if (typeof row.icon === "string" && row.icon) return row;
          const seeded = typeof row.id === "string" ? SEED_CATEGORY_ICONS[row.id] : undefined;
          return seeded ? { ...row, icon: seeded } : row;
        })
      };
    }
  },
  {
    from: 10,
    to: 11,
    // v11 added the plan/fact tables (planned amounts per month and a note per
    // month). An install without them simply has no plan yet, which the Zod
    // defaults express as empty lists, so the migration only stamps the version.
    migrate: (state) => ({ ...state, schemaVersion: 11 })
  },
  {
    from: 11,
    to: 12,
    // v12 marks a debt payment on the transaction that pays it. Such a payment
    // takes money off an account and takes the same amount off what is owed, so
    // net worth does not move — but the capital chart reconstructs the past from
    // flows and counted it as spending, drawing a falling line for someone who
    // was paying a loan down. Rows the app posted itself carry the debt's name
    // as their description, which is what identifies them here; from now on the
    // link is written at the source.
    migrate: (state) => {
      const liabilities = Array.isArray(state.liabilities) ? state.liabilities : [];
      const transactions = Array.isArray(state.transactions) ? state.transactions : [];
      const byName = new Map<string, string>();
      for (const raw of liabilities) {
        const liability = raw as { id?: unknown; name?: unknown; autoPay?: unknown };
        // Only debts the app has been paying automatically: those are the rows
        // it wrote, and a name typed by hand should not sweep up real spending.
        if (!liability.autoPay || typeof liability.id !== "string") continue;
        if (typeof liability.name === "string" && liability.name.trim())
          byName.set(liability.name.trim().toLowerCase(), liability.id);
      }

      return {
        ...state,
        schemaVersion: 12,
        transactions: transactions.map((raw) => {
          const row = raw as Record<string, unknown>;
          if (row.liabilityId || row.type !== "EXPENSE") return row;
          const description = typeof row.description === "string" ? row.description.trim() : "";
          const liabilityId = byName.get(description.toLowerCase());
          return liabilityId ? { ...row, liabilityId } : row;
        })
      };
    }
  },
  {
    from: 12,
    to: 13,
    // v13 puts every operation back on the day it is shown on.
    //
    // An operation belongs to a calendar day, and everything that counts money
    // reads that day off the stored text ("2026-09-01T…" → сентябрь) while the
    // list on screen renders the same text in local time. Dates typed into a
    // form were stored as UTC midnight and agreed with both. Dates the app
    // produced itself — a CSV import, a materialised recurring payment, an
    // automatic debt payment — were built in local time and serialised, which
    // east of Greenwich lands on the evening of the day BEFORE: the row read
    // «1 сентября» in the ledger and was counted in August by budgets, plan/fact
    // and analytics. This rewrites those timestamps to UTC midnight of the day
    // they are displayed on, so the two finally say the same thing.
    migrate: (state) => {
      const transactions = Array.isArray(state.transactions) ? state.transactions : [];
      return {
        ...state,
        schemaVersion: 13,
        transactions: transactions.map((raw) => {
          if (!raw || typeof raw !== "object") return raw;
          const row = raw as Record<string, unknown>;
          if (typeof row.date !== "string" || !row.date) return row;
          const normalized = storedTransactionDate(row.date);
          return normalized === row.date ? row : { ...row, date: normalized };
        })
      };
    }
  },
  {
    from: 13,
    to: 14,
    // v14 gives a limit the month it was set in. A record without one goes on
    // meaning "the limit for any month that has none of its own", which is
    // exactly what a single limit per category meant before — so nothing is
    // rewritten and every earlier month keeps reading the way it did.
    migrate: (state) => ({ ...state, schemaVersion: 14 })
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
