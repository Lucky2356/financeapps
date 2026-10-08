// Кэшбэк, поездки и налоговые вычеты — чтение и запись для LocalApiClient.
// Расчёты живут в lib/cashback, lib/trips и lib/tax; здесь — только то, как
// они ложатся в книгу и что отдаётся экрану.

import {
  ANY_CATEGORY,
  copyRules,
  monthCashback,
  type CashbackRule,
  type CashbackSpend,
  type CashbackSummary
} from "@/lib/cashback/cashback";
import type { Stamped } from "@/lib/sync/row-stamps";
import {
  deductionYear,
  isDeductionKind,
  taxFromNetSalary,
  type DeductionKind,
  type DeductionSpend,
  type DeductionYear
} from "@/lib/tax/deductions";
import {
  activeTrip,
  tripTag,
  tripView,
  type Trip,
  type TripSpend,
  type TripView
} from "@/lib/trips/trips";

export type DeductionYearRow = { id: string; taxPaid?: number; children?: number };

export type ExtrasState = {
  cashbackRules: Array<Stamped<CashbackRule>>;
  trips: Array<Stamped<Trip>>;
  deductionYears: Array<Stamped<DeductionYearRow>>;
};

type Body = Record<string, unknown>;

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function previousMonthOf(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ——— кэшбэк ————————————————————————————————————————————————————————

export type CashbackPageData = {
  month: string;
  rules: CashbackRule[];
  summary: CashbackSummary;
  previousHasRules: boolean;
};

export function readCashback(
  state: ExtrasState,
  month: string,
  spends: readonly CashbackSpend[]
): CashbackPageData {
  const rules = state.cashbackRules.map(({ updatedAt: _stamp, ...rule }) => {
    void _stamp;
    return rule;
  });
  return {
    month,
    rules: rules.filter((rule) => rule.month === month),
    summary: monthCashback(rules, spends, month),
    previousHasRules: rules.some((rule) => rule.month === previousMonthOf(month))
  };
}

/** Дела с кешбэком по полю `action`; без него — правило записывается. */
export const CASHBACK_ACTIONS = {
  remove: (state: ExtrasState, body: Body) => {
    state.cashbackRules = state.cashbackRules.filter((rule) => rule.id !== body.id);
    return { removed: true };
  },
  copyPrevious: (state: ExtrasState, body: Body, makeId: () => string) => {
    const month = String(body.month ?? "");
    if (!MONTH.test(month)) throw new Error("Не тот месяц.");
    const copied = copyRules(state.cashbackRules, previousMonthOf(month), month, makeId);
    state.cashbackRules = [...state.cashbackRules, ...copied];
    return { copied: copied.length };
  }
};

/** Есть ли такие карта и категория — проверяет вызывающий: книга у него. */
export type CashbackRefs = { account: (id: string) => boolean; category: (id: string) => boolean };

/** Правило кешбэка: новое или правка. */
export function saveCashbackRule(
  state: ExtrasState,
  body: Body,
  makeId: () => string,
  exists: CashbackRefs
): CashbackRule {
  const month = String(body.month ?? "");
  const accountId = String(body.accountId ?? "");
  const categoryId = String(body.categoryId ?? "");
  const percent = Number(String(body.percent ?? "").replace(",", "."));
  const limitRaw = String(body.limit ?? "")
    .replace(",", ".")
    .replace(/\s/g, "");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (!MONTH.test(month)) throw new Error("Не тот месяц.");
  if (!exists.account(accountId)) throw new Error("Выберите карту.");
  if (categoryId !== ANY_CATEGORY && !exists.category(categoryId))
    throw new Error("Выберите категорию.");
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
    throw new Error("Процент — от 0,1 до 100.");
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 0))
    throw new Error("Лимит — сумма в рублях или пусто.");

  // Та же карта и категория в том же месяце — правка, а не второе правило.
  // Правили условие и поставили карту/категорию, у которой условие уже есть, —
  // остаётся одно: иначе в месяце жили бы два правила на одно и то же.
  const edited = body.id ? state.cashbackRules.find((rule) => rule.id === body.id) : undefined;
  const clash = state.cashbackRules.find(
    (rule) => rule.month === month && rule.accountId === accountId && rule.categoryId === categoryId
  );
  const rule: CashbackRule = {
    id: edited?.id ?? clash?.id ?? makeId(),
    accountId,
    month,
    categoryId,
    percent,
    ...(limit !== undefined ? { limit } : {})
  };
  const at = state.cashbackRules.findIndex((item) => item.id === rule.id);
  const rest = state.cashbackRules.filter((item) => item.id !== rule.id && item.id !== clash?.id);
  state.cashbackRules = at >= 0 ? [...rest.slice(0, at), rule, ...rest.slice(at)] : [...rest, rule];
  return rule;
}

// ——— поездки ———————————————————————————————————————————————————————

export type TripsPageData = { trips: TripView[]; active: TripView | null };

