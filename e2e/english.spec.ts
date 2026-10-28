import { expect, test } from "@playwright/test";

import { fakeExchange } from "./fake-exchange";
import { openSettled } from "./helpers";

// GUARD: английская версия — целиком по-английски.
//
// Перевод долго шёл «где успели»: оболочка по-английски, а категории,
// пример, ошибки, вкладка Таблицы, заголовок окна — по-русски. Здесь
// английский выбран с первого запуска, загружен пример, и на каждом экране
// не должно быть ни одной русской строки — ни в тексте, ни в подписях для
// экранного диктора, подсказках и полях ввода. Исключение одно: название
// русского языка в переключателе языков пишется по-русски нарочно.

const ROUTES = [
  "/",
  "/transactions",
  "/accounts",
  "/debts",
  "/categories",
  "/budgets",
  "/goals",
  "/recurring",
  "/subscriptions",
  "/analytics",
  "/forecast",
  "/reports",
  "/reports/month",
  "/plan",
  "/investments",
  "/sheet",
  "/cashback",
  "/trips",
  "/family",
  "/deductions",
  "/what-if",
  "/import",
  "/settings"
];

const ALLOWED = new Set(["Русский"]);

test.use({ locale: "en-US" });

test("английская версия: ни одной русской строки на экранах", async ({ page }) => {
  test.setTimeout(600_000);
  // Биржа — своя, как в проверках инвестиций: настоящая в CI то отвечает, то
  // нет, а ответила — и имена бумаг приходят с неё, по-русски и латиницей.
  await fakeExchange(page);
  await page.addInitScript(() => window.localStorage.setItem("app-locale", "en"));
  await page.goto("/");
  const button = page.getByRole("button", { name: "Load example" });
  await button.waitFor({ state: "visible", timeout: 30_000 });
  // Пример записывается — и приложение перечитывает себя; метка на окне
  // пропадает с перезагрузкой (см. loadExample в helpers.ts).
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__seedMark = true;
  });
  await button.click();
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as Record<string, unknown>).__seedMark !== true),
      { timeout: 30_000 }
    )
    .toBe(true);

  const found: string[] = [];
  for (const route of ROUTES) {
    await openSettled(page, route);
    // Карточки ниже первого экрана монтируются, когда до них долистали.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
    await page.waitForTimeout(500);
    const russian = await page.evaluate(() => {
      const out = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          node.parentElement?.closest("script, style, noscript")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT
      });
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? "").trim();
        if (/[А-Яа-яЁё]/.test(text)) out.add(text.slice(0, 80));
      }
      for (const el of Array.from(
        document.querySelectorAll("[aria-label], [title], [placeholder]")
      )) {
        for (const attr of ["aria-label", "title", "placeholder"]) {
          const value = el.getAttribute(attr) ?? "";
          if (/[А-Яа-яЁё]/.test(value)) out.add(`${attr}=${value.slice(0, 80)}`);
        }
      }
      if (/[А-Яа-яЁё]/.test(document.title)) out.add(`title: ${document.title}`);
      return [...out];
    });
    for (const text of russian) if (!ALLOWED.has(text)) found.push(`${route}: ${text}`);
  }
  expect(found).toEqual([]);
});
