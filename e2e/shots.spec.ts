import { test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Not a check — a camera. Captures the screens the owner reported, in both
// themes, so the fixes can be judged by eye. Run on demand:
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
    test.setTimeout(120_000);
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

    // The delete confirmation, mid-flight.
    await openSettled(page, "/transactions");
    await page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "Удалить операцию" })
      .click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/06-подтверждение-удаления.png` });
    await page.keyboard.press("Escape");

    // Quick add with the new transfer type selected.
    await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Перевод", exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/07-быстрое-добавление-перевод.png` });
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
  });
});
