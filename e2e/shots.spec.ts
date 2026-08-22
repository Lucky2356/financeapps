import { expect, test } from "@playwright/test";

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

// The example ledger has no securities in it, so the investments screens are
// empty rooms without this: three positions, entered the way a person does.
async function addPositions(page: import("@playwright/test").Page) {
  const wanted = [
    { ticker: "SBER", quantity: "10", price: "300" },
    { ticker: "BELU", quantity: "5", price: "5000" },
    { ticker: "ETLN", quantity: "100", price: "70" }
  ];
  for (const [index, position] of wanted.entries()) {
    await page
      .getByRole("button", { name: index === 0 ? "Добавить первую бумагу" : "Добавить бумагу" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").first().fill(position.ticker);
    await dialog
      .getByRole("button", { name: new RegExp(position.ticker) })
      .first()
      .click({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "Средняя вручную" }).click();
    await dialog.getByLabel("Количество").fill(position.quantity);
    await dialog.getByLabel("Средняя цена покупки").fill(position.price);
    await dialog.getByRole("button", { name: "Сохранить позицию" }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
  }
}

test.describe("скриншоты", () => {
  // A tall viewport instead of fullPage: a full-page shot resizes the window,
  // and the charts rebuild themselves from zero when it does — which is how the
  // first attempt produced empty axes.
  test.use({ colorScheme: "light", viewport: { width: 1360, height: 2200 } });

  test("тёмная тема", async ({ page }) => {
    test.setTimeout(240_000);
    await seedExampleData(page);
    await setTheme(page, "Тёмная");

    // The filters on the list's own line — no window to open.
    await openSettled(page, "/transactions?type=EXPENSE&categoryId=cat-food&minAmount=1000");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/01-фильтры.png` });

    // What the gear holds.
    await page.getByRole("button", { name: "Фильтры" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/02-фильтры-шестерёнка.png` });
    await page.keyboard.press("Escape");

    await openSettled(page, "/analytics");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/03-аналитика.png` });

    await openSettled(page, "/investments");
    await addPositions(page);
    await chartsPainted(page, "path.recharts-curve");
    await page.screenshot({ path: `${DIR}/04-инвестиции.png` });

    await page.getByTestId("section-tabs").getByRole("button", { name: "Аналитика" }).click();
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/05-инвестиции-аналитика.png` });

    // The industries themselves, not "Фонды / Прочее / Облигации".
    await page
      .getByTestId("breakdown-switch")
      .getByRole("button", { name: "Секторная структура" })
      .click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/05b-инвестиции-секторы.png` });

    // The rollover switch stands on every row now, limit or not.
    await openSettled(page, "/budgets");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${DIR}/06-лимиты.png` });

    await openSettled(page, "/settings");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/07-настройки.png` });
  });

  test("телефон", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 1500 });
    await seedExampleData(page);

    await openSettled(page, "/transactions");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/10-телефон-операции.png` });

    await openSettled(page, "/analytics");
    await chartsPainted(page, "path.recharts-sector");
    await page.screenshot({ path: `${DIR}/11-телефон-аналитика.png` });

    await openSettled(page, "/investments");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${DIR}/12-телефон-инвестиции.png` });

    await openSettled(page, "/settings");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/13-телефон-настройки.png` });
  });
});
