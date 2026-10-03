import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Окна на телефоне — по центру экрана, а не прижаты к верху (жалоба владельца
// на 2.2.0). Но как только появилась клавиатура, окно встаёт к верху и там
// остаётся: иначе, когда клавиатура уходит, оно съезжает из-под пальца
// (см. e2e/quick-add-touch.spec.ts).

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("короткое окно стоит по центру телефона", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  // exact: в первые дни месяца на главной ещё и карточка итогов с кнопкой
  // «Закрыть итоги месяца».
  await page.getByRole("button", { name: "Итоги месяца", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300); // анимация появления
  const box = (await dialog.boundingBox())!;
  const above = box.y;
  const below = 844 - (box.y + box.height);
  expect(Math.abs(above - below)).toBeLessThan(24);
});

test("после клавиатуры окно у верха и остаётся там, когда она уходит", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("1234");
  await page.waitForTimeout(300);
  const centred = (await dialog.boundingBox())!.y;

  // Клавиатура: окно ниже на её высоту.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.waitForTimeout(200);
  const pinned = (await dialog.boundingBox())!.y;
  expect(pinned).toBeLessThanOrEqual(24);

  // Клавиатура ушла — окно не двигается.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  expect((await dialog.boundingBox())!.y).toBe(pinned);
  expect(centred).toBeGreaterThanOrEqual(pinned);
});
