import { expect, test } from "@playwright/test";

import { loadExample } from "./helpers";

// Замок целиком, на чистом устройстве: первый запуск, проверка кода, запирание
// при перезапуске, неверный пароль, восстановление по коду.
//
// Общий снимок хранилища (e2e/vault.setup.ts) здесь не годится: в нём замок уже
// заведён, а проверяется как раз то, как он заводится.
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "длинный-пароль-1";

/**
 * Сообщение об ошибке В ФОРМЕ.
 *
 * Не getByRole("alert"): у Next есть свой невидимый объявитель маршрутов с той
 * же ролью, и проверка спотыкалась не о приложение, а о двусмысленность.
 */
function formError(page: import("@playwright/test").Page) {
  return page.locator('p[role="alert"]');
}

/**
 * Перезапуск приложения: перезагрузка уносит ключ книги из памяти вкладки —
 * ровно как закрытие окна.
 *
 * Без повторов и без пауз. Повторы тут были, пока пример загружался вручную:
 * приложение после записи перезагружает себя само, и начатый в этот миг переход
 * браузер обрывал. Теперь пример грузится общим помощником, который этой
 * перезагрузки дожидается, — и обрываться стало нечему.
 */
async function restart(page: import("@playwright/test").Page) {
  await page.goto("/");
}

/** Проходит первый запуск и возвращает выписанный код восстановления. */
async function firstRun(page: import("@playwright/test").Page): Promise<string[]> {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Ещё раз").fill(PASSWORD);
  await page.getByRole("button", { name: "Задать пароль" }).click();

  await expect(page.getByRole("heading", { name: "Запишите код восстановления" })).toBeVisible({
    timeout: 60_000
  });
  const words = await page.locator("ol li span.font-medium").allInnerTexts();
  await page.getByRole("button", { name: "Я записал" }).click();
  return words;
}

/** Отвечает на вопрос «введите слова под номерами …» по выписанному коду. */
async function answerVerification(page: import("@playwright/test").Page, words: string[]) {
  const fields = page.locator('input[id^="vault-word-"]');
  for (let slot = 0; slot < 2; slot++) {
    const label = await page.locator(`label[for="vault-word-${slot}"]`).innerText();
    await fields.nth(slot).fill(words[Number(label.replace(/\D+/g, "")) - 1]);
  }
}

test("первый запуск просит пароль раньше, чем покажет приложение", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Защитите книгу паролем" })).toBeVisible({
    timeout: 30_000
  });
  // Ни боковой панели, ни кнопки добавления: под замком нажимать нечего.
  await expect(page.getByRole("button", { name: "Быстрое добавление операции" })).toHaveCount(0);
});

test("короткий пароль и опечатка во втором поле не пропускаются", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("корот");
  await page.getByLabel("Ещё раз").fill("корот");
  await page.getByRole("button", { name: "Задать пароль" }).click();
  await expect(formError(page)).toContainText("восьми знаков");

  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Ещё раз").fill(`${PASSWORD}!`);
  await page.getByRole("button", { name: "Задать пароль" }).click();
  await expect(formError(page)).toContainText("не совпадают");
});

test("код восстановления показывают и заставляют доказать, что записали", async ({ page }) => {
  const words = await firstRun(page);
  expect(words).toHaveLength(12);

  // Неверное слово дальше не пускает — иначе проверка была бы украшением.
  await expect(page.getByRole("heading", { name: "Проверим, что записали" })).toBeVisible();
  const fields = page.locator('input[id^="vault-word-"]');
  await fields.nth(0).fill("заведомоневерно");
  await fields.nth(1).fill("иэтотоже");
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(formError(page)).toContainText("Не сходится");
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toHaveCount(0);

  await answerVerification(page, words);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });
});

test("после перезапуска книга заперта, и верный пароль её открывает", async ({ page }) => {
  const words = await firstRun(page);
  await answerVerification(page, words);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });

  await restart(page);
  await expect(page.getByRole("heading", { name: "Книга заперта" })).toBeVisible({
    timeout: 30_000
  });

  await page.getByLabel("Пароль", { exact: true }).fill("не тот пароль");
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(formError(page)).toContainText("Не подходит");

  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });
});

test("забытый пароль чинится кодом, и записанное остаётся на месте", async ({ page }) => {
  const words = await firstRun(page);
  await answerVerification(page, words);
  await page.getByRole("button", { name: "Готово" }).click();

  // Что-нибудь записываем, чтобы было что терять. Через общий помощник, а не
  // руками: он дожидается, пока приложение допишет пример и перезагрузит себя.
  // Без этого ожидания следующий переход уводил страницу посреди записи, и
  // терялся не замок, а сам пример — проверка ловила собственную гонку.
  await loadExample(page);

  await restart(page);
  await expect(page.getByRole("heading", { name: "Книга заперта" })).toBeVisible({
    timeout: 30_000
  });
  await page.getByRole("button", { name: "Забыли пароль?" }).click();

  await page.getByLabel("Код восстановления").fill(words.join(" "));
  await page.getByLabel("Новый пароль").fill("совсем-другой-пароль");
  await page.getByRole("button", { name: "Восстановить доступ" }).click();

  // Внутрь пустили, и книга та же — пример на месте, а не пустая книга.
  await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toHaveCount(0);
});

test("галка «не спрашивать» убирает вопрос при следующем запуске", async ({ page }) => {
  const words = await firstRun(page);
  await answerVerification(page, words);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });

  await restart(page);
  await page.getByLabel("Пароль", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Не спрашивать на этом устройстве").check();
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });

  await restart(page);
  await expect(page.getByRole("heading", { name: "Книга заперта" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });
});
