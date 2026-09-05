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
  await expect(dialog.getByRole("heading", { name: "Расходы" })).toBeVisible();
  await expect(dialog.getByText("Загружаем операции…")).toBeHidden({ timeout: 15_000 });
  expect(await dialog.locator("tbody tr").count()).toBeGreaterThan(0);
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

// A month read at once, or printed. `limit=all` was already understood by the
// ledger — export and duplicate search ask for it — but nothing put the switch
// where the owner could reach it.
test("галочка «на одной странице» убирает разбивку", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  const gear = page.getByRole("button", { name: "Фильтры" });
  await gear.click();
  const toggle = page.getByTestId("one-page-toggle");
  await expect(toggle).toBeVisible();
  // A plain click, not check(): ticking it navigates, and check() waits for a
  // state it can no longer read on the element it clicked.
  await toggle.click();
  await expect(page).toHaveURL(/limit=all/);

  // Nothing is left on another page: what is shown is everything there is.
  const footer = page.getByText(/Показано \d+-\d+ из \d+/);
  await expect(footer).toBeVisible({ timeout: 15_000 });
  const [, to, total] = (await footer.innerText()).match(/Показано \d+-(\d+) из (\d+)/) ?? [];
  expect(to).toBe(total);
  await expect(page.getByRole("link", { name: "Дальше" })).toBeHidden();

  // The panel stays open across the navigation, so the state of its own
  // controls is right there: the picker goes inert rather than vanishing, which
  // is what keeps it obvious what the checkbox is overriding.
  await expect(toggle).toBeChecked();
  await expect(page.locator("#flt-limit")).toBeDisabled();
});
