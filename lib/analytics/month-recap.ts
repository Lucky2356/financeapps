// «Итоги месяца» — короткий разбор прошедшего месяца в начале нового.
//
// Не отчёт на страницу, а пять чисел и одна фраза: сколько пришло, сколько
// ушло, сколько отложено, где потратили больше всего и что выросло. С
// разницей к месяцу до него — иначе число само по себе ни о чём не говорит.

export type RecapRow = {
  type: "INCOME" | "EXPENSE";
  /** ISO или YYYY-MM-DD — берётся день. */
  date: string;
  amount: number;
  categoryId: string;
  category: string;
  color?: string;
};

export type RecapCategory = {
  categoryId: string;
  category: string;
  color?: string;
  amount: number;
  /** Сколько было месяцем раньше. */
  previous: number;
};

export type MonthRecap = {
  /** YYYY-MM */
  month: string;
  income: number;
  expense: number;
  /** Доход минус расход; отрицательный — жили в долг или из запасов. */
  saved: number;
  /** Доля отложенного от дохода, %, или null без дохода. */
  savedRate: number | null;
  previous: { income: number; expense: number; savedRate: number | null };
  top: RecapCategory[];
  /** Категория, выросшая сильнее всех в рублях (и хотя бы на 10 %). */
  grew: RecapCategory | null;
  /** Превышенные лимиты: категория и на сколько. */
  overBudget: Array<{ category: string; over: number }>;
  operations: number;
  /**
   * Месяц ещё идёт: итоги — на этот день, и прошлый месяц для сравнения взят
   * тоже до этого же числа. Иначе 27-го расходы всегда были бы «меньше, чем в
   * прошлом месяце» — просто потому, что месяц не кончился.
   */
  asOfDay: number | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function previousMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function totals(rows: readonly RecapRow[]) {
  const income = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.amount, 0);
  const rate = income > 0 ? Math.round(((income - expense) / income) * 100) : null;
  return { income: round(income), expense: round(expense), savedRate: rate };
}

function byCategory(rows: readonly RecapRow[]) {
  const map = new Map<string, { category: string; color?: string; amount: number }>();
  for (const row of rows) {
    if (row.type !== "EXPENSE") continue;
    const entry = map.get(row.categoryId) ?? {
      category: row.category,
      color: row.color,
      amount: 0
    };
    entry.amount += row.amount;
    map.set(row.categoryId, entry);
  }
  return map;
}

export function buildMonthRecap(input: {
  month: string;
  rows: readonly RecapRow[];
  budgets?: ReadonlyArray<{ category: string; limitAmount: number; spent: number }>;
  /** Месяц идёт — какое сегодня число. Пусто — месяц закончен. */
  asOfDay?: number | null;
}): MonthRecap {
  const before = previousMonth(input.month);
  const cutoff = input.asOfDay ?? null;
  const day = (row: RecapRow) => Number(row.date.slice(8, 10));
  const inMonth = input.rows.filter(
    (row) => row.date.startsWith(input.month) && (cutoff === null || day(row) <= cutoff)
  );
  const inBefore = input.rows.filter(
    (row) => row.date.startsWith(before) && (cutoff === null || day(row) <= cutoff)
  );
  const now = totals(inMonth);
  const then = totals(inBefore);

  const current = byCategory(inMonth);
  const past = byCategory(inBefore);
  const categories: RecapCategory[] = [...current.entries()].map(([categoryId, entry]) => ({
    categoryId,
    category: entry.category,
    color: entry.color,
    amount: round(entry.amount),
    previous: round(past.get(categoryId)?.amount ?? 0)
  }));
  const top = [...categories].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const grew =
    [...categories]
      .filter((c) => c.previous > 0 && c.amount - c.previous > 0 && c.amount >= c.previous * 1.1)
      .sort((a, b) => b.amount - b.previous - (a.amount - a.previous))[0] ?? null;

  return {
    month: input.month,
    income: now.income,
    expense: now.expense,
    saved: round(now.income - now.expense),
    savedRate: now.savedRate,
    previous: then,
    top,
    grew,
    overBudget: (input.budgets ?? [])
      .filter((b) => b.limitAmount > 0 && b.spent > b.limitAmount)
      .map((b) => ({ category: b.category, over: round(b.spent - b.limitAmount) })),
    operations: inMonth.length,
    asOfDay: cutoff
  };
}
