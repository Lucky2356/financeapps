import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const backupAccountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["CASH", "DEBIT_CARD", "SAVINGS", "BROKERAGE"]),
  balance: z.coerce.number().finite(),
  currency: z.string().default("RUB"),
  isArchived: z.boolean().default(false)
});

const backupCategorySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().default("#2563eb"),
  icon: z.string().default("Circle"),
  isEssential: z.boolean().default(false),
  isSubscription: z.boolean().default(false)
});

const backupTransactionSchema = z.object({
  accountName: z.string().min(1),
  categoryName: z.string().min(1),
  categoryKind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().min(1),
  description: z.string().nullable().optional()
});

const backupRecurringTransactionSchema = z.object({
  accountName: z.string().min(1),
  categoryName: z.string().min(1),
  categoryKind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextDate: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true)
});

const backupBudgetSchema = z.object({
  categoryName: z.string().min(1),
  categoryKind: z.literal("EXPENSE"),
  month: z.string().min(1),
  limitAmount: z.coerce.number().positive()
});

const backupGoalSchema = z.object({
  title: z.string().min(1),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().min(0),
  deadline: z.string().min(1)
});

const backupPositionSchema = z.object({
  ticker: z.string().min(1),
  quantity: z.coerce.number().positive(),
  averageBuyPrice: z.coerce.number().positive()
});

const backupPortfolioSchema = z.object({
  name: z.string().min(1),
  accountName: z.string().nullable().optional(),
  positions: z.array(backupPositionSchema)
});

export const userBackupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  user: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    currency: z.literal("RUB"),
    demoMode: z.boolean(),
    emergencyFundMonthsTarget: z.number().int(),
    riskProfileCode: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]).nullable()
  }),
  accounts: z.array(backupAccountSchema),
  categories: z.array(backupCategorySchema),
  transactions: z.array(backupTransactionSchema),
  recurringTransactions: z.array(backupRecurringTransactionSchema).default([]),
  budgets: z.array(backupBudgetSchema),
  savingGoals: z.array(backupGoalSchema),
  portfolios: z.array(backupPortfolioSchema),
  watchlist: z.array(z.object({ ticker: z.string().min(1), notes: z.string().nullable().optional() }))
});

export type UserBackup = z.infer<typeof userBackupSchema>;

