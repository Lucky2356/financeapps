import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Житейские мелочи 1.47.0: спрятать суммы на людях, стандартные категории под
// замком, вопросик у каждого экрана.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedExampleData(page);
});

test("глаз прячет все суммы и возвращает их обратно", async ({ page }) => {
  await openSettled(page, "/");
  const main = page.locator("main");
  const amount = /\d[\d\s  ]*\s?₽/;
  await expect(main).toContainText(amount);

  const eye = page.locator('[data-testid="amounts-toggle"]:visible');
  await eye.click();
  await expect(main).toContainText("•••• ₽");
  await expect(main).not.toContainText(amount);

  await eye.click();
  await expect(main).toContainText(amount);
});

test("стандартная категория под замком: удалить её нельзя", async ({ page }) => {
  await openSettled(page, "/categories");
  const row = page.getByRole("row").filter({ hasText: "Продукты" });
  await expect(row.getByTestId("category-standard")).toBeVisible();
  await expect(row.getByRole("button", { name: "Удалить категорию" })).toBeDisabled();
});

test("у экрана есть вопросик, и он объясняет, что это за экран", async ({ page }) => {
  await openSettled(page, "/budgets");
  await page.locator("h1").getByRole("button", { name: "Пояснение" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Лимит");
});
