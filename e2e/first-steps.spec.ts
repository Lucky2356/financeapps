import { expect, test } from "@playwright/test";

import { loadExample, openSettled } from "./helpers";

// Путь новичка целиком: поставил приложение, «Начать с нуля» — и сразу внутри,
// без пароля; счета одним окном; пример отдельно от своих данных.

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

test("с нуля до своих счетов — без пароля и без раздела «Счета»", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Начать с нуля" }).click();

  // Ни пароля, ни двенадцати слов: сразу приложение. И без второго «с нуля
  // или пример?» — источник уже выбран, дальше ведёт «Быстрый старт».
  const start = page.getByText("Быстрый старт");
  await expect(start).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: /Добро пожаловать/ })).toHaveCount(0);
  // «Настроить» в «Быстром старте» не одна (есть ещё у пароля) — берём ту, что
  // в строке «Добавьте счёт».
  await page
    .getByText("Добавьте счёт")
    .locator("xpath=ancestor::*[.//button][1]")
    .getByRole("button", { name: "Настроить" })
    .click();

  const setup = page.getByTestId("accounts-quick-setup");
  await setup.getByLabel("Сколько сейчас на счёте «Карта»").fill("5000");
  await setup.getByLabel("Сколько сейчас на счёте «Наличные»").fill("300");
  await setup.getByRole("button", { name: "Создать (2)" }).click();
  await expect(setup).toBeHidden();

  await openSettled(page, "/accounts");
  // Обзор сверху группирует по типам — там видно, что остатки из окна
  // доехали; в списке ниже — имена, которые вписаны в окне.
  await expect(page.getByRole("link", { name: /^Дебетовая карта 5\s?000/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Наличные 300/ })).toBeVisible();
  await expect(page.getByText("Карта", { exact: true }).filter({ visible: true })).toHaveCount(1);

  // Пример — отдельно: свои счета на месте, пока смотришь выдуманные.
  await openSettled(page, "/settings?section=data");
  await loadExample(page);
  await openSettled(page, "/accounts");
  const banner = page.getByTestId("sample-banner");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  // Карта примера — со своим остатком, по нему пример и узнаётся.
  await expect(page.getByRole("link", { name: /^Дебетовая карта 184\s?500/ })).toBeVisible();

  // «К своим данным» перезагружает приложение — ждём, пока метка на окне
  // исчезнет, как и после загрузки примера.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__backMark = true;
  });
  await banner.getByRole("button", { name: "К своим данным" }).click();
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (window as unknown as Record<string, unknown>).__backMark ?? null)
          .catch(() => "перезагрузка идёт"),
      { timeout: 30_000 }
    )
    .toBeNull();
  await openSettled(page, "/accounts");
  await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Наличные 300/ })).toBeVisible();
  // Выдуманные остатки примера не просочились в свои данные.
  await expect(page.getByRole("link", { name: /^Дебетовая карта 5\s?000/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /184\s?500/ })).toHaveCount(0);
});
