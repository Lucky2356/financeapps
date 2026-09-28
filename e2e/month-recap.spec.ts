import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Итоги месяца» — в первые дни нового месяца, один раз.

test.use({ viewport: { width: 390, height: 844 } });

test("в начале месяца — итоги прошлого; закрыл — больше нет", async ({ page }) => {
  // Третье число: пример строится от «сегодня», так что прошлый месяц в нём есть.
  await page.clock.setFixedTime(new Date(2026, 9, 3, 10, 0, 0));
  await seedExampleData(page);
  await openSettled(page, "/");

  const recap = page.getByTestId("month-recap");
  await expect(recap).toBeVisible({ timeout: 20_000 });
  await expect(recap.getByRole("heading", { name: "Итоги сентября" })).toBeVisible();
  await expect(recap.getByText("Больше всего ушло на")).toBeVisible();

  await recap.getByRole("button", { name: "Закрыть итоги месяца" }).click();
  await expect(recap).toBeHidden();
  await openSettled(page, "/");
  await expect(page.getByTestId("month-recap")).toHaveCount(0);
});

test("в середине месяца итогов нет", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 15, 10, 0, 0));
  await seedExampleData(page);
  await openSettled(page, "/");
  await expect(page.getByTestId("daily-allowance")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("month-recap")).toHaveCount(0);
});

test("кнопка «Итоги месяца» — в любой день, месяц на сегодня и прошлые", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 15, 10, 0, 0));
  await seedExampleData(page);
  await openSettled(page, "/");

  await page.getByRole("button", { name: "Итоги месяца" }).click();
  const dialog = page.getByTestId("month-recap-dialog");
  await expect(dialog.getByRole("heading", { name: "Итоги октября на 15-е" })).toBeVisible();
  // Дальше текущего месяца листать некуда.
  await expect(dialog.getByRole("button", { name: "Позже" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Раньше" }).click();
  await expect(dialog.getByRole("heading", { name: "Итоги сентября" })).toBeVisible();
  await expect(dialog.getByText("Больше всего ушло на")).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});
