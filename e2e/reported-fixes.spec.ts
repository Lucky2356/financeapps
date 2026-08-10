import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The six things the owner reported after using the app for real. Each one is
// checked the way she hit it — through the interface, not through the code that
// happens to implement it.

test("удаление операции спрашивает подтверждение и его можно отменить", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  const rows = page.locator("tbody tr");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await rows.first().getByRole("button", { name: "Удалить операцию" }).click();

  // The point of the dialog: a mis-tap must be recoverable, so "Отмена" has to
  // leave the operation exactly where it was.
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText("Удалить операцию?")).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена" }).click();

  await expect(rows).toHaveCount(before);
});

test("быстрое добавление умеет переводы между счетами", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Расход" })).toBeVisible();

  await dialog.getByRole("button", { name: "Перевод", exact: true }).click();

  // A transfer moves money between two of your own accounts, so it asks for
  // both and stops asking for a category.
  await expect(dialog.getByText("Списать со счета")).toBeVisible();
  await expect(dialog.getByText("Зачислить на счет")).toBeVisible();
  await expect(dialog.getByText("Категория")).toBeHidden();
});

test("на главной есть разбивка и по расходам, и по доходам", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  await expect(page.getByText("Расходы по категориям").first()).toBeVisible();
  await expect(page.getByText("Доходы по категориям").first()).toBeVisible();
});

test("в аналитике есть структура доходов рядом со структурой расходов", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/analytics");

  // The analytics view (and Recharts with it) is code-split, so it mounts a
  // beat after the route settles.
  // By heading, not by text: the page description mentions "структура расходов"
  // in prose too.
  await expect(page.getByRole("heading", { name: "Структура расходов" })).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("heading", { name: "Структура доходов" })).toBeVisible({
    timeout: 20_000
  });
});

// The panel remembers that it was open, but used to forget to load anything —
// so coming back showed "не удалось посчитать" about a calculation that had
// never been attempted.
test("аналитика в учёте сама считается после возврата на экран", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/transactions");

  const panel = page.getByRole("button", { name: /Аналитика по операциям/ });
  await panel.click();
  await expect(page.getByText("Доход в месяц")).toBeVisible({ timeout: 15_000 });

  await openSettled(page, "/");
  await openSettled(page, "/transactions");

  await expect(page.getByText("Не удалось посчитать аналитику")).toBeHidden();
  await expect(page.getByText("Доход в месяц")).toBeVisible({ timeout: 15_000 });
});

// Adding an operation from the floating button used to leave every figure on
// screen untouched: the write went to storage, but nothing on the page re-read
// it until the screen was navigated away from and back.
test("суммы на главной пересчитываются сразу после новой операции", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const incomeTile = page.getByRole("link", { name: /Доходы за месяц/ });
  const before = (await incomeTile.innerText()).replace(/\s/g, "");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Доход", exact: true }).click();
  await dialog.getByLabel("Сумма").fill("54321");

  // Pick the first offered category and account.
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option").first().click();

  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await expect
    .poll(async () => (await incomeTile.innerText()).replace(/\s/g, ""), { timeout: 15_000 })
    .not.toBe(before);
});
