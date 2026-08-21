import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The filter bar replaced a nine-field form that only did anything once you
// found the "Применить" button. What matters now is that a filter takes effect
// the moment it is set, that it says so, and that it can be taken off again
// one at a time.
test.describe("фильтры операций", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
  });

  test("период применяется сразу и снимается чипсом", async ({ page }) => {
    await openSettled(page, "/transactions");

    // Nothing is filtered to begin with, so there are no chips.
    await expect(page.getByTestId("filter-chips")).toHaveCount(0);

    await page.getByRole("combobox").first().click();
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

  test("поиск фильтрует список и показывает себя чипсом", async ({ page }) => {
    await openSettled(page, "/transactions");

    await page.getByRole("textbox", { name: "Поиск", exact: true }).fill("аренда");
    await expect(page).toHaveURL(/q=/, { timeout: 5_000 });
    await expect(page.getByTestId("filter-chips").getByText(/аренда/)).toBeVisible();

    // "Сбросить всё" puts the screen back to unfiltered.
    await page.getByRole("button", { name: "Сбросить всё" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test("счётчик на кнопке считает то, что реально включено", async ({ page }) => {
    await openSettled(page, "/transactions?type=EXPENSE&q=кофе");

    const button = page.getByRole("button", { name: /Фильтры/ });
    await expect(button).toContainText("2");

    await button.click();
    // The window carries what the line has no room for, and closes without
    // applying anything — it has already been applied.
    await expect(page.getByRole("dialog").getByText("Фильтры операций")).toBeVisible();
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/type=EXPENSE/);
  });

  test("«на странице» показывает размер, который правда действует", async ({ page }) => {
    await openSettled(page, "/transactions");
    await page.getByRole("button", { name: /Фильтры/ }).click();

    // The list's own default is 20, and the control used to offer 25/50/100 —
    // so it sat there empty until something was picked.
    await expect(page.locator("#flt-limit")).toHaveText(/^\d+$/);
  });
});
