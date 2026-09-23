import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Двое на одном устройстве — в настоящем браузере.
//
// Всё, что ниже, проверено и по слоям, и через настоящую службу. Здесь другое:
// только тут работают настоящий IndexedDB и настоящая ПЕРЕЗАГРУЗКА страницы, а
// смена человека идёт именно ею. Стопка при этом собирается заново, с нуля, — и
// весь выбор человека из lib/vault/runtime проходит ровно тот путь, каким он
// пройдёт у живого человека, а не тот, который удобно позвать из проверки.
//
// Снимок с заведённым замком здесь не годится: в нём человек уже один и уже
// открыт, а проверяется появление второго.
test.use({ storageState: { cookies: [], origins: [] } });

const HIS = "пароль-васи-1";
const HERS = "пароль-маши-1";

/** Первый запуск целиком, веткой «с нуля, с паролем». */
async function firstRun(page: import("@playwright/test").Page, password: string) {
  await page.getByRole("button", { name: "Начать с нуля" }).click();
  await page.getByRole("button", { name: "Задать пароль" }).click();

  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Ещё раз").fill(password);
  await page.getByRole("button", { name: "Задать пароль" }).click();

  await expect(page.getByRole("heading", { name: "Запишите код восстановления" })).toBeVisible({
    timeout: 60_000
  });
  const words = await page.locator("ol li span.font-medium").allInnerTexts();
  await page.getByRole("button", { name: "Я записал" }).click();

  await expect(page.getByRole("heading", { name: "Проверим, что записали" })).toBeVisible();
  const fields = page.locator('input[id^="vault-word-"]');
  for (let slot = 0; slot < 2; slot++) {
    const label = await page.locator(`label[for="vault-word-${slot}"]`).innerText();
    const number = Number(label.replace(/\D+/g, ""));
    await fields.nth(slot).fill(words[number - 1]);
  }
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });
}

test("второй человек заводится, и каждый открывает только своё", async ({ page }) => {
  await page.goto("/");
  await firstRun(page, HIS);

  // Пока человек один, экрана выбора нет вовсе — и это условие, а не
  // случайность: одному он не говорит ничего и лишь удлиняет каждый запуск.
  //
  // Перезагрузка тут не для красоты: она уносит ключ из памяти вкладки, то есть
  // это настоящий перезапуск приложения. Ворота проходят весь путь заново —
  // включая выбор человека, ради которого сценарий и написан.
  await page.reload();
  await expect(page.getByLabel("Пароль", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Кто за компьютером?" })).toBeHidden();

  // Заводим второго. Делать это пока некуда, кроме как из хранилища напрямую:
  // экран «добавить человека» живёт на экране выбора, а тот не показывается,
  // пока человек один. Курица и яйцо разрешаются здесь так же, как у живого
  // человека их разрешит этап 3 (кнопка в настройках): списком людей.
  await page.evaluate(async () => {
    const open = indexedDB.open("financial-assistant-desktop", 1);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("key-value", "readwrite");
      tx.objectStore("key-value").put({
        key: "financePeople",
        value: {
          v: 1,
          people: [
            { id: "", name: "Вася", createdAt: "" },
            { id: "masha", name: "Маша", createdAt: "" }
          ],
          lastUsedId: ""
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  // Теперь людей двое — и экран выбора обязан появиться.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Кто за компьютером?" })).toBeVisible({
    timeout: 30_000
  });

  // И он честно говорит, чьи данные заперты, а чьи откроет любой.
  const vasya = page.getByRole("button").filter({ hasText: "Вася" });
  await expect(vasya).toContainText("Под паролем");

  // Маша ещё не заводила замок — её ждёт первый запуск, а не чужой.
  await page.getByRole("button").filter({ hasText: "Маша" }).click();
  await expect(page.getByRole("heading", { name: "С чего начнём?" })).toBeVisible({
    timeout: 30_000
  });
  await firstRun(page, HERS);

  // Перезапуск ПРИЛОЖЕНИЯ, а не перезагрузка страницы: выбор человека
  // спрашивается один раз за запуск, и пометка о сделанном выборе живёт ровно
  // столько же, сколько вкладка. Стереть её — то же самое, что закрыть окно и
  // открыть заново.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Кто за компьютером?" })).toBeVisible({
    timeout: 30_000
  });
  await page.getByRole("button").filter({ hasText: "Маша" }).click();
  const password = page.getByLabel("Пароль", { exact: true });
  await password.waitFor({ state: "visible", timeout: 30_000 });
  await password.fill(HIS);
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.locator('p[role="alert"]')).toBeVisible({ timeout: 30_000 });

  // А своим — открывает.
  await password.fill(HERS);
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });
});

// Дверь к «второму человеку» — в настройках, и она обязана быть открыта тому,
// кто на устройстве ОДИН.
//
// Это не придирка к расположению кнопки. Возможность «двое на одном
// устройстве» была выпущена, а войти в неё было неоткуда: заводит человека
// экран «Кто за компьютером?», а тот показывается, только когда людей уже
// больше одного. У каждого в первый день двери не было вовсе.
//
// Свой storageState: здесь нужен снимок с заведённым замком — то есть обычное
// устройство обычного человека, а не чистое, как в сценарии выше.
test.describe("дверь к второму человеку", () => {
  test.use({ storageState: "e2e/.auth/vault.json" });

  test("«Добавить человека» видно в настройках, когда человек один", async ({ page }) => {
    await seedExampleData(page);
    await openSettled(page, "/settings?section=data");

    const card = page.locator("#set-people");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Добавить человека" })).toBeVisible();

    // И там же видно, заперты ли данные того, кто сейчас за компьютером, —
    // ровно то же, что говорит экран выбора.
    await expect(card).toContainText("это вы");
  });
});
