// Лимиты по категориям: сколько потрачено за месяц, строки экрана «Лимиты»,
// запись лимита и предупреждение о превышении при новой операции. Сама
// страница «Лимиты» собирается в overview.ts — ей нужны ещё и рекомендации.

import type { BudgetsPageData } from "@/lib/data";
import { monthKeyOf, toFormObject } from "@/lib/api/local/helpers";
import { clamp, percent, roundMoney } from "@/lib/utils";
import { baseAmountContext, toBaseRows } from "@/lib/transactions/base-amount";
import { suggestedLimitFor } from "@/lib/budget-suggest";
import { budgetInForce, effectiveLimit, rolloverCarry } from "@/lib/budget-rollover";
import type { TransactionRow } from "@/types/finance";
import {
  type CategoryOption,
  type LocalState,
  spendingPlan,
  monthStart
} from "@/lib/api/local/state";
import { ratesOf } from "@/lib/api/local/money";

// Returns budget overflow info when an EXPENSE pushes its category over the limit.
export function budgetWarningFor(
  state: LocalState,
  tx: TransactionRow
): { category: string; spent: number; limit: number } | null {
  if (tx.type !== "EXPENSE") return null;
  // Лимит того месяца, в котором операция, — а не первая попавшаяся запись
  // категории: с тех пор как у лимитов есть месяц, их у категории несколько.
  const month = tx.date.slice(0, 7);
  const limit = spendingPlan(state, tx.category.id, month) ?? 0;
  if (limit <= 0) return null;
  const context = baseAmountContext(state.accounts, ratesOf(state), state.currency);
  const spent = toBaseRows(state.transactions, context)
    .filter(
      (item) =>
        item.type === "EXPENSE" &&
        item.category.id === tx.category.id &&
        item.date.startsWith(month)
    )
    .reduce((sum, item) => sum + item.amount, 0);
  if (spent > limit) {
    return { category: tx.category.label, spent: roundMoney(spent), limit };
  }
  return null;
}

export function upsertBudget(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const category = state.categories.find(
    (item) => item.id === input.categoryId && item.kind === "EXPENSE"
  );
  if (!category) throw new Error("Выберите расходную категорию.");

  const limit = Number(input.limitAmount);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Введите лимит от нуля.");
  const monthKey = typeof input.month === "string" && input.month ? input.month : undefined;

  // A limit belongs to the month it was set in and holds until it is changed
  // (see budgetInForce). Saving one used to overwrite the single record a
  // category had, so a figure typed in September changed August as well.
  const month = monthKey ?? monthKeyOf(new Date());
  // Only this month's own record gives way. A record written before limits
  // had a month is the limit for every month that has none of its own, so
  // treating it as this month's and replacing it dropped every earlier month
  // to "no limit" the first time a figure was saved after the update.
  const otherMonths = (item: BudgetsPageData["budgets"][number]) =>
    item.categoryId !== category.id || (item.month ?? "") !== month;
  const inForce = budgetInForce(state.budgets, category.id, month);
  // Клетка плана за этот месяц — то же число. Прежняя, вписанная отдельно,
  // уступает только что сказанному, иначе она спорила бы с ним (spendingPlan).
  state.plans = state.plans.filter(
    (entry) => !(entry.categoryId === category.id && entry.month === month)
  );

  // A zero limit means "no limit this month". Simply dropping the record would
  // let an earlier month's limit take its place, so the zero is written down.
  if (limit === 0) {
    const earlier = state.budgets.some(
      (item) => item.categoryId === category.id && (item.month ?? "") !== month
    );
    state.budgets = state.budgets.filter(otherMonths);
    if (earlier) {
      state.budgets = [
        buildBudgetRow(state, category, 0, month, inForce?.rollover ?? false),
        ...state.budgets
      ];
    }
    return { removed: true };
  }

  // Update rollover only when explicitly provided (so saving a limit doesn't
  // silently turn it off). toFormObject stringifies values.
  const rolloverProvided = input.rollover === "true" || input.rollover === "false";
  const rollover = rolloverProvided ? input.rollover === "true" : (inForce?.rollover ?? false);

  const row = buildBudgetRow(state, category, limit, month, rollover);
  state.budgets = [row, ...state.budgets.filter(otherMonths)];
  return row;
}

/**
 * Траты по категориям — разложенные один раз на список операций. Лимиты
 * строятся по каждой категории, и каждая раньше перебирала весь учёт — трижды
 * (этот месяц, прошлый, подсказка лимита): на двадцати категориях и двадцати
 * тысячах операций это больше миллиона проверок на одно открытие экрана.
 */
const expensesByCategory = new WeakMap<readonly TransactionRow[], Map<string, TransactionRow[]>>();

export function expensesOf(rows: readonly TransactionRow[], categoryId: string): TransactionRow[] {
  let groups = expensesByCategory.get(rows);
  if (!groups) {
    groups = new Map();
    for (const row of rows) {
      if (row.type !== "EXPENSE") continue;
      const list = groups.get(row.category.id);
      if (list) list.push(row);
      else groups.set(row.category.id, [row]);
    }
    expensesByCategory.set(rows, groups);
  }
  return groups.get(categoryId) ?? [];
}

/** Amounts are expected in the base currency already — see `inBase`. */
export function spentInMonth(state: LocalState, categoryId: string, monthKey: string): number {
  return expensesOf(state.transactions, categoryId)
    .filter((transaction) => transaction.date.startsWith(monthKey))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function buildBudgetRow(
  state: LocalState,
  category: CategoryOption,
  limitAmount: number,
  monthKey?: string,
  rollover = false,
  suggest = true
): BudgetsPageData["budgets"][number] {
  const now = new Date();
  const month = monthKey ?? monthKeyOf(now);
  const spent = spentInMonth(state, category.id, month);
  // Previous month (single-month carryover); desktop stores one limit per
  // category, so the previous limit equals the current limit.
  const [y, m] = month.split("-").map(Number);
  const prevMonthKey = monthKeyOf(new Date(y, m - 2, 1));
  // What was left over is last month's limit against last month's spending —
  // and last month may well have had a different limit.
  const carried = rolloverCarry(
    rollover,
    budgetInForce(state.budgets, category.id, prevMonthKey)?.limitAmount ?? limitAmount,
    spentInMonth(state, category.id, prevMonthKey)
  );
  const effective = effectiveLimit(limitAmount, carried);
  return {
    id: `budget-${category.id}-${month}`,
    categoryId: category.id,
    category: category.label,
    color: category.color,
    month,
    limitAmount,
    spent: roundMoney(spent),
    rollover,
    rolloverAmount: carried,
    progress: effective > 0 ? clamp(percent(spent, effective), 0, 140) : 0,
    isExceeded: effective > 0 && spent > effective,
    // Подсказка лимита нужна только экрану «Лимиты»; главной, прогнозу и
    // советам она ни к чему, а стоит прохода по трём месяцам учёта.
    suggestedLimit: suggest
      ? suggestedLimitFor(category.id, expensesOf(state.transactions, category.id), {
          now: monthKey ? monthStart(monthKey) : now
        })
      : 0
  };
}

export function budgetRows(state: LocalState, monthKey?: string, suggest = false) {
  const month = monthKey ?? monthKeyOf(new Date());
  return state.categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => {
      const inForce = budgetInForce(state.budgets, category.id, month);
      return buildBudgetRow(
        state,
        category,
        spendingPlan(state, category.id, month) ?? 0,
        month,
        inForce?.rollover ?? false,
        suggest
      );
    });
}
