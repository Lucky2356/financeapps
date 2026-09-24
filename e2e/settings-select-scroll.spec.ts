import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Скриншот владельца: открыл «Провайдер ИИ» — боковая колонка слева
// «улетела куда-то вверх».
//
// Выпадающий список на время открытия запрещает прокрутку страницы: вешает на
// body `overflow: hidden`. У html и body стоял `overflow-x: clip`, а с ним
// overflow body не передаётся окну — body сам становится прокручиваемым
// контейнером, и липкая колонка прилипает уже к нему, то есть к верху
// документа. Страница прокручена — колонка уезжает вверх ровно на прокрутку.
test("боковая колонка стоит на месте, когда открыт выпадающий список", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await seedExampleData(page);
  // Раздел длинный — «Данные»: страницу есть куда прокрутить, и выпадающий
  // список (частота копий) лежит ниже первого экрана.
  await openSettled(page, "/settings?section=data");

  const trigger = page.locator("#set-data").getByRole("combobox").first();
  await trigger.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  const sidebar = page.locator("aside").first();
  const before = (await sidebar.boundingBox())!;
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const after = (await sidebar.boundingBox())!;

  expect(Math.round(after.y)).toBe(Math.round(before.y));
});
