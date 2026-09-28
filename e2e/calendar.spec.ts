import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Календарь операций: месяц сеткой, день — операции под ним.

test.use({ viewport: { width: 360, height: 740 } });

test("календарь в «Учёте»: суммы по дням и операции выбранного дня", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");
  await page.getByRole("radiogroup", { name: "Вид" }).getByText("Календарь").click();
  await expect(page).toHaveURL(/view=calendar/);

  const calendar = page.getByTestId("transactions-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText(/Расходы за месяц:/)).toBeVisible();

  // В примере траты есть почти каждый день: первый день с суммой — открыть.
  const day = calendar.locator("button[aria-pressed]").filter({ hasText: /\d\s*(т|млн)?$/ });
  await expect(day.first()).toBeVisible();
  const withSum = calendar
    .locator("button[aria-pressed]")
    .filter({ has: page.locator("span.tabular-nums") })
    .first();
  await withSum.click();
  await expect(calendar.locator("ul li").first()).toBeVisible();

  // Сетка целиком в экране телефона.
  const box = (await calendar.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);

  // Назад к списку.
  await page.getByRole("radiogroup", { name: "Вид" }).getByText("Список").click();
  await expect(calendar).toBeHidden();
});
