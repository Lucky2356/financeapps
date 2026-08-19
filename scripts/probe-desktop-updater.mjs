// Diagnostic for "auto-update is broken again" on Windows.
//
// A packaged build has no devtools, so the reason behind the toast never
// escapes the window. WebView2 will open a debugging port on request, and this
// connects to it and drives the real update path — check, confirm, install —
// printing console errors and toasts along the way.
//
// Start the installed app with the port open, then run this from the repo:
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//   & "$env:LOCALAPPDATA\Финансовый помощник\financial-assistant.exe"
//   node scripts/probe-desktop-updater.mjs

import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.waitForEvent("page"));

page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE ERROR:", message.text());
});
page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));

const dialog = page.locator("[role=alertdialog], [role=dialog]").first();
if (!(await dialog.isVisible().catch(() => false))) {
  await page.getByRole("link", { name: "Настройки" }).first().click();
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: /О приложении/ })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: /Проверить обновления|Проверяю/ })
    .first()
    .click();
  await page.waitForTimeout(6000);
}

console.log("ДИАЛОГ:", (await dialog.innerText()).replace(/\n+/g, " | "));
await dialog
  .getByRole("button", { name: /Обновить|Скачать|Установить/ })
  .first()
  .click();

// Download, signature check, then the installer runs and the app restarts.
for (let step = 0; step < 12; step += 1) {
  await page.waitForTimeout(5000);
  const toasts = await page
    .locator("[data-sonner-toast]")
    .allInnerTexts()
    .catch(() => ["<окно закрылось>"]);
  console.log(`+${(step + 1) * 5}s`, JSON.stringify(toasts));
}
