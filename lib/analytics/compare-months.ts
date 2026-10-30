// «Сравнение месяцев»: два месяца бок о бок по каждой статье.
//
// Что выросло, что упало и на сколько — в рублях и процентах, крупные
// изменения первыми. Если первый месяц ещё идёт, оба берутся до сегодняшнего
// числа: иначе 5-го числа любой месяц «тратит меньше прошлого» просто потому,
// что не кончился. Режется и сам идущий месяц — записанная заранее аренда на
// 25-е иначе попадала в него, но не в прошлый, и 12-го «расходы выросли в
// тридцать раз», хотя «Итоги месяца» на тот же день показывали поровну.
//
// Чистая функция: экран и проверки зовут одно и то же.

export type CompareRow = {
  type: string;
  date: string;
  amount: number;
  categoryId: string;
  category: string;
  color?: string;
};

export type CompareLine = {
  categoryId: string;
  category: string;
  color?: string;
  a: number;
  b: number;
  /** a − b: плюс — в первом месяце больше. */
  change: number;
  /** Изменение в процентах к b; null — во втором месяце этой статьи не было. */
  percent: number | null;
};

export type MonthComparison = {
  a: string;
  b: string;
  /** Первый месяц ещё идёт — оба взяты до этого числа. */
  asOfDay: number | null;
  expense: CompareLine[];
  income: CompareLine[];
  totals: { expenseA: number; expenseB: number; incomeA: number; incomeB: number };
};

const round = (value: number) => Math.round(value * 100) / 100;

function lines(
  rows: readonly CompareRow[],
  a: string,
  b: string,
  inWindow: (row: CompareRow) => boolean
) {
  const map = new Map<string, CompareLine>();
  for (const row of rows) {
    if (!inWindow(row)) continue;
    const month = row.date.slice(0, 7);
    const side = month === a ? "a" : month === b ? "b" : null;
    if (!side) continue;
    const line = map.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      category: row.category,
      color: row.color,
      a: 0,
      b: 0,
      change: 0,
      percent: null
    };
    line[side] += row.amount;
    map.set(row.categoryId, line);
  }
  return [...map.values()]
    .map((line) => {
      const a = round(line.a);
      const b = round(line.b);
      return {
        ...line,
        a,
        b,
        change: round(a - b),
        percent: b > 0 ? Math.round(((a - b) / b) * 100) : null
      };
    })
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
}

export function compareMonths(input: {
  rows: readonly CompareRow[];
  a: string;
  b: string;
  today: string;
}): MonthComparison {
  const asOfDay = input.a === input.today.slice(0, 7) ? Number(input.today.slice(8, 10)) : null;
  // Одно окно на обе стороны: до сегодняшнего числа — и в идущем месяце, и в прошлом.
  const inWindow = (row: CompareRow) =>
    asOfDay === null || Number(row.date.slice(8, 10)) <= asOfDay;
  const expense = lines(
    input.rows.filter((row) => row.type === "EXPENSE"),
    input.a,
    input.b,
    inWindow
  );
  const income = lines(
    input.rows.filter((row) => row.type === "INCOME"),
    input.a,
    input.b,
    inWindow
  );
  const sum = (list: CompareLine[], side: "a" | "b") =>
    round(list.reduce((total, line) => total + line[side], 0));
  return {
    a: input.a,
    b: input.b,
    asOfDay,
    expense,
    income,
    totals: {
      expenseA: sum(expense, "a"),
      expenseB: sum(expense, "b"),
      incomeA: sum(income, "a"),
      incomeB: sum(income, "b")
    }
  };
}
