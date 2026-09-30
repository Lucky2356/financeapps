import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Таблица» 2.4: мастер создания, строка выбранной клетки, заметки, показ
// клетки под липким месяцем, копия месяца, предупреждение «не хватит» и режим
// «По месяцам» на телефоне.

const monthKey = (shift = 0) => {
  const date = new Date();
  const at = new Date(date.getFullYear(), date.getMonth() + shift, 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
};

function cell(page: Page, month: string, column: string) {
  return page.locator(`tr[data-month="${month}"] td[data-col="${column}"]`);
}

type Wizard = { food?: string; opening?: string; income?: string; all?: boolean };

/** Мастер: с чистого экрана до готовой таблицы. */
async function createWithWizard(page: Page, options: Wizard) {
  await seedExampleData(page);
  await openSettled(page, "/sheet");
  await expect(page.getByTestId("sheet-empty")).toBeVisible();
  await page.getByRole("button", { name: "Создать таблицу" }).click();
  const wizard = page.getByTestId("sheet-wizard");
  await expect(wizard.getByTestId("wizard-articles")).toHaveAttribute("data-loaded", "true");
  if (options.all) {
    await wizard.getByRole("button", { name: "Выбрать все" }).click();
  } else {
    await wizard.getByRole("button", { name: "Снять все" }).click();
    await wizard.getByRole("checkbox", { name: "Продукты" }).check();
    await wizard.getByLabel("Продукты: в месяц").fill(options.food ?? "");
  }
  await wizard.getByLabel("Сколько денег сейчас").fill(options.opening ?? "");
  await wizard.getByLabel("Доход в месяц").fill(options.income ?? "");
  await wizard.getByRole("button", { name: "Создать таблицу" }).click();
  await expect(wizard).toBeHidden();
}

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("мастер собирает таблицу, строка клетки вводит числа, копия месяца", async ({ page }) => {
    test.setTimeout(120_000);
    const now = monthKey();
    const next = monthKey(1);
    await createWithWizard(page, { food: "25000", opening: "50000", income: "100000" });

    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    await expect(cell(page, now, "Продукты")).toHaveText("25 000");
    // Остаток 50 000 + доход 100 000 − продукты 25 000.
    await expect(cell(page, now, "total")).toHaveText("125 000");
    await expect(page.getByTestId("sum-total")).toContainText("125 000");
    // Следующий месяц: остаток пришёл сам.
    await expect(cell(page, next, "Остаток")).toHaveText("125 000");

    // Строка выбранной клетки: чья клетка и ввод формулой.
    await cell(page, now, "Продукты").click();
    await expect(page.getByTestId("sheet-cell-title")).toContainText("Продукты");
    const bar = page.getByLabel("Ввод в выбранную клетку");
    await bar.fill("=20000+5000+5000");
    await expect(page.getByTestId("sheet-cell-bar")).toContainText("= 30 000");
    await bar.press("Enter");
    await expect(cell(page, now, "Продукты")).toHaveText("30 000");
    await expect(cell(page, now, "total")).toHaveText("120 000");

    // Меню месяца: скопировать числа из прошлого месяца.
    await page.locator(`tr[data-month="${next}"] th button`).click();
    await page.getByRole("button", { name: "Скопировать числа из прошлого месяца" }).click();
    await expect(cell(page, next, "Продукты")).toHaveText("30 000");
    await expect(cell(page, next, "Доходы")).toHaveText("100 000");
    // Остаток при копировании не тронут — он считается сам.
    await expect(cell(page, next, "Остаток")).toHaveText("120 000");
  });

  test("столбец «Заметка»: слова не считаются и не дают ошибку", async ({ page }) => {
    test.setTimeout(120_000);
    const now = monthKey();
    await createWithWizard(page, { food: "1000", opening: "5000", income: "3000" });

    await page.getByRole("button", { name: "Статья", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill("Комментарии");
    await dialog.getByRole("combobox", { name: "Что это" }).click();
    await page.getByRole("option", { name: "Заметка (текст)" }).click();
    // У заметки нет категории учёта.
    await expect(dialog.getByRole("combobox", { name: "Категория в учёте" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Сохранить" }).click();

    // Enter открывает ввод; слова — не цифры, поэтому в текстовом столбце
    // начать можно и с буквы, но Playwright набирает кириллицу без нажатий
    // клавиш, и само «начать печатать» здесь не проверить.
    await cell(page, now, "Комментарии").click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("купили торт");
    await page.keyboard.press("Enter");
    await expect(cell(page, now, "Комментарии")).toHaveText("купили торт");
    await expect(cell(page, now, "Комментарии")).not.toContainText("#!");
    // Итог не изменился: 5 000 + 3 000 − 1 000.
    await expect(cell(page, now, "total")).toHaveText("7 000");
  });

  test("предупреждение, когда денег не хватит", async ({ page }) => {
    test.setTimeout(120_000);
    await createWithWizard(page, { food: "5000", opening: "0", income: "1000" });
    const warning = page.getByTestId("sheet-shortfall");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("не хватит");
  });
});

test.describe("узкое окно ПК", () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test("выбранная клетка не прячется под столбец «Месяц»", async ({ page }) => {
    test.setTimeout(120_000);
    await createWithWizard(page, { all: true, opening: "1000", income: "1000" });
    const grid = page.getByTestId("sheet-grid");
    await cell(page, monthKey(), "Остаток").click();
    await grid.focus();
    for (let step = 0; step < 14; step += 1) await page.keyboard.press("ArrowRight");

    const selected = await page.locator('td[aria-selected="true"]').boundingBox();
    const month = await page.locator("tbody th").first().boundingBox();
    const frame = await grid.boundingBox();
    expect(selected && month && frame).toBeTruthy();
    // Левый край клетки правее столбца с месяцами, правый — внутри рамки.
    expect(selected!.x).toBeGreaterThanOrEqual(month!.x + month!.width - 1);
    expect(selected!.x + selected!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("«По месяцам»: карточка месяца, стрелки, правка в окне", async ({ page }) => {
    test.setTimeout(120_000);
    await createWithWizard(page, { food: "25000", opening: "10000", income: "50000" });

    const view = page.getByTestId("sheet-month-view");
    await expect(view).toBeVisible();
    await expect(page.getByTestId("sheet-grid")).toBeHidden();
    const title = page.getByTestId("month-view-title");
    const before = await title.textContent();

    // Нажали статью — ввод в окне.
    await view.getByTestId("month-cell").filter({ hasText: "Продукты" }).tap();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Число или формула").fill("12345");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(view.getByTestId("month-cell").filter({ hasText: "Продукты" })).toContainText(
      "12 345"
    );

    await page.getByRole("button", { name: "Следующий месяц" }).tap();
    await expect(title).not.toHaveText(before ?? "");
    // Страница вбок не едет.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
