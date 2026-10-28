import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/currency";
import { apiText, moneyRangeText } from "@/lib/i18n/api-text";
import { MAX_MONEY } from "@/lib/utils";

/**
 * Текст отказа — функцией, а не строкой. Схемы строятся один раз, при загрузке
 * модуля, когда язык экрана ещё не выбран; строка застыла бы русской навсегда.
 * Функцию zod зовёт при каждой проверке — и фраза выходит на языке экрана.
 */
function say(key: string): { error: () => string } {
  return { error: () => apiText(key) };
}

const optionalId = z.string().trim().optional();
// The same ceiling the ledger itself enforces (lib/utils): past it a double
// stops holding every hundredth, and a stuck zero comes back as a different
// number than the one typed.
const positiveMoney = z.coerce
  .number()
  .finite()
  .positive(say("api.validation.amountPositive"))
  .max(MAX_MONEY, { error: moneyRangeText });
const nonNegativeMoney = z.coerce
  .number()
  .finite()
  .min(0, say("api.validation.amountNonNegative"))
  .max(MAX_MONEY, { error: moneyRangeText });

export const transactionSchema = z.object({
  id: optionalId,
  amount: positiveMoney,
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().min(1, say("api.validation.category")),
  accountId: z.string().min(1, say("api.validation.account")),
  date: z.string().min(1, say("api.validation.date")),
  description: z.string().trim().max(180).optional()
});

export const transferSchema = z
  .object({
    amount: positiveMoney,
    fromAccountId: z.string().min(1, say("api.validation.fromAccount")),
    toAccountId: z.string().min(1, say("api.validation.toAccount")),
    date: z.string().min(1, say("api.validation.date")),
    description: z.string().trim().max(180).optional()
  })
  .refine((input) => input.fromAccountId !== input.toAccountId, {
    ...say("api.transfer.distinct"),
    path: ["toAccountId"]
  });

export const transactionFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(["ALL", "INCOME", "EXPENSE"]).optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  minAmount: z.coerce.number().finite().nonnegative().optional(),
  maxAmount: z.coerce.number().finite().nonnegative().optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).catch(20).default(20)
});

export const accountSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(2, say("api.name.tooShort")).max(80),
  type: z.enum(["CASH", "DEBIT_CARD", "SAVINGS", "BROKERAGE"]),
  balance: z.coerce.number().finite(),
  currency: z.string().trim().default("RUB")
});

export const budgetSchema = z.object({
  categoryId: z.string().min(1),
  // 0 means "reset" (remove the budget); nonNegative so reset is valid.
  limitAmount: nonNegativeMoney,
  // Optional: only updated when explicitly provided (so saving a limit does not
  // silently turn rollover off).
  rollover: z.boolean().optional(),
  // Target month "yyyy-MM"; defaults to the current month.
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

export const savingGoalSchema = z.object({
  id: optionalId,
  title: z.string().trim().min(2).max(100),
  targetAmount: positiveMoney,
  currentAmount: nonNegativeMoney,
  deadline: z.string().min(1)
});

export const liabilitySchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1, say("api.validation.name")).max(100),
  kind: z.enum(["CREDIT_CARD", "LOAN", "MORTGAGE", "INSTALLMENT", "OTHER"]),
  balance: nonNegativeMoney,
  originalAmount: z.coerce.number().finite().min(0).default(0),
  interestRate: z.coerce.number().finite().min(0).default(0),
  minPayment: z.coerce.number().finite().min(0).default(0),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  currency: z.string().trim().default("RUB")
});

export const settingsSchema = z.object({
  currency: z.enum(CURRENCY_CODES),
  demoMode: z.preprocess((value) => value === "on" || value === true, z.boolean()),
  riskProfileCode: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]),
  emergencyFundMonthsTarget: z.coerce
    .number()
    .int()
    .refine((value) => [3, 6, 12].includes(value)),
  theme: z.enum(["light", "dark", "system"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  defaultTransactionType: z.enum(["INCOME", "EXPENSE"]).optional(),
  autoMaterializeRecurring: z.boolean().optional(),
  paymentReminders: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  aiApiKey: z.string().max(200).optional(),
  aiModel: z.string().max(100).optional()
});

export const recurringTransactionSchema = z.object({
  id: optionalId,
  amount: positiveMoney,
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().min(1, say("api.validation.category")),
  accountId: z.string().min(1, say("api.validation.account")),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDate: z.string().min(1, say("api.validation.nextDate")),
  description: z.string().trim().max(180).optional(),
  isActive: z.preprocess(
    (value) => (value === undefined ? true : value === "on" || value === true || value === "true"),
    z.boolean()
  )
});

export const portfolioPositionSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .transform((value) => value.toUpperCase()),
  quantity: z.coerce.number().finite().positive(say("api.validation.quantityPositive")),
  averageBuyPrice: z.coerce.number().finite().positive(say("api.validation.pricePositive"))
});

export const watchlistItemSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .transform((value) => value.toUpperCase())
});

// Hard ceiling on the imported payload. `rows` is a JSON-stringified array; the
// length cap (~8 MB) bounds memory before JSON.parse, and the route additionally
// caps the parsed row count (MAX_IMPORT_ROWS) to prevent DoS via huge imports.
export const MAX_IMPORT_ROWS = 20_000;
const MAX_IMPORT_PAYLOAD_CHARS = 8_000_000;

export const csvImportSchema = z.object({
  rows: z.string().min(2).max(MAX_IMPORT_PAYLOAD_CHARS, say("api.validation.importTooLarge")),
  dateColumn: z.string().min(1),
  amountColumn: z.string().min(1),
  descriptionColumn: z.string().optional(),
  categoryColumn: z.string().optional(),
  accountColumn: z.string().optional()
});

export const categoryInputSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(2, say("api.name.tooShort")).max(80),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, say("api.validation.color"))
    .default("#64748b"),
  isEssential: z.preprocess(
    (v) => v === "on" || v === true || v === "true",
    z.boolean().default(false)
  ),
  isSubscription: z.preprocess(
    (v) => v === "on" || v === true || v === "true",
    z.boolean().default(false)
  )
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type SavingGoalInput = z.infer<typeof savingGoalSchema>;
export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>;
export type PortfolioPositionInput = z.infer<typeof portfolioPositionSchema>;
export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>;
