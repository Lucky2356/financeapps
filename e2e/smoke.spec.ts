import { expect, test } from "@playwright/test";

// Smoke coverage for the static desktop build: it must boot, hydrate, and let
// the client-side LocalApiClient drive a real route without a backend.
test.describe("desktop static build", () => {
  test("home page loads with the app title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Финансовый помощник/);
    await expect(page.getByText("Финансовый помощник").first()).toBeVisible();
  });

  test("transactions route hydrates the client manager", async ({ page }) => {
    await page.goto("/transactions");
    // TransactionManager renders these once the client-side LocalApiClient
    // resolves — proves data wiring works in the exported build without a backend.
    await expect(page.getByText("Фильтры").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Добавить операцию").first()).toBeVisible();
  });
});
