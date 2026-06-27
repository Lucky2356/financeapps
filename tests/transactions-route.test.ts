import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Money-logic tests for the transactions endpoint with a mocked Prisma. They lock
// in the balance math (INCOME adds, EXPENSE subtracts), the edit reverse-then-apply
// flow, the delete reversal, and the transfer (decrement source, increment target),
// without needing a live database.

const findCurrentUser = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: () => findCurrentUser() }));
// GET pulls the heavy data layer; stub it so importing the route stays light.
vi.mock("@/lib/data", () => ({ getTransactionsPageData: vi.fn() }));

type UpdateArg = {
  where: { id: string };
  data: { balance: { increment?: number; decrement?: number } };
};

function makeDb(
  opts: {
    categoryKind?: "INCOME" | "EXPENSE";
    existing?: { id: string; accountId: string; type: "INCOME" | "EXPENSE"; amount: number };
  } = {}
) {
  const accountUpdates: UpdateArg[] = [];
  const db = {
    account: {
      findFirst: vi.fn(async (args: { where: { id: string } }) => ({
        id: args.where.id,
        userId: "u1",
        name: `Acc-${args.where.id}`,
        isArchived: false
      })),
      update: vi.fn(async (args: UpdateArg) => {
        accountUpdates.push(args);
        return { id: args.where.id };
      })
    },
    category: {
      findFirst: vi.fn(async (args: { where: { id?: string } }) => ({
        id: args.where.id ?? "cat-1",
        userId: "u1",
        kind: opts.categoryKind ?? "EXPENSE"
      })),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "cat-new",
        ...args.data
      }))
    },
    transaction: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "tx-new",
        ...args.data
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data
      })),
      delete: vi.fn(async (args: { where: { id: string } }) => ({ id: args.where.id })),
      findFirstOrThrow: vi.fn(
        async () =>
          opts.existing ?? {
            id: "tx-1",
            accountId: "acc-1",
            type: "EXPENSE",
            amount: 100,
            userId: "u1"
          }
      )
    },
    // Supports both array form db.$transaction([...]) and callback db.$transaction(fn).
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(db)
        : Promise.all(arg as unknown[])
    )
  };
  return { db, accountUpdates };
}

const prismaMock = vi.hoisted(() => ({ current: null as ReturnType<typeof makeDb>["db"] | null }));
vi.mock("@/lib/prisma", () => ({ requirePrisma: () => prismaMock.current }));

const { POST, PUT, DELETE } = await import("@/app/api/transactions/route.web");

afterEach(() => vi.clearAllMocks());

function req(body?: unknown, search = "") {
  return new NextRequest(`http://localhost/api/transactions${search}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("/api/transactions balance math", () => {
  it("EXPENSE create decrements the account by the amount", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb({ categoryKind: "EXPENSE" });
    prismaMock.current = db;
    const res = await POST(
      req({
        accountId: "acc-1",
        categoryId: "cat-1",
        amount: 100,
        type: "EXPENSE",
        date: "2026-01-01"
      })
    );
    expect(res.status).toBe(201);
    expect(accountUpdates[0].data.balance).toEqual({ increment: -100 });
  });

  it("INCOME create increments the account by the amount", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb({ categoryKind: "INCOME" });
    prismaMock.current = db;
    await POST(
      req({
        accountId: "acc-1",
        categoryId: "cat-1",
        amount: 250,
        type: "INCOME",
        date: "2026-01-01"
      })
    );
    expect(accountUpdates[0].data.balance).toEqual({ increment: 250 });
  });

  it("rejects when category kind does not match the transaction type", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    prismaMock.current = makeDb({ categoryKind: "INCOME" }).db;
    const res = await POST(
      req({
        accountId: "acc-1",
        categoryId: "cat-1",
        amount: 100,
        type: "EXPENSE",
        date: "2026-01-01"
      })
    );
    expect(res.status).toBe(400);
  });

  it("DELETE reverses the original balance effect", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb({
      existing: { id: "tx-1", accountId: "acc-1", type: "EXPENSE", amount: 100 }
    });
    prismaMock.current = db;
    const res = await DELETE(req(undefined, "?id=tx-1"));
    expect(res.status).toBe(204);
    // Original expense subtracted 100, so the reversal decrements by -100 (i.e. +100).
    expect(accountUpdates[0].data.balance).toEqual({ decrement: -100 });
  });

  it("PUT reverses the old effect and applies the new one", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb({
      categoryKind: "INCOME",
      existing: { id: "tx-1", accountId: "acc-1", type: "EXPENSE", amount: 100 }
    });
    prismaMock.current = db;
    await PUT(
      req({
        id: "tx-1",
        accountId: "acc-1",
        categoryId: "cat-1",
        amount: 80,
        type: "INCOME",
        date: "2026-01-01"
      })
    );
    // Reverse old EXPENSE 100 (decrement -100 = +100), then apply new INCOME 80 (+80).
    expect(accountUpdates[0].data.balance).toEqual({ decrement: -100 });
    expect(accountUpdates[1].data.balance).toEqual({ increment: 80 });
  });

  it("transfer decrements the source and increments the target by the amount", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const { db, accountUpdates } = makeDb();
    prismaMock.current = db;
    const res = await POST(
      req({
        action: "transfer",
        fromAccountId: "acc-1",
        toAccountId: "acc-2",
        amount: 500,
        date: "2026-01-01"
      })
    );
    expect(res.status).toBe(201);
    const byAccount = Object.fromEntries(accountUpdates.map((u) => [u.where.id, u.data.balance]));
    expect(byAccount["acc-1"]).toEqual({ decrement: 500 });
    expect(byAccount["acc-2"]).toEqual({ increment: 500 });
  });
});
