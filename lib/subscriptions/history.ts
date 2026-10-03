// История подписки по операциям: сколько заплачено за год и не подорожала ли.
//
// Списание подписки узнаётся по номеру регулярного платежа, из которого его
// записали, а у старых и импортированных строк — по названию (как ищет
// detect.ts). Подорожание — последнее списание дороже предыдущего.
//
// Чистая функция: экран и проверки зовут одно и то же.

import { normalizeMerchant } from "@/lib/subscriptions/detect";

export type HistoryTx = {
  type: string;
  amount: number;
  date: string;
  description: string | null;
  recurringId?: string;
};

export type SubscriptionHistory = {
  /** Заплачено за последние 12 месяцев. */
  paidYear: number;
  charges: number;
  /** Последнее списание дороже предыдущего — на сколько; иначе null. */
  increase: { from: number; to: number } | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function subscriptionHistory(
  subscription: { id: string; description: string | null },
  transactions: readonly HistoryTx[],
  today: string
): SubscriptionHistory {
  const name = normalizeMerchant(subscription.description);
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;
  const charges = transactions
    .filter(
      (row) =>
        row.type === "EXPENSE" &&
        (row.recurringId === subscription.id ||
          (!row.recurringId && name !== "" && normalizeMerchant(row.description) === name))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastYear = charges.filter((row) => row.date.slice(0, 10) > yearAgo);
  const last = charges[charges.length - 1];
  const before = charges[charges.length - 2];
  return {
    paidYear: round(lastYear.reduce((sum, row) => sum + row.amount, 0)),
    charges: lastYear.length,
    increase:
      last && before && last.amount - before.amount >= 0.01
        ? { from: round(before.amount), to: round(last.amount) }
        : null
  };
}
