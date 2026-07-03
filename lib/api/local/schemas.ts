import { z } from "zod";

import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { CURRENCY_CODES } from "@/lib/currency";

// Zod schemas for the desktop LocalState document and its sub-entities,
// extracted from LocalApiClient to keep the client a thinner router (plan A1).
const currency = "RUB" as const;

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE"]);
export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["CASH", "DEBIT_CARD", "SAVINGS", "BROKERAGE"]),
  balance: z.coerce.number().finite(),
  currency: z.enum(CURRENCY_CODES).default("RUB"),
  isArchived: z.boolean().optional()
});
export const liabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["CREDIT_CARD", "LOAN", "MORTGAGE", "INSTALLMENT", "OTHER"]),
  balance: z.coerce.number().finite().min(0),
  originalAmount: z.coerce.number().finite().min(0).default(0),
  interestRate: z.coerce.number().finite().min(0).default(0),
  minPayment: z.coerce.number().finite().min(0).default(0),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  currency: z.enum(CURRENCY_CODES).default("RUB")
});
export const categorizationRuleSchema = z.object({
  id: z.string().min(1),
  match: z.string().trim().min(1).max(100),
  categoryId: z.string().min(1)
});
export const categorySchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  kind: transactionTypeSchema,
  color: z.string().trim().min(1).max(32).default("#64748b"),
  isEssential: z.boolean().optional(),
  isSubscription: z.boolean().optional()
});
export const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(100)
});
export const transactionRowSchema = z.object({
  id: z.string().min(1),
  amount: z.coerce.number().finite().positive(),
  type: transactionTypeSchema,
  date: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  account: optionSchema,
  category: optionSchema.extend({ color: z.string().trim().min(1).max(32).default("#64748b") }),
  // Optional link to the recurring template that materialized this transaction
  recurringId: z.string().optional()
});
export const budgetRowSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  category: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(32).default("#64748b"),
  limitAmount: z.coerce.number().finite().min(0),
  spent: z.coerce.number().finite().min(0).default(0),
  progress: z.coerce.number().finite().min(0).default(0),
  isExceeded: z.boolean().default(false),
  suggestedLimit: z.coerce.number().finite().min(0).default(0),
  // Persisted carry-over flag (recomputed amount lives in rolloverAmount).
  rollover: z.boolean().default(false),
  rolloverAmount: z.coerce.number().finite().min(0).default(0)
});
export const goalRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  targetAmount: z.coerce.number().finite().positive(),
  currentAmount: z.coerce.number().finite().min(0),
  deadline: z.string().min(1),
  progress: z.coerce.number().finite().min(0).default(0),
  monthlyContribution: z.coerce.number().finite().min(0).default(0)
});
export const recurringRowSchema = z.object({
  id: z.string().min(1),
  amount: z.coerce.number().finite().positive(),
  type: transactionTypeSchema,
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDate: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  isActive: z.boolean().default(true),
  daysUntilNext: z.coerce.number().finite().default(0),
  isDue: z.boolean().default(false),
  account: optionSchema,
  category: optionSchema.extend({ color: z.string().trim().min(1).max(32).default("#64748b") }),
  // Id of the transaction this template last created — kept in sync on edit/delete
  lastTransactionId: z.string().optional()
});
export const watchlistRowSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(80),
  price: z.coerce.number().finite().min(0),
  changeDay: z.coerce.number().finite(),
  change30d: z.coerce.number().finite(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  comment: z.string().trim().max(500).default("")
});
export const portfolioRowSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().finite().positive(),
  averageBuyPrice: z.coerce.number().finite().positive(),
  currentPrice: z.coerce.number().finite().min(0),
  currentValue: z.coerce.number().finite().min(0),
  pnl: z.coerce.number().finite(),
  share: z.coerce.number().finite().min(0),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"])
});
export const investmentSchema = z.object({
  source: z.enum(["database", "demo-fallback"]).default("database"),
  currency: z.enum(CURRENCY_CODES).default("RUB"),
  riskProfile: z.string().trim().min(1).default(RISK_PROFILE_LABELS.MODERATE),
  securities: z.array(watchlistRowSchema).default([]),
  watchlist: z.array(watchlistRowSchema).default([]),
  portfolio: z.array(portfolioRowSchema).default([]),
  structure: z
    .array(
      z.object({
        name: z.string().min(1),
        value: z.coerce.number().finite(),
        fill: z.string().optional()
      })
    )
    .default([]),
  sectorStructure: z
    .array(
      z.object({
        name: z.string().min(1),
        value: z.coerce.number().finite(),
        fill: z.string().optional()
      })
    )
    .default([]),
  risks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"])
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"])
      })
    )
    .default([])
});
export const localStateSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  currency: z.enum(CURRENCY_CODES).default("RUB"),
  liabilities: z.array(liabilitySchema).default([]),
  rules: z.array(categorizationRuleSchema).default([]),
  autoMaterializeRecurring: z.boolean().default(false),
  paymentReminders: z.boolean().default(false),
  aiEnabled: z.boolean().default(false),
  aiProvider: z.string().default("anthropic"),
  aiApiKey: z.string().default(""),
  aiModel: z.string().default(""),
  netWorthSnapshots: z
    .array(z.object({ date: z.string().min(1), value: z.coerce.number().finite() }))
    .default([]),
  demoMode: z.boolean().default(false),
  emergencyFundMonthsTarget: z.coerce
    .number()
    .int()
    .refine((value) => [3, 6, 12].includes(value))
    .default(6),
  riskProfileCode: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]).default("MODERATE"),
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionRowSchema).default([]),
  budgets: z.array(budgetRowSchema).default([]),
  goals: z.array(goalRowSchema).default([]),
  recurringTransactions: z.array(recurringRowSchema).default([]),
  investments: investmentSchema.default(() => ({
    source: "demo-fallback" as const,
    currency,
    riskProfile: RISK_PROFILE_LABELS.MODERATE,
    securities: [],
    watchlist: [],
    portfolio: [],
    structure: [],
    sectorStructure: [],
    risks: [],
    education: []
  })),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  defaultTransactionType: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  lastBackupAt: z.string().nullable().optional().default(null),
  importBatches: z
    .array(
      z.object({
        id: z.string().min(1),
        importedAt: z.string().min(1),
        transactionIds: z.array(z.string().min(1))
      })
    )
    .optional()
    .default([])
});
