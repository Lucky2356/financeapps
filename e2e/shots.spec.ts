import { test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Not a check — a camera. Captures the screens this release changed, so they
// can be judged by eye. Run on demand:
//   npx playwright test e2e/shots.spec.ts
// Screenshots land in the folder given by SHOTS_DIR (default "shots/").
const DIR = process.env.SHOTS_DIR ?? "shots";

// Recharts paints its marks a beat after the data lands, and a fixed pause is a
// guess — the first run of this file caught empty axes and looked like a bug in
// the charts. Wait for the marks themselves instead.
async function chartsPainted(page: import("@playwright/test").Page, selector: string) {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function setTheme(page: import("@playwright/test").Page, theme: "Тёмная" | "Светлая") {
  await openSettled(page, "/settings");
  const skip = page.getByRole("button", { name: "Пропустить обучение" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole("button", { name: "Внешний вид" }).click();
  await page.getByText(theme, { exact: true }).click();
  await page.waitForTimeout(600);
}

test.describe("скриншоты", () => {
  // A tall viewport instead of fullPage: a full-page shot resizes the window,
  // and the charts rebuild themselves from zero when it does — which is how the
  // first attempt produced empty axes.
  test.use({ colorScheme: "light", viewport: { width: 1360, height: 2200 } });

  test("тёмная тема", async ({ page }) => {
    test.setTimeout(180_000);
    await seedExampleData(page);
    await setTheme(page, "Тёмная");

    // The filter bar inside the list it filters, with the active filters as
    // chips underneath.
    await openSettled(page, "/transactions?type=EXPENSE&categoryId=cat-food&minAmount=1000");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/01-фильтры-тёмная.png` });

    // What sits behind "Фильтры".
    await page.getByRole("button", { name: /Фильтры/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/02-фильтры-окно.png` });
    await page.keyboard.press("Escape");

    await openSettled(page, "/analytics");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/03-аналитика-тёмная.png` });

    // The investments analytics: one switchable breakdown instead of three
    // donuts, and the panels below it folded.
    await openSettled(page, "/investments");
    await page.getByTestId("section-tabs").getByRole("button", { name: "Аналитика" }).click();
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/04-инвестиции-аналитика.png` });

    // The limits table: one line per limit, and a field the width of the money
    // that goes in it.
    await openSettled(page, "/budgets");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${DIR}/06-лимиты.png` });

    // The icon that follows the name.
    await openSettled(page, "/categories");
    await page
      .getByTestId("category-column-EXPENSE")
      .getByRole("button", { name: "Добавить" })
      .click();
    await page.getByRole("dialog").getByRole("textbox").first().fill("Продукты");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/05-иконка-по-названию.png` });
    await page.keyboard.press("Escape");
  });

  test("светлая тема и печать", async ({ page }) => {
    test.setTimeout(180_000);
    await seedExampleData(page);
    await setTheme(page, "Светлая");

    await openSettled(page, "/transactions");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/06-учёт-светлая.png` });

    await openSettled(page, "/analytics");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/07-аналитика-светлая.png` });

    // The report as it reaches the paper — from the LIGHT theme…
    await openSettled(page, "/reports");
    await chartsPainted(page, "rect.recharts-rectangle");
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/08-отчёт-на-печать.png` });
    await page.emulateMedia({ media: "screen" });

    // …and from the DARK one, which used to print dark rectangles.
    await setTheme(page, "Тёмная");
    await openSettled(page, "/reports");
    await chartsPainted(page, "rect.recharts-rectangle");
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/09-отчёт-на-печать-из-тёмной.png` });
  });

  test("телефон", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 1400 });
    await seedExampleData(page);

    // The round add button in the bar — the ring should read as a notch.
    await openSettled(page, "/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${DIR}/10-телефон-главная.png` });

    await openSettled(page, "/transactions");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/11-телефон-фильтры.png` });
  });
});
