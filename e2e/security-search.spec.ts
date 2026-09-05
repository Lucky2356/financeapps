import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: поиск бумаг работает так же, как в банковском приложении, — с
// клавиатуры и не с пустого листа.
//
// Раньше результаты были просто кнопками: стрелками по ним не пройти, Enter
// ничего не выбирал, а пока не набрано ни буквы — пустота. Механизм «стрелки и
// Enter» общий с командной строкой (hooks/use-list-keyboard.ts).
//
// Встроенный пример не заводит инвестиций, поэтому «свои бумаги» на нём пусты —
// проверяется вторая половина того же списка, недавно выбранные. Она и
// показывает, что пустое поле перестало быть пустым.
async function openAddPosition(page: Page) {
  await page
    .getByRole("button", { name: /Добавить (первую )?бумагу/ })
    .first()
    .click();
  return page.getByTestId("security-search-results");
}

test("выбор делается с клавиатуры, и выбранное запоминается", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/investments");

  const results = await openAddPosition(page);
  const field = page.getByRole("dialog").getByRole("textbox").first();
  // Одна буква, а не тикер целиком: строк должно быть несколько, иначе
  // стрелкам некуда двигаться. Точное совпадение тикера даёт ровно одну строку —
  // и в запасном наборе бумаг, которым приложение пользуется без сети, тоже.
  await field.fill("S");

  // Ждём саму выдачу, а не время: поиск ходит на биржу.
  await expect(results.locator("button").first()).toBeVisible({ timeout: 20_000 });

  // Первая строка подсвечена сразу — Enter на ней и есть «выбрать найденное».
  await expect(results.locator("button[data-active='true']")).toHaveCount(1);
  await expect
    .poll(async () => results.locator("button").count(), { timeout: 20_000 })
    .toBeGreaterThan(1);

  await field.press("ArrowDown");
  await expect(results.locator("button").nth(1)).toHaveAttribute("data-active", "true");
  await field.press("ArrowUp");
  await expect(results.locator("button").first()).toHaveAttribute("data-active", "true");

  const picked = (await results.locator("button").first().textContent()) ?? "";
  const ticker = picked.trim().split(/\s/)[0];
  expect(ticker).toBeTruthy();

  await field.press("Enter");
  // Бумага выбрана — поле поиска уступает место выбранной строке.
  await expect(results).toHaveCount(0, { timeout: 20_000 });

  // Второй заход: ничего не набирая, приложение предлагает то, что уже искали.
  await page.getByRole("button", { name: "Закрыть" }).first().click();
  const again = await openAddPosition(page);
  await expect(page.getByText("Ваши бумаги и недавние")).toBeVisible();
  await expect(again.getByText(ticker, { exact: false }).first()).toBeVisible();
});
