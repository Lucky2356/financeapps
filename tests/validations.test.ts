import { describe, expect, it } from "vitest";

import {
  accountSchema,
  budgetSchema,
  categoryInputSchema,
  portfolioPositionSchema,
  recurringTransactionSchema,
  settingsSchema,
  transactionFilterSchema,
  transactionSchema,
  transferSchema
} from "@/lib/validations";

describe("transactionSchema", () => {
  const valid = {
    amount: "1500",
    type: "EXPENSE",
    categoryId: "cat-1",
    accountId: "acc-1",
    date: "2026-06-19"
  };

  it("coerces a numeric string amount to a number", () => {
    const parsed = transactionSchema.parse(valid);
    expect(parsed.amount).toBe(1500);
  });

  it("rejects a non-positive amount", () => {
    const result = transactionSchema.safeParse({ ...valid, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown type", () => {
    const result = transactionSchema.safeParse({ ...valid, type: "REFUND" });
    expect(result.success).toBe(false);
  });

  it("requires a category and account", () => {
    expect(transactionSchema.safeParse({ ...valid, categoryId: "" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...valid, accountId: "" }).success).toBe(false);
  });
});

describe("transferSchema", () => {
  const valid = {
    amount: "100",
    fromAccountId: "a",
    toAccountId: "b",
    date: "2026-06-19"
  };

  it("accepts distinct accounts", () => {
    expect(transferSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects identical from/to accounts via refine", () => {
    const result = transferSchema.safeParse({ ...valid, toAccountId: "a" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("toAccountId");
    }
  });
});

describe("accountSchema", () => {
  it("rejects a too-short name and defaults the currency to RUB", () => {
    expect(accountSchema.safeParse({ name: "A", type: "CASH", balance: 0 }).success).toBe(false);
    const parsed = accountSchema.parse({ name: "Карта", type: "DEBIT_CARD", balance: "1000" });
    expect(parsed.currency).toBe("RUB");
    expect(parsed.balance).toBe(1000);
  });
});

describe("budgetSchema", () => {
  it("requires a positive limit", () => {
    expect(budgetSchema.safeParse({ categoryId: "c", limitAmount: "-5" }).success).toBe(false);
    expect(budgetSchema.parse({ categoryId: "c", limitAmount: "5000" }).limitAmount).toBe(5000);
  });
});

describe("settingsSchema", () => {
  const base = {
    currency: "RUB",
    riskProfileCode: "MODERATE",
    emergencyFundMonthsTarget: "6"
  };

  it("preprocesses demoMode 'on' to true and others to false", () => {
    expect(settingsSchema.parse({ ...base, demoMode: "on" }).demoMode).toBe(true);
    expect(settingsSchema.parse({ ...base, demoMode: "off" }).demoMode).toBe(false);
  });

  it("only allows emergency fund targets of 3, 6 or 12", () => {
    expect(
      settingsSchema.safeParse({ ...base, demoMode: "on", emergencyFundMonthsTarget: "4" }).success
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ ...base, demoMode: "on", emergencyFundMonthsTarget: "12" }).success
    ).toBe(true);
  });
});

describe("categoryInputSchema", () => {
  it("defaults the color and coerces checkbox flags", () => {
    const parsed = categoryInputSchema.parse({ name: "Еда", kind: "EXPENSE" });
    expect(parsed.color).toBe("#64748b");
    expect(parsed.isEssential).toBe(false);
    expect(parsed.isSubscription).toBe(false);
  });

  it("accepts 'on' for boolean flags", () => {
    const parsed = categoryInputSchema.parse({
      name: "Подписки",
      kind: "EXPENSE",
      isSubscription: "on"
    });
    expect(parsed.isSubscription).toBe(true);
  });

  it("rejects an invalid hex color", () => {
    expect(
      categoryInputSchema.safeParse({ name: "Еда", kind: "EXPENSE", color: "red" }).success
    ).toBe(false);
  });
});

describe("portfolioPositionSchema", () => {
  it("uppercases the ticker and coerces numbers", () => {
    const parsed = portfolioPositionSchema.parse({
      ticker: "sber",
      quantity: "10",
      averageBuyPrice: "250.5"
    });
    expect(parsed.ticker).toBe("SBER");
    expect(parsed.quantity).toBe(10);
    expect(parsed.averageBuyPrice).toBe(250.5);
  });

  it("rejects a non-positive quantity", () => {
    expect(
      portfolioPositionSchema.safeParse({ ticker: "SBER", quantity: "0", averageBuyPrice: "1" })
        .success
    ).toBe(false);
  });
});

describe("recurringTransactionSchema", () => {
  const base = {
    amount: "100",
    type: "EXPENSE",
    categoryId: "c",
    accountId: "a",
    frequency: "MONTHLY",
    nextDate: "2026-07-01"
  };

  it("coerces 'on'/'true' to an active flag", () => {
    expect(recurringTransactionSchema.parse({ ...base, isActive: "on" }).isActive).toBe(true);
    expect(recurringTransactionSchema.parse({ ...base, isActive: "true" }).isActive).toBe(true);
  });

  // An omitted isActive defaults to true, matching the Prisma column default
  // (@default(true)) and the backup schema. The form never omits the field (a
  // hidden "false" input always accompanies the checkbox), so only programmatic
  // callers hit this path.
  it("defaults an omitted isActive to true", () => {
    expect(recurringTransactionSchema.parse(base).isActive).toBe(true);
  });

  it("still coerces an explicit 'false' (unchecked form checkbox) to false", () => {
    expect(recurringTransactionSchema.parse({ ...base, isActive: "false" }).isActive).toBe(false);
  });
});

describe("transactionFilterSchema", () => {
  it("defaults page and limit when omitted", () => {
    const parsed = transactionFilterSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("falls back to defaults for out-of-range values via catch", () => {
    const parsed = transactionFilterSchema.parse({ page: "0", limit: "5" });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it("accepts in-range overrides", () => {
    const parsed = transactionFilterSchema.parse({ page: "3", limit: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });
});
