import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Adding an operation now has exactly one door: the round button. The
// operations screen used to carry a second one, and removing it must not have
// removed anything it could do — the category guessed from the description and
// the tags both had to move here.
test.describe("быстрое добавление", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
  });

  test("создаёт расход с описанием и тегом", async ({ page }) => {
    await openSettled(page, "/");
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Сумма").fill("1234");
    await dialog.getByLabel("Категория").click();
    await page.getByRole("option", { name: "Продукты" }).click();
    await dialog.getByLabel(/Описание/).fill("Магазин у дома");
    await dialog.getByLabel(/Теги/).fill("проверка");
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(dialog).toBeHidden();

    // The row is in the ledger, with the tag it was given.
    await openSettled(page, "/transactions?q=Магазин у дома");
    await expect(page.getByText("Магазин у дома").first()).toBeVisible();
    await openSettled(page, "/transactions?tag=проверка");
    await expect(page.getByText("Магазин у дома").first()).toBeVisible();
  });

  test("подставляет категорию по описанию", async ({ page }) => {
    await openSettled(page, "/");
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Сумма").fill("700");
    // The example ledger already has "Продукты" spending described that way, so
    // the history heuristic has something to learn from.
    await dialog.getByLabel(/Описание/).fill("Продукты");
    await expect(dialog.getByLabel("Категория")).toContainText("Продукты", { timeout: 10_000 });
  });

  test("на экране операций не осталось кнопок добавления", async ({ page }) => {
    await openSettled(page, "/transactions");
    // The screen's header carries filters only: everything that records
    // something moved to the round button.
    await expect(page.getByRole("button", { name: "Добавить операцию", exact: true })).toHaveCount(
      0
    );
    await expect(page.locator('main [aria-label="Перевод"]')).toHaveCount(0);
  });

  test("перевод живёт в круглой кнопке, и больше ничего", async ({ page }) => {
    await openSettled(page, "/");
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();

    const dialog = page.getByRole("dialog");
    // Three ways to record something: spending, income, and money changing
    // pocket. "Разбить" is gone — it was a fourth kind of form for what is
    // simply several operations.
    await expect(dialog.getByRole("button", { name: "Расход", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Доход", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Перевод", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Разбить", exact: true })).toHaveCount(0);
  });
});
