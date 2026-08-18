import { test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Not a check — a camera. Captures the screens the owner reported, so the fixes
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
  test.use({ colorScheme: "light", viewport: { width: 1360, height: 2800 } });

  test("тёмная тема", async ({ page }) => {
    test.setTimeout(180_000);
    await seedExampleData(page);
    await setTheme(page, "Тёмная");

    await openSettled(page, "/");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/01-главная-тёмная.png` });

    await openSettled(page, "/transactions");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/03-учёт-тёмная.png` });

    await openSettled(page, "/analytics");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/05-аналитика-тёмная.png` });

    // The report — the screen that used to print a page of zeros.
    await openSettled(page, "/reports");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/06-отчёт-тёмная.png` });

    // Plan against fact: the grid that replaced the spreadsheet — categories
    // across the top, months down the side, three bands.
    await openSettled(page, "/plan");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/09-план-факт-тёмная.png` });

    // The category dialog: icons by group, and the full colour grid.
    await openSettled(page, "/categories");
    await page
      .getByTestId("category-column-EXPENSE")
      .getByRole("button", { name: "Добавить" })
      .click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/07-категория-иконки-и-цвета.png` });
    await page.keyboard.press("Escape");

    // Adding a holding: the asset-type filter above the search results.
    await openSettled(page, "/investments");
    await page
      .getByRole("button", { name: /Добавить (первую )?бумагу/ })
      .first()
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Облигации" }).click();
    await page.getByRole("dialog").getByRole("textbox").first().fill("ОФЗ");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${DIR}/08-инвестиции-облигации.png` });
  });

  test("светлая тема", async ({ page }) => {
    test.setTimeout(120_000);
    await seedExampleData(page);
    await setTheme(page, "Светлая");

    await openSettled(page, "/");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/02-главная-светлая.png` });

    await openSettled(page, "/transactions");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/04-учёт-светлая.png` });

    await openSettled(page, "/plan");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DIR}/10-план-факт-светлая.png` });
  });
});
