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

  // A month with nothing in it appears only on request — and the request now
  // works in both directions, so an earlier month can be planned too.
  const rows = page.locator('tr[data-band="plan"]');
  const before = await rows.count();
  await page.getByRole("button", { name: "Добавить месяц" }).click();
  await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(before + 1);

  // A pinned month belongs to the data, not to the session.
  await openSettled(page, "/plan");
  await expect.poll(() => rows.count(), { timeout: 20_000 }).toBe(before + 1);
});

test("месяц можно добавить назад, отфильтровать и удалить", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const rows = page.locator('tr[data-band="plan"]');
  await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  const before = await rows.count();

  // A month in the past, which nothing in the ledger would have produced.
  await page.getByLabel("Месяц, который добавить").fill("2020-01");
  await page.getByRole("button", { name: "Добавить месяц" }).click();
  await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(before + 1);
  await expect(page.locator('tr[data-band="plan"][data-month="2020-01"]')).toBeVisible();

  // The period filter hides everything outside it — the point of it on a table
  // that grows by a row a month.
  await page.getByLabel("Период: по какой месяц").fill("2020-06");
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(1);
  await page.getByRole("button", { name: "Показать все месяцы" }).click();
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(before + 1);

  // And it can be taken away again.
  await page
    .locator('tr[data-band="plan"][data-month="2020-01"]')
    .getByRole("button", { name: /Удалить месяц/ })
    .click();
  await page.getByRole("button", { name: "Удалить" }).last().click();
  await expect.poll(() => rows.count(), { timeout: 15_000 }).toBe(before);
});

test("остаток разделён на основные счета и сбережения", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const savings = cell(page, "fact", "savings");
  // The example keeps 260 000 on a savings account and 95 000 with a broker;
  // neither is money on hand, and mixing them in is what made the opening
  // figure useless.
  await expect
    .poll(async () => digits(await savings.innerText()), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(260_000);
  const opening = digits(await cell(page, "fact", "opening").innerText());
  expect(opening).toBeGreaterThan(0);
  expect(opening).toBeLessThan(digits(await savings.innerText()));
});

test("калькулятор в ячейке плана считает и результат сохраняется", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const plan = cell(page, "plan", "Продукты");
  await expect(plan.getByRole("button")).toBeVisible({ timeout: 20_000 });
  await plan.getByRole("button").click();
  await expect(plan.locator("input")).toBeVisible();

  await plan.getByRole("button", { name: "Калькулятор" }).click();
  const calculator = page.getByRole("dialog");
  await calculator.getByLabel("Выражение").fill("12000+3000");
  await calculator.getByRole("button", { name: "Применить" }).click();

  // The result has to land in the cell AND be saved: the first version threw it
  // away, because the cell committed the value it held before the sum.
  await expect
    .poll(async () => (await plan.innerText()).replace(/\s/g, ""), { timeout: 15_000 })
    .toBe("15000");

  await openSettled(page, "/plan");
  await expect
    .poll(async () => (await cell(page, "plan", "Продукты").innerText()).replace(/\s/g, ""), {
      timeout: 20_000
    })
    .toBe("15000");
});

test("галочка переводов есть в аналитике, отчётах и плане", async ({ page }) => {
  await seedExampleData(page);

  for (const route of ["/analytics", "/reports", "/plan"]) {
    await openSettled(page, route);
    await expect(page.getByTestId("transfers-toggle").first()).toBeVisible({ timeout: 20_000 });
  }
});
