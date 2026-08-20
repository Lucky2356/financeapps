import { z } from "zod";

import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { CURRENCY_CODES, DEFAULT_CURRENCY_RATES } from "@/lib/currency";

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
  isArchived: z.boolean().optional(),
  // Savings terms (v8): annual rate in percent and how often it is capitalised.
  // Optional — an account without a rate simply earns nothing.
  interestRate: z.coerce.number().finite().min(0).max(1000).optional(),
  interestCompounding: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional()
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
  currency: z.enum(CURRENCY_CODES).default("RUB"),
  // Auto-payment (v5): when enabled, the monthly payment is posted as a real
  // expense on the due day and the balance goes down. lastPaidMonth (YYYY-MM)
  // makes the posting idempotent.
  autoPay: z.boolean().optional(),
  paymentAccountId: z.string().optional(),
  paymentCategoryId: z.string().optional(),
  lastPaidMonth: z.string().optional(),
  // Marked as repaid by the owner (v6): ISO date. A settled debt keeps its
  // history but stops counting anywhere — capital, health score, planning.
  settledAt: z.string().optional()
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
  // The picture the owner chose. Unlisted keys are dropped on load, so a
  // category would lose its icon on the next read without this line.
  icon: z.string().trim().max(64).optional(),
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
  category: optionSchema.extend({
    color: z.string().trim().min(1).max(32).default("#64748b"),
    icon: z.string().trim().max(64).optional()
  }),
  // Optional link to the recurring template that materialized this transaction
  recurringId: z.string().optional(),
  // Free-form cross-cutting labels beyond the category.
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  // Shared id linking the rows of a single split (each row is a normal
  // transaction, so all existing aggregations count them without double-counting).
  splitGroupId: z.string().optional(),
  // Shared id linking the two halves of a transfer between own accounts.
  transferId: z.string().optional()
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
  monthlyContribution: z.coerce.number().finite().min(0).default(0),
  // Optional link to a funding account and a user-set planned monthly
  // contribution (distinct from the computed pace `monthlyContribution`).
  linkedAccountId: z.string().default(""),
  plannedContribution: z.coerce.number().finite().min(0).default(0)
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
  category: optionSchema.extend({
    color: z.string().trim().min(1).max(32).default("#64748b"),
    icon: z.string().trim().max(64).optional()
  }),
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
  assetKind: z.enum(["STOCK", "BOND", "FUND", "GOLD", "OTHER"]).default("STOCK"),
  sector: z.string().trim().min(1).max(80),
  price: z.coerce.number().finite().min(0),
  changeDay: z.coerce.number().finite(),
  change30d: z.coerce.number().finite(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  comment: z.string().trim().max(500).default("")
});
// One purchase of a security. Optional on a position: holdings entered before
// v7 (and quick "add suggestion" buys) only carry the resulting average.
export const purchaseLotSchema = z.object({
  date: z.string().min(1),
  quantity: z.coerce.number().finite().positive(),
  price: z.coerce.number().finite().positive()
});
export const portfolioRowSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  // What the holding is. Absent on positions saved before the app knew about
  // anything but shares; readers treat that as a share.
  assetKind: z.enum(["STOCK", "BOND", "FUND", "GOLD", "OTHER"]).optional(),
  sector: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().finite().positive(),
  averageBuyPrice: z.coerce.number().finite().positive(),
  currentPrice: z.coerce.number().finite().min(0),
  currentValue: z.coerce.number().finite().min(0),
  pnl: z.coerce.number().finite(),
  share: z.coerce.number().finite().min(0),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  lots: z.array(purchaseLotSchema).optional()
});
// A realized investment event for the tax report: a sale (with per-share buy/
// sell prices) or a dividend. Kept separate from the current-holdings list.
export const realizedEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["SELL", "DIVIDEND"]),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().max(120).default(""),
  date: z.string().min(1),
  quantity: z.coerce.number().finite().min(0).default(0),
  sellPrice: z.coerce.number().finite().min(0).default(0),
  buyPrice: z.coerce.number().finite().min(0).default(0),
  amount: z.coerce.number().finite().min(0).default(0),
  fee: z.coerce.number().finite().min(0).default(0),
  currency: z.enum(CURRENCY_CODES).default("RUB")
});

export const expectedDividendSchema = z.object({
  id: z.string().min(1),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().max(120).default(""),
  date: z.string().min(1),
  amount: z.coerce.number().finite().min(0).default(0),
  currency: z.enum(CURRENCY_CODES).default("RUB")
});

