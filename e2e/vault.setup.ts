import { expect, test as setup } from "@playwright/test";

// Замок заводится ОДИН раз на весь прогон, и получившееся состояние устройства
// достаётся всем остальным сценариям.
//
// Иначе каждый из ста шестидесяти семи проходил бы первый запуск сам: три
// прогона PBKDF2 по шестьсот тысяч раундов — секунды полторы-две на сценарий,
// то есть минуты к каждому прогону CI, и всё это ради одного и того же.
// Здесь пароль задаётся, код восстановления подтверждается, книга отпирается с
// галкой «не спрашивать» — и снимок хранилища кладётся на диск.
//
// Книга при этом остаётся ПУСТОЙ: сценарии наполняют её сами, кнопкой
// «Загрузить пример», и снимок с уже готовыми данными им только мешал бы.

export const VAULT_STATE = "e2e/.auth/vault.json";
const PASSWORD = "проверочный-пароль";

setup("завести замок один раз на весь прогон", async ({ page, context }) => {
  await page.goto("/");

  // Первый запуск: пароль.
  const password = page.getByLabel("Пароль", { exact: true });
  await password.waitFor({ state: "visible", timeout: 30_000 });
  await password.fill(PASSWORD);
  await page.getByLabel("Ещё раз").fill(PASSWORD);
  await page.getByRole("button", { name: "Задать пароль" }).click();

  // Код восстановления: списываем слова прямо с экрана.
  await expect(page.getByRole("heading", { name: "Запишите код восстановления" })).toBeVisible({
    timeout: 60_000
  });
  const words = await page.locator("ol li span.font-medium").allInnerTexts();
  expect(words).toHaveLength(12);

  await page.getByRole("button", { name: "Я записал" }).click();

  // Проверка «а правда ли записали»: спрашивают два слова по номерам.
  await expect(page.getByRole("heading", { name: "Проверим, что записали" })).toBeVisible();
  const fields = page.locator('input[id^="vault-word-"]');
  for (let slot = 0; slot < 2; slot++) {
    const label = await page.locator(`label[for="vault-word-${slot}"]`).innerText();
    const number = Number(label.replace(/\D+/g, ""));
    await fields.nth(slot).fill(words[number - 1]);
  }
  await page.getByRole("button", { name: "Готово" }).click();

  // Ворота пустили внутрь — значит книга открыта.
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });

  // Открыть заново с галкой: только так на устройстве появляется пометка, без
  // которой следующий запуск снова спросит пароль, а снимок хранилища
  // достался бы сценариям запертым.
  //
  // Запирать нарочно не нужно и нечем: ключ книги живёт в памяти вкладки, и
  // обычная перезагрузка уносит его с собой. Никакой зацепки «только для
  // тестов» в приложении ради этого заводить не пришлось — и не надо: такая
  // зацепка потом непременно оказалась бы способом обойти замок.
  await page.goto("/");
  const unlock = page.getByLabel("Пароль", { exact: true });
  await unlock.waitFor({ state: "visible", timeout: 30_000 });
  await unlock.fill(PASSWORD);
  await page.getByLabel("Не спрашивать на этом устройстве").check();
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("button", { name: "Загрузить пример" })).toBeVisible({
    timeout: 30_000
  });

  await context.storageState({ path: VAULT_STATE, indexedDB: true });
});
