import { expect, test } from "@playwright/test";

import { openSettled } from "./helpers";

// Picking a theme has to change the screen at once. It used not to: the app
// reads the stored theme from IndexedDB on start, and that read landed after
// the click, snapping the choice back to "system" — which on a light device
// looked like "I chose dark and got white".
test.use({ colorScheme: "light" });

test("тёмная тема применяется сразу и переживает перезагрузку", async ({ page }) => {
  await openSettled(page, "/settings");
  const skip = page.getByRole("button", { name: "Пропустить обучение" });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.getByRole("button", { name: "Внешний вид" }).click();
  await page.getByText("Тёмная", { exact: true }).click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.className), { timeout: 5_000 })
    .toContain("dark");

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.className), { timeout: 15_000 })
    .toContain("dark");
});
