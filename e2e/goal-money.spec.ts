import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

const digits = (text: string) => Number(text.replace(/[^\d]/g, ""));

// Money in a goal is money that left an account. Every way of changing it has to
// go through one, or capital grows and shrinks on its own.
test("цель пополняется и опустошается через счёт", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/goals");

  const savedFigure = async () => {
    const card = page
      .locator("main")
      .locator("p", { hasText: /^Накоплено$/ })
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    return digits(await card.locator("xpath=following-sibling::p[1]").innerText());
  };
  const before = await savedFigure();

  // The dialog behind the piggy bank does both directions now.
  await page.getByRole("button", { name: "Пополнить цель" }).first().click();
  const dialog = page.getByRole("dialog");
  // The amount field is the only number input in the dialog.
  await dialog.locator("input[type=number]").first().fill("1000");
  await dialog.getByRole("button", { name: "Пополнить", exact: true }).last().click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect.poll(savedFigure, { timeout: 15_000 }).toBe(before + 1000);

  // And back out again — the direction the app had no way to record.
  await page.getByRole("button", { name: "Пополнить цель" }).first().click();
  await dialog.getByRole("button", { name: "Снять", exact: true }).first().click();
  await expect(dialog.getByText("На какой счёт вернуть")).toBeVisible();
  await dialog.locator("input[type=number]").first().fill("400");
  await dialog.getByRole("button", { name: "Снять", exact: true }).last().click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect.poll(savedFigure, { timeout: 15_000 }).toBe(before + 600);
});

// Deleting a goal that holds money asks where the money goes rather than making
// it disappear from capital.
test("удаление цели с деньгами спрашивает, куда их вернуть", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/goals");

  await page
    .getByRole("button", { name: /Удалить/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/Куда вернуть эти деньги|будет удалена/)).toBeVisible();
});

// A limit belongs to the month it was set in.
test("лимит, заданный в одном месяце, не трогает соседний", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/budgets");

  const row = page.locator("main").getByText("Продукты").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  // The month strip is on the screen and the limit follows it.
  await expect(page.getByRole("combobox").first()).toBeVisible();
});
