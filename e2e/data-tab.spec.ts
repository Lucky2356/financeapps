import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Loading and unloading data used to be two places: a screen called «Импорт» in
// the ledger's tabs and a settings tab called «Данные». There is one now.
test("«Данные» открывает вкладку настроек со всем, что двигает данные", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page
    .locator('[data-testid="hub-tabs"][data-surface="desktop"]')
    .getByRole("link", { name: "Данные" })
    .click();
  await expect(page).toHaveURL(/\/settings\?section=data/);

  // The copy of the data comes first — it is the one thing here that matters
  // when something has gone wrong.
  // Словами, а не «backup»: с 1.46.0 настройки говорят с человеком по-русски.
  await expect(page.getByRole("button", { name: "Скачать копию" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("button", { name: "Восстановить из копии" })).toBeVisible();
  // The CSV import is on the same tab, not a screen of its own.
  await expect(page.getByText("Импорт из банка (CSV)")).toBeVisible();
  // And the exports are one quiet row rather than a card of their own.
  await expect(page.getByRole("button", { name: "CSV", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible();
});

test("старая ссылка /import ведёт на ту же вкладку", async ({ page }) => {
  await seedExampleData(page);
  // Через openSettled, а не page.goto: пример заканчивается перезагрузкой
  // самого приложения, и голый переход, начатый сразу после, она перебивала.
  await openSettled(page, "/import");
  await expect(page).toHaveURL(/\/settings\?section=data/, { timeout: 20_000 });
});

test("в списке категорий видно иконки", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  const dialog = page.getByRole("dialog");
  // По подписи поля, а не по надписи внутри: категория теперь подставляется
  // из последней операции, и «Выберите категорию» в поле уже не стоит.
  await dialog.getByLabel("Категория").click();

  // Every option carries the category's own picture, the way the plan/fact
  // header and the ledger rows do.
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible();
  await expect(option.locator("svg")).toHaveCount(1);
});
