import { defineConfig, devices } from "@playwright/test";

// E2E runs against the static desktop export (out/) served locally — the same
// client-side LocalApiClient path the Tauri .exe ships. Build it first with
// `npm run build:static`, then `npx playwright test`.
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry"
  },
  // Pin the browser language so the client i18n layer resolves to Russian
  // deterministically. Without this the app honors navigator.language (English on
  // CI), switching the UI to EN and breaking the RU text assertions in the specs.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], locale: "ru-RU" } }],
  webServer: {
    command: `npx serve out -l ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
