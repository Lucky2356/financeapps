import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

const digits = (text: string) => Number(text.replace(/[^\d]/g, ""));

// The ring of categories was drawn from the six biggest of them while the number
// in the middle of it said «всего» — 102 079 ₽ under a month that had spent
// 111 234 ₽. Every category is drawn now, and the heading says which period the
// ring covers, so nothing on the panel pretends to be something else.
test("кольцо расходов показывает весь период целиком", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByRole("button", { name: /Аналитика по операциям/ }).click();

  const spend = page.getByTestId("txa-expense");
  await expect(spend).toBeVisible({ timeout: 20_000 });
  const spendValue = digits(await spend.innerText());
  expect(spendValue).toBeGreaterThan(0);

  // The ring prints what its slices add up to in the hole in the middle. The
  // first ring on this panel is the spending one.
  await expect(page.getByText("Расходы по категориям за 6 месяцев")).toBeVisible();

  // Six months of spending is at least the average month it is drawn beside —
  // a truncated ring came out smaller than the month above it.
  const ring = page.getByTestId("ring-total").first();
  await expect
    .poll(async () => digits(await ring.innerText()), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(spendValue);
});

// Largest first, both halves of the dashboard. The spending ring used to come
// out in whatever order the categories happened to be stored in.
test("категории на главной идут по убыванию", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const legend = page.getByTestId("breakdown-legend").last();
  await expect(legend).toBeVisible({ timeout: 20_000 });
  const rows = await legend.locator("> div").allInnerTexts();
  const amounts = rows.map(digits).filter((value) => Number.isFinite(value));
  expect(amounts.length).toBeGreaterThan(2);
  const sorted = [...amounts].sort((left, right) => right - left);
  expect(amounts).toEqual(sorted);
});

// A link into the ledger already says what to show. Filling the current month in
// behind it opened a six-month category on a list of this month — the figure and
// the rows under it disagreeing again, one release after that was settled.
test("ссылка из аналитики открывает тот же период, что и кольцо", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/analytics");

  const row = page.locator('a[href*="/transactions?categoryId="]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  await expect(page).toHaveURL(/categoryId=/);
  // No dates were asked for, so none are added.
  await expect(page).not.toHaveURL(/from=/);
});

// The screen still opens on the current month when nothing is asked of it.
test("пустой адрес журнала открывает текущий месяц", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
});
