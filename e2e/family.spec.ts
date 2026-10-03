import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Семейный бюджет: участники, «кто платил» в быстром добавлении, общая трата
// поровну, долг и «Рассчитались».

test("участники, общая трата из быстрого добавления, долг и расчёт", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedExampleData(page);
  await openSettled(page, "/family");
  await expect(page.getByTestId("family-empty")).toBeVisible();

  await page.getByTestId("family-name").fill("Саша");
  await page.getByTestId("family-add").click();
  const members = page.getByTestId("family-members");
  await expect(members).toContainText("Саша");
  // Первый участник на устройстве — это устройство.
  await expect(members).toContainText("Это устройство");
  await page.getByTestId("family-name").fill("Маша");
  await page.getByTestId("family-add").click();
  await expect(members.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
  const form = page.getByRole("dialog");
  const fields = form.getByTestId("family-fields");
  await expect(fields.getByRole("button", { name: "Саша" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await form.locator("#fab-amount").fill("3000");
  await form.locator("#fab-description").fill("семья-продукты");
  await fields.getByTestId("family-shared").check();
  await form.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(form).toBeHidden();

  await openSettled(page, "/family");
  const debt = page.getByTestId("family-debt");
  await expect(debt).toHaveCount(1);
  await expect(debt).toContainText("Маша");
  await expect(debt).toContainText("1 500");
  const sasha = page.getByTestId("family-person").filter({ hasText: "Саша" });
  await expect(sasha).toContainText("3 000");

  await debt.getByTestId("family-settle").click();
  const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await confirm.getByRole("button", { name: "Рассчитались" }).click();
  await expect(page.getByTestId("family-even")).toBeVisible();

  // «В семье с»: дата вступления ставится и видна в списке.
  await page.getByRole("button", { name: "Переименовать: Маша" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByTestId("family-since").fill("2026-01-15");
  await editor.getByRole("button", { name: "Сохранить" }).click();
  await expect(editor).toBeHidden();
  await expect(members).toContainText("с 15.01.2026");

  // Правка операции помнит, кто платил.
  await openSettled(page, "/transactions?period=all&q=семья-продукты");
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Редактировать операцию" })
    .click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByRole("button", { name: "Саша" })).toHaveAttribute("aria-pressed", "true");
  await expect(edit.getByTestId("family-shared")).toBeChecked();
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test("экран семьи влезает по ширине", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/family");
    await page.getByTestId("family-name").fill("Александра");
    await page.getByTestId("family-add").click();
    // Первый участник меняет пустой экран на список — поле ввода новое.
    await expect(page.getByTestId("family-members")).toContainText("Александра");
    await page.getByTestId("family-name").fill("Мария");
    await page.getByTestId("family-add").click();
    await expect(page.getByTestId("family-person")).toHaveCount(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
