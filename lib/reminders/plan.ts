// Напоминания на телефоне: что и когда показать на ближайшую неделю.
//
// Телефон показывает уведомление сам, даже когда приложение закрыто
// (InstallerPlugin.kt → AlarmManager), поэтому расписание собирается заранее —
// при каждом запуске и после каждой правки — и целиком заменяет прежнее.
// Здесь только решение «что и во сколько»; ничего не показывается и не
// запоминается — это делают вызывающий код и Android.

export type ReminderItem = {
  /** Стабильный номер: то же напоминание при пересборке — тот же номер. */
  id: number;
  /** Когда показать, мс с 1970. */
  at: number;
  title: string;
  body: string;
  /** Что открыть по нажатию: financeapps://add… или financeapps://open?path=… */
  link: string;
  /** Ключ — для «показать один раз» (лимиты, вклады). */
  key: string;
};

export type ReminderInput = {
  now: Date;
  /** Плановые платежи из прогноза. */
  payments: ReadonlyArray<{ id: string; date: string; title: string; amount: number }>;
  /** Лимиты месяца. */
  budgets: ReadonlyArray<{ categoryId: string; category: string; spent: number; limit: number }>;
  deposits: ReadonlyArray<{ id: string; name: string; endsOn: string }>;
  /** Вечером напомнить записать траты, если за день пусто. */
  evening: boolean;
  /** Сегодня уже что-то записано. */
  loggedToday: boolean;
  /** Сводка недели по понедельникам. */
  weekly: boolean;
  /**
   * Что показываем один раз (ключ → когда было назначено). Назначенное и ещё
   * не наступившее назначается снова в то же время; наступившее — больше нет.
   */
  once: Readonly<Record<string, number>>;
  money: (value: number) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const DAYS_AHEAD = 7;
export const EVENING_HOUR = 21;

/** Номер для Android: 31-хеш ключа, положительный int. */
export function reminderId(key: string): number {
  let hash = 7;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_000_000_000;
}

const at = (base: Date, dayShift: number, hour: number) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayShift, hour, 0, 0, 0);
const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export function planReminders(input: ReminderInput): ReminderItem[] {
  const now = input.now.getTime();
  const horizon = at(input.now, DAYS_AHEAD + 1, 0).getTime();
  const items: ReminderItem[] = [];
  const add = (key: string, when: Date, title: string, body: string, link: string) => {
    const time = when.getTime();
    if (time <= now || time > horizon) return;
    items.push({ id: reminderId(key), at: time, title, body, link, key });
  };
  // Один раз: если уже назначали — только в то же время и только если оно впереди.
  const once = (key: string, when: Date, title: string, body: string, link: string) => {
    const planned = input.once[key];
    if (planned !== undefined) {
      if (planned > now) add(key, new Date(planned), title, body, link);
      return;
    }
    add(key, when, title, body, link);
  };

  // Платёж завтра — накануне в 10:00.
  for (const payment of input.payments) {
    const day = dayOf(payment.date);
    add(
      `pay:${payment.id}:${iso(day)}`,
      at(day, -1, 10),
      input.t("rem.payTitle", { title: payment.title }),
      input.t("rem.payBody", { amount: input.money(payment.amount) }),
      "financeapps://open?path=/recurring"
    );
  }

  // Лимит почти съеден — ближайшие 12:00 или 19:00, один раз на уровень в месяц.
  const month = iso(input.now).slice(0, 7);
  const nextSlot = () => {
    for (const hour of [12, 19]) {
      const slot = at(input.now, 0, hour);
      if (slot.getTime() > now) return slot;
    }
    return at(input.now, 1, 12);
  };
  for (const budget of input.budgets) {
    if (budget.limit <= 0) continue;
    const share = budget.spent / budget.limit;
    if (share < 0.9) continue;
    const level = share >= 1 ? "100" : "90";
    once(
      `limit:${month}:${budget.categoryId}:${level}`,
      nextSlot(),
      input.t(level === "100" ? "rem.limitOver" : "rem.limitNear", { category: budget.category }),
      input.t("rem.limitBody", {
        spent: input.money(budget.spent),
        limit: input.money(budget.limit)
      }),
      "financeapps://open?path=/budgets"
    );
  }

  // Вклад: за неделю и накануне, в 10:00.
  for (const deposit of input.deposits) {
    const end = dayOf(deposit.endsOn);
    for (const before of [7, 1]) {
      add(
        `deposit:${deposit.id}:${deposit.endsOn}:${before}`,
        at(end, -before, 10),
        input.t("rem.depositTitle", { name: deposit.name }),
        input.t(before === 1 ? "rem.depositTomorrow" : "rem.depositWeek"),
        "financeapps://open?path=/accounts"
      );
    }
  }

  // Вечер: записать траты. Сегодня — только если за день пусто.
  if (input.evening) {
    for (let day = input.loggedToday ? 1 : 0; day <= DAYS_AHEAD; day += 1) {
      const when = at(input.now, day, EVENING_HOUR);
      add(
        `evening:${iso(when)}`,
        when,
        input.t("rem.eveningTitle"),
        input.t("rem.eveningBody"),
        "financeapps://add?type=EXPENSE"
      );
    }
  }

  // Понедельник, 10:00 — неделя позади.
  if (input.weekly) {
    const shift = (8 - input.now.getDay()) % 7 || 7;
    const monday = at(input.now, input.now.getDay() === 1 ? 0 : shift, 10);
    const when = monday.getTime() > now ? monday : at(monday, 7, 10);
    add(
      `week:${iso(when)}`,
      when,
      input.t("rem.weekTitle"),
      input.t("rem.weekBody"),
      "financeapps://open?path=/"
    );
  }

  return items.sort((a, b) => a.at - b.at);
}
