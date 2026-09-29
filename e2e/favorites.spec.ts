import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Частые траты — одним касанием. Трижды записанный «Кофе 250» становится
// кнопкой в быстром добавлении; касание записывает сразу и даёт «Отменить».

async function addCoffee(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("250");
  await dialog.getByLabel(/Описание/).fill("Кофе у метро");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("трижды записанное — в частых; касание пишет сразу", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");
  for (let i = 0; i < 3; i += 1) await addCoffee(page);

  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
  const chips = page.getByTestId("favorite-chips");
  await expect(chips).toBeVisible({ timeout: 10_000 });
  await chips.getByRole("button", { name: /Кофе у метро/ }).click();
  await expect(page.getByText(/Записано: Кофе у метро/)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Четыре одинаковые строки в учёте.
  await openSettled(page, "/transactions?q=Кофе у метро");
  await expect(page.getByText("Кофе у метро").first()).toBeVisible();
});

test("двойное списание — на главной «Стоит проверить», «Всё верно» убирает", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");
  for (let i = 0; i < 2; i += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Сумма").fill("1250");
    await dialog.getByLabel(/Описание/).fill("Пятёрочка на углу");
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await openSettled(page, "/");
  const card = page.getByTestId("watchdog");
  await expect(card.getByText(/двойное списание: «Пятёрочка на углу»/)).toBeVisible({
    timeout: 15_000
  });
  await card.getByRole("button", { name: "Всё верно" }).first().click();
  await expect(card).toBeHidden();
});

test("частая трата пишется на счёт, выбранный в форме", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");
  for (let i = 0; i < 3; i += 1) await addCoffee(page);

  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));
  const dialog = page.getByRole("dialog");
  await dialog.locator("#fab-account").click();
  await page.getByRole("option", { name: "Наличные" }).click();
  const chips = page.getByTestId("favorite-chips");
  await expect(chips).toBeVisible({ timeout: 10_000 });
  await chips.getByRole("button", { name: /Кофе у метро/ }).click();
  await expect(page.getByText(/Записано: Кофе у метро/)).toBeVisible();

  await openSettled(page, "/transactions?accountId=sample-cash&q=Кофе у метро");
  await expect(page.getByText("Кофе у метро").first()).toBeVisible();
});
