import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The filters are the list's own line now — no window to open, no "Применить".
// What matters is that a control takes effect the moment it is touched, that
// the line says what is on, and that a filter can be taken off one at a time.
test.describe("фильтры операций", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
  });

  test("период — две даты, и по умолчанию это текущий месяц", async ({ page }) => {
    await openSettled(page, "/transactions");

    // The screen opens on the current month without being asked: the dates are
    // in the URL, in the fields, and on a chip.
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    const from = page.getByRole("textbox", { name: "С", exact: true });
    const to = page.getByRole("textbox", { name: "По", exact: true });
    const month = new Date();
    const iso = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    await expect(from).toHaveValue(iso(new Date(month.getFullYear(), month.getMonth(), 1)));
    await expect(to).toHaveValue(iso(new Date(month.getFullYear(), month.getMonth() + 1, 0)));

    // Typing over one end keeps the other and applies at once.
    await from.fill("2026-01-05");
    await expect(page).toHaveURL(/from=2026-01-05/);

    const chips = page.getByTestId("filter-chips");
    await expect(chips).toBeVisible();
    await chips
      .getByRole("button", { name: /Убрать фильтр/ })
      .first()
      .click();
    // Taking the period off means "за всё время", not "back to this month".
    await expect(page).toHaveURL(/period=all/);
    await expect(page).not.toHaveURL(/from=/);
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
    // Type and search — the period is a filter too, but this URL names none.
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
