import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Что если»: ответ на покупку и кредит — до того, как тратить.

test("покупка со счетов и кредит: ответ, подушка, платёж и цели", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await openSettled(page, "/what-if");
  await expect(page.getByText(/Впишите сумму/)).toBeVisible();

  await page.locator("#wi-amount").fill("30000");
  const verdict = page.getByTestId("what-if-verdict");
  await expect(verdict).toHaveAttribute("data-verdict", "ok");
  await expect(page.getByTestId("what-if-year")).toBeVisible();

  // Слишком дорого для счетов — честное «не стоит» с недостачей.
  await page.locator("#wi-amount").fill("5000000");
  await expect(verdict).toHaveAttribute("data-verdict", "danger");
  await expect(verdict).toContainText("не хватает");

  // Кредит: платёж и переплата.
  await page.locator("#wi-amount").fill("300000");
  await page.getByText("Кредит / рассрочка", { exact: true }).click();
  await page.locator("#wi-rate").fill("20");
  await expect(page.getByTestId("what-if-payment")).toContainText("27 790");
  await expect(page.getByTestId("what-if-path")).toBeVisible();
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("на узком экране всё в столбик и читается", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/what-if");
    await page.locator("#wi-amount").fill("50000");
    await expect(page.getByTestId("what-if-verdict")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
