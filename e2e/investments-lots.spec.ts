import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The average purchase price is the app's job, not the user's arithmetic.
// This walks the real dialog: pick a security, list two purchases at different
// prices, and check that the position is stored with the WEIGHTED average
// (10 × 100 + 30 × 200 = 7000 for 40 shares → 175, not the naive 150).
test("считает среднюю цену покупки по списку покупок", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedExampleData(page);
  await openSettled(page, "/investments");
  await page.getByRole("button", { name: "Добавить первую бумагу" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("SBER");
  await dialog.getByRole("button", { name: /SBER/ }).first().click();

  const rows = dialog.locator("input[type='date']");
  await rows.first().fill("2026-01-10");
  const numbers = dialog.locator("input[type='number']");
  await numbers.nth(0).fill("10");
  await numbers.nth(1).fill("100");

  await dialog.getByRole("button", { name: "Добавить покупку" }).click();
  await rows.nth(1).fill("2026-03-05");
  await numbers.nth(2).fill("30");
  await numbers.nth(3).fill("200");

  // The running total is shown before saving, so the user can check the maths.
  await expect(dialog.getByText(/Итого 40/)).toBeVisible();

  await dialog.getByRole("button", { name: "Сохранить позицию" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // 40 shares at an average of 175 ₽ — "вложено" is 7 000 ₽.
  await expect(page.getByText("SBER").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/7\s?000/).first()).toBeVisible({ timeout: 15_000 });
});
