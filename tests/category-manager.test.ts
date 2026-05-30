import { describe, expect, it } from "vitest";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { CategoriesPageData } from "@/lib/data";

function createClient() {
  return new LocalApiClient(new MemoryStorageAdapter());
}

describe("Category management in LocalApiClient", () => {
  it("returns default categories on fresh state", async () => {
    const client = createClient();
    const data = await client.get<CategoriesPageData>("/categories");
    expect(data.categories.length).toBeGreaterThan(0);
    const income = data.categories.filter((c) => c.kind === "INCOME");
    const expense = data.categories.filter((c) => c.kind === "EXPENSE");
    expect(income.length).toBeGreaterThan(0);
    expect(expense.length).toBeGreaterThan(0);
  });

  it("creates and deletes a custom category", async () => {
    const client = createClient();

    await client.post("/categories", {
      name: "Тест категория",
      kind: "EXPENSE",
      color: "#ff0000",
      isEssential: false,
      isSubscription: false,
    });

    const after = await client.get<CategoriesPageData>("/categories");
    const created = after.categories.find((c) => c.name === "Тест категория");
    expect(created).toBeDefined();
    expect(created?.kind).toBe("EXPENSE");
    expect(created?.color).toBe("#ff0000");

    // Delete it (no transactions)
    await client.delete(`/categories?id=${created!.id}`);
    const afterDelete = await client.get<CategoriesPageData>("/categories");
    expect(afterDelete.categories.find((c) => c.name === "Тест категория")).toBeUndefined();
  });

  it("prevents duplicate category names for same kind", async () => {
    const client = createClient();

    await client.post("/categories", {
      name: "Уникальная",
      kind: "INCOME",
      color: "#16a34a",
      isEssential: false,
      isSubscription: false,
    });

    await expect(
      client.post("/categories", {
        name: "уникальная",  // same name, different case
        kind: "INCOME",
        color: "#0d9488",
        isEssential: false,
        isSubscription: false,
      })
    ).rejects.toThrow();
  });

  it("prevents deleting category with transactions", async () => {
    const client = createClient();

    // Get existing category
    const data = await client.get<CategoriesPageData>("/categories");
    const expenseCategory = data.categories.find((c) => c.kind === "EXPENSE");
    if (!expenseCategory) return;

    // Add a transaction using this category
    const accounts = (await client.get<{ accounts: Array<{ id: string }> }>("/accounts")).accounts;
    await client.post("/transactions", {
      amount: "500",
      type: "EXPENSE",
      accountId: accounts[0].id,
      categoryId: expenseCategory.id,
      date: new Date().toISOString(),
    });

    // Try to delete — should throw
    await expect(
      client.delete(`/categories?id=${expenseCategory.id}`)
    ).rejects.toThrow();
  });
});
