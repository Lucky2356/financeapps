import { expect, test, type Locator, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

/** A fact cell of the newest month in the plan grid. */
const factCell = (page: Page, column: string) =>
  page.locator('tr[data-band="fact"]').first().locator(`td[data-column="${column}"]`);

/** Clicks the figure in a cell and hands back the dialog it opened. */
async function openDrilldown(page: Page, cell: Locator) {
  const figure = cell.getByRole("button");
  await expect(figure).toBeVisible({ timeout: 20_000 });
  await figure.click();
  const dialog = page.getByTestId("drilldown");
  await expect(dialog).toBeVisible();
  return dialog;
}

// Every total in the app is a sum of rows in the ledger, and until now the only
// way to see which rows was to leave the screen and rebuild the same filters by
// hand on the operations page. They rarely matched — the period alone is easy
// to get wrong by a day — so a figure that looked wrong could not be checked.

test("число факта в плане раскрывается в операции, из которых сложилось", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const fact = factCell(page, "Продукты");
  await expect(fact.getByRole("button")).toBeVisible({ timeout: 20_000 });
  const shown = Number((await fact.innerText()).replace(/[^\d-]/g, ""));
  expect(shown).toBeGreaterThan(0);

  const dialog = await openDrilldown(page, fact);
  await expect(dialog.getByRole("heading", { name: "Продукты" })).toBeVisible();

  // The sum of the rows listed has to be the figure that was clicked; a list
  // filtered even slightly differently is worse than no list at all.
  await expect
    .poll(
      async () =>
        Number((await dialog.getByTestId("drill-total").innerText()).replace(/[^\d-]/g, "")),
      { timeout: 15_000 }
    )
    .toBe(shown);
});

test("итог расходов раскрывается так же, как отдельная категория", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  const dialog = await openDrilldown(page, factCell(page, "expense-total-main"));
  await expect(dialog.getByRole("heading", { name: "Расходы · Основные" })).toBeVisible();
  await expect(dialog.getByText("Загружаем операции…")).toBeHidden({ timeout: 15_000 });
  expect(await dialog.locator("tbody tr").count()).toBeGreaterThan(0);
});

// «Основные» и «Сбережения» — разные итоги, и расшифровка у каждого своя:
// сумма строк в окне равна той цифре, по которой нажали.
test("итоги основных и сбережений расшифровываются раздельно", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/plan");

  let opened = 0;
  for (const column of [
    "income-total-main",
    "income-total-savings",
    "expense-total-main",
    "expense-total-savings"
  ]) {
    const cell = factCell(page, column);
    // Ноль — не кнопка: расшифровывать нечего.
    if ((await cell.getByRole("button").count()) === 0) continue;
    const shown = Number((await cell.innerText()).replace(/[^\d-]/g, ""));
    const dialog = await openDrilldown(page, cell);
    await expect
      .poll(
        async () =>
          Number((await dialog.getByTestId("drill-total").innerText()).replace(/[^\d-]/g, "")),
        { timeout: 15_000 }
      )
      .toBe(shown);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    opened += 1;
  }
  expect(opened).toBeGreaterThan(1);
});

test("строка легенды на главной раскрывается в операции", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const legend = page.getByTestId("breakdown-legend").last();
  await expect(legend).toBeVisible({ timeout: 20_000 });
  await legend.locator("> div > button").first().click();

  const dialog = page.getByTestId("drilldown");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Загружаем операции…")).toBeHidden({ timeout: 15_000 });
});

// Сумма над списком — по всему фильтру, а не по странице. Прежде она
// складывалась из строк страницы и сходилась с аналитикой только с галочкой
// «На одной странице»; галочки больше нет — она не нужна.
test("итоги над списком не зависят от размера страницы", async ({ page }) => {
  await seedExampleData(page);
  const totalsAt = async (limit: number) => {
    await openSettled(page, `/transactions?limit=${limit}`);
    const line = page.getByText(/Итоговый поток:/);
    await expect(line).toBeVisible({ timeout: 15_000 });
    return (await line.locator("..").innerText()).replace(/\s+/g, " ");
  };
  const small = await totalsAt(10);
  const large = await totalsAt(100);
  expect(small).toBe(large);

  await page.getByRole("button", { name: "Фильтры" }).click();
  await expect(page.getByTestId("more-filters-panel")).toBeVisible();
  await expect(page.getByTestId("one-page-toggle")).toHaveCount(0);
});
