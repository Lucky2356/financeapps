// «Хватит ли до зарплаты».
//
// «Можно тратить сегодня» считает до конца месяца. Но живут не от первого
// числа до первого, а от зарплаты до зарплаты: если она приходит 10-го, то 25-го
// важен не конец месяца, а 10-е следующего. Здесь — ровно это: сколько дней до
// зарплаты, сколько денег на картах и наличными, сколько из них уже обещано
// обязательным платежам до неё и сколько остаётся на каждый день.
//
// Зарплата приходит не у всех раз в месяц: бывает аванс 10-го и расчёт 25-го,
// бывает каждую пятницу, бывает каждый день (доставка, такси, своё дело).
// Поэтому день — не одно число, а расписание (PaydaySchedule), и считается
// всегда до БЛИЖАЙШЕЙ выплаты.
//
// Расписание берётся из истории: в какие дни месяца обычно приходят самые
// крупные поступления. Человек может указать его сам — тогда берётся его.
//
// Чистые функции: экран и проверки зовут одно и то же.

export type IncomeRow = { date: string; amount: number; category: string };

export type UpcomingPayment = { date: string; amount: number; title: string };

/** День месяца (1–31) или «последний день месяца». */
export type PaydayDay = number | "last";

export type PaydaySchedule =
  /** Числа месяца: аванс 10-го и зарплата 25-го — [10, 25]. */
  | { kind: "monthly"; days: PaydayDay[] }
  /** Каждую неделю; день недели — 1 понедельник … 7 воскресенье. */
  | { kind: "weekly"; weekday: number }
  | { kind: "daily" };

export type PaydayForecast = {
  /** Когда приходит зарплата. */
  schedule: PaydaySchedule;
  /** Откуда расписание: угадано по истории или указано человеком. */
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
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** «Зарплатные» поступления, если такие статьи есть, иначе все. */
function salaryPool(rows: readonly IncomeRow[]): readonly IncomeRow[] {
  const salaryRows = rows.filter((row) => SALARY.test(row.category));
  return salaryRows.length > 0 ? salaryRows : rows;
}

const dayOf = (row: IncomeRow) => Number(row.date.slice(8, 10));

/**
 * В какой день месяца обычно приходит зарплата: самое крупное поступление
 * каждого месяца (среди «зарплатных» статей, если такие есть), день — медиана.
 * Меньше двух месяцев истории — не угадываем.
 */
export function detectPayday(rows: readonly IncomeRow[]): number | null {
  const biggest = new Map<string, IncomeRow>();
  for (const row of salaryPool(rows)) {
    const month = row.date.slice(0, 7);
    const current = biggest.get(month);
    if (!current || row.amount > current.amount) biggest.set(month, row);
  }
  const days = [...biggest.values()].map(dayOf).filter((day) => day >= 1 && day <= 31);
  if (days.length < 2) return null;
  return median(days);
}

/** Второе поступление считается крупным от этой доли самого крупного в месяце. */
const SECOND_SHARE = 0.3;
/** Аванс и расчёт — не одна выплата, разбитая на две строки: между ними неделя и больше. */
const MIN_GAP = 7;
/** Насколько день выплаты гуляет от месяца к месяцу (выходные, праздники). */
const DRIFT = 3;

/**
 * Дни зарплаты по истории: один, как detectPayday, или два — аванс и расчёт.
 *
 * Два дня — только когда это видно уверенно: за последние полгода в двух и
 * более месяцах, и в трёх четвертях месяцев вообще, пришло по два крупных
 * поступления (второе — не меньше трети первого) с разрывом в неделю и больше,
 * и каждое приходит в свой день с точностью до трёх дней. Иначе — один день,
 * как прежде: лишний «аванс», которого нет, хуже недосчитанного.
 *
 * Идущий месяц (`today`), где пока одно поступление, не считается против:
 * второе в нём могло ещё не прийти. Так же и самый первый месяц истории:
 * учёт могли начать между авансом и расчётом.
 */
export function detectPaydays(rows: readonly IncomeRow[], today?: string): number[] | null {
  const primary = detectPayday(rows);
  if (primary === null) return null;
  const byMonth = new Map<string, IncomeRow[]>();
  for (const row of salaryPool(rows)) {
    const day = dayOf(row);
    if (!(day >= 1 && day <= 31) || !(row.amount > 0)) continue;
    const month = row.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  const current = today?.slice(0, 7);
  const first = [...byMonth.keys()].sort()[0];
  const pairs: Array<[number, number]> = [];
  let counted = 0;
  for (const month of [...byMonth.keys()].sort().slice(-6)) {
    const monthRows = [...(byMonth.get(month) ?? [])].sort((a, b) => b.amount - a.amount);
    const [top] = monthRows;
    const second = monthRows.find(
      (row) =>
        row !== top &&
        row.amount >= top.amount * SECOND_SHARE &&
        Math.abs(dayOf(row) - dayOf(top)) >= MIN_GAP
    );
    if (!second && (month === current || month === first)) continue;
    counted += 1;
    if (second) {
      const days = [dayOf(top), dayOf(second)].sort((a, b) => a - b);
      pairs.push([days[0], days[1]]);
    }
  }
  if (pairs.length < 2 || pairs.length < counted * 0.75) return [primary];
  const early = median(pairs.map((pair) => pair[0]));
  const late = median(pairs.map((pair) => pair[1]));
  const steady = pairs.every(
    ([a, b]) => Math.abs(a - early) <= DRIFT && Math.abs(b - late) <= DRIFT
  );
  return steady && late - early >= MIN_GAP ? [early, late] : [primary];
}

/**
 * Расписание из строки, как оно лежит на устройстве и ходит в ?schedule=.
 *
 *   ""            — по истории (null);
 *   "10"          — 10-го (так хранился единственный день до расписаний — старая
 *                   запись читается как есть, переносить ничего не нужно);
 *   "10,25,last"  — 10-го, 25-го и в последний день месяца;
 *   "week:5"      — каждую пятницу;
 *   "daily"       — каждый день.
 *
 * Непонятное — тоже null: лучше по истории, чем упасть или считать чушь.
 */
export function parsePaydaySchedule(raw: string | null | undefined): PaydaySchedule | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "daily") return { kind: "daily" };
  const weekly = /^week:([1-7])$/.exec(value);
  if (weekly) return { kind: "weekly", weekday: Number(weekly[1]) };
  const days: PaydayDay[] = [];
  for (const part of value.split(",")) {
    const item = part.trim();
    if (item === "last") days.push("last");
    else if (/^\d{1,2}$/.test(item) && Number(item) >= 1 && Number(item) <= 31)
      days.push(Number(item));
    else return null;
  }
  return days.length > 0 ? { kind: "monthly", days: normalizeDays(days) } : null;
}

