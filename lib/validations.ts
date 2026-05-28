import { z } from "zod";

const optionalId = z.string().trim().optional();
const positiveMoney = z.coerce.number().finite().positive("Введите сумму больше нуля");
const nonNegativeMoney = z.coerce.number().finite().min(0, "Сумма не может быть отрицательной");

export const transactionSchema = z.object({
  id: optionalId,
  amount: positiveMoney,
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().min(1, "Выберите категорию"),
  accountId: z.string().min(1, "Выберите счет"),
  date: z.string().min(1, "Укажите дату"),
  description: z.string().trim().max(180).optional()
});

export const transactionFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(["ALL", "INCOME", "EXPENSE"]).optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional()
});

export const accountSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(2, "Название слишком короткое").max(80),
  type: z.enum(["CASH", "DEBIT_CARD", "SAVINGS", "BROKERAGE"]),
  balance: z.coerce.number().finite(),
  currency: z.string().trim().default("RUB")
});

export const budgetSchema = z.object({
  categoryId: z.string().min(1),
  limitAmount: positiveMoney
});

export const savingGoalSchema = z.object({
  id: optionalId,
  title: z.string().trim().min(2).max(100),
  targetAmount: positiveMoney,
  currentAmount: nonNegativeMoney,
  deadline: z.string().min(1)
});

export const settingsSchema = z.object({
  currency: z.literal("RUB"),
  demoMode: z.preprocess((value) => value === "on" || value === true, z.boolean()),
  riskProfileCode: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]),
  emergencyFundMonthsTarget: z.coerce.number().int().refine((value) => [3, 6, 12].includes(value))
});

export const recurringTransactionSchema = z.object({
  id: optionalId,
  amount: positiveMoney,
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().min(1, "Выберите категорию"),
  accountId: z.string().min(1, "Выберите счет"),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDate: z.string().min(1, "Укажите следующую дату"),
  description: z.string().trim().max(180).optional(),
  isActive: z.preprocess((value) => value === "on" || value === true || value === "true", z.boolean().default(true))
});

export const portfolioPositionSchema = z.object({
  ticker: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  quantity: z.coerce.number().finite().positive("Количество должно быть больше нуля"),
  averageBuyPrice: z.coerce.number().finite().positive("Средняя цена должна быть больше нуля")
});

export const watchlistItemSchema = z.object({
  ticker: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase())
});

export const csvImportSchema = z.object({
  rows: z.string().min(2),
  dateColumn: z.string().min(1),
  amountColumn: z.string().min(1),
  descriptionColumn: z.string().optional(),
  categoryColumn: z.string().optional(),
  accountColumn: z.string().optional()
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type SavingGoalInput = z.infer<typeof savingGoalSchema>;
export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>;
export type PortfolioPositionInput = z.infer<typeof portfolioPositionSchema>;
export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;
