// История остатка: сколько лежало на каждом счёте в конце каждого месяца.
//
// Отдельно остатки по дням не хранятся — и не нужны: сегодняшний остаток
// известен, а всё, что с ним случилось, записано операциями. Отматываем назад:
// остаток в конце месяца = сегодняшний минус всё, что пришло после, плюс всё,
// что ушло после. Так история всегда сходится с операциями — ей не с чем
// разойтись.
//
// Цели считаются отдельной строкой: пополнение цели снимает деньги со счёта и
// кладёт их в цель — деньги остаются вашими (см. openingBalances в
// LocalApiClient — та же логика).
//
// Чистые функции: экран и проверки зовут одно и то же.

export type HistoryAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
};

/** Движение по счёту в его валюте: плюс — пришло, минус — ушло. */
export type HistoryFlow = { accountId: string; date: string; signed: number };

export type HistoryGoalMovement = { date: string; amount: number };

export type BalanceHistory = {
  /** Месяцы по порядку, YYYY-MM; последний — текущий (остаток на сегодня). */
  months: string[];
  accounts: Array<HistoryAccount & { values: number[] }>;
  /** Сколько лежало в целях на конец месяца. */
  goals: number[];
};

const round = (value: number) => Math.round(value * 100) / 100;

export function monthsBack(current: string, count: number): string[] {
  const [year, month] = current.split("-").map(Number);
  const out: string[] = [];
  for (let step = count - 1; step >= 0; step -= 1) {
    const date = new Date(year, month - 1 - step, 1);
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function balanceHistory(input: {
  accounts: readonly HistoryAccount[];
  flows: readonly HistoryFlow[];
  goalsNow: number;
  goalMovements: readonly HistoryGoalMovement[];
  months: readonly string[];
}): BalanceHistory {
  // Что случилось ПОСЛЕ конца месяца m: всё, что датировано месяцем позже m.
  const after = (month: string, items: Array<{ date: string; value: number }>) =>
    items.reduce((sum, item) => (item.date.slice(0, 7) > month ? sum + item.value : sum), 0);

  const byAccount = new Map<string, Array<{ date: string; value: number }>>();
  for (const flow of input.flows) {
    const list = byAccount.get(flow.accountId) ?? [];
    list.push({ date: flow.date, value: flow.signed });
    byAccount.set(flow.accountId, list);
  }
  const goalFlows = input.goalMovements.map((item) => ({ date: item.date, value: item.amount }));

  return {
    months: [...input.months],
    accounts: input.accounts.map((account) => {
      const flows = byAccount.get(account.id) ?? [];
      return {
        ...account,
        values: input.months.map((month) => round(account.balance - after(month, flows)))
      };
    }),
    goals: input.months.map((month) => round(input.goalsNow - after(month, goalFlows)))
  };
}
