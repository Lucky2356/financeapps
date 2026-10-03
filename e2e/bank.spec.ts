import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Траты из уведомлений банка: предложение на главной → «Записать».
// Само уведомление приходит от Android (BankNotifications.kt) — здесь его
// подкладываем туда же, куда кладёт BankWatch, уже разобранным.

async function suggest(page: Page, items: Array<{ id: string; amount: number; merchant: string }>) {
  await page.evaluate((list) => {
    const now = Date.now();
    const day = new Date(now);
    const pad = (value: number) => String(value).padStart(2, "0");
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const stored = list.map((item, index) => ({
      ...item,
      type: "EXPENSE",
      card: null,
      date,
      at: now - index * 60_000,
      app: "Т-Банк",
      source: `Покупка ${item.amount} ₽, ${item.merchant}`
    }));
    localStorage.setItem("bank-suggestions", JSON.stringify(stored));
  }, items);
}

test("незнакомое место — окно с суммой; знакомое — записано одним нажатием", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);

  await suggest(page, [{ id: "n1", amount: 777, merchant: "Лавка-проверки" }]);
  await openSettled(page, "/");
  const card = page.getByTestId("bank-suggestions");
  await expect(card).toContainText("Лавка-проверки");
  await expect(card).toContainText("777");

  // Категорию не угадать — открывается быстрое добавление, всё уже вписано.
  await card.getByTestId("bank-record").click();
  const form = page.getByRole("dialog");
  await expect(form.locator("#fab-amount")).toHaveValue(/777/);
  await expect(form.locator("#fab-description")).toHaveValue("Лавка-проверки");
  await form.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(card).toBeHidden();

  // То же место ещё раз — категория уже известна, записывается сразу.
  await suggest(page, [{ id: "n2", amount: 333, merchant: "Лавка-проверки" }]);
  await openSettled(page, "/");
  await page.getByTestId("bank-suggestions").getByTestId("bank-record").click();
  await expect(page.getByText(/Записано: 333/)).toBeVisible();
  await expect(page.getByTestId("bank-suggestions")).toBeHidden();

  await openSettled(page, "/transactions?period=all&q=Лавка-проверки");
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("«Не записывать» убирает предложение", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await suggest(page, [
    { id: "d1", amount: 120, merchant: "Кофейня-проверки" },
    { id: "d2", amount: 90, merchant: "Булочная-проверки" }
  ]);
  await openSettled(page, "/");
  const rows = page.getByTestId("bank-suggestion");
  await expect(rows).toHaveCount(2);
  await rows.first().getByTestId("bank-dismiss").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Булочная-проверки");
});
