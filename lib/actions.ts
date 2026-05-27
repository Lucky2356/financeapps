"use server";

import type { CategoryKind, TransactionType } from "@prisma/client";
import { isValid, parse, startOfMonth } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrisma } from "@/lib/prisma";
import {
  accountSchema,
  budgetSchema,
  csvImportSchema,
  savingGoalSchema,
  settingsSchema,
  transactionSchema
} from "@/lib/validations";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function toastRedirect(path: string, message: string): never {
  redirect(`${path}?toast=${encodeURIComponent(message)}`);
}

async function defaultUser() {
  const db = requirePrisma();
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("Demo user not found. Run npx prisma db seed.");
  }

  return user;
}

function balanceDelta(type: TransactionType, amount: number) {
  return type === "INCOME" ? amount : -amount;
}

function parseCsvAmount(raw: unknown) {
  const normalized = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) return 0;
  return amount;
}

function parseCsvDate(raw: unknown) {
  const value = String(raw ?? "").trim();
  const ddmmyyyy = parse(value, "dd.MM.yyyy", new Date());
  if (isValid(ddmmyyyy)) return ddmmyyyy;

  const yyyymmdd = parse(value, "yyyy-MM-dd", new Date());
  if (isValid(yyyymmdd)) return yyyymmdd;

  const native = new Date(value);
  return isValid(native) ? native : new Date();
}

async function withDatabaseOrToast(path: string) {
  try {
    return await defaultUser();
  } catch {
    toastRedirect(path, "Подключите PostgreSQL, выполните миграции и seed, чтобы сохранять данные.");
  }
}

export async function createTransaction(formData: FormData) {
  const user = await withDatabaseOrToast("/transactions");
  const db = requirePrisma();
  const input = transactionSchema.parse({
    amount: value(formData, "amount"),
    type: value(formData, "type"),
    categoryId: value(formData, "categoryId"),
    accountId: value(formData, "accountId"),
    date: value(formData, "date"),
    description: value(formData, "description")
  });

  await db.$transaction([
    db.transaction.create({
      data: {
        userId: user.id,
        amount: input.amount,
        type: input.type,
        categoryId: input.categoryId,
        accountId: input.accountId,
        date: new Date(input.date),
        description: input.description || null
      }
    }),
    db.account.update({
      where: { id: input.accountId },
      data: { balance: { increment: balanceDelta(input.type, input.amount) } }
    })
  ]);

  revalidatePath("/");
  revalidatePath("/transactions");
  toastRedirect("/transactions", "Операция добавлена");
}

export async function updateTransaction(formData: FormData) {
  await withDatabaseOrToast("/transactions");
  const db = requirePrisma();
  const input = transactionSchema.parse({
    id: value(formData, "id"),
    amount: value(formData, "amount"),
    type: value(formData, "type"),
    categoryId: value(formData, "categoryId"),
    accountId: value(formData, "accountId"),
    date: value(formData, "date"),
    description: value(formData, "description")
  });

  if (!input.id) {
    throw new Error("Transaction id is required.");
  }

  const existing = await db.transaction.findUnique({ where: { id: input.id } });
  if (!existing) {
    throw new Error("Transaction not found.");
  }

  await db.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: existing.accountId },
      data: { balance: { decrement: balanceDelta(existing.type, Number(existing.amount)) } }
    });
    await tx.transaction.update({
      where: { id: input.id },
      data: {
        amount: input.amount,
        type: input.type,
        categoryId: input.categoryId,
        accountId: input.accountId,
        date: new Date(input.date),
        description: input.description || null
      }
    });
    await tx.account.update({
      where: { id: input.accountId },
      data: { balance: { increment: balanceDelta(input.type, input.amount) } }
    });
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  toastRedirect("/transactions", "Операция обновлена");
}

