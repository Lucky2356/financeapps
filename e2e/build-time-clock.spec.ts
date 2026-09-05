import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: экраны обязаны открываться в том месяце, в котором живёт человек, а не
// в том, в котором собрали приложение.
//
// Это самый частый баг этого проекта, и всегда один и тот же корень: статический
// экспорт считает данные страницы во время СБОРКИ. `data.selectedMonth`,
// `data.period` и всё, что выведено из «сегодня», замерзают на дате релиза, а
// экран показывает их как текущее. Приложение, собранное в августе, открывало
// лимиты на августе весь сентябрь — рядом со списком месяцев, который читал
// настоящие часы и сентябрь уже предлагал.
//
// Проверить это обычным тестом нельзя: сборка и прогон происходят в один день,
// поэтому «месяц сборки» и «месяц запуска» совпадают, и ошибка не видна. Здесь
// часы страницы переводятся на дату, до которой не доживёт ни одна сборка, — и
// тогда любое замороженное значение сразу расходится с ожидаемым.
//
// setFixedTime, а не install: подменяется только ответ Date, таймеры продолжают
// идти. Приложение анимирует, опрашивает и ждёт — с остановленными таймерами оно
// просто не догрузится, и тест проверял бы не то.
const FUTURE = new Date("2031-07-15T10:00:00");
const EXPECTED_MONTH = "2031-07";
const EXPECTED_FIRST = "2031-07-01";
const EXPECTED_LAST = "2031-07-31";

test.describe("экраны открываются в месяце запуска, а не сборки", () => {
  test.beforeEach(async ({ page }) => {
    // Пример заводится на настоящих часах: подмена нужна экранам, а не данным.
    await seedExampleData(page);
    await page.clock.setFixedTime(FUTURE);
  });

  test("лимиты", async ({ page }) => {
    await openSettled(page, "/budgets");

    // Месяц виден дважды — в выбранном значении и в списке, который читает часы
    // напрямую. Именно их расхождение и было багом, поэтому проверяются оба.
    await expect(page.getByRole("combobox").first()).toContainText("2031");
    await expect(page.getByRole("combobox").first()).toContainText(/июл/i);
  });

  test("план/факт", async ({ page }) => {
    await openSettled(page, "/plan");

    await expect(page.getByLabel("Период: с какой даты")).toHaveValue(EXPECTED_FIRST);
    await expect(page.getByLabel("Период: по какую дату")).toHaveValue(EXPECTED_LAST);
  });

  test("операции", async ({ page }) => {
    await openSettled(page, "/transactions");

    // Список операций сам ставит текущий месяц в адрес при открытии без
    // фильтров — значит и поля дат обязаны показать его же.
    await expect(page.getByLabel("С", { exact: true })).toHaveValue(EXPECTED_FIRST);
    await expect(page.getByLabel("По", { exact: true })).toHaveValue(EXPECTED_LAST);
    expect(page.url()).toContain(EXPECTED_MONTH);
  });
});
