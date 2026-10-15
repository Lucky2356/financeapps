import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Таблица» 2.8: шаблоны мастера, справка открывается сама один раз, график
// итогов, подсветка «выше обычного», единые сокращения месяцев и кнопка «+»,
// которая больше не садится на клетки.

const monthKey = (shift = 0) => {
  const date = new Date();
  const at = new Date(date.getFullYear(), date.getMonth() + shift, 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
};

function cell(page: Page, month: string, column: string) {
  return page.locator(`tr[data-month="${month}"] td[data-col="${column}"]`);
}

/** Мастер с чистого экрана: шаблон по названию или свои категории с «Продуктами». */
async function openWizard(page: Page) {
  await seedExampleData(page);
  await openSettled(page, "/sheet");
  await expect(page.getByTestId("sheet-empty")).toBeVisible();
  await page.getByRole("button", { name: "Создать таблицу" }).click();
  const wizard = page.getByTestId("sheet-wizard");
  await expect(wizard.getByTestId("wizard-articles")).toHaveAttribute("data-loaded", "true");
  return wizard;
}

async function createWithFood(page: Page, food: string, income = "") {
  const wizard = await openWizard(page);
  await wizard.getByRole("button", { name: "Снять все" }).click();
  const foodBox = wizard.getByRole("checkbox", { name: "Продукты" });
  await expect(foodBox).not.toBeChecked();
  // «Снять все» перерисовывает список; галочка, поставленная в ту же минуту,
  // могла слететь вместе с перерисовкой. Ставим, пока не встанет.
  await expect(async () => {
    await foodBox.check();
    await expect(foodBox).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await wizard.getByLabel("Продукты: в месяц").fill(food);
  await wizard.getByLabel("Доход в месяц").fill(income);
  await wizard.getByRole("button", { name: "Создать таблицу" }).click();
  await expect(wizard).toBeHidden();
}

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 820 } });

  test("шаблон «Ремонт»: свои статьи и заметка, полгода", async ({ page }) => {
    test.setTimeout(120_000);
    const wizard = await openWizard(page);
    const templates = wizard.getByTestId("wizard-templates");
    // По умолчанию — свои категории, как раньше.
    await expect(templates.getByRole("radio", { name: /Мои категории/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    for (const name of ["Семейный бюджет", "Ремонт", "Отпуск", "С нуля"]) {
      await expect(templates.getByRole("radio", { name: new RegExp(name) })).toBeVisible();
    }
    await templates.getByRole("radio", { name: /Ремонт/ }).click();
    await expect(wizard.getByTestId("wizard-articles")).toHaveAttribute(
      "data-template",
      "renovation"
    );
    await expect(wizard.getByRole("checkbox", { name: "Работа мастеров" })).toBeChecked();
    await wizard.getByRole("checkbox", { name: "Мебель" }).uncheck();
    await wizard.getByLabel("Работа мастеров: в месяц").fill("40000");
    await wizard.getByLabel("Доход в месяц").fill("50000");
    await wizard.getByRole("button", { name: "Создать таблицу" }).click();
    await expect(wizard).toBeHidden();

    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    const heads = page.locator("thead tr").last();
    await expect(heads).toContainText("Отложено на ремонт");
    await expect(heads).toContainText("Работа мастеров");
    await expect(heads).toContainText("Что сделано");
    await expect(heads).not.toContainText("Мебель");
    await expect(page.locator("tbody tr")).toHaveCount(6);
    await expect(cell(page, monthKey(), "Работа мастеров")).toHaveText("40 000");
  });

  test("шаблон «С нуля»: только остаток и доходы", async ({ page }) => {
    test.setTimeout(120_000);
    const wizard = await openWizard(page);
    await wizard
      .getByTestId("wizard-templates")
      .getByRole("radio", { name: /С нуля/ })
      .click();
    await expect(wizard.getByTestId("wizard-blank")).toBeVisible();
    await wizard.getByRole("button", { name: "Создать таблицу" }).click();
    await expect(wizard).toBeHidden();
    const heads = page.locator("thead tr").last().locator("th");
    await expect(heads).toHaveText([
      /Остаток/,
      /Доходы/,
      /Итог/,
      /Подушка/,
      /В сбережения/,
      /Итог/
    ]);
  });

  test("справка открывается сама только в первый раз, потом — кнопкой", async ({ page }) => {
    test.setTimeout(120_000);
    await createWithFood(page, "10000", "50000");
    await expect(page.getByTestId("sheet-help")).toBeVisible();

    // Не закрывали — и всё равно в следующий раз она не открывается сама.
    await openSettled(page, "/sheet");
    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    await expect(page.getByTestId("sheet-help")).toBeHidden();

    await page.getByRole("button", { name: "Как это работает" }).click();
    await expect(page.getByTestId("sheet-help")).toBeVisible();
    await expect(page.getByTestId("sheet-help")).toContainText("выше обычного");
  });

  test("график итогов: столбики, минус — цветом нехватки, сворачивается и помнит", async ({
    page
  }) => {
    test.setTimeout(120_000);
    // Дохода нет, продукты есть — итог уходит в минус с первого месяца.
    await createWithFood(page, "25000");
    const chart = page.getByTestId("sheet-chart");
    await expect(chart).toContainText("Итог по месяцам");
    const bars = chart.locator(".recharts-bar-rectangle path");
    await expect(bars).toHaveCount(12);
    await expect(bars.first()).toHaveAttribute("fill", /--destructive/);

    await chart.getByRole("button", { name: "Скрыть график итогов" }).click();
    await expect(page.getByTestId("sheet-chart-plot")).toBeHidden();
    await openSettled(page, "/sheet");
    await expect(page.getByTestId("sheet-chart")).toBeVisible();
    await expect(page.getByTestId("sheet-chart-plot")).toBeHidden();
    await page.getByRole("button", { name: "Показать график итогов" }).click();
    await expect(page.getByTestId("sheet-chart-plot")).toBeVisible();
  });

  test("минус в Итоге красный, расход выше обычного подсвечен, месяцы — «Ноя», не «Нояб»", async ({
    page
  }) => {
    test.setTimeout(120_000);
    await createWithFood(page, "10000");
    const total = cell(page, monthKey(), "total");
    await expect(total).toHaveText(/−|-/);
    await expect(total).toHaveClass(/text-destructive/);
    // Красная черта слева — у минуса, не у плюса.
    const bar = (el: Element) => getComputedStyle(el, "::before").backgroundColor;
    expect(await total.evaluate(bar)).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    expect(await total.evaluate((el) => getComputedStyle(el, "::before").content)).not.toBe("none");

    // Четвёртый месяц: продукты вдвое больше трёх прошлых — подсветка с подсказкой.
    const fourth = cell(page, monthKey(3), "Продукты");
    await fourth.click();
    await page.keyboard.type("20000");
    await page.keyboard.press("Enter");
    await expect(fourth).toHaveAttribute("data-above", "100");
    await expect(fourth).toHaveAttribute("title", /Выше обычного на 100%/);
    // Второй месяц той же суммы — истории мало, без подсветки.
    await expect(cell(page, monthKey(1), "Продукты")).not.toHaveAttribute("data-above", /.*/);

    const labels = await page.locator("tbody th").allInnerTexts();
    for (const label of labels) {
      expect(label.trim()).toMatch(/^(Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек) \d{4}$/);
    }
    // В сводке тот же «Итог», что в таблице, а не «Останется».
    await expect(page.getByTestId("sum-total")).toContainText("Итог");
    await expect(page.getByTestId("budget-sheet")).not.toContainText("Останется");
  });

  test("плавающая «+» не садится на прибитый Итог", async ({ page }) => {
    test.setTimeout(120_000);
    await createWithFood(page, "10000", "50000");
    await expect(page.getByTestId("sheet-grid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Быстрое добавление операции" })).toBeHidden();
    // На других экранах она на месте.
    await openSettled(page, "/transactions");
    await expect(page.getByRole("button", { name: "Быстрое добавление операции" })).toBeVisible();
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("последняя строка и «Всего» видны над нижней панелью, справка не открыта", async ({
    page
  }) => {
    test.setTimeout(120_000);
    await createWithFood(page, "10000", "50000");
    await expect(page.getByTestId("sheet-help")).toBeHidden();
    await page.getByTestId("budget-sheet").getByText("Таблица", { exact: true }).click();
    const grid = page.getByTestId("sheet-grid");
    await expect(grid).toBeVisible();
    // Таблица прокручена до конца — и своя прокрутка, и страница. На
    // медленной машине раскладка может доехать позже прокрутки (подгрузка
    // кусочков, шрифты), поэтому прокрутка и замер повторяются, пока
    // страница не устоится; само условие — «Всего» над нижней панелью — то же.
    await expect(async () => {
      await grid.evaluate((el) => (el.scrollTop = el.scrollHeight));
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
      );
      await page.waitForTimeout(200);
      const nav = await page.locator("nav[aria-label]").last().boundingBox();
      const plus = await page
        .getByRole("button", { name: "Быстрое добавление операции" })
        .boundingBox();
      const foot = await grid.locator("tfoot").boundingBox();
      expect(nav && plus && foot).toBeTruthy();
      const top = Math.min(nav!.y, plus!.y);
      expect(foot!.y + foot!.height).toBeLessThanOrEqual(top);
    }).toPass({ timeout: 10_000 });
  });
});
