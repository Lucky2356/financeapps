import { expect, test } from "@playwright/test";

import { openSettled } from "./helpers";

// Путь новичка целиком: поставил приложение, «Начать с нуля» — и сразу внутри,
// без пароля; счета одним окном; пример отдельно от своих данных.

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test("с нуля до своих счетов — без пароля и без раздела «Счета»", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Начать с нуля" }).click();

  // Ни пароля, ни двенадцати слов: сразу приложение. Приветствие закрываем.
  const welcome = page.getByRole("dialog");
  if (await welcome.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await page.keyboard.press("Escape");
  }

  const start = page.getByText("Быстрый старт");
  await expect(start).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Настроить" }).click();

  const setup = page.getByTestId("accounts-quick-setup");
  await setup.getByLabel("Сколько сейчас на счёте «Карта»").fill("5000");
  await setup.getByLabel("Сколько сейчас на счёте «Наличные»").fill("300");
  await setup.getByRole("button", { name: "Создать (2)" }).click();
  await expect(setup).toBeHidden();

  await openSettled(page, "/accounts");
  await expect(page.getByText("Карта").first()).toBeVisible();
  await expect(page.getByText("Наличные").first()).toBeVisible();

  // Пример — отдельно: свои счета на месте, пока смотришь выдуманные.
  await openSettled(page, "/settings?section=data");
  const reloaded = page.waitForEvent("framenavigated", { timeout: 30_000 });
  await page
    .getByRole("button", { name: /Загрузить пример|Загрузить/ })
    .first()
    .click();
  await reloaded;
  await openSettled(page, "/accounts");
  const banner = page.getByTestId("sample-banner");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Дебетовая карта").first()).toBeVisible();

  const back = page.waitForEvent("framenavigated", { timeout: 30_000 });
  await banner.getByRole("button", { name: "К своим данным" }).click();
  await back;
  await openSettled(page, "/accounts");
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  await expect(page.getByText("Наличные").first()).toBeVisible();
  await expect(page.getByText("Дебетовая карта")).toHaveCount(0);
});
