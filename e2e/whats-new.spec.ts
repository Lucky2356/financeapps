import { expect, test } from "@playwright/test";

import { openSettled } from "./helpers";

// «Что нового» — один раз после обновления. Обновление изображаем так, как его
// видит приложение: версия, которую человек «уже видел», старше текущей.

test.use({ viewport: { width: 360, height: 740 } });

test("после обновления окно «Что нового» — один раз, и влезает в телефон", async ({ page }) => {
  await openSettled(page, "/");
  await page.evaluate(() => localStorage.setItem("whats-new-seen", "1.0.0"));
  await openSettled(page, "/");

  const dialog = page.getByTestId("whats-new");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("heading", { name: /^(Что нового|Исправления) в / })).toBeVisible();

  // Окно в экране целиком: кнопка «Понятно» достижима прокруткой внутри него.
  const box = await dialog.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
  await dialog.getByRole("button", { name: "Понятно" }).click();
  await expect(dialog).toBeHidden();

  await openSettled(page, "/");
  await expect(page.getByTestId("whats-new")).toHaveCount(0);
});

test("из настроек — история последних выпусков", async ({ page }) => {
  await openSettled(page, "/settings?section=about");
  await page.getByRole("button", { name: "Посмотреть" }).click();
  await expect(page.getByTestId("whats-new")).toBeVisible();
  await expect(page.getByText("Раньше")).toBeVisible();
});
