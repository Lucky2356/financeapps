import type { AddressInfo } from "node:net";

import { expect, test, type BrowserContext } from "@playwright/test";

import { createApp, type App } from "../server/src/main.ts";
import { openSettled, seedExampleData } from "./helpers";

// «Мои устройства»: выкидывать другие можно только с главного устройства
// (жалоба владельца: с любого подключённого телефона выкидывался компьютер).

const DEFAULT = "https://finance.zagranica.online";

let service: App;
let local: string;

test.beforeAll(async () => {
  service = createApp({ dbPath: ":memory:", adminToken: "propusk", openRegistration: true });
  await new Promise<void>((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  local = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await service.stop();
});

async function toLocalService(context: BrowserContext) {
  await context.route(`${DEFAULT}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/events")) return route.abort();
    const response = await route.fetch({ url: url.replace(DEFAULT, local) });
    await route.fulfill({ response });
  });
}

test("главное выкидывает другие, остальные — только себя", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await toLocalService(page.context());

  await seedExampleData(page);
  await openSettled(page, "/settings?section=sync");
  await page.getByRole("button", { name: /Включить синхронизацию/ }).click();
  const offer = page.getByTestId("pair-offer");
  await expect(offer).toHaveAttribute("data-link", /^financeapps:\/\/pair\?/, { timeout: 30_000 });
  const link = (await offer.getAttribute("data-link")) ?? "";

  const phone = await browser.newContext({
    locale: "ru-RU",
    baseURL: new URL(page.url()).origin,
    storageState: { cookies: [], origins: [] }
  });
  await toLocalService(phone);
  const second = await phone.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: /Синхронизировать устройства/ }).click();
  await second.getByRole("button", { name: /Подключиться к другому устройству/ }).click();
  await second.getByLabel(/ссылк/i).fill(link);
  const reloaded = second.waitForEvent("framenavigated", { timeout: 30_000 });
  await second.getByRole("button", { name: "Подключить", exact: true }).click();
  await reloaded;
  await second.waitForLoadState("load");

  // Второе устройство: чужое выкинуть нельзя, себя — можно.
  await openSettled(second, "/settings?section=sync");
  const theirs = second.locator("#set-devices");
  await expect(theirs.getByText("главное")).toBeVisible({ timeout: 30_000 });
  await expect(theirs.getByTestId("dev-not-primary")).toBeVisible();
  // По тексту, а не по роли: поверх нового устройства может стоять окно
  // обучения, и оно прячет страницу от поиска по ролям.
  await expect(theirs.getByText("Выкинуть", { exact: true })).toHaveCount(0);
  await expect(theirs.getByText("Отключить это устройство")).toBeVisible();

  // Главное: выкидывает второе — с подтверждением.
  await openSettled(page, "/settings?section=sync");
  const mine = page.locator("#set-devices");
  await expect(mine.locator("li")).toHaveCount(2, { timeout: 30_000 });
  await mine.getByRole("button", { name: "Выкинуть", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Выкинуть «/)).toBeVisible();
  // Пароль задан — без него кнопка не нажимается, а с неверным — отказ.
  const confirmButton = dialog.getByRole("button", { name: "Выкинуть", exact: true });
  await expect(confirmButton).toBeDisabled();
  await dialog.getByLabel("Пароль приложения").fill("не тот");
  await confirmButton.click();
  await expect(page.getByText("Пароль не подходит.")).toBeVisible();
  await expect(mine.locator("li")).toHaveCount(2);
  await dialog.getByLabel("Пароль приложения").fill("проверочный-пароль");
  await confirmButton.click();
  await expect(mine.locator("li")).toHaveCount(1, { timeout: 30_000 });
  await phone.close();
});
