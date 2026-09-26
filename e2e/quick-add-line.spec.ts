import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Одна строка вместо четырёх полей: человек пишет «1200 продукты картой», и
// сумма, категория и счёт расходятся по своим полям сами. Разбор — чистая
// функция, и её правила закреплены в tests/parse-entry.test.ts; здесь
// проверяется, что диалог этими правилами действительно пользуется и что
// поправленное руками он больше не трогает.
test.describe("ввод строкой", () => {
  test.beforeEach(async ({ page }) => {
    await seedExampleData(page);
    await openSettled(page, "/");
  });

  test("строка раскладывается по полям, и сохраняется очищенное описание", async ({ page }) => {
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel(/Описание/).fill("1200 продукты картой");

    await expect(dialog.getByLabel("Сумма")).toHaveValue("1200");
    // Счёт назван словом «картой» — в примере это «Дебетовая карта».
    await expect(dialog.getByLabel("Счёт")).toContainText("Дебетовая карта");
    await expect(dialog.getByLabel("Категория")).toContainText("Продукты");
    // Набранное и сохраняемое расходятся, и об этом сказано прямо.
    await expect(page.getByTestId("qa-cleaned")).toContainText("продукты");

    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(dialog).toBeHidden();

    // В журнал ушло «продукты», а не вся набранная строка.
    await openSettled(page, "/transactions?q=продукты");
    await expect(page.getByText("продукты", { exact: true }).first()).toBeVisible();
  });

  test("поправленное руками разбор больше не трогает", async ({ page }) => {
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel(/Описание/).fill("1200 продукты");
    await expect(dialog.getByLabel("Сумма")).toHaveValue("1200");

    // Человек поправил сумму — с этого момента она его, и дописанное в строку
    // её не перебьёт. Иначе исправление молча отменялось бы следующей буквой.
    await dialog.getByLabel("Сумма").fill("999");
    await dialog.getByLabel(/Описание/).fill("1200 продукты картой");
    await expect(dialog.getByLabel("Сумма")).toHaveValue("999");
  });

  test("категория и счёт берутся из последней операции того же типа", async ({ page }) => {
    // Чаще всего следующая операция такая же, как предыдущая: поля открываются
    // заполненными, пустой остаётся только сумма, и курсор стоит в ней.
    await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("qa-repeat-last")).toHaveCount(0);
    await expect(dialog.getByLabel("Категория")).not.toContainText("Выберите категорию");
    await expect(dialog.getByLabel("Счёт")).not.toContainText("Выберите счёт");
    await expect(dialog.getByLabel("Сумма")).toHaveValue("");
    await expect(dialog.getByLabel("Сумма")).toBeFocused();

    // У дохода категория своя — тоже из последнего дохода, а не пустая.
    await dialog.getByRole("button", { name: "Доход", exact: true }).click();
    await expect(dialog.getByLabel("Категория")).not.toContainText("Выберите категорию");
  });
});
