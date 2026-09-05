import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The average purchase price is the app's job, not the user's arithmetic.
// This walks the real dialog: pick a security, list two purchases at different
// prices, and check that the position is stored with the WEIGHTED average
// (10 × 100 + 30 × 200 = 7000 for 40 shares → 175, not the naive 150).
test("считает среднюю цену покупки по списку покупок", async ({ page }) => {
  // Saving a position asks MOEX for the security's current price, so this test
  // is bounded by a live network call. Under a full parallel run those calls
  // queue up and the default 30s budget runs out on waiting, not on failing —
  // the arithmetic under test is instant.
  test.setTimeout(120_000);
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
  // Saving a position fetches the security's current price from MOEX, so this
  // step is bounded by a live network call — under a full parallel run 15s was
  // not enough and the suite failed on timing, not on behaviour.
  await expect(dialog).toBeHidden({ timeout: 45_000 });

  // 40 shares at an average of 175 ₽ — "вложено" is 7 000 ₽. Same live-price
  // round-trip as above: generous, because what is under test is the arithmetic,
  // not how fast MOEX answers while the rest of the suite runs beside it.
  await expect(page.getByText("SBER").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/7\s?000/).first()).toBeVisible({ timeout: 45_000 });
});

// The dialog keeps its state inside itself, and it used to stay mounted after
// closing: the next security you added opened with the previous one already
// chosen, and the quantity still in the field.
test("форма добавления бумаги открывается чистой", async ({ page }) => {
  test.setTimeout(120_000);
  await seedExampleData(page);
  await openSettled(page, "/investments");

  await page.getByRole("button", { name: "Добавить первую бумагу" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("SBER");
  await dialog.getByRole("button", { name: /SBER/ }).first().click();
  await expect(dialog.getByText("Сбербанк")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Добавить первую бумагу" }).click();
  // A search field, not a chosen security.
  await expect(dialog.getByRole("textbox").first()).toBeVisible();
  // Проверяется отсутствие ВЫБРАННОЙ бумаги, а не отсутствие её названия на
  // экране. С 1.26.0 пустой поиск показывает недавно выбранные — «Сбербанк»
  // там теперь есть, и это не остаток прежнего диалога, а подсказка. Признак
  // выбранной бумаги один: рядом с ней стоит кнопка «Изменить».
  await expect(dialog.getByRole("button", { name: "Изменить" })).toHaveCount(0);
});
