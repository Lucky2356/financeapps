// Недельная сводка — в понедельник: как прошла прошлая неделя.
//
// Месячные итоги приходят раз в месяц — поздно, чтобы что-то поправить.
// Неделя — в самый раз: сколько ушло, больше или меньше обычного (среднее за
// четыре недели до неё), что выросло сильнее всего и сколько можно тратить
// на этой неделе, чтобы месяц сошёлся.

export type WeekRow = {
  type: "INCOME" | "EXPENSE";
  date: string;
  amount: number;
  categoryId: string;
  category: string;
};

export type WeekRecap = {
  /** Понедельник прошлой недели, YYYY-MM-DD. */
  weekStart: string;
  weekEnd: string;
  spent: number;
  /** Среднее за четыре недели до неё; 0 — сравнить не с чем. */
  usual: number;
  /** Рост к обычному, %, или null, если сравнить не с чем. */
  change: number | null;
  top: Array<{ categoryId: string; category: string; amount: number }>;
  grew: { category: string; amount: number; usual: number } | null;
  /** Сколько можно на эту неделю (из «Можно тратить сегодня» × 7). */
  allowance: number | null;
  operations: number;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(date: Date): Date {
  const shift = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

const round = (value: number) => Math.round(value * 100) / 100;

export function buildWeekRecap(input: {
  rows: readonly WeekRow[];
  today: Date;
  perDay?: number | null;
}): WeekRecap {
  const thisMonday = mondayOf(input.today);
  const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  const weeks = [0, 1, 2, 3, 4].map((back) => {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7 * back);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: iso(from), to: iso(to) };
  });
  const expenses = input.rows.filter((row) => row.type === "EXPENSE");
  const inWeek = (week: { from: string; to: string }) =>
    expenses.filter(
      (row) => row.date.slice(0, 10) >= week.from && row.date.slice(0, 10) <= week.to
    );

  const current = inWeek(weeks[0]);
  const spent = round(current.reduce((sum, row) => sum + row.amount, 0));
  const earlier = weeks.slice(1).map(inWeek);
  const earlierWithData = earlier.filter((rows) => rows.length > 0);
  const usual = earlierWithData.length
    ? round(
        earlierWithData.reduce((sum, rows) => sum + rows.reduce((s, row) => s + row.amount, 0), 0) /
          earlierWithData.length
      )
    : 0;

  const byCategory = (rows: WeekRow[]) => {
    const map = new Map<string, { category: string; amount: number }>();
    for (const row of rows) {
      const entry = map.get(row.categoryId) ?? { category: row.category, amount: 0 };
      entry.amount += row.amount;
      map.set(row.categoryId, entry);
    }
    return map;
  };
  const now = byCategory(current);
  const before = byCategory(earlier.flat());
  const top = [...now.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      category: entry.category,
      amount: round(entry.amount)
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  let grew: WeekRecap["grew"] = null;
  for (const [categoryId, entry] of now) {
    const typical = earlierWithData.length
      ? (before.get(categoryId)?.amount ?? 0) / earlierWithData.length
      : 0;
    const extra = entry.amount - typical;
    if (
      typical > 0 &&
      entry.amount >= typical * 1.3 &&
      extra > (grew ? grew.amount - grew.usual : 0)
    ) {
      grew = { category: entry.category, amount: round(entry.amount), usual: round(typical) };
    }
  }

  return {
    weekStart: weeks[0].from,
    weekEnd: weeks[0].to,
    spent,
    usual,
    change: usual > 0 ? Math.round(((spent - usual) / usual) * 100) : null,
    top,
    grew,
    allowance: input.perDay && input.perDay > 0 ? round(input.perDay * 7) : null,
    operations: current.length
  };
}
