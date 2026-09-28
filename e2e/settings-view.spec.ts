import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Две настройки, которые в 2.1.0 нажимались, но ничего не делали.

const rootSize = (page: import("@playwright/test").Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test("«Крупный» текст правда крупнее — и с плотным видом тоже", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/settings?section=general");
  const size = page.getByRole("radiogroup", { name: "Размер текста" });

  expect(await rootSize(page)).toBe(16);
  await size.getByText("Крупный").click();
  await expect.poll(() => rootSize(page)).toBe(18);

  // Плотность раньше писала 16 px прямо на <html> и перебивала крупный текст.
  await page.getByRole("radiogroup", { name: "Плотность" }).getByText("Компактная").click();
  await expect.poll(() => rootSize(page)).toBeCloseTo(15.75, 1);

  await size.getByText("Обычный").click();
  await expect.poll(() => rootSize(page)).toBe(14);
});

test("«Переводы на главной» выключаются так же, как включаются", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/settings?section=general");
  const toggle = page.getByRole("switch", { name: "Переводы на главной" });

  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("home-include-transfers"))).toBe("0");
});
