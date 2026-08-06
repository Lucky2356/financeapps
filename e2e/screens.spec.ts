import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Every money screen is built from the same three blocks: a headline card with
// one figure, a four-tile "Обзор" grid, and lists. These checks fail if a screen
// loses its head or starts clipping the figures it exists to show.
test.use({ viewport: { width: 390, height: 844 } });

const SCREENS = [
  { route: "/transactions", hero: "Расходы за месяц" },
  { route: "/accounts", hero: "Общий баланс" },
  { route: "/budgets", hero: "Потрачено из лимита" },
  { route: "/goals", hero: "Накоплено по целям" },
  { route: "/debts", hero: "Остаток долга" },
  { route: "/forecast", hero: "Прогноз через 30 дней" }
];

test.beforeEach(async ({ page }) => {
  await seedExampleData(page);
});

for (const screen of SCREENS) {
  test(`${screen.route}: карточка суммы и сетка «Обзор»`, async ({ page }) => {
    await openSettled(page, screen.route);

    const hero = page.getByText(screen.hero, { exact: true }).first();
    await expect(hero, `Нет карточки «${screen.hero}» на ${screen.route}`).toBeVisible();
    await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();

    // The grid always carries four tiles — a half-filled row reads as a bug.
    // Counted as "children of the grid", because a tile is a link when the
    // figure has somewhere to open and a plain box when it does not.
    const tiles = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "Обзор"
      );
      return heading?.nextElementSibling?.children.length ?? 0;
    });
    expect(tiles, `Плиток в сетке на ${screen.route}`).toBe(4);

    // No figure may be cut off: a truncated amount is worse than none.
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll("p.stat.num"))
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => node.textContent ?? "")
    );
    expect(clipped, `Обрезанные суммы на ${screen.route}: ${clipped.join(", ")}`).toEqual([]);
  });
}

test("шапка называет каждый экран", async ({ page }) => {
  for (const { route } of SCREENS) {
    await openSettled(page, route);
    const heading = page.locator("header").first().getByRole("heading");
    await expect(heading, `Шапка на ${route}`).not.toBeEmpty();
  }
});
