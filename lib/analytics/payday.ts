// «Хватит ли до зарплаты».
//
// «Можно тратить сегодня» считает до конца месяца. Но живут не от первого
// числа до первого, а от зарплаты до зарплаты: если она приходит 10-го, то 25-го
// важен не конец месяца, а 10-е следующего. Здесь — ровно это: сколько дней до
// зарплаты, сколько денег на картах и наличными, сколько из них уже обещано
// обязательным платежам до неё и сколько остаётся на каждый день.
//
// День зарплаты берётся из истории: в какой день месяца обычно приходит самое
// крупное поступление. Человек может поправить его сам — тогда берётся его.
//
// Чистые функции: экран и проверки зовут одно и то же.

export type IncomeRow = { date: string; amount: number; category: string };

export type UpcomingPayment = { date: string; amount: number; title: string };

export type PaydayForecast = {
  /** День месяца, когда приходит зарплата. */
  payday: number;
  /** Откуда день: угадан по истории или указан человеком. */
  source: "history" | "manual";
  /** Ближайшая дата зарплаты, YYYY-MM-DD (сегодня не считается — она уже пришла). */
  nextDate: string;
  daysLeft: number;
  /** Деньги на картах и наличными. */
  liquid: number;
  /** Обязательные платежи до зарплаты. */
  upcoming: number;
  payments: UpcomingPayment[];
  /** Остаётся на жизнь до зарплаты. */
  free: number;
  perDay: number;
  /** Средняя трата в день за последние месяцы — с чем сравнивать perDay. */
  usualPerDay: number;
  /** ok — хватает с запасом; tight — впритык (меньше обычного); short — не хватает. */
  status: "ok" | "tight" | "short";
};

const SALARY = /зарплат|зп\b|аванс|оклад|преми|salary|wage|payroll/i;
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * В какой день месяца обычно приходит зарплата: самое крупное поступление
 * каждого месяца (среди «зарплатных» статей, если такие есть), день — медиана.
 * Меньше двух месяцев истории — не угадываем.
 */
export function detectPayday(rows: readonly IncomeRow[]): number | null {
  const salaryRows = rows.filter((row) => SALARY.test(row.category));
  const pool = salaryRows.length > 0 ? salaryRows : rows;
  const biggest = new Map<string, IncomeRow>();
  for (const row of pool) {
    const month = row.date.slice(0, 7);
    const current = biggest.get(month);
    if (!current || row.amount > current.amount) biggest.set(month, row);
  }
  const days = [...biggest.values()]
    .map((row) => Number(row.date.slice(8, 10)))
    .filter((day) => day >= 1 && day <= 31)
    .sort((a, b) => a - b);
  if (days.length < 2) return null;
  return days[Math.floor(days.length / 2)];
}

/** Ближайшая дата зарплаты после сегодня; в коротком месяце — последний день. */
export function nextPayday(today: string, payday: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const at = (y: number, m: number) => {
    const last = new Date(y, m, 0).getDate();
    return new Date(y, m - 1, Math.min(payday, last));
  };
  let date = at(year, month);
  if (date.getDate() <= day)
    date = at(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function forecastToPayday(input: {
  today: string;
  payday: number;
  source: PaydayForecast["source"];
  liquid: number;
  payments: readonly UpcomingPayment[];
  usualPerDay: number;
}): PaydayForecast {
  const nextDate = nextPayday(input.today, input.payday);
  const daysLeft = Math.max(
    1,
    Math.round(
      (Date.parse(`${nextDate}T12:00:00Z`) - Date.parse(`${input.today}T12:00:00Z`)) / 86_400_000
    )
  );
  // Платежи от сегодня до дня зарплаты (в сам день зарплаты — уже из неё).
  const payments = input.payments
    .filter((item) => item.date.slice(0, 10) >= input.today && item.date.slice(0, 10) < nextDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = round(payments.reduce((sum, item) => sum + item.amount, 0));
  const free = round(input.liquid - upcoming);
  const perDay = round(Math.max(free, 0) / daysLeft);
  const status: PaydayForecast["status"] =
    free < 0 ? "short" : input.usualPerDay > 0 && perDay < input.usualPerDay ? "tight" : "ok";
  return {
    payday: input.payday,
    source: input.source,
    nextDate,
    daysLeft,
    liquid: round(input.liquid),
    upcoming,
    payments,
    free,
    perDay,
    usualPerDay: round(input.usualPerDay),
    status
  };
}