export function readTrips(
  state: ExtrasState,
  spendsIn: (currency: string) => readonly TripSpend[],
  today: string
): TripsPageData {
  const views = [...state.trips]
    .sort((a, b) => b.from.localeCompare(a.from))
    .map(({ updatedAt: _stamp, ...trip }) => {
      void _stamp;
      return tripView(trip, spendsIn(trip.currency), today);
    });
  return { trips: views, active: activeTrip(views, today) };
}

/** Дела с поездками по полю `action`; без него — поездка записывается. */
export const TRIP_ACTIONS = {
  remove: (state: ExtrasState, body: Body) => {
    state.trips = state.trips.filter((trip) => trip.id !== body.id);
    return { removed: true };
  },
  finish: (state: ExtrasState, body: Body) => {
    const yesterday = String(body.today ?? "");
    state.trips = state.trips.map((trip) =>
      trip.id === body.id && DAY.test(yesterday)
        ? { ...trip, to: yesterday < trip.from ? trip.from : yesterday }
        : trip
    );
    return { finished: true };
  }
};

/** Поездка: новая или правка. */
export function saveTrip(state: ExtrasState, body: Body, makeId: () => string): Trip {
  const name = String(body.name ?? "").trim();
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  const budget = Number(
    String(body.budget ?? "0")
      .replace(",", ".")
      .replace(/\s/g, "") || 0
  );
  if (!name) throw new Error("Назовите поездку.");
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Укажите даты поездки.");
  if (to < from) throw new Error("Поездка кончается раньше, чем начинается.");
  if (!Number.isFinite(budget) || budget < 0) throw new Error("Бюджет — сумма или ноль.");
  const previous = state.trips.find((trip) => trip.id === body.id);
  const trip: Trip = {
    id: previous?.id ?? makeId(),
    name,
    from,
    to,
    budget,
    currency: String(body.currency || "RUB"),
    // Метка не меняется при переименовании — иначе операции «потеряют» поездку.
    tag: previous?.tag ?? uniqueTag(state.trips, tripTag(name))
  };
  state.trips = previous
    ? state.trips.map((item) => (item.id === trip.id ? trip : item))
    : [...state.trips, trip];
  return trip;
}

function uniqueTag(trips: readonly Trip[], tag: string): string {
  const taken = new Set(trips.map((trip) => trip.tag));
  if (!taken.has(tag)) return tag;
  for (let n = 2; ; n += 1) if (!taken.has(`${tag}-${n}`)) return `${tag}-${n}`;
}

/** Метка идущей в этот день поездки — её получает новая операция. */
export function tripTagFor(state: ExtrasState, day: string): string | null {
  return activeTrip(state.trips, day)?.tag ?? null;
}

// ——— вычеты ————————————————————————————————————————————————————————

export type DeductionsPageData = DeductionYear & {
  /** Оценка НДФЛ по зарплате, если человек не вписал точную цифру. */
  taxEstimated: boolean;
  children: number;
  operations: DeductionSpend[];
  /** Категории с отметкой вида вычета. */
  marked: Array<{ categoryId: string; kind: DeductionKind }>;
};

export function readDeductions(
  state: ExtrasState,
  input: {
    year: number;
    spends: readonly DeductionSpend[];
    /** Зарплата «на руки» за год — для оценки НДФЛ. */
    netSalary: number;
    marked: Array<{ categoryId: string; kind: DeductionKind }>;
  }
): DeductionsPageData {
  const row = state.deductionYears.find((item) => item.id === String(input.year));
  const children = row?.children ?? 1;
  const known = row?.taxPaid;
  const taxPaid =
    known !== undefined ? known : input.netSalary > 0 ? taxFromNetSalary(input.netSalary) : null;
  return {
    ...deductionYear({ year: input.year, spends: input.spends, taxPaid, children }),
    taxEstimated: known === undefined && taxPaid !== null,
    children,
    operations: input.spends
      .filter((spend) => spend.date.startsWith(String(input.year)))
      .sort((a, b) => b.date.localeCompare(a.date)),
    marked: input.marked
  };
}

export function writeDeductionYear(state: ExtrasState, body: Body): unknown {
  const id = String(body.year ?? "");
  if (!/^\d{4}$/.test(id)) throw new Error("Не тот год.");
  const taxRaw = String(body.taxPaid ?? "")
    .replace(",", ".")
    .replace(/\s/g, "");
  const taxPaid = taxRaw ? Number(taxRaw) : undefined;
  if (taxPaid !== undefined && (!Number.isFinite(taxPaid) || taxPaid < 0))
    throw new Error("Налог — сумма в рублях или пусто.");
  const childrenRaw = Number(body.children ?? 1);
  const children = Number.isFinite(childrenRaw)
    ? Math.min(Math.max(Math.floor(childrenRaw), 1), 20)
    : 1;
  const row: DeductionYearRow = {
    id,
    ...(taxPaid !== undefined ? { taxPaid } : {}),
    children
  };
  state.deductionYears = state.deductionYears.some((item) => item.id === id)
    ? state.deductionYears.map((item) => (item.id === id ? row : item))
    : [...state.deductionYears, row];
  return row;
}

export function deductionKindOf(value: unknown): DeductionKind | null {
  return isDeductionKind(value) ? value : null;
}
