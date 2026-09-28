import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Кэшбэк, поездки, вычеты, вклады — новые экраны 2.3.0 открываются, пишут и
// считают на примере данных.

test("кэшбэк: условие карты — и подсказка при записи траты", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/cashback");
  await page.getByRole("button", { name: "Добавить условие" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Карта").click();
  await page.getByRole("option", { name: "Наличные" }).click();
  await dialog.getByLabel("Категория", { exact: true }).click();
  await page.getByRole("option", { name: "Продукты" }).click();
  await dialog.getByLabel("Кэшбэк, %").fill("10");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Условие сохранено.")).toBeVisible();
  await expect(page.getByText("10 %")).toBeVisible();

  // Быстрое добавление: продукты картой — подсказка «выгоднее наличными».
  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
  const add = page.getByRole("dialog");
  await add.getByLabel("Сумма").fill("1000");
  await add.getByLabel(/Описание/).fill("продукты");
  // Категорию «Продукты» подставляет разбор описания, счёт — последний (карта).
  const hint = add.getByTestId("cashback-hint");
  await expect(hint).toContainText("Наличные");
  await hint.getByRole("button", { name: "Взять её" }).click();
  await expect(hint).toBeHidden();
});

test("поездка: бюджет и метка у новой траты", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/trips");
  await page.getByRole("button", { name: "Новая поездка" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Куда").fill("Казань");
  await dialog.getByLabel("Бюджет").fill("30000");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Поездка сохранена.")).toBeVisible();
  await expect(page.getByTestId("trip-card").getByText("Казань")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
  const add = page.getByRole("dialog");
  await expect(add.getByTestId("trip-hint")).toContainText("Казань");
  await add.getByLabel("Сумма").fill("1500");
  await add.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(add).toBeHidden();
  await expect(page.getByTestId("trip-card")).toContainText(/Потрачено 1\s?500/);
});

test("вычеты: отметили «Здоровье» — посчитан возврат", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/deductions");
  await page.getByTestId("deduction-kind-Здоровье").click();
  await page.getByRole("option", { name: "Лечение и лекарства" }).click();
  await expect(page.getByText("Лечение, обучение, спорт")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("deduction-refund")).not.toHaveText(/^0/);
});

test("вклад: дата окончания и доход к концу", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/accounts");
  await page
    .locator("tr", { hasText: "Накопительный счёт" })
    .getByRole("button", { name: "Редактировать счет" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="interestRate"]').fill("15");
  await dialog.getByLabel("Вклад до").fill("2027-03-28");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("deposit-outlook").first()).toContainText("в месяц");
});
