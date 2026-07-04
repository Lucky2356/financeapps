import type { TransactionType } from "@prisma/client";
import { subMonths } from "date-fns";

import { clamp, percent } from "@/lib/utils";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";
import type {
  AccountRow,
  GoalRow,
  Option,
  RecurringTransactionRow,
  TransactionRow
} from "@/types/finance";

// Demo / fallback seed data for the app, extracted from lib/data.ts. Pure and
// dependency-light: used to render a realistic sample dashboard when there is no
// database (desktop demo mode, web fallback). No Prisma imports here.

export type CategoryOption = Option & {
  kind: "INCOME" | "EXPENSE";
  color: string;
  icon?: string;
  isEssential?: boolean;
  isSubscription?: boolean;
};

export type DemoTransaction = TransactionRow & {
  categoryMeta: CategoryOption;
};

export const demoAccounts: AccountRow[] = [
  { id: "account-cash", name: "Наличные", type: "CASH", balance: 32000, currency: "RUB" },
  {
    id: "account-card",
    name: "Дебетовая карта",
    type: "DEBIT_CARD",
    balance: 184500,
    currency: "RUB"
  },
  {
    id: "account-savings",
    name: "Накопительный счет",
    type: "SAVINGS",
    balance: 280000,
    currency: "RUB"
  },
  {
    id: "account-brokerage",
    name: "Брокерский счет",
    type: "BROKERAGE",
    balance: 420000,
    currency: "RUB"
  }
];

export const demoCategories: CategoryOption[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { id: "cat-freelance", label: "Фриланс", kind: "INCOME", color: "#0d9488" },
  { id: "cat-food", label: "Продукты", kind: "EXPENSE", color: "#f97316", isEssential: true },
  { id: "cat-transport", label: "Транспорт", kind: "EXPENSE", color: "#2563eb", isEssential: true },
  { id: "cat-utilities", label: "ЖКХ", kind: "EXPENSE", color: "#7c3aed", isEssential: true },
  {
    id: "cat-subscriptions",
    label: "Подписки",
    kind: "EXPENSE",
    color: "#db2777",
    isSubscription: true
  },
  { id: "cat-entertainment", label: "Развлечения", kind: "EXPENSE", color: "#eab308" },
  { id: "cat-health", label: "Здоровье", kind: "EXPENSE", color: "#dc2626", isEssential: true },
  { id: "cat-education", label: "Образование", kind: "EXPENSE", color: "#0891b2" },
  { id: "cat-restaurants", label: "Рестораны", kind: "EXPENSE", color: "#ea580c" },
  { id: "cat-travel", label: "Путешествия", kind: "EXPENSE", color: "#0284c7" }
];

export const budgetLimits = new Map([
  ["cat-food", 43000],
  ["cat-transport", 12000],
  ["cat-utilities", 21000],
  ["cat-subscriptions", 7000],
  ["cat-entertainment", 18000],
  ["cat-restaurants", 12000],
  ["cat-health", 14000],
  ["cat-education", 16000],
  ["cat-travel", 25000]
]);

