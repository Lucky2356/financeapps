import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Plan/fact is the screen that replaces the spreadsheet kept beside the app:
// categories across the top, months down the side, three bands. The plan band
// is typed in; the other two are read off the ledger.

const digits = (text: string) => Number(text.replace(/[^\d-]/g, ""));

// The newest month is the first row of each band.
const cell = (page: Page, band: string, column: string) =>
  page.locator(`tr[data-band="${band}"]`).first().locator(`td[data-column="${column}"]`);

test("план вводится, факт и разница считаются", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const fact = cell(page, "fact", "Продукты");
  // The screen renders the empty server shell first and swaps in the device's
  // own figures a moment later; the fact column is what tells the two apart.
  await expect
    .poll(async () => digits(await fact.innerText()), { timeout: 20_000 })
    .toBeGreaterThan(0);
  const spent = digits(await fact.innerText());

  const plan = cell(page, "plan", "Продукты");
  await plan.getByRole("button").click();
  await plan.locator("input").fill(String(spent + 1000));
  await plan.locator("input").press("Enter");

  // plan − fact, the same rule in every cell of the band.
  await expect
    .poll(async () => (await cell(page, "diff", "Продукты").innerText()).replace(/\s/g, ""), {
      timeout: 15_000
    })
    .toContain("1000");
});

test("план сохраняется и месяц можно добавить вперёд", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const plan = cell(page, "plan", "Продукты");
  await expect(plan.getByRole("button")).toBeVisible({ timeout: 20_000 });
  await plan.getByRole("button").click();
  await plan.locator("input").fill("31000");
  await plan.locator("input").press("Enter");
  await expect
    .poll(async () => (await plan.innerText()).replace(/\s/g, ""), { timeout: 15_000 })
    .toBe("31000");

  // The figure belongs to the month, not to the session.
  await openSettled(page, "/plan");
  await expect
    .poll(async () => (await cell(page, "plan", "Продукты").innerText()).replace(/\s/g, ""), {
      timeout: 20_000
    })
    .toBe("31000");

  // A month still to come has no operations, so it only appears on request.
  const rows = page.locator('tr[data-band="plan"]');
  const before = await rows.count();
  await page.getByRole("button", { name: "Добавить месяц" }).click();
  await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(before + 1);
});

test("галочка переводов есть в аналитике, отчётах и плане", async ({ page }) => {
  await seedExampleData(page);

  for (const route of ["/analytics", "/reports", "/plan"]) {
    await openSettled(page, route);
    await expect(page.getByTestId("transfers-toggle").first()).toBeVisible({ timeout: 20_000 });
  }
});
