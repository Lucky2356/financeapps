import { afterEach, describe, expect, it, vi } from "vitest";

// Money-logic test for undoing the last CSV import: it must delete the batch and
// revert each affected account's balance by the net imported delta.

const findCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: () => findCurrentUser() }));

type DeltaUpdate = { where: { id: string }; data: { balance: { decrement: number } } };

function makeDb(batch: { accountId: string; amount: number; type: "INCOME" | "EXPENSE" }[] | null) {
  const accountUpdates: DeltaUpdate[] = [];
  const deleteMany = vi.fn(async () => ({ count: batch?.length ?? 0 }));
  const db = {
    transaction: {
      findFirst: vi.fn(async () => (batch && batch.length ? { importBatchId: "batch-1" } : null)),
      findMany: vi.fn(async () =>
        (batch ?? []).map((b, i) => ({
          id: `t${i}`,
          accountId: b.accountId,
          amount: b.amount,
          type: b.type
        }))
      ),
      deleteMany
    },
    account: {
      update: vi.fn(async (args: DeltaUpdate) => {
        accountUpdates.push(args);
        return { id: args.where.id };
      })
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  };
  return { db, accountUpdates, deleteMany };
}

const prismaMock = vi.hoisted(() => ({ current: null as ReturnType<typeof makeDb>["db"] | null }));
vi.mock("@/lib/prisma", () => ({ requirePrisma: () => prismaMock.current }));

const { POST } = await import("@/app/api/import/undo/route.web");

afterEach(() => vi.clearAllMocks());

describe("/api/import/undo", () => {
  it("reverts the net per-account balance delta and deletes the batch", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates, deleteMany } = makeDb([
      { accountId: "acc-1", amount: 100, type: "EXPENSE" }, // delta -100
      { accountId: "acc-1", amount: 50, type: "INCOME" } // delta +50  → net -50
    ]);
    prismaMock.current = db;

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 2 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", importBatchId: "batch-1" } });
    // Import moved the balance by net -50, so undo decrements by -50 (i.e. +50).
    expect(accountUpdates).toEqual([
      { where: { id: "acc-1" }, data: { balance: { decrement: -50 } } }
    ]);
  });

  it("is a no-op (removed: 0) when there is no prior import", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb(null);
    prismaMock.current = db;

    const res = await POST();
    expect(await res.json()).toEqual({ removed: 0 });
    expect(accountUpdates).toHaveLength(0);
  });

  it("requires authentication", async () => {
    findCurrentUser.mockResolvedValue(null);
    prismaMock.current = makeDb([]).db;
    const res = await POST();
    expect(res.status).toBe(404);
  });
});
