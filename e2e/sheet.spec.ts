import { expect, test, type Page } from "@playwright/test";

import { OWNER_SHEET_TSV } from "../tests/fixtures/budget-sheet";
import { openSettled, seedExampleData } from "./helpers";

// «Таблица» — своя таблица бюджета, перенесённая из Excel владельца.

async function importOwnerSheet(page: Page) {
  await seedExampleData(page);
  await openSettled(page, "/sheet");
  await page.getByRole("button", { name: "Перенести мою таблицу из Excel" }).click();
  const dialog = page.getByTestId("sheet-import");
  await dialog.getByLabel("Вставьте таблицу сюда").fill(OWNER_SHEET_TSV);
  await expect(dialog.getByTestId("sheet-import-ok")).toContainText("во всех 11 мес.");
  await dialog.getByRole("button", { name: "Перенести", exact: true }).click();
  // На телефоне таблица открывается «По месяцам», на ПК — сеткой.
  await expect(
    page.locator('[data-testid="sheet-grid"]:visible, [data-testid="sheet-month-view"]:visible')
  ).toBeVisible();
}

/** Ячейка: строка месяца и столбец по названию. */
function cell(page: Page, month: string, column: string) {
  return page.locator(`tr[data-month="${month}"] td[data-col="${column}"]`);
}

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("перенос из Excel: итоги как в Excel, правка пересчитывает, Продукты ведут в учёт", async ({
    page
  }) => {
    await importOwnerSheet(page);
    await expect(cell(page, "2026-08", "total")).toHaveText("52 796");
    await expect(cell(page, "2027-06", "total")).toHaveText("91 977");
    // Остаток сентября посчитан из итога августа.
    await expect(cell(page, "2026-09", "Остаток")).toHaveText("52 796");

    // Ввод как в Excel: выделить, начать печатать, Enter.
    await cell(page, "2026-09", "Продукты").click();
    await page.keyboard.type("=25000+5000");
    await page.keyboard.press("Enter");
    await expect(cell(page, "2026-09", "Продукты")).toHaveText("30 000");
    await expect(cell(page, "2026-09", "total")).toHaveText("54 984");
    // Правка дошла до конца таблицы.
    await expect(cell(page, "2027-06", "total")).toHaveText("86 977");

    // Ctrl+Z — как было.
    await page.keyboard.press("Control+z");
    await expect(cell(page, "2026-09", "total")).toHaveText("59 984");

    // Вставка блока из Excel в выделенное место.
    await cell(page, "2026-10", "Подписки").click();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "5000\t4500\r\n5000\t4500");
      document
        .querySelector('[data-testid="sheet-grid"]')!
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    await expect(cell(page, "2026-11", "Транспорт")).toHaveText("4 500");

    // Столбец «Продукты» открывает свои операции в учёте.
    await page.getByRole("link", { name: "Продукты", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions\?categoryId=/);
  });

  test("у выделенной ячейки — операции за её месяц", async ({ page }) => {
    await importOwnerSheet(page);
    await cell(page, "2026-09", "Продукты").click();
    await cell(page, "2026-09", "Продукты")
      .getByRole("link", { name: /Операции за/ })
      .click();
    await expect(page).toHaveURL(/categoryId=.*from=2026-09-01.*to=2026-09-30/);
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("ячейка правится в окне, таблица листается вбок", async ({ page }) => {
    await importOwnerSheet(page);
    // Сетка — второй вид; первый на телефоне — «По месяцам».
    await page.getByTestId("budget-sheet").getByText("Таблица", { exact: true }).click();
    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    await cell(page, "2026-10", "Продукты").tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Продукты")).toBeVisible();
    await dialog.getByLabel("Число или формула").fill("20000+1000");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(cell(page, "2026-10", "Продукты")).toHaveText("21 000");
    // Страница вбок не едет: прокручивается только сама таблица.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
