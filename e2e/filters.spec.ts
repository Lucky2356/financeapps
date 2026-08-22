import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The filters are the list's own line now — no window to open, no "Применить".
// What matters is that a control takes effect the moment it is touched, that
// the line says what is on, and that a filter can be taken off one at a time.
test.describe("фильтры операций", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
  });

  test("период применяется сразу и снимается чипсом", async ({ page }) => {
    await openSettled(page, "/transactions");

    // Nothing is filtered to begin with, so there are no chips.
    await expect(page.getByTestId("filter-chips")).toHaveCount(0);

    await page.getByRole("combobox", { name: "Период" }).click();
    await page.getByRole("option", { name: "Этот месяц" }).click();

    // The URL is the filter — no apply step in between.
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
    const chips = page.getByTestId("filter-chips");
    await expect(chips).toBeVisible();
    await expect(chips.getByText("Этот месяц")).toBeVisible();

    await chips
      .getByRole("button", { name: /Убрать фильтр/ })
      .first()
      .click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(page.getByTestId("filter-chips")).toHaveCount(0);
  });

  test("тип фильтрует, включая переводы", async ({ page }) => {
    await openSettled(page, "/transactions");

    await page.getByRole("combobox", { name: "Тип" }).click();
    await page.getByRole("option", { name: "Перевод", exact: true }).click();
    await expect(page).toHaveURL(/type=TRANSFER/);

    // Both halves of a transfer are ordinary rows, so this is the one filter
    // that cannot be answered by the row's own type.
    await expect(page.getByTestId("filter-chips").getByText("Перевод")).toBeVisible();
  });

  test("категория выбирается прямо со строки", async ({ page }) => {
    await openSettled(page, "/transactions");

    await page.getByRole("button", { name: "Категория", exact: true }).click();
    const menu = page.getByTestId("category-filter-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("option", { name: "Продукты" }).first().click();

    await expect(page).toHaveURL(/categoryId=/);
    await expect(page.getByTestId("filter-chips").getByText("Продукты")).toBeVisible();
  });

  test("поиск фильтрует список и показывает себя чипсом", async ({ page }) => {
    await openSettled(page, "/transactions");

    await page.getByRole("textbox", { name: "Поиск", exact: true }).fill("аренда");
    await expect(page).toHaveURL(/q=/, { timeout: 5_000 });
    await expect(page.getByTestId("filter-chips").getByText(/аренда/)).toBeVisible();

    // "Сбросить всё" puts the screen back to unfiltered.
    await page.getByRole("button", { name: "Сбросить всё" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test("счётчик на шестерёнке считает то, что реально включено", async ({ page }) => {
    await openSettled(page, "/transactions?type=EXPENSE&q=кофе");

    const gear = page.getByRole("button", { name: "Фильтры" });
    await expect(gear).toContainText("2");

    // The panel is not a window: it carries the rare settings and applies them
    // on the spot, with the list still visible behind it.
    await gear.click();
    // The list's own default is 20, and the control used to offer 25/50/100 —
    // so it sat there empty until something was picked.
    await expect(page.locator("#flt-limit")).toHaveText(/^\d+$/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#flt-limit")).toHaveCount(0);
    await expect(page).toHaveURL(/type=EXPENSE/);
  });
});
