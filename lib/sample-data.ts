// Shared example dataset used to populate a fresh install with a realistic,
// already-filled picture so a new user can explore the app before entering
// their own data. Consumed by both the desktop seeder (LocalApiClient) and the
// web seeder (app/api/sample) so the example is identical in both modes.

export type SampleAccount = {
  id: string;
  name: string;
  type: "CASH" | "DEBIT_CARD" | "SAVINGS" | "BROKERAGE";
  balance: number;
};

export type SampleCategory = {
  id: string;
  label: string;
  kind: "INCOME" | "EXPENSE";
  color: string;
  isEssential?: boolean;
  isSubscription?: boolean;
};

export type SampleTransaction = {
  amount: number;
  type: "INCOME" | "EXPENSE";
  monthOffset: number; // 0 = this month, -1 = last month
  day: number;
  categoryId: string;
  accountId: string;
  description: string;
};

export type SampleBudget = { categoryId: string; limitAmount: number };
export type SampleGoal = { id: string; title: string; targetAmount: number; currentAmount: number; monthsToDeadline: number };

export const SAMPLE_ACCOUNTS: SampleAccount[] = [
  { id: "sample-cash", name: "Наличные", type: "CASH", balance: 28000 },
  { id: "sample-card", name: "Дебетовая карта", type: "DEBIT_CARD", balance: 184500 },
  { id: "sample-savings", name: "Накопительный счёт", type: "SAVINGS", balance: 260000 },
  { id: "sample-broker", name: "Брокерский счёт", type: "BROKERAGE", balance: 95000 }
];

export const SAMPLE_CATEGORIES: SampleCategory[] = [
  { id: "cat-salary", label: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { id: "cat-freelance", label: "Подработка", kind: "INCOME", color: "#0d9488" },
  { id: "cat-food", label: "Продукты", kind: "EXPENSE", color: "#f97316", isEssential: true },
  { id: "cat-transport", label: "Транспорт", kind: "EXPENSE", color: "#2563eb", isEssential: true },
  { id: "cat-utilities", label: "ЖКХ", kind: "EXPENSE", color: "#7c3aed", isEssential: true },
  { id: "cat-subscriptions", label: "Подписки", kind: "EXPENSE", color: "#db2777", isSubscription: true },
  { id: "cat-entertainment", label: "Развлечения", kind: "EXPENSE", color: "#eab308" },
  { id: "cat-restaurants", label: "Рестораны", kind: "EXPENSE", color: "#ea580c" },
  { id: "cat-health", label: "Здоровье", kind: "EXPENSE", color: "#dc2626", isEssential: true }
];

export const SAMPLE_TRANSACTIONS: SampleTransaction[] = [
  // Last month
  { amount: 195000, type: "INCOME", monthOffset: -1, day: 5, categoryId: "cat-salary", accountId: "sample-card", description: "Зарплата за месяц" },
  { amount: 24000, type: "INCOME", monthOffset: -1, day: 18, categoryId: "cat-freelance", accountId: "sample-card", description: "Подработка" },
  { amount: 41000, type: "EXPENSE", monthOffset: -1, day: 3, categoryId: "cat-food", accountId: "sample-card", description: "Продукты" },
  { amount: 9500, type: "EXPENSE", monthOffset: -1, day: 7, categoryId: "cat-transport", accountId: "sample-card", description: "Проезд и такси" },
  { amount: 18500, type: "EXPENSE", monthOffset: -1, day: 9, categoryId: "cat-utilities", accountId: "sample-card", description: "ЖКХ" },
  { amount: 6900, type: "EXPENSE", monthOffset: -1, day: 11, categoryId: "cat-subscriptions", accountId: "sample-card", description: "Подписки" },
  { amount: 14200, type: "EXPENSE", monthOffset: -1, day: 21, categoryId: "cat-entertainment", accountId: "sample-card", description: "Кино и мероприятия" },
  { amount: 8800, type: "EXPENSE", monthOffset: -1, day: 24, categoryId: "cat-restaurants", accountId: "sample-card", description: "Кафе" },
  // This month
  { amount: 195000, type: "INCOME", monthOffset: 0, day: 5, categoryId: "cat-salary", accountId: "sample-card", description: "Зарплата за месяц" },
  { amount: 17000, type: "INCOME", monthOffset: 0, day: 12, categoryId: "cat-freelance", accountId: "sample-card", description: "Разовая задача" },
  { amount: 44800, type: "EXPENSE", monthOffset: 0, day: 2, categoryId: "cat-food", accountId: "sample-card", description: "Продукты" },
  { amount: 11200, type: "EXPENSE", monthOffset: 0, day: 6, categoryId: "cat-transport", accountId: "sample-card", description: "Проезд и такси" },
  { amount: 19000, type: "EXPENSE", monthOffset: 0, day: 8, categoryId: "cat-utilities", accountId: "sample-card", description: "ЖКХ" },
  { amount: 6900, type: "EXPENSE", monthOffset: 0, day: 10, categoryId: "cat-subscriptions", accountId: "sample-card", description: "Подписки" },
  { amount: 12600, type: "EXPENSE", monthOffset: 0, day: 16, categoryId: "cat-restaurants", accountId: "sample-card", description: "Кафе и рестораны" },
  { amount: 9300, type: "EXPENSE", monthOffset: 0, day: 20, categoryId: "cat-health", accountId: "sample-card", description: "Аптека и врач" }
];

export const SAMPLE_BUDGETS: SampleBudget[] = [
  { categoryId: "cat-food", limitAmount: 45000 },
  { categoryId: "cat-transport", limitAmount: 12000 },
  { categoryId: "cat-utilities", limitAmount: 20000 },
  { categoryId: "cat-restaurants", limitAmount: 10000 }
];

export const SAMPLE_GOALS: SampleGoal[] = [
  { id: "sample-goal-cushion", title: "Финансовая подушка", targetAmount: 400000, currentAmount: 180000, monthsToDeadline: 10 },
  { id: "sample-goal-vacation", title: "Отпуск", targetAmount: 200000, currentAmount: 60000, monthsToDeadline: 6 }
];

// Resolve a sample relative month/day into a concrete date (noon to avoid TZ edge cases).
export function sampleDate(monthOffset: number, day: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + monthOffset, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function sampleDeadline(monthsAhead: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead, 1);
  date.setHours(12, 0, 0, 0);
  return date;
}
