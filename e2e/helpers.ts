import { expect, type Page } from "@playwright/test";

// Fills the device storage with the built-in example through the app's own
// onboarding button. Empty screens hide the interesting cases: it is tables,
// charts and long category names that overflow, and they only exist with data.
export async function seedExampleData(page: Page) {
  await page.goto("/");
  const loadExample = page.getByRole("button", { name: "Загрузить пример" });
  await loadExample.waitFor({ state: "visible", timeout: 30_000 });
  await loadExample.click();
  // The app reloads itself once the example is written to IndexedDB. Waiting for
  // the button to disappear is the honest signal — `networkidle` never settles
  // here, because the market-data pages keep polling MOEX in the background.
  await expect(loadExample).toBeHidden({ timeout: 30_000 });
}

// Seeding ends with the app reloading ITSELF, and that reload lands whenever it
// lands — so a navigation started right after can be aborted, or overtaken by
// the reload. Both read as a navigation error rather than a failed page.
const NAVIGATION_RACE = /ERR_ABORTED|interrupted by another navigation/;

// Opens a route and lets the client swap the empty server shell for real data.
export async function openSettled(page: Page, route: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(route);
      break;
    } catch (error) {
      if (attempt >= 4 || !NAVIGATION_RACE.test(String(error))) throw error;
      await page.waitForTimeout(500);
    }
  }
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  // Charts and lazy panels mount a frame or two after hydration; layout
  // assertions are a snapshot, so give them time to settle.
  await page.waitForTimeout(1_500);
}