function toNumber(value: { toNumber(): number } | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function categoryKey(kind: string, name: string) {
  return `${kind}:${name.trim().toLowerCase()}`;
}

function accountKey(name: string) {
  return name.trim().toLowerCase();
}

export class UserBackupService {
  constructor(private readonly db: PrismaClient) {}

  async exportFirstUser(): Promise<UserBackup> {
    const user = await this.db.user.findFirst({
      orderBy: { createdAt: "asc" },
      include: {
        riskProfile: true,
        accounts: { orderBy: { createdAt: "asc" } },
        categories: { orderBy: { createdAt: "asc" } },
        transactions: {
          orderBy: { date: "desc" },
          include: { account: true, category: true }
        },
        recurringTransactions: {
          orderBy: { nextDate: "asc" },
          include: { account: true, category: true }
        },
        budgets: {
          orderBy: { month: "desc" },
          include: { category: true }
        },
        savingGoals: { orderBy: { deadline: "asc" } },
        portfolios: {
          orderBy: { createdAt: "asc" },
          include: {
            account: true,
            positions: {
              include: { security: true },
              orderBy: { createdAt: "asc" }
            }
          }
        },
        watchlistItems: {
          orderBy: { createdAt: "asc" },
          include: { security: true }
        }
      }
    });

    if (!user) {
      throw new Error("Demo user not found. Run seed first.");
    }

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      user: {
        name: user.name,
        email: user.email,
        currency: "RUB",
        demoMode: user.demoMode,
        emergencyFundMonthsTarget: user.emergencyFundMonthsTarget,
        riskProfileCode: user.riskProfile?.code ?? null
      },
      accounts: user.accounts.map((account) => ({
        name: account.name,
        type: account.type,
        balance: toNumber(account.balance),
        currency: account.currency,
        isArchived: account.isArchived
      })),
      categories: user.categories.map((category) => ({
        name: category.name,
        kind: category.kind,
        color: category.color,
        icon: category.icon,
        isEssential: category.isEssential,
        isSubscription: category.isSubscription
      })),
      transactions: user.transactions.map((transaction) => ({
        accountName: transaction.account.name,
        categoryName: transaction.category.name,
        categoryKind: transaction.category.kind,
        amount: toNumber(transaction.amount),
        type: transaction.type,
        date: transaction.date.toISOString(),
        description: transaction.description
      })),
      recurringTransactions: user.recurringTransactions.map((transaction) => ({
        accountName: transaction.account.name,
        categoryName: transaction.category.name,
        categoryKind: transaction.category.kind,
        amount: toNumber(transaction.amount),
        type: transaction.type,
        frequency: transaction.frequency,
        nextDate: transaction.nextDate.toISOString(),
        description: transaction.description,
        isActive: transaction.isActive
      })),
      budgets: user.budgets.map((budget) => ({
        categoryName: budget.category.name,
        categoryKind: "EXPENSE",
        month: budget.month.toISOString(),
        limitAmount: toNumber(budget.limitAmount)
      })),
      savingGoals: user.savingGoals.map((goal) => ({
        title: goal.title,
        targetAmount: toNumber(goal.targetAmount),
        currentAmount: toNumber(goal.currentAmount),
        deadline: goal.deadline.toISOString()
      })),
      portfolios: user.portfolios.map((portfolio) => ({
        name: portfolio.name,
        accountName: portfolio.account?.name ?? null,
        positions: portfolio.positions.map((position) => ({
          ticker: position.security.ticker,
          quantity: toNumber(position.quantity),
          averageBuyPrice: toNumber(position.averageBuyPrice)
        }))
      })),
      watchlist: user.watchlistItems.map((item) => ({
        ticker: item.security.ticker,
        notes: item.notes
      }))
    };
  }

  async restoreFirstUser(input: unknown) {
    const backup = userBackupSchema.parse(input);
    const existingUser = await this.db.user.findFirst({ orderBy: { createdAt: "asc" } });

    if (!existingUser) {
      throw new Error("Demo user not found. Run seed first.");
    }

    await this.db.$transaction(async (tx) => {
      const riskProfile = backup.user.riskProfileCode
        ? await tx.riskProfile.findUnique({ where: { code: backup.user.riskProfileCode } })
        : null;

      await tx.transaction.deleteMany({ where: { userId: existingUser.id } });
      await tx.recurringTransaction.deleteMany({ where: { userId: existingUser.id } });
      await tx.budget.deleteMany({ where: { userId: existingUser.id } });
      await tx.savingGoal.deleteMany({ where: { userId: existingUser.id } });
      await tx.recommendation.deleteMany({ where: { userId: existingUser.id } });
      await tx.watchlistItem.deleteMany({ where: { userId: existingUser.id } });
      await tx.portfolio.deleteMany({ where: { userId: existingUser.id } });
      await tx.account.deleteMany({ where: { userId: existingUser.id } });
      await tx.category.deleteMany({ where: { userId: existingUser.id } });

      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          name: backup.user.name,
          email: backup.user.email,
          currency: "RUB",
          demoMode: backup.user.demoMode,
          emergencyFundMonthsTarget: backup.user.emergencyFundMonthsTarget,
          riskProfileId: riskProfile?.id ?? null
        }
      });

      const accountByName = new Map<string, string>();
      for (const account of backup.accounts) {
        const created = await tx.account.create({
          data: {
            userId: existingUser.id,
            name: account.name,
            type: account.type,
            balance: account.balance,
            currency: account.currency,
            isArchived: account.isArchived
          }
        });
        accountByName.set(accountKey(account.name), created.id);
      }

      const categoryByName = new Map<string, string>();
      for (const category of backup.categories) {
        const created = await tx.category.create({
          data: {
            userId: existingUser.id,
            name: category.name,
            kind: category.kind,
            color: category.color,
            icon: category.icon,
            isEssential: category.isEssential,
            isSubscription: category.isSubscription
          }
        });
        categoryByName.set(categoryKey(category.kind, category.name), created.id);
      }

      for (const goal of backup.savingGoals) {
        await tx.savingGoal.create({
          data: {
            userId: existingUser.id,
            title: goal.title,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount,
            deadline: new Date(goal.deadline)
          }
        });
      }

      for (const budget of backup.budgets) {
        const categoryId = categoryByName.get(categoryKey(budget.categoryKind, budget.categoryName));
        if (!categoryId) continue;

        await tx.budget.create({
          data: {
            userId: existingUser.id,
            categoryId,
            month: new Date(budget.month),
            limitAmount: budget.limitAmount
          }
        });
      }

      for (const transaction of backup.transactions) {
        const accountId = accountByName.get(accountKey(transaction.accountName));
        const categoryId = categoryByName.get(categoryKey(transaction.categoryKind, transaction.categoryName));
        if (!accountId || !categoryId) continue;

        await tx.transaction.create({
          data: {
            userId: existingUser.id,
            accountId,
            categoryId,
            amount: transaction.amount,
            type: transaction.type,
            date: new Date(transaction.date),
            description: transaction.description ?? null
          }
        });
      }

      for (const transaction of backup.recurringTransactions) {
        const accountId = accountByName.get(accountKey(transaction.accountName));
        const categoryId = categoryByName.get(categoryKey(transaction.categoryKind, transaction.categoryName));
        if (!accountId || !categoryId) continue;

        await tx.recurringTransaction.create({
          data: {
            userId: existingUser.id,
            accountId,
            categoryId,
            amount: transaction.amount,
            type: transaction.type,
            frequency: transaction.frequency,
            nextDate: new Date(transaction.nextDate),
            description: transaction.description ?? null,
            isActive: transaction.isActive
          }
        });
      }

      for (const portfolio of backup.portfolios) {
        const accountId = portfolio.accountName ? accountByName.get(accountKey(portfolio.accountName)) ?? null : null;
        const createdPortfolio = await tx.portfolio.create({
          data: {
            userId: existingUser.id,
            accountId,
            name: portfolio.name
          }
        });

        for (const position of portfolio.positions) {
          const security = await tx.security.findUnique({ where: { ticker: position.ticker.toUpperCase() } });
          if (!security) continue;

          await tx.portfolioPosition.create({
            data: {
              portfolioId: createdPortfolio.id,
              securityId: security.id,
              quantity: position.quantity,
              averageBuyPrice: position.averageBuyPrice
            }
          });
        }
      }

      for (const item of backup.watchlist) {
        const security = await tx.security.findUnique({ where: { ticker: item.ticker.toUpperCase() } });
        if (!security) continue;

        await tx.watchlistItem.create({
          data: {
            userId: existingUser.id,
            securityId: security.id,
            notes: item.notes ?? null
          }
        });
      }
    });

    return { restored: true, schemaVersion: backup.schemaVersion };
  }
}
