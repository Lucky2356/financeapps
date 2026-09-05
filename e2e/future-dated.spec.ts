import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// An operation dated ahead of today leaves the balance and the net worth the
// moment it is saved. Post-dating on purpose is a real thing, so the app asks
// rather than refuses — but it has to ask, and it has to keep saying so
// afterwards: the list opens on the current month, where a row a year out is
// not on the page at all while its money is already gone from the headline.

test("дата в будущем требует подтверждения и остаётся видимой", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  const before = await page.getByTestId("future-dated-notice").count();
  expect(before).toBe(0);

  // Added through the one door the app has: the round button.
  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("50000");
  await dialog.getByLabel("Категория").click();
  await page.getByRole("option", { name: "Продукты" }).click();
  // The year is one keystroke wide, and this is the keystroke.
  await dialog.locator("#fab-date").fill("2027-03-15");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();

  // The question, in the owner's own words.
  await expect(page.getByText("Дата ещё не наступила")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Да, дата верная" }).click();

  // And afterwards the screen keeps saying it, on the month that does not hold it.
  const notice = page.getByTestId("future-dated-notice");
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText("будущем");
});
