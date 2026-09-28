import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Можно тратить сегодня» — узкая полоса под сводкой, расчёт раскрывается по
// нажатию. В 2.2.0 она была крупной карточкой в самом верху — владелец счёл
// это некрасивым.

test.use({ viewport: { width: 360, height: 740 } });

test("главная показывает, сколько можно тратить сегодня", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const card = page.getByTestId("daily-allowance");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(
    card.getByText(/в день до конца месяца|Потрачено .* из |больше, чем позволяет месяц/).first()
  ).toBeVisible();

  // Под сводкой, а не над ней.
  const cardTop = (await card.boundingBox())!.y;
  const overviewTop = (await page.getByRole("heading", { name: "Обзор" }).first().boundingBox())!.y;
  expect(cardTop).toBeGreaterThan(overviewTop);
  // Узкая: одна строка, а не карточка на полэкрана.
  expect((await card.boundingBox())!.height).toBeLessThan(90);

  const row = card.getByRole("button", { name: /Можно тратить сегодня/ });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(card.getByText("Платежи до конца месяца")).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});