/** Обратно в строку; null — «по истории», пустая строка. */
export function serializePaydaySchedule(schedule: PaydaySchedule | null): string {
  if (!schedule) return "";
  if (schedule.kind === "daily") return "daily";
  if (schedule.kind === "weekly") return `week:${schedule.weekday}`;
  return normalizeDays(schedule.days).join(",");
}

/** Без повторов, по порядку, «последний день» — в конце. */
export function normalizeDays(days: readonly PaydayDay[]): PaydayDay[] {
  const numbers = [...new Set(days.filter((day): day is number => day !== "last"))].sort(
    (a, b) => a - b
  );
  return days.includes("last") ? [...numbers, "last"] : numbers;
}

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

/**
 * Ближайшая дата зарплаты ПОСЛЕ сегодня. Сегодня не считается: если зарплата
 * сегодня, она уже пришла и лежит на картах, а считать надо до следующей.
 * 31-е (и 29–30-е) в коротком месяце — его последний день.
 */
export function nextPaydayDate(today: string, schedule: PaydaySchedule): string {
  const [year, month, day] = today.split("-").map(Number);
  if (schedule.kind === "daily") return iso(new Date(year, month - 1, day + 1));
  if (schedule.kind === "weekly") {
    // getDay(): 0 — воскресенье; в расписании воскресенье — 7.
    const weekday = new Date(year, month - 1, day).getDay() || 7;
    const ahead = (schedule.weekday - weekday + 7) % 7 || 7;
    return iso(new Date(year, month - 1, day + ahead));
  }
  const candidates: string[] = [];
  // Этот месяц и следующий: в следующем любая выплата уже после сегодня.
  for (const offset of [0, 1]) {
    const y = year + Math.floor((month - 1 + offset) / 12);
    const m = ((month - 1 + offset) % 12) + 1;
    const last = new Date(y, m, 0).getDate();
    for (const item of schedule.days)
      candidates.push(iso(new Date(y, m - 1, item === "last" ? last : Math.min(item, last))));
  }
  const ahead = candidates.filter((date) => date > today).sort();
  // Пустого расписания не бывает (parsePaydaySchedule его не отдаёт), но на
  // всякий случай — через месяц, а не падение.
  return ahead[0] ?? iso(new Date(year, month, day));
}

/** Ближайшая дата зарплаты, приходящей раз в месяц в день `payday`. */
export function nextPayday(today: string, payday: number): string {
  return nextPaydayDate(today, { kind: "monthly", days: [payday] });
}

export function forecastToPayday(input: {
  today: string;
  schedule: PaydaySchedule;
  source: PaydayForecast["source"];
  liquid: number;
  payments: readonly UpcomingPayment[];
  usualPerDay: number;
}): PaydayForecast {
  const nextDate = nextPaydayDate(input.today, input.schedule);
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
    schedule: input.schedule,
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
