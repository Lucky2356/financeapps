import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// The calculator opens as a dialog ON TOP of the transaction form — a nested
// Radix dialog. The thing that must never happen is the outer form closing with
// it: the user would lose everything they had already filled in.
test("считает сумму и возвращает её в форму операции", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  const form = page.getByRole("dialog");
  const amount = form.getByLabel("Сумма");
  await expect(amount).toBeVisible();

  await form.getByRole("button", { name: "Калькулятор" }).click();

  // The calculator is the topmost dialog now.
  const calculator = page.getByRole("dialog").filter({ hasText: "Калькулятор" }).last();
  for (const key of ["1", "2", "0", "0", "×", "3"]) {
    await calculator.getByRole("button", { name: key, exact: true }).click();
  }
  await expect(calculator.getByText("= 3600")).toBeVisible();

  await calculator.getByRole("button", { name: "Применить" }).click();

  // Result landed in the field AND the form survived.
  await expect(amount).toHaveValue("3600");
  await expect(page.getByRole("heading", { name: "Быстрое добавление" })).toBeVisible();
});

test("Escape закрывает калькулятор, но не форму под ним", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Сумма").fill("500");
  await form.getByRole("button", { name: "Калькулятор" }).click();
  await expect(page.getByLabel("Выражение")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByLabel("Выражение")).toBeHidden();
  // The form is still open and still holds what was typed before.
  await expect(page.getByRole("heading", { name: "Быстрое добавление" })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Сумма")).toHaveValue("500");
});

// The calculator adds a fifth row of keys to a dialog, and a dialog taller than
// the screen used to put its buttons out of reach (fixed before 1.6.0). Смотрим
// на самом маленьком телефоне из набора.
test("калькулятор целиком помещается на маленьком экране", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });

  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Калькулятор" }).click();
  await expect(page.getByLabel("Выражение")).toBeVisible();

  const calculator = page.getByRole("dialog").filter({ has: page.getByLabel("Выражение") });
  // The dialog zooms in over 200 ms; measuring mid-flight reports the scaled-down
  // box in the wrong place. Wait until the rendered box matches the layout box.
  await expect
    .poll(() =>
      calculator.evaluate(
        (el) => Math.abs(el.getBoundingClientRect().height - (el as HTMLElement).offsetHeight) < 1
      )
    )
    .toBe(true);

  const box = await calculator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y, "верх калькулятора выше экрана").toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, "низ калькулятора ниже экрана").toBeLessThanOrEqual(740);
  expect(box!.x + box!.width, "калькулятор шире экрана").toBeLessThanOrEqual(360);

  // Every key stays a comfortable tap target.
  const keys = calculator.locator(".grid-cols-4 button");
  await expect(keys).toHaveCount(20);
  for (const key of await keys.all()) {
    const size = await key.boundingBox();
    expect(size!.height, "клавиша слишком мелкая для пальца").toBeGreaterThanOrEqual(40);
  }
});

// Planning fields used to step by 100, and the browser refuses to submit a
// number that is not a multiple of the step ("ближайшие 4500 и 4600") — which is
// exactly what a calculator produces. Same class of bug as the debt amounts in
// 1.4.0, so it gets the same guard.
test("некруглая сумма из калькулятора сохраняется в цели", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedExampleData(page);
  await openSettled(page, "/goals");

  await page.getByRole("button", { name: "Добавить цель" }).click();
  const form = page.getByRole("dialog");
  // The goal dialog labels are not wired with htmlFor, so go by role: the first
  // number field is the target amount.
  const target = form.getByRole("spinbutton").first();
  await expect(target).toBeVisible();

  await form.getByRole("button", { name: "Калькулятор" }).first().click();
  await page.getByLabel("Выражение").fill("4590");
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(target).toHaveValue("4590");
  // The browser would block submission if the step still rejected this value.
  expect(await target.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
});

test("процент считается как на телефонном калькуляторе", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await seedExampleData(page);
  await openSettled(page, "/transactions");

  await page.getByRole("button", { name: "Быстрое добавление операции" }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Калькулятор" }).click();

  // "5400 минус 15%" — скидка, а не вычитание пятнадцати сотых.
  await page.getByLabel("Выражение").fill("5400-15%");
  await expect(page.getByText("= 4590")).toBeVisible();

  await page.getByRole("button", { name: "Применить" }).click();
  await expect(form.getByLabel("Сумма")).toHaveValue("4590");
});