// A user "flag" on a company fundamental: notify when the metric crosses a
// threshold (e.g. ETLN debt_ebitda > 3.5). Desktop-only (needs the HTTP plugin).
export const marketAlertSchema = z.object({
  id: z.string().min(1),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .transform((value) => value.toUpperCase()),
  metric: z.string().trim().min(1).max(40),
  op: z.enum([">", "<", ">=", "<="]),
  value: z.coerce.number().finite(),
  lastFiredAt: z.string().optional()
});

export const targetAllocationSchema = z.object({
  id: z.string().min(1),
  sector: z.string().trim().min(1).max(60),
  targetPct: z.coerce.number().finite().min(0).max(100)
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
  // Declared on the type and written on every /investments read, but missing
  // here — so Zod quietly dropped the breakdown by asset kind on load.
  assetStructure: z
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
// One planned amount for one category in one month. `categoryId` is a real
// category, except for OPENING_BALANCE_ID which holds the money the month was
// started with — a figure the owner sets, since no operation records it.
export const planEntrySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  categoryId: z.string().min(1),
  amount: z.coerce.number().finite().min(0)
});
// Two comments per month, one against each band: what the plan was for, and
// what the month turned out to be.
export const planNoteSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  note: z.string().trim().max(500),
  factNote: z.string().trim().max(500).default("")
});

export const localStateSchema = z.object({
  schemaVersion: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11)
  ]),
  currency: z.enum(CURRENCY_CODES).default("RUB"),
  // Live FX rates (RUB per 1 unit of a currency), refreshed from the CBR feed
  // and cached here so cross-currency capital is a single honest number offline.
  currencyRates: z
    .record(z.string(), z.coerce.number().finite().positive())
    .default(() => ({ ...DEFAULT_CURRENCY_RATES })),
  currencyRatesUpdatedAt: z.string().nullable().optional().default(null),
  liabilities: z.array(liabilitySchema).default([]),
  rules: z.array(categorizationRuleSchema).default([]),
  autoMaterializeRecurring: z.boolean().default(false),
  paymentReminders: z.boolean().default(false),
  aiEnabled: z.boolean().default(false),
  aiProvider: z.string().default("anthropic"),
  aiEffort: z.string().default("medium"),
  aiApiKey: z.string().default(""),
  aiModel: z.string().default(""),
  netWorthSnapshots: z
    .array(z.object({ date: z.string().min(1), value: z.coerce.number().finite() }))
    .default([]),
  realizedInvestmentEvents: z.array(realizedEventSchema).default([]),
  expectedDividends: z.array(expectedDividendSchema).default([]),
  targetAllocations: z.array(targetAllocationSchema).default([]),
  marketAlerts: z.array(marketAlertSchema).default([]),
  demoMode: z.boolean().default(false),
  emergencyFundMonthsTarget: z.coerce
    .number()
    .int()
    .refine((value) => [3, 6, 12].includes(value))
    .default(6),
  riskProfileCode: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]).default("MODERATE"),
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  // Plan/fact: what the owner intends to earn and spend per month.
  plans: z.array(planEntrySchema).default([]),
  planNotes: z.array(planNoteSchema).default([]),
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
    assetStructure: [],
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

/**
 * The row collections a damaged document can be rescued by dropping bad entries
 * from. Listed by hand rather than derived from the schema: a collection that
 * is forgotten here simply is not salvaged, which is the safe direction.
 */
const SALVAGEABLE = {
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionRowSchema,
  budgets: budgetRowSchema,
  goals: goalRowSchema,
  recurringTransactions: recurringRowSchema,
  liabilities: liabilitySchema,
  rules: categorizationRuleSchema,
  plans: planEntrySchema,
  planNotes: planNoteSchema,
  realizedInvestmentEvents: realizedEventSchema,
  expectedDividends: expectedDividendSchema,
  targetAllocations: targetAllocationSchema,
  marketAlerts: marketAlertSchema
} as const;

/**
 * Reads what can still be read out of a document the strict schema rejects.
 *
 * One unparseable row used to condemn the whole ledger — and the reader's
 * answer was to replace it with an empty state, which is the worst possible
 * answer for the only copy of someone's money. Dropping the bad rows keeps
 * everything else; if even that does not parse, the caller leaves the stored
 * document alone and says so out loud.
 */
export function salvageLocalState(
  raw: unknown
): { state: z.infer<typeof localStateSchema>; dropped: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  let dropped = 0;
  for (const [field, schema] of Object.entries(SALVAGEABLE)) {
    const value = copy[field];
    if (!Array.isArray(value)) continue;
    const kept = value.filter((row) => schema.safeParse(row).success);
    dropped += value.length - kept.length;
    copy[field] = kept;
  }

  const parsed = localStateSchema.safeParse(copy);
  return parsed.success ? { state: parsed.data, dropped } : null;
}