export function demoDate(monthOffset: number, day: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function buildDemoTransactions(): DemoTransaction[] {
  const rows = [
    [-2, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [-2, 14, 22000, "INCOME", "cat-freelance", "account-card", "Проектная оплата"],
    [-2, 3, 38200, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [-2, 6, 9800, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [-2, 8, 18500, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [-2, 10, 6900, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [-2, 19, 16400, "EXPENSE", "cat-entertainment", "account-card", "Кино и мероприятия"],
    [-2, 22, 8400, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [-1, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [-1, 12, 27000, "INCOME", "cat-freelance", "account-card", "Консультации"],
    [-1, 2, 42600, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [-1, 7, 11800, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [-1, 9, 19000, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [-1, 13, 7600, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [-1, 20, 21400, "EXPENSE", "cat-entertainment", "account-card", "Концерты"],
    [-1, 24, 13300, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [-1, 28, 18000, "EXPENSE", "cat-education", "account-card", "Курс"],
    [0, 5, 210000, "INCOME", "cat-salary", "account-card", "Зарплата за месяц"],
    [0, 11, 18500, "INCOME", "cat-freelance", "account-card", "Разовая задача"],
    [0, 2, 48700, "EXPENSE", "cat-food", "account-card", "Супермаркеты"],
    [0, 6, 13200, "EXPENSE", "cat-transport", "account-card", "Такси и проезд"],
    [0, 8, 19700, "EXPENSE", "cat-utilities", "account-card", "Коммунальные платежи"],
    [0, 10, 8800, "EXPENSE", "cat-subscriptions", "account-card", "Сервисы и приложения"],
    [0, 15, 24800, "EXPENSE", "cat-entertainment", "account-card", "Выходные"],
    [0, 19, 16200, "EXPENSE", "cat-restaurants", "account-card", "Кафе"],
    [0, 22, 12600, "EXPENSE", "cat-health", "account-card", "Врач"],
    [0, 25, 30000, "EXPENSE", "cat-travel", "account-savings", "Билеты"]
  ] as const;

  return rows.map(([monthOffset, day, amount, type, categoryId, accountId, description], index) => {
    const category = demoCategories.find((item) => item.id === categoryId)!;
    const account = demoAccounts.find((item) => item.id === accountId)!;

    return {
      id: `demo-tx-${index}`,
      amount,
      type: type as TransactionType,
      date: demoDate(monthOffset, day).toISOString(),
      description,
      account: { id: account.id, label: account.name },
      category: { id: category.id, label: category.label, color: category.color },
      categoryMeta: category
    };
  });
}

export function buildDemoRecurringTransactions(): RecurringTransactionRow[] {
  const service = new RecurringTransactionService();
  const rows = [
    [0, 5, 210000, "INCOME", "MONTHLY", "cat-salary", "account-card", "Зарплата"],
    [0, 8, 19700, "EXPENSE", "MONTHLY", "cat-utilities", "account-card", "ЖКХ"],
    [0, 10, 8800, "EXPENSE", "MONTHLY", "cat-subscriptions", "account-card", "Подписки"],
    [0, 12, 3500, "EXPENSE", "WEEKLY", "cat-food", "account-card", "Плановая закупка продуктов"],
    [1, 3, 15000, "EXPENSE", "MONTHLY", "cat-education", "account-card", "Обучение"]
  ] as const;

  return service.sortUpcoming(
    rows.map(
      ([monthOffset, day, amount, type, frequency, categoryId, accountId, description], index) => {
        const category = demoCategories.find((item) => item.id === categoryId)!;
        const account = demoAccounts.find((item) => item.id === accountId)!;
        const nextDate = demoDate(monthOffset, day);
        const status = service.getStatus({ nextDate, frequency, isActive: true });

        return {
          id: `demo-recurring-${index}`,
          amount,
          type,
          frequency,
          nextDate: nextDate.toISOString(),
          description,
          isActive: true,
          daysUntilNext: status.daysUntilNext,
          isDue: status.isDue,
          account: { id: account.id, label: account.name },
          category: { id: category.id, label: category.label, color: category.color }
        };
      }
    )
  );
}

export function buildDemoGoals(): GoalRow[] {
  const rows = [
    ["goal-emergency", "Финансовая подушка", 900000, 280000, 9],
    ["goal-vacation", "Отпуск", 260000, 85000, 5],
    ["goal-laptop", "Обновление ноутбука", 220000, 70000, 7]
  ] as const;

  return rows.map(([id, title, targetAmount, currentAmount, months]) => {
    const deadline = subMonths(new Date(), -months);
    const remaining = Math.max(targetAmount - currentAmount, 0);

    return {
      id,
      title,
      targetAmount,
      currentAmount,
      deadline: deadline.toISOString(),
      progress: clamp(percent(currentAmount, targetAmount), 0, 100),
      monthlyContribution: Math.ceil(remaining / Math.max(months, 1))
    };
  });
}
