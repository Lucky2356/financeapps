import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// 2.4: разделы меню, горячие клавиши и платёж по долгу.

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("раздел можно убрать из меню и вернуть; выбор переживает перезагрузку", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/settings?section=general");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Инвестиции" })).toBeVisible();

    await page.getByRole("switch", { name: "Инвестиции" }).click();
    await expect(sidebar.getByRole("link", { name: "Инвестиции" })).toHaveCount(0);
    // Соседние на месте.
    await expect(sidebar.getByRole("link", { name: "Таблица" })).toBeVisible();

    await openSettled(page, "/settings?section=general");
    await expect(sidebar.getByRole("link", { name: "Инвестиции" })).toHaveCount(0);

    await page.getByRole("switch", { name: "Инвестиции" }).click();
    await expect(sidebar.getByRole("link", { name: "Инвестиции" })).toBeVisible();
  });

  test("горячие клавиши: «/» — в поиск, Alt+B — к лимитам", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions");
    await page.keyboard.press("/");
    await expect(page.locator("#tx-search")).toBeFocused();

    await page.locator("#tx-search").blur();
    await page.keyboard.press("Alt+KeyB");
    await expect(page).toHaveURL(/\/budgets/);
  });

  test("платёж по долгу: сумма, счёт — и долг стал меньше", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/debts");
    // В примере долгов нет — заводим свой.
    await page.getByRole("button", { name: "Добавить долг" }).first().click();
    const form = page.getByRole("dialog");
    await form.locator('input[name="name"]').fill("Кредитка");
    await form.locator('input[name="balance"]').fill("30000");
    await form.locator('input[name="minPayment"]').fill("3000");
    await form.getByRole("button", { name: "Сохранить" }).click();
    await expect(form).toBeHidden();

    const card = page.getByTestId("debt-pay").first();
    await expect(card).toBeVisible();
    await card.click();

    const dialog = page.getByTestId("pay-debt");
    await expect(dialog).toBeVisible();
    await dialog.locator("#pay-amount").fill("1000");
    await dialog.getByRole("button", { name: "Внести", exact: true }).click();
    await expect(page.getByText(/Платёж внесён/).first()).toBeVisible();
    await expect(dialog).toBeHidden();
    // Долг стал меньше на сумму платежа.
    await expect(page.getByText(/29\s?000/).first()).toBeVisible();
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("скрыли «Инвестиции» — на их месте «Настройки», панель не перекошена", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/settings?section=general");
    const bar = page.getByRole("navigation").last();
    await expect(bar.getByRole("link", { name: "Инвест." })).toBeVisible();

    await page.getByRole("switch", { name: "Инвестиции" }).click();
    await expect(bar.getByRole("link", { name: "Инвест." })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Настройки" })).toBeVisible();
  });
});
