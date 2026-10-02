import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// «Учёт» 2.4: порядок списка, поиск по суммам, заголовки дней на телефоне.

/** Первое число из текста суммы: «-12 000 ₽ (1 200 ₽)» → 12000. */
function amountOf(text: string | null): number {
  const match = /(\d[\d\s ]*)(?:,(\d+))?/.exec(text ?? "");
  if (!match) return Number.NaN;
  return Number(`${match[1].replace(/[\s ]/g, "")}.${match[2] ?? "0"}`);
}

async function firstAmounts(page: Page, count: number): Promise<number[]> {
  const cells = page.locator("tbody tr td:nth-child(6)");
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(amountOf(await cells.nth(index).textContent()));
  }
  return values;
}

test.describe("ПК", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("порядок: крупные сверху, мелкие сверху, адрес хранит выбор", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions?period=all");

    await page.getByTestId("tx-sort").click();
    await page.getByRole("option", { name: "Крупные сверху" }).click();
    await expect(page).toHaveURL(/sort=amount-desc/);
    await expect
      .poll(async () => {
        const [first, second, third] = await firstAmounts(page, 3);
        return first >= second && second >= third;
      })
      .toBe(true);

    await page.getByTestId("tx-sort").click();
    await page.getByRole("option", { name: "Мелкие сверху" }).click();
    await expect(page).toHaveURL(/sort=amount-asc/);
    await expect
      .poll(async () => {
        const [first, second, third] = await firstAmounts(page, 3);
        return first <= second && second <= third;
      })
      .toBe(true);
  });

  test("поиск понимает суммы: точная, «больше», диапазон", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions?period=all&sort=amount-desc");
    const [biggest] = await firstAmounts(page, 1);

    // Точная сумма самой крупной операции находит её.
    await openSettled(page, `/transactions?period=all&q=${biggest}`);
    await expect.poll(async () => (await firstAmounts(page, 1))[0]).toBe(biggest);

    // «Больше чем всё» — пусто.
    await openSettled(page, `/transactions?period=all&q=${encodeURIComponent(`>${biggest}`)}`);
    await expect(page.getByText("Операции не найдены")).toBeVisible();

    // Диапазон вокруг неё — снова находится.
    await openSettled(
      page,
      `/transactions?period=all&q=${encodeURIComponent(`${biggest - 1}-${biggest + 1}`)}`
    );
    await expect.poll(async () => (await firstAmounts(page, 1))[0]).toBe(biggest);
  });
});

test.describe("удаление", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("удалили — и вернули кнопкой «Отменить»", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/");
    await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
    const form = page.getByRole("dialog");
    await form.locator("#fab-amount").fill("5");
    await form.locator("#fab-description").fill("проверка-отмены");
    await form.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(form).toBeHidden();

    await openSettled(page, "/transactions?period=all&q=проверка-отмены");
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole("button", { name: "Удалить операцию" }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(rows).toHaveCount(0);

    await page.getByRole("button", { name: "Отменить" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("проверка-отмены");
  });
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("дни в списке с итогом; при порядке по сумме заголовков нет", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/transactions?period=all");
    const header = page.getByTestId("day-header").first();
    await expect(header).toBeVisible();
    // В заголовке — итог дня.
    await expect(header).toContainText("₽");

    await openSettled(page, "/transactions?period=all&sort=amount-desc");
    await expect(page.getByTestId("day-header")).toHaveCount(0);
  });
});

test.describe("корзина", () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test("удалённая операция лежит в корзине и возвращается оттуда", async ({ page }) => {
    test.setTimeout(90_000);
    await seedExampleData(page);
    await openSettled(page, "/");
    await page.getByRole("button", { name: "Быстрое добавление операции" }).first().click();
    const form = page.getByRole("dialog");
    await form.locator("#fab-amount").fill("7");
    await form.locator("#fab-description").fill("в-корзину");
    await form.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(form).toBeHidden();

    await openSettled(page, "/transactions?period=all&q=в-корзину");
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole("button", { name: "Удалить операцию" }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(rows).toHaveCount(0);

    await openSettled(page, "/settings?section=data");
    const trash = page.getByTestId("trash");
    const group = trash.getByTestId("trash-group").filter({ hasText: "в-корзину" });
    await expect(group).toBeVisible();
    await expect(group).toContainText("удалено здесь");
    await group.getByRole("button", { name: "Вернуть" }).click();
    await expect(trash.getByTestId("trash-group").filter({ hasText: "в-корзину" })).toHaveCount(0);

    await openSettled(page, "/transactions?period=all&q=в-корзину");
    await expect(rows).toHaveCount(1);
  });
});
