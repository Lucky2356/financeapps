import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Жалоба владельца: на телефоне ввёл сумму, сразу жмёшь категорию — не
// нажимается, приходится второй раз.
//
// Что происходит под пальцем. Пока вводится сумма, открыта клавиатура, и окно
// короче. Касание «Категории» открывает список — и снимает фокус с суммы.
// Клавиатура уходит, окно вырастает, а выпадающий список (Radix Select)
// закрывается на ЛЮБОЕ изменение размера окна: так он написан. Список
// мелькнул и пропал. Второе касание срабатывает, потому что клавиатуры уже нет
// и окну нечего менять.
//
// Была и вторая беда рядом: диалог стоял по центру и съезжал вслед за
// серединой окна. Её закрывает прижатие диалога к верху на узком экране.
//
// Сымитировать клавиатуру в браузере нельзя, но её след — можно: окно ниже,
// пока вводится сумма, и вырастает сразу после касания.
test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

test("категория открывается с первого касания, когда уходит клавиатура", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Сумма").fill("1234");

  // Клавиатура открыта: окно ниже на её высоту.
  await page.setViewportSize({ width: 390, height: 460 });
  const trigger = dialog.getByLabel("Категория");
  await expect(trigger).toBeVisible();
  const box = (await trigger.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // Касание сняло фокус с суммы — клавиатура уходит, окно вырастает.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);

  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2_000 });
});

// Контроль самой проверки: то же касание без сдвига окна. Не будь его, красное
// выше могло бы значить «касание через CDP не открывает список вообще», и
// зелёное после правки не доказывало бы ничего.
test("без клавиатуры категория открывается тем же касанием", async ({ page }) => {
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.evaluate(() => window.dispatchEvent(new Event("quick-add-open")));

  const trigger = page.getByRole("dialog").getByLabel("Категория");
  await expect(trigger).toBeVisible();
  const box = (await trigger.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2_000 });
});
