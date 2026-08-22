import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The desktop sidebar folds down to icons: the wide tables want the pixels, and
// the choice has to survive a restart or it is not worth making.
test("боковое меню сворачивается и остаётся свёрнутым", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");

  const sidebar = page.locator("aside[data-collapsed]");
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
  const wide = (await sidebar.boundingBox())?.width ?? 0;
  // Labels are readable while it is open.
  await expect(sidebar.getByRole("link", { name: "Аналитика" })).toBeVisible();

  await page.getByRole("button", { name: "Свернуть меню" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  // The width is animated, so the box is read until it settles rather than once.
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0, { timeout: 5000 })
    .toBeLessThan(wide);
  // The screens are still reachable — the label just moved into the tooltip.
  // The analytics button lands on План/факт — the first tab of its group.
  await expect(sidebar.locator('a[href="/plan"]')).toBeVisible();

  await openSettled(page, "/accounts");
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");

  await page.getByRole("button", { name: "Развернуть меню" }).click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "false");
});
