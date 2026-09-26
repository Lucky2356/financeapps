import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Новый счёт и новая категория из формы операции — своим окном поверх неё.
//
// Раньше это была строка в форме: название, тип и «Создать» в один ряд. На
// телефоне поле названия сжималось до «Напр», набирать было негде. Теперь окно
// «Новый счёт» / «Новая категория», а созданное сразу выбрано в операции —
// сумма, набранная до этого, остаётся на месте.

test.use({ viewport: { width: 360, height: 740 } });

test.beforeEach(async ({ page }) => {
  await seedExampleData(page);
});

test("счёт, созданный из операции, выбран в ней, и сумма не потерялась", async ({ page }) => {
  await openSettled(page, "/");
  await page.getByRole("button", { name: "Быстрое добавление операции" }).last().click();

  const form = page.getByRole("dialog").first();
  await form.getByLabel("Сумма").fill("321");
  await form.getByRole("button", { name: "+ Новый" }).click();

  const create = page.getByTestId("new-account-dialog");
  await expect(create).toBeVisible();
  // Поле названия — во всю ширину окна, а не обрезок «Напр».
  const field = create.getByLabel("Название");
  const box = await field.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(250);
  await field.fill("Кошелёк в дорогу");
  await create.getByLabel("Сколько на нём сейчас").fill("1500");
  await create.getByRole("button", { name: "Создать" }).click();
  await expect(create).toBeHidden();

  await expect(form.getByLabel("Счёт")).toContainText("Кошелёк в дорогу");
  await expect(form.getByLabel("Сумма")).toHaveValue(/321/);
});

test("категория, созданная из операции, выбрана в ней", async ({ page }) => {
  await openSettled(page, "/");
  await page.getByRole("button", { name: "Быстрое добавление операции" }).last().click();

  const form = page.getByRole("dialog").first();
  await form.getByRole("button", { name: "+ Новая" }).click();
  const create = page.getByTestId("new-category-dialog");
  await expect(create.getByRole("heading")).toHaveText("Новая категория расходов");
  await create.getByLabel("Название").fill("Кофе с собой");
  await create.getByRole("button", { name: "Создать" }).click();
  await expect(create).toBeHidden();

  await expect(form.getByLabel("Категория")).toContainText("Кофе с собой");
});
