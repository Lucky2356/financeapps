import type { AddressInfo } from "node:net";

import { expect, test, type BrowserContext } from "@playwright/test";

import { createApp, type App } from "../server/src/main.ts";
import { openSettled, seedExampleData } from "./helpers";

// Два устройства, связанных по картинке, — целиком, в браузере.
//
// Служба поднимается здесь же, а запросы приложения к службе по умолчанию
// перенаправляются на неё: сборка одна, и адрес службы в ней зашит.
// Поток событий обрывается нарочно — он долгий, а проверке он не нужен: данные
// второе устройство забирает при подключении.

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

test("второе устройство подключается по ссылке из QR без имени и пароля", async ({
  page,
  browser
}) => {
  test.setTimeout(120_000);
  await toLocalService(page.context());

  // Первое устройство: данные есть, синхронизация включается одной кнопкой.
  await seedExampleData(page);
  await openSettled(page, "/settings?section=sync");
  await page.getByRole("button", { name: /Включить синхронизацию/ }).click();
  const offer = page.getByTestId("pair-offer");
  await expect(offer).toHaveAttribute("data-link", /^financeapps:\/\/pair\?/, { timeout: 30_000 });
  const link = (await offer.getAttribute("data-link")) ?? "";
  await expect(page.getByTestId("pairing-qr")).toBeVisible();

  // Второе устройство: совсем новое, первый запуск.
  // Пустое хранилище явно: иначе новое окно получает снимок устройства из
  // настроек прогона — то есть уже заведённый замок.
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
  // После подключения приложение перечитывает себя само — дожидаемся этого,
  // иначе следующий переход столкнётся с перезагрузкой.
  const reloaded = second.waitForEvent("framenavigated", { timeout: 30_000 });
  await second.getByRole("button", { name: "Подключить", exact: true }).click();
  await reloaded;
  await second.waitForLoadState("load");

  // Приложение открывается с данными первого устройства — без вопроса о
  // пароле и без первого запуска.
  await openSettled(second, "/accounts");
  await expect(second.getByRole("heading", { name: "С чего начнём?" })).toHaveCount(0);
  await expect(second.getByText("Дебетовая карта").first()).toBeVisible({ timeout: 30_000 });

  // А первое устройство видит, что подключилось второе.
  await expect(page.getByTestId("pair-joined")).toBeVisible({ timeout: 30_000 });
  await phone.close();
});
