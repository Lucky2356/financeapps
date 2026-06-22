import type { Prisma } from "@prisma/client";

// Default starter categories seeded for every newly-registered web user (plan
// P0). Mirrors the desktop `defaultCategories` in LocalApiClient so both paths
// start a new account with the same set.
export const DEFAULT_NEW_USER_CATEGORIES = [
  { name: "Зарплата", kind: "INCOME", color: "#16a34a" },
  { name: "Прочие доходы", kind: "INCOME", color: "#0d9488" },
  { name: "Продукты", kind: "EXPENSE", color: "#f97316", isEssential: true },
  { name: "Транспорт", kind: "EXPENSE", color: "#2563eb", isEssential: true },
  { name: "ЖКХ", kind: "EXPENSE", color: "#7c3aed", isEssential: true },
  { name: "Подписки", kind: "EXPENSE", color: "#db2777", isSubscription: true },
  { name: "Рестораны", kind: "EXPENSE", color: "#ea580c" },
  { name: "Здоровье", kind: "EXPENSE", color: "#dc2626", isEssential: true }
] as const;

// Seeds a fresh account's default categories. Accepts a transaction client so it
// can run inside the same transaction as user creation.
export async function provisionNewUser(
  db: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  for (const c of DEFAULT_NEW_USER_CATEGORIES) {
    await db.category.create({
      data: {
        userId,
        name: c.name,
        kind: c.kind,
        color: c.color,
        isEssential: "isEssential" in c ? c.isEssential : false,
        isSubscription: "isSubscription" in c ? c.isSubscription : false
      }
    });
  }
}
