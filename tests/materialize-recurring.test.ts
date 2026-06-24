import { describe, expect, it, vi } from "vitest";

import { materializeRecurringTx } from "@/lib/recurring/materialize";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";

// Minimal fake of the Prisma transaction client surface the helper touches.
function fakeTx() {
  return {
    transaction: { create: vi.fn().mockResolvedValue({}) },
    account: { update: vi.fn().mockResolvedValue({}) },
    recurringTransaction: { update: vi.fn().mockResolvedValue({}) }
  };
}

type Recurring = Parameters<typeof materializeRecurringTx>[1];

// amount is a Prisma Decimal in production; the helper only reads it via Number(),
// so a plain number is fine at runtime — cast for the type.
function recurring(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: "rec-1",
    userId: "user-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    amount: 1000 as never,
    type: "EXPENSE",
    frequency: "MONTHLY",
    nextDate: new Date("2020-01-01T00:00:00Z"),
    isActive: true,
    description: "Аренда",
    ...overrides
  };
}

describe("materializeRecurringTx", () => {
  const service = new RecurringTransactionService();

  it("posts each due occurrence and advances nextDate", async () => {
    const tx = fakeTx();
    // nextDate far in the past → several monthly occurrences are due by today.
    const result = await materializeRecurringTx(tx as never, recurring(), service);

    expect(result.created).toBeGreaterThan(0);
    expect(tx.transaction.create).toHaveBeenCalledTimes(result.created);
    expect(tx.account.update).toHaveBeenCalledTimes(result.created);
    // nextDate moved into the future relative to the original.
    expect(result.nextDate.getTime()).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime());
    expect(tx.recurringTransaction.update).toHaveBeenCalledTimes(1);
  });

  it("creates nothing when the template is not yet due", async () => {
    const tx = fakeTx();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const result = await materializeRecurringTx(tx as never, recurring({ nextDate: future }), service);

    expect(result.created).toBe(0);
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.recurringTransaction.update).not.toHaveBeenCalled();
    expect(result.nextDate).toEqual(future);
  });

  it("creates nothing for an inactive template", async () => {
    const tx = fakeTx();
    const result = await materializeRecurringTx(
      tx as never,
      recurring({ isActive: false }),
      service
    );

    expect(result.created).toBe(0);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
