import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Можно тратить сегодня» — наверху главной, и расчёт можно раскрыть.

test.use({ viewport: { width: 360, height: 740 } });

test("главная показывает, сколько можно тратить сегодня", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const card = page.getByTestId("daily-allowance");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(
    card.getByText(/в день до конца месяца|больше, чем позволяет месяц/).first()
  ).toBeVisible();

  // Наверху: выше обзора.
  const cardTop = (await card.boundingBox())!.y;
  const overviewTop = (await page.getByRole("heading", { name: "Обзор" }).first().boundingBox())!.y;
  expect(cardTop).toBeLessThan(overviewTop);

  await card.getByRole("button", { name: "Из чего складывается" }).click();
  await expect(card.getByText("Платежи до конца месяца")).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});
