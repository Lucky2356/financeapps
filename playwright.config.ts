import { defineConfig, devices } from "@playwright/test";

// E2E runs against the static desktop export (out/) served locally — the same
// client-side LocalApiClient path the Tauri .exe ships. Build it first with
// `npm run build:static`, then `npx playwright test`.
const PORT = 4173;

// Состояние устройства с заведённым замком — его пишет проект "setup".
const VAULT_STATE = "e2e/.auth/vault.json";

export default defineConfig({
  testDir: "e2e",
  // shots.spec.ts is a camera, not a check: it writes PNGs and is run by hand
  // (`SHOTS=1 npx playwright test e2e/shots.spec.ts`), so it stays out of the
  // suite unless SHOTS asks for it.
  testIgnore: process.env.SHOTS ? [] : "**/shots.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Pin the browser language so the client i18n layer resolves to Russian
    // deterministically. Without this the app honors navigator.language (English on
    // CI), switching the UI to EN and breaking the RU text assertions in the specs.
    //
    // Здесь, а не у проекта "chromium": проектов стало два, и заведённый замок
    // из второго достаётся первому. Стоял язык у одного — второй заводил замок
    // по-английски и не находил на экране ни одной русской надписи.
    locale: "ru-RU"
  },
  projects: [
    // Замок заводится один раз (см. e2e/vault.setup.ts), и снимок устройства
    // достаётся всем сценариям. Иначе каждый проходил бы первый запуск сам —
    // три прогона PBKDF2 по шестьсот тысяч раундов на сценарий.
    { name: "setup", testMatch: /vault\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /vault\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: VAULT_STATE }
    }
  ],
  webServer: {
    // A local static server rather than `npx serve`: the latter leaked file
    // handles and died mid-suite with EMFILE (see scripts/serve-static.mjs).
    command: `node scripts/serve-static.mjs out ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
