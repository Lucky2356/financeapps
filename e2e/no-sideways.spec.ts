import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: на телефоне экран не ездит вбок.
//
// «Когда провожу вправо-влево, экран туда-сюда дёргается»: на снимке
// пользователя «Главная» сдвинута — заголовок обрезан слева, нижняя панель
// уехала вместе с ним. Это не прокрутка документа (scrollX там 0), а окно
// телефона, растянутое шире экрана: мобильный Chrome и WebView растягивают
// его по самому широкому содержимому, и палец таскает видимую часть по
// растянутому окну. overflow-x: clip на body от этого не спасает — overflow
// body уходит окну, а растяжение окна его не слушает.
//
// Соседние сторожа этого не видели:
// - e2e/responsive.spec.ts открывает экраны в настольном Chrome, где окно не
//   растягивается вовсе, и смотрит только правые края элементов при загрузке —
//   ни жеста, ни visualViewport;
// - он же пропускает плавающие слои (absolute без pointer-events) и всё, у чего
//   есть предок с overflow: hidden, — а растяжение окна считает и их;
// - e2e/cramping.spec.ts ищет обрезанное, а не лишнюю ширину.
//
// Здесь — телефон по-настоящему (isMobile + hasTouch: мобильное окно, грубый
// указатель и его стили), пример с данными, и после загрузки — жест пальцем
// вбок. Мерится и scrollX, и сдвиг visualViewport: сдвиг шапки на снимке был
// именно вторым.

test.use({ hasTouch: true, isMobile: true, locale: "ru-RU" });

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 }
];

const ROUTES = [
  "/",
  "/transactions",
  "/transactions?view=calendar",
  "/accounts",
  "/debts",
  "/categories",
  "/import",
  "/budgets",
  "/goals",
  "/recurring",
  "/subscriptions",
  "/analytics",
  "/forecast",
  "/reports",
  "/plan",
  "/investments",
  "/settings"
];

async function measure(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
    clientWidth: document.scrollingElement?.clientWidth ?? 0,
    // Ширина окна (layout viewport). На телефоне она растёт вместе с лишней
    // шириной содержимого, хотя clientWidth остаётся шириной экрана.
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
    offsetLeft: Math.round(window.visualViewport?.offsetLeft ?? 0)
  }));
}

/** Провести пальцем по середине экрана справа налево — и замерить. */
async function swipeSideways(page: Page, width: number, height: number) {
  const cdp = await page.context().newCDPSession(page);
  const y = Math.round(height / 2);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: width - 20, y }]
  });
  for (let x = width - 20; x > 20; x -= 20) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
  return measure(page);
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}px: ни один экран не уезжает вбок`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    await seedExampleData(page);

    for (const route of ROUTES) {
      await openSettled(page, route);
      const loaded = await measure(page);
      expect
        .soft(loaded.scrollWidth, `${route}: страница шире экрана`)
        .toBeLessThanOrEqual(loaded.clientWidth);
      expect
        .soft(loaded.innerWidth, `${route}: окно телефона растянуто шире экрана`)
        .toBe(loaded.clientWidth);

      await page.evaluate(() => window.scrollTo(0, 200));
      const swiped = await swipeSideways(page, viewport.width, viewport.height);
      expect.soft(swiped.scrollX, `${route}: жест вбок прокрутил страницу`).toBe(0);
      expect.soft(swiped.offsetLeft, `${route}: жест вбок сдвинул экран`).toBe(0);
    }
  });
}

// Сам предохранитель: элемент шире экрана — ровно то, что однажды и растянуло
// окно, — не должен давать экрану ездить. Без overflow-x-clip на корне оболочки
// (components/layout-shell.tsx) здесь окно 466 px на экране 412 и сдвиг 54 px.
test("элемент шире экрана не растягивает окно телефона", async ({ page }) => {
  test.setTimeout(120_000);
  const viewport = { width: 412, height: 915 };
  await page.setViewportSize(viewport);
  await seedExampleData(page);
  await openSettled(page, "/");
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.cssText = "width: 450px; height: 20px";
    document.querySelector("main")!.appendChild(wide);
  });
  await page.waitForTimeout(300);

  const loaded = await measure(page);
  expect(loaded.innerWidth).toBe(loaded.clientWidth);
  expect(loaded.scrollWidth).toBeLessThanOrEqual(loaded.clientWidth);
  const swiped = await swipeSideways(page, viewport.width, viewport.height);
  expect(swiped.scrollX).toBe(0);
  expect(swiped.offsetLeft).toBe(0);
});
