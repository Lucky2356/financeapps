// Плановые платежи в календаре операций (components/transactions/transactions-calendar.tsx).
//
// Сегодняшний день — ещё «впереди»: прогноз (CashflowForecastService) ставит на
// сегодня и платёж с таким сроком, и просроченный, но не подтверждённый. Пока
// он не проведён, деньги со счёта не ушли, и клетка сегодняшнего дня должна его
// показывать. Прежде брались только дни после сегодня, и неоплаченная аренда в
// календаре не была видна нигде. Прошедшие дни — история: там только операции.

import type { ForecastEvent } from "@/types/finance";

/** Плановые расходы месяца `month` («ГГГГ-ММ») по дням, начиная с сегодняшнего. */
export function plannedExpenseByDay(
  events: readonly ForecastEvent[],
  todayKey: string,
  month: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const event of events) {
    const key = event.date.slice(0, 10);
    if (key < todayKey || !key.startsWith(month) || event.type !== "EXPENSE") continue;
    map.set(key, (map.get(key) ?? 0) + event.amount);
  }
  return map;
}

/** Плановые события выбранного дня — если этот день не в прошлом. */
export function plannedOnDay(events: readonly ForecastEvent[], day: string, todayKey: string) {
  if (day < todayKey) return [];
  return events.filter((event) => event.date.slice(0, 10) === day);
}
