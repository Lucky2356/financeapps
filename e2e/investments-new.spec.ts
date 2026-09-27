import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Инвестиции 2.2: таблица на ПК, карточки на телефоне, выплаты с «Получено»,
// сравнение с индексом.

test("ПК: таблица позиций сортируется и раскрывает бумагу", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await openSettled(page, "/investments");

  const table = page.getByTestId("holdings-table");
  await expect(table.locator("tbody tr")).toHaveCount(3, { timeout: 20_000 });
  await table.getByRole("button", { name: "Бумага" }).click();
  await expect(table.locator("tbody tr").first()).toContainText("LKOH");
  await table.locator("tbody tr").first().click();
  await expect(table.getByText("Покупки")).toBeVisible();
});

test("телефон: карточки, а вкладка «Доход» собирает выплаты, продажи и налоги", async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedExampleData(page);
  await openSettled(page, "/investments");
  await expect(page.getByTestId("holdings-table")).toBeHidden();
  await expect(page.getByTestId("holding-average").first()).toBeVisible({ timeout: 20_000 });

  // Выплаты с биржи здесь не проверить — биржа из проверок недоступна, а
  // выдумывать выплаты без сети приложение нарочно не станет. Их проверяет
  // tests/payouts.test.ts на поставщике-заглушке.
  await page.getByTestId("section-tabs").getByRole("button", { name: "Доход" }).click();
  await expect(page.getByText(/Налог/).first()).toBeVisible({ timeout: 20_000 });
});

test("график: «Против индекса» показывает итог за период", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await openSettled(page, "/investments");
  await page.getByRole("radiogroup", { name: "Что показать" }).getByText("Против индекса").click();
  await expect(page.getByText(/За период: ваши бумаги .*индекс Мосбиржи/)).toBeVisible({
    timeout: 20_000
  });
});
