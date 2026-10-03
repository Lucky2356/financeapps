import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// 2.6: новые карточки на своих местах и сверка с банком целиком.

test("новые карточки: итоги года, отчёт за месяц, история остатка, сравнение месяцев", async ({
  page
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);

  await openSettled(page, "/reports");
  await expect(page.getByTestId("year-recap")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("month-report-link").click();
  await expect(page.getByTestId("month-report")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Печать или PDF" })).toBeVisible();

  await openSettled(page, "/accounts");
  await expect(page.getByTestId("balance-history")).toBeVisible({ timeout: 20_000 });

  await openSettled(page, "/analytics");
  await expect(page.getByTestId("compare-months")).toBeVisible({ timeout: 20_000 });
});

test("сверка с банком: разница записывается, и остаток становится банковским", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await openSettled(page, "/accounts");

  await page.getByTestId("reconcile-open").first().click();
  const dialog = page.getByTestId("reconcile-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("reconcile-bank").fill("1");
  await expect(dialog.getByTestId("reconcile-diff")).toBeVisible();
  await dialog.getByTestId("reconcile-record").click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // Тот же счёт ещё раз: теперь сходится.
  await page.getByTestId("reconcile-open").first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("reconcile-bank").fill("1");
  await expect(dialog.getByTestId("reconcile-match")).toBeVisible();
});
