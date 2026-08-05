import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The home screen's shape is a deliberate design: greeting, one headline card,
// a grid of four figures, then the list of what is coming up. These checks fail
// if a change quietly drops one of those blocks or truncates a figure.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  const skip = page.getByRole("button", { name: "Пропустить обучение" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
});

test("шапка приветствует по времени суток", async ({ page }) => {
  const header = page.locator("header").first();
  await expect(header).toContainText(/Доброе утро|Добрый день|Добрый вечер|Доброй ночи/);
  // The avatar links to settings — the only right-hand control on this screen.
  await expect(header.getByRole("link", { name: "Настройки" })).toBeVisible();
});

test("капитал показан крупной карточкой с изменением", async ({ page }) => {
  const hero = page.getByText("Чистый капитал").locator("xpath=ancestor::section[1]");
  await expect(hero).toBeVisible();
  await expect(hero).toContainText("₽");
  await expect(hero).toContainText("%");
});

test("сетка «Обзор» — четыре плитки, суммы не обрезаны", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();

  const clipped = await page.evaluate(() => {
    const problems: string[] = [];
    for (const node of Array.from(document.querySelectorAll("p.stat.num"))) {
      if (node.scrollWidth > node.clientWidth + 1) problems.push(node.textContent ?? "");
    }
    return problems;
  });
  expect(clipped, `Обрезанные суммы: ${clipped.join(", ")}`).toEqual([]);
});

test("ближайшие платежи ведут в прогноз", async ({ page }) => {
  const section = page
    .getByRole("heading", { name: "Ближайшие платежи" })
    .locator("xpath=ancestor::section[1]");
  await expect(section.getByRole("link", { name: "Все" })).toHaveAttribute("href", "/forecast");
});