export async function deleteTransaction(formData: FormData) {
  await withDatabaseOrToast("/transactions");
  const db = requirePrisma();
  const id = value(formData, "id");
  const existing = await db.transaction.findUnique({ where: { id } });

  if (existing) {
    await db.$transaction([
      db.transaction.delete({ where: { id } }),
      db.account.update({
        where: { id: existing.accountId },
        data: { balance: { decrement: balanceDelta(existing.type, Number(existing.amount)) } }
      })
    ]);
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  toastRedirect("/transactions", "Операция удалена");
}

export async function createAccount(formData: FormData) {
  const user = await withDatabaseOrToast("/accounts");
  const db = requirePrisma();
  const input = accountSchema.parse({
    name: value(formData, "name"),
    type: value(formData, "type"),
    balance: value(formData, "balance"),
    currency: value(formData, "currency") || "RUB"
  });

  await db.account.create({
    data: {
      userId: user.id,
      name: input.name,
      type: input.type,
      balance: input.balance,
      currency: input.currency
    }
  });

  revalidatePath("/");
  revalidatePath("/accounts");
  toastRedirect("/accounts", "Счет добавлен");
}

export async function updateAccount(formData: FormData) {
  await withDatabaseOrToast("/accounts");
  const db = requirePrisma();
  const input = accountSchema.parse({
    id: value(formData, "id"),
    name: value(formData, "name"),
    type: value(formData, "type"),
    balance: value(formData, "balance"),
    currency: value(formData, "currency") || "RUB"
  });

  if (!input.id) throw new Error("Account id is required.");

  await db.account.update({
    where: { id: input.id },
    data: {
      name: input.name,
      type: input.type,
      balance: input.balance,
      currency: input.currency
    }
  });

  revalidatePath("/");
  revalidatePath("/accounts");
  toastRedirect("/accounts", "Счет обновлен");
}

export async function deleteAccount(formData: FormData) {
  await withDatabaseOrToast("/accounts");
  const db = requirePrisma();
  const id = value(formData, "id");

  await db.account.update({
    where: { id },
    data: { isArchived: true }
  });

  revalidatePath("/");
  revalidatePath("/accounts");
  toastRedirect("/accounts", "Счет архивирован");
}

export async function upsertBudget(formData: FormData) {
  const user = await withDatabaseOrToast("/budgets");
  const db = requirePrisma();
  const input = budgetSchema.parse({
    categoryId: value(formData, "categoryId"),
    limitAmount: value(formData, "limitAmount")
  });
  const month = startOfMonth(new Date());

  await db.budget.upsert({
    where: {
      userId_categoryId_month: {
        userId: user.id,
        categoryId: input.categoryId,
        month
      }
    },
    update: { limitAmount: input.limitAmount },
    create: {
      userId: user.id,
      categoryId: input.categoryId,
      month,
      limitAmount: input.limitAmount
    }
  });

  revalidatePath("/");
  revalidatePath("/budgets");
  toastRedirect("/budgets", "Лимит бюджета сохранен");
}

export async function createSavingGoal(formData: FormData) {
  const user = await withDatabaseOrToast("/goals");
  const db = requirePrisma();
  const input = savingGoalSchema.parse({
    title: value(formData, "title"),
    targetAmount: value(formData, "targetAmount"),
    currentAmount: value(formData, "currentAmount"),
    deadline: value(formData, "deadline")
  });

  await db.savingGoal.create({
    data: {
      userId: user.id,
      title: input.title,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      deadline: new Date(input.deadline)
    }
  });

  revalidatePath("/");
  revalidatePath("/goals");
  toastRedirect("/goals", "Цель добавлена");
}

export async function updateSavingGoal(formData: FormData) {
  await withDatabaseOrToast("/goals");
  const db = requirePrisma();
  const input = savingGoalSchema.parse({
    id: value(formData, "id"),
    title: value(formData, "title"),
    targetAmount: value(formData, "targetAmount"),
    currentAmount: value(formData, "currentAmount"),
    deadline: value(formData, "deadline")
  });

  if (!input.id) throw new Error("Goal id is required.");

  await db.savingGoal.update({
    where: { id: input.id },
    data: {
      title: input.title,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      deadline: new Date(input.deadline)
    }
  });

  revalidatePath("/");
  revalidatePath("/goals");
  toastRedirect("/goals", "Цель обновлена");
}

export async function deleteSavingGoal(formData: FormData) {
  await withDatabaseOrToast("/goals");
  const db = requirePrisma();
  const id = value(formData, "id");

  await db.savingGoal.delete({ where: { id } });

  revalidatePath("/");
  revalidatePath("/goals");
  toastRedirect("/goals", "Цель удалена");
}

export async function updateSettings(formData: FormData) {
  const user = await withDatabaseOrToast("/settings");
  const db = requirePrisma();
  const input = settingsSchema.parse({
    currency: "RUB",
    demoMode: formData.get("demoMode") === "on",
    riskProfileCode: value(formData, "riskProfileCode"),
    emergencyFundMonthsTarget: value(formData, "emergencyFundMonthsTarget")
  });
  const riskProfile = await db.riskProfile.findUnique({ where: { code: input.riskProfileCode } });

  await db.user.update({
    where: { id: user.id },
    data: {
      currency: input.currency,
      demoMode: input.demoMode,
      emergencyFundMonthsTarget: input.emergencyFundMonthsTarget,
      riskProfileId: riskProfile?.id ?? user.riskProfileId
    }
  });

  revalidatePath("/");
  revalidatePath("/settings");
  toastRedirect("/settings", "Настройки сохранены");
}

async function findOrCreateImportCategory(userId: string, name: string, kind: CategoryKind) {
  const db = requirePrisma();
  const normalizedName = name.trim() || (kind === "INCOME" ? "Импорт доходов" : "Импорт расходов");
  const existing = await db.category.findFirst({
    where: {
      userId,
      name: { equals: normalizedName, mode: "insensitive" },
      kind
    }
  });

  if (existing) return existing;

  return db.category.create({
    data: {
      userId,
      name: normalizedName,
      kind,
      color: kind === "INCOME" ? "#16a34a" : "#64748b",
      icon: "Upload"
    }
  });
}

export async function importTransactions(formData: FormData) {
  const user = await withDatabaseOrToast("/import");
  const db = requirePrisma();
  const input = csvImportSchema.parse({
    rows: value(formData, "rows"),
    dateColumn: value(formData, "dateColumn"),
    amountColumn: value(formData, "amountColumn"),
    descriptionColumn: value(formData, "descriptionColumn"),
    categoryColumn: value(formData, "categoryColumn"),
    accountColumn: value(formData, "accountColumn")
  });
  const rows = JSON.parse(input.rows) as Array<Record<string, unknown>>;
  const accounts = await db.account.findMany({ where: { userId: user.id, isArchived: false } });
  const fallbackAccount = accounts[0];

  if (!fallbackAccount) {
    throw new Error("Create an account before importing CSV.");
  }

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const rawAmount = parseCsvAmount(row[input.amountColumn]);
      if (rawAmount === 0) continue;

      const type: TransactionType = rawAmount >= 0 ? "INCOME" : "EXPENSE";
      const amount = Math.abs(rawAmount);
      const accountName = String(row[input.accountColumn ?? ""] ?? "").trim().toLowerCase();
      const account = accounts.find((item) => item.name.toLowerCase() === accountName) ?? fallbackAccount;
      const categoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
      const category = await findOrCreateImportCategory(user.id, categoryName, type);

      await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: account.id,
          categoryId: category.id,
          amount,
          type,
          date: parseCsvDate(row[input.dateColumn]),
          description: String(row[input.descriptionColumn ?? ""] ?? "").trim() || null
        }
      });
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: balanceDelta(type, amount) } }
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/import");
  toastRedirect("/transactions", "CSV импортирован");
}
