import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The second round of things the owner hit while using the app. Each one is
// checked the way she hit it — through the interface, on a desktop window,
// which is the surface every one of these reports came from.

test("боковая панель показывает разделы, а Учёт — свои вкладки", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  const sidebar = page.locator("aside");
  for (const name of [
    "Главная",
    "Счета",
    "Категории",
    "Учёт",
    "Лимиты",
    "Цели",
    "Планирование",
    "Аналитика",
    "Инвестиции",
    "Настройки"
  ]) {
    await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
  }

  // The accounting group carries the ledger and the two screens that feed it —
  // and nothing else, now that accounts and categories have their own buttons.
  const tabs = page.locator('[data-testid="hub-tabs"][data-surface="desktop"]');
  await expect(tabs.getByRole("link", { name: "Операции" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Долги" })).toBeVisible();
  // Loading and unloading data is one place now — the settings tab.
  await expect(tabs.getByRole("link", { name: "Данные" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Счета" })).toBeHidden();
});

test("Аналитика собирает прогноз и отчёты", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/analytics");

  const tabs = page.locator('[data-testid="hub-tabs"][data-surface="desktop"]');
  await expect(tabs.getByRole("link", { name: "Прогноз" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Отчёты" })).toBeVisible();
});

// The report was built entirely from the server shell, which is empty by
// design — so it printed a full page of zeros next to screens showing money.
test("в отчёте стоят настоящие суммы, а не нули", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/reports");

  const capital = page.getByText("Капитал (net worth)").locator("..");
  await expect
    .poll(async () => (await capital.innerText()).replace(/\s/g, ""), { timeout: 20_000 })
    .not.toBe("Капитал(networth)0₽");
});

// The example has exactly six spending categories, which is where the old
// legend stopped — so the seventh is added here on purpose: it is the one that
// used to sit in the ring with its own colour and appear nowhere in the list.
test("легенда описывает каждую долю круга, включая седьмую", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/categories");

  const expenseColumn = page.getByTestId("category-column-EXPENSE");
  await expenseColumn.getByRole("button", { name: "Добавить" }).click();
  const categoryDialog = page.getByRole("dialog");
  await categoryDialog.locator('input[name="name"]').fill("Личные");
  await categoryDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(categoryDialog).toBeHidden({ timeout: 15_000 });

  await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
  const quickAdd = page.getByRole("dialog");
  await quickAdd.getByRole("button", { name: "Расход", exact: true }).click();
  await quickAdd.getByLabel("Сумма").fill("3039");
  // Each list must be closed before the next combobox is clicked: a click that
  // lands while the first is still closing is swallowed by its overlay.
  await quickAdd.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Личные" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await quickAdd.getByRole("combobox").nth(1).click();
  await page.getByRole("option").first().click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await quickAdd.getByRole("button", { name: "Добавить" }).click();
  await expect(quickAdd).toBeHidden({ timeout: 15_000 });

  await openSettled(page, "/");
  const card = page
    .getByTestId("breakdown-card")
    .filter({ has: page.getByText("Расходы по категориям") });
  await expect(card.locator("path.recharts-sector").first()).toBeVisible({ timeout: 20_000 });

  const sectors = await card.locator("path.recharts-sector").count();
  expect(sectors).toBeGreaterThan(6);
  const legendRows = await card.getByTestId("breakdown-legend").locator("> div").count();
  expect(legendRows).toBe(sectors);
  await expect(card.getByTestId("breakdown-legend").getByText("Личные")).toBeVisible();
});

test("у категории выбирается иконка, а цветов больше сотни", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/categories");

  await page.getByRole("button", { name: "Добавить" }).first().click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText("Иконка")).toBeVisible();
  await expect(dialog.getByText("Еда и напитки")).toBeVisible();
  await expect(dialog.getByText("Семья и дети")).toBeVisible();

  const swatches = dialog.getByRole("button", { name: /^Цвет #/ });
  expect(await swatches.count()).toBeGreaterThan(100);
});

test("в инвестициях бумаги ищутся по виду актива", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/investments");

  await page
    .getByRole("button", { name: /Добавить (первую )?бумагу/ })
    .first()
    .click();
  const filter = page.getByTestId("asset-kind-filter");
  await expect(filter.getByRole("button", { name: "Облигации" })).toBeVisible();
  await expect(filter.getByRole("button", { name: "Фонды и ПИФы" })).toBeVisible();
  await expect(filter.getByRole("button", { name: "Золото и металлы" })).toBeVisible();
});
