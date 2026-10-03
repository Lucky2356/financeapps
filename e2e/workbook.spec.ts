import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";
import { buildXlsx } from "./xlsx";

// Книга таблиц: листы-вкладки, свободный лист как в Excel, перенос всего файла.

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("свободный лист: формула, переключение листов, удаление в корзину", async ({ page }) => {
    test.setTimeout(120_000);
    await seedExampleData(page);
    await openSettled(page, "/sheet");
    const tabs = page.getByTestId("sheet-tabs");
    await expect(tabs.getByTestId("sheet-tab")).toHaveCount(1);

    await page.getByTestId("sheet-add").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill("Расчёты");
    await dialog.getByText("Свободный", { exact: true }).click();
    await dialog.getByRole("button", { name: "Создать" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/sheet=/);
    await expect(page.getByTestId("free-sheet")).toBeVisible();

    const a1 = page.locator('td[data-cell="A1"]');
    await a1.click();
    await page.keyboard.press("Enter");
    await page.getByLabel("A1", { exact: true }).fill("=СУММ(1000;2000)");
    await page.keyboard.press("Enter");
    await expect(a1).toHaveText("3 000");
    // Enter опустил выбор на A2 — набор сразу идёт туда.
    await page.keyboard.press("Enter");
    await page.getByLabel("A2", { exact: true }).fill("Ипотека");
    await page.keyboard.press("Tab");
    await expect(page.locator('td[data-cell="A2"]')).toHaveText("Ипотека");

    // На главный лист и обратно — всё на месте.
    await tabs.getByTestId("sheet-tab").first().click();
    await expect(page.getByTestId("free-sheet")).toHaveCount(0);
    await tabs.getByTestId("sheet-tab").filter({ hasText: "Расчёты" }).click();
    await expect(page.locator('td[data-cell="A1"]')).toHaveText("3 000");

    // Удалить — уходит в корзину целиком.
    await page.getByTestId("sheet-tab-menu").click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить лист" }).click();
    await page
      .getByRole("alertdialog")
      .or(page.getByRole("dialog"))
      .getByRole("button", { name: "Удалить лист" })
      .click();
    await expect(tabs.getByTestId("sheet-tab")).toHaveCount(1);
    await openSettled(page, "/settings?section=data");
    await expect(page.getByTestId("trash-group").filter({ hasText: "Расчёты" })).toBeVisible();
  });

  test("перенос всего файла Excel: бюджет и свободный лист", async ({ page }) => {
    test.setTimeout(120_000);
    await seedExampleData(page);
    await openSettled(page, "/sheet");
    await page.getByRole("button", { name: "Перенести мою таблицу из Excel" }).click();
    const dialog = page.getByTestId("sheet-import");
    const file = buildXlsx([
      {
        name: "Бюджет 2026",
        rows: [
          ["Месяц", "Остаток", "Доходы", "Продукты"],
          ["01.08.2026", 10000, 50000, 20000],
          ["01.09.2026", "", 50000, 21000]
        ]
      },
      {
        name: "Кредиты",
        rows: [
          ["Банк", "Долг"],
          ["Сбер", 120000]
        ]
      }
    ]);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(file)
    });
    const whole = dialog.getByTestId("workbook-import");
    await expect(whole).toContainText("бюджет · месяцев: 2");
    await expect(whole).toContainText("свободный · 2×2");
    await whole.getByTestId("workbook-import-run").click();
    await expect(dialog).toBeHidden();

    const tabs = page.getByTestId("sheet-tabs").getByTestId("sheet-tab");
    await expect(tabs).toHaveText(["Бюджет 2026", "Кредитысвободный"]);
    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    await tabs.filter({ hasText: "Кредиты" }).click();
    await expect(page.locator('td[data-cell="B2"]')).toHaveText("120 000");
  });
});
