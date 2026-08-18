import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Plan/fact is the screen that replaces the spreadsheet kept beside the app:
// the plan column is typed in, everything else is read off the ledger.

test("план вводится, факт и разница считаются", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  // The example seeds spending on groceries, so the row exists with a fact and
  // an empty plan. Filling the plan must make the gap appear by itself.
  const row = page.locator("tr").filter({ hasText: "Продукты" }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  // The screen renders the empty server shell first and swaps in the device's
  // own figures a moment later; the fact column is what tells the two apart.
  const factCell = async () =>
    Number((await row.locator("td").nth(2).innerText()).replace(/[^\d]/g, ""));
  await expect.poll(factCell, { timeout: 20_000 }).toBeGreaterThan(0);
  const fact = await factCell();

  await row.locator("input[type=number]").fill(String(fact + 1000));
  await row.locator("input[type=number]").blur();

  await expect
    .poll(async () => (await row.locator("td").nth(3).innerText()).replace(/\s/g, ""), {
      timeout: 15_000
    })
    .toContain("1000");
});

test("план сохраняется и месяц можно переключить", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const row = page.locator("tr").filter({ hasText: "Продукты" }).first();
  await row.locator("input[type=number]").fill("31000");
  await row.locator("input[type=number]").blur();
  await expect
    .poll(async () => row.locator("input[type=number]").inputValue(), { timeout: 15_000 })
    .toBe("31000");

  // Another month is a clean sheet, and coming back finds the figure again.
  const picker = page.getByLabel("Месяц");
  // The picker starts out holding only the current month — the server shell
  // knows nothing — and fills in when the device's own months arrive.
  await expect.poll(() => picker.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
  const options = await picker
    .locator("option")
    .evaluateAll((list) => list.map((option) => (option as HTMLOptionElement).value));
  await picker.selectOption(options[1]);
  await expect
    .poll(async () => row.locator("input[type=number]").inputValue(), { timeout: 15_000 })
    .not.toBe("31000");

  await picker.selectOption(options[0]);
  await expect
    .poll(async () => row.locator("input[type=number]").inputValue(), { timeout: 15_000 })
    .toBe("31000");
});

test("галочка переводов есть в аналитике, отчётах и плане", async ({ page }) => {
  await seedExampleData(page);

  for (const route of ["/analytics", "/reports", "/plan"]) {
    await openSettled(page, route);
    await expect(page.getByTestId("transfers-toggle").first()).toBeVisible({ timeout: 20_000 });
  }
});
