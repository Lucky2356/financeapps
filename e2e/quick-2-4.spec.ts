import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Быстрое добавление 2.4: даты одним касанием, черновик и подсказка про лимит.

test.use({ viewport: { width: 1280, height: 860 } });

const iso = (back: number) => {
  const date = new Date();
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate()
  ).padStart(2, "0")}`;
};

const OPEN = { name: "Быстрое добавление операции" };

test("вчера и позавчера — одним касанием", async ({ page }) => {
  test.setTimeout(90_000);
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.getByRole("button", OPEN).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#fab-date")).toHaveValue(iso(0));

  await dialog.getByTestId("qa-date-yesterday").click();
  await expect(dialog.locator("#fab-date")).toHaveValue(iso(1));
  await dialog.getByTestId("qa-date-dayBefore").click();
  await expect(dialog.locator("#fab-date")).toHaveValue(iso(2));
  await dialog.getByTestId("qa-date-today").click();
  await expect(dialog.locator("#fab-date")).toHaveValue(iso(0));
});

test("закрыли не записью — набранное возвращается, записью — нет", async ({ page }) => {
  test.setTimeout(90_000);
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.getByRole("button", OPEN).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#fab-amount").fill("777");
  await dialog.locator("#fab-description").fill("хлеб");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", OPEN).first().click();
  await expect(dialog.getByTestId("qa-draft")).toBeVisible();
  await expect(dialog.locator("#fab-amount")).toHaveValue("777");
  await expect(dialog.locator("#fab-description")).toHaveValue("хлеб");

  // «Начать заново» — пустая форма, и черновика больше нет.
  await dialog.getByRole("button", { name: "Начать заново" }).click();
  await expect(dialog.locator("#fab-amount")).toHaveValue("");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await page.getByRole("button", OPEN).first().click();
  await expect(dialog.getByTestId("qa-draft")).toHaveCount(0);

  // Записали — черновик не остаётся.
  await dialog.locator("#fab-amount").fill("5");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", OPEN).first().click();
  await expect(dialog.getByTestId("qa-draft")).toHaveCount(0);
});

test("под категорией — сколько осталось в лимите, до траты", async ({ page }) => {
  test.setTimeout(90_000);
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.getByRole("button", OPEN).first().click();
  const dialog = page.getByRole("dialog");

  await dialog.locator("#fab-category").click();
  await page.getByRole("option", { name: "Продукты" }).click();
  const hint = dialog.getByTestId("limit-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute("data-kind", "left");
  await expect(hint).toContainText("Продукты");

  // Сумма больше лимита — предупреждение красным, пока ещё можно передумать.
  await dialog.locator("#fab-amount").fill("9999999");
  await expect(hint).toHaveAttribute("data-kind", "over");
  await expect(hint).toContainText("превысит");

  // Категория без лимита — без подсказки.
  await dialog.locator("#fab-category").click();
  await page.getByRole("option", { name: "Здоровье" }).click();
  await expect(dialog.getByTestId("limit-hint")).toHaveCount(0);
});
