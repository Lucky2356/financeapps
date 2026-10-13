// «Можно тратить сегодня».
//
// Одно число, ради которого такие приложения открывают каждый день: сколько
// можно потратить сегодня, чтобы до конца месяца хватило. Считается просто и
// честно, без угадываний:
//
//   (доходы месяца + остаток с прошлого − платежи до конца месяца − потрачено до сегодня)
//   ─────────────────────────────────────────────────────────────────────────────────────
//                         дней до конца месяца, считая сегодня
//
// Остаток с прошлого — то, что прошлый месяц не доел: его доходы минус его
// расходы. Без него человек, отложивший в сентябре, в октябре видел «уже
// больше, чем позволяет месяц», хотя деньги у него были.
//
// Доходов в месяце ещё нет (зарплата пятого, а сегодня третье) — берём средний
// доход за прошлые месяцы и так и пишем: «по среднему доходу». Иначе первые
// дни месяца показывали бы ноль и красный цвет у человека, у которого всё в
// порядке.

export type AllowanceInput = {
  /** Сегодня, YYYY-MM-DD. */
  today: string;
  /** Доходы с начала месяца. */
  income: number;
  /** Средний доход за прошлые месяцы — запасной, пока в этом месяце пусто. */
  averageIncome: number;
  /**
   * Доходы прошлого календарного месяца минус его расходы — как есть, со
   * знаком. В расчёт идёт только плюс (см. carryOverOf).
   */
  previousNet?: number;
  /** Плановые расходы после сегодня и до конца месяца (регулярные, долги, записанные вперёд). */
  upcoming: number;
  /** Расходы с начала месяца до вчера включительно. */
  spentBeforeToday: number;
  spentToday: number;
  spentYesterday: number;
};

export type Allowance = {
  /** Сколько можно тратить в день до конца месяца, начиная с сегодня. */
  perDay: number;
  /** Сколько осталось на сегодня: perDay − потрачено сегодня. */
  leftToday: number;
  /** Дней до конца месяца, считая сегодня. */
  daysLeft: number;
  /** Сколько вообще осталось на месяц. */
  budget: number;
  incomeSource: "actual" | "average";
  /** Остаток с прошлого месяца, уже не меньше нуля. */
  carryOver: number;
  /** Доходы минус расходы прошлого месяца со знаком — чтобы объяснить ноль в carryOver. */
  previousNet: number;
  /** ok — укладываемся; tight — на сегодня почти всё; over — уже перебор. */
  status: "ok" | "tight" | "over";
  spentToday: number;
  spentYesterday: number;
  /** Потрачено с начала месяца до вчера — чтобы расчёт сходился на глаз. */
  spentBeforeToday: number;
  upcoming: number;
  income: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Сколько прошлый месяц оставил этому. Перерасход остатком не считается: минус
 * прошлого месяца уже сидит в балансе карт (или в долге по кредитке), и
 * вычесть его ещё раз из этого месяца значило бы наказать за него дважды.
 * Поэтому — не меньше нуля.
 */
export function carryOverOf(previousNet: number | undefined): number {
  return previousNet && previousNet > 0 ? round(previousNet) : 0;
}

export function computeDailyAllowance(input: AllowanceInput): Allowance {
  const [year, month, day] = input.today.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const daysLeft = Math.max(lastDay - day + 1, 1);

  const useAverage = !(input.income > 0) && input.averageIncome > 0;
  const income = useAverage ? input.averageIncome : Math.max(input.income, 0);
  const carryOver = carryOverOf(input.previousNet);
  const budget = round(income + carryOver - input.upcoming - input.spentBeforeToday);
  const perDay = round(Math.max(budget, 0) / daysLeft);
  const leftToday = round(perDay - input.spentToday);

  const status: Allowance["status"] =
    budget <= 0 || leftToday < 0 ? "over" : leftToday < perDay * 0.25 ? "tight" : "ok";

  return {
    perDay,
    leftToday,
    daysLeft,
    budget,
    incomeSource: useAverage ? "average" : "actual",
    carryOver,
    previousNet: round(input.previousNet ?? 0),
    status,
    spentToday: round(input.spentToday),
    spentYesterday: round(input.spentYesterday),
    spentBeforeToday: round(input.spentBeforeToday),
    upcoming: round(input.upcoming),
    income: round(income)
  };
}
