import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Один чек — несколько категорий: «Пятёрочка» — продукты и хозяйство.

test.use({ viewport: { width: 390, height: 844 } });

test("покупка делится по категориям и удаляется целиком", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("2340");
  await dialog.getByLabel("Категория", { exact: true }).click();
  await page.getByRole("option", { name: "Продукты" }).click();
  await dialog.getByLabel(/Описание/).fill("Чек из магазина у дома");

  await dialog.getByRole("button", { name: "Разделить по категориям" }).click();
  await dialog.getByLabel("Категория части 2").click();
  await page.getByRole("option").nth(1).click();
  await dialog.getByLabel("Сумма части 2").fill("440");
  await expect(dialog.getByText(/Остальное — 1\s900/)).toBeVisible();
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog).toBeHidden();

  await openSettled(page, "/transactions?q=Чек из магазина у дома");
  // На телефоне — карточки; таблица для ПК скрыта, её не считаем.
  const rows = page.locator("main").getByText("Чек из магазина у дома", { exact: true });
  await expect(rows.filter({ visible: true })).toHaveCount(2);
  await expect(page.getByText("разбивка").filter({ visible: true }).first()).toBeVisible();

  // Удалить одну часть — значит удалить покупку.
  // Именно «Удалить» у операции: на плашке примера есть «Удалить пример».
  await page
    .getByRole("button", { name: "Удалить", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByText(/Удалятся все её части \(2\)/)).toBeVisible();
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(rows.filter({ visible: true })).toHaveCount(0);
});
