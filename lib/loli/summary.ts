// Сводка для Лоли — чтобы на «сколько можно тратить сегодня?», «хватит ли до
// зарплаты?» и «сколько осталось на продукты?» она отвечала по здешним
// цифрам, а не по своим записям.
//
// Только итоги — ни одной операции, описания или имени магазина: Лоли нужно
// ответить одной фразой, а не читать учёт. Кладётся на телефон (loli_summary)
// после каждого изменения, и только если человек разрешил отдавать её.
//
// Договор с Лоли (версия 1) — суммы в основных единицах валюты, даты YYYY-MM-DD:
//   { v, updatedAt, currency,
//     today: { canSpend, perDay, spent, status } | null,
//     month: { month, income, expense, daysLeft },
//     categories: [{ name, spent, limit }],
//     balance: { total, accounts: [{ name, balance, currency }] },
//     payday: { date, daysLeft, free, perDay, status } | null }

import type { Allowance } from "@/lib/analytics/daily-allowance";
import type { MonthRecap } from "@/lib/analytics/month-recap";
import type { PaydayForecast } from "@/lib/analytics/payday";
import type { BudgetRow } from "@/types/finance";

export type LoliSummary = {
  v: 1;
  updatedAt: string;
  currency: string;
  today: { canSpend: number; perDay: number; spent: number; status: Allowance["status"] } | null;
  month: { month: string; income: number; expense: number; daysLeft: number | null };
  categories: Array<{ name: string; spent: number; limit: number | null }>;
  balance: {
    total: number;
    accounts: Array<{ name: string; balance: number; currency: string }>;
  };
  payday: {
    date: string;
    daysLeft: number;
    free: number;
    perDay: number;
    status: PaydayForecast["status"];
  } | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function buildLoliSummary(input: {
  now: Date;
  currency: string;
  allowance: Allowance | null;
  recap: MonthRecap | null;
  budgets: readonly BudgetRow[];
  accounts: ReadonlyArray<{ name: string; balance: number; currency: string; type?: string }>;
  totalBalance: number;
  payday: PaydayForecast | null;
}): LoliSummary {
  const month = `${input.now.getFullYear()}-${String(input.now.getMonth() + 1).padStart(2, "0")}`;
  return {
    v: 1,
    updatedAt: input.now.toISOString(),
    currency: input.currency,
    // Доходов в этом месяце нет и взять неоткуда — «можно сегодня» не считается
    // (на главной эта карточка тогда тоже не показывается), а не «ноль».
    today:
      input.allowance && input.allowance.income > 0
        ? {
            canSpend: round(Math.max(input.allowance.leftToday, 0)),
            perDay: round(input.allowance.perDay),
            spent: round(input.allowance.spentToday),
            status: input.allowance.status
          }
        : null,
    month: {
      month,
      income: round(input.recap?.income ?? 0),
      expense: round(input.recap?.expense ?? 0),
      daysLeft: input.allowance?.daysLeft ?? null
    },
    // Статьи с тратами или лимитом в этом месяце — больше Лоли знать незачем.
    categories: input.budgets
      .filter((row) => row.spent > 0 || row.limitAmount > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 40)
      .map((row) => ({
        name: row.category,
        spent: round(row.spent),
        limit: row.limitAmount > 0 ? round(row.limitAmount + (row.rolloverAmount ?? 0)) : null
      })),
    balance: {
      total: round(input.totalBalance),
      accounts: input.accounts.slice(0, 20).map((account) => ({
        name: account.name,
        balance: round(account.balance),
        currency: account.currency
      }))
    },
    payday: input.payday
      ? {
          date: input.payday.nextDate,
          daysLeft: input.payday.daysLeft,
          free: round(input.payday.free),
          perDay: round(input.payday.perDay),
          status: input.payday.status
        }
      : null
  };
}
