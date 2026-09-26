import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: всё, что открывается, открывается на экране целиком.
//
// Соседние сторожа (responsive, cramping) смотрят на страницу и на диалоги —
// но не на то, что выпадает из кнопки. Поэтому ушла в 2.0.1 панель фильтров
// «Учёта»: на телефоне кнопка стоит у левого края, а панель раскрывалась влево
// и уезжала за экран — половины не видно, нажать нечего.
//
// Здесь на каждом экране, на телефоне и в окне приложения на ПК, нажимается
// каждый выпадающий список, каждая панель и меню, и проверяется, что открывшееся
// лежит в пределах экрана.

const VIEWPORTS = [
  { name: "телефон", width: 360, height: 740 },
  { name: "ПК", width: 1265, height: 780 }
];

const ROUTES = [
  "/",
  "/transactions",
  // С выбранными счётом и типом ряд фильтров длиннее, и на телефоне кнопка
  // «Фильтры» переносится к ЛЕВОМУ краю — ровно тот случай со скриншота.
  "/transactions?accountId=sample-cash&type=EXPENSE",
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

/** Сколько кнопок на экране нажимать — хватает на все, что видны сразу. */
const MAX_TRIGGERS = 30;

const TRIGGERS = [
  'main button[aria-expanded="false"]',
  'main [role="combobox"]:not(input)',
  'main button[aria-haspopup="listbox"]',
  'main button[aria-haspopup="menu"]'
].join(", ");

/** Кнопки, открывающие окна: быстрое добавление, «Добавить счёт» и т. п. */
const DIALOG_OPENERS = [
  'button[aria-haspopup="dialog"]',
  // Быстрое добавление — самое частое окно, а открывается оно своим состоянием,
  // без DialogTrigger: помечено только подписью.
  'button[aria-label="Быстрое добавление операции"]'
].join(", ");
const MAX_DIALOGS = 8;

const DIALOG_TRIGGERS = [
  '[role="combobox"]:not(input)',
  'button[aria-expanded="false"]',
  'button[aria-haspopup="listbox"]'
].join(", ");

/** Пометить всё, что уже есть: новое после нажатия — это и есть открывшееся. */
async function markSeen(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      el.setAttribute("data-fit-seen", "");
    }
  });
}

/** Открывшиеся панели, которые хоть краем за экраном. */
async function offscreenPopups(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.hasAttribute("data-fit-seen")) continue;
      // Только верхний из новых: его детей проверять незачем.
      if (el.parentElement && !el.parentElement.hasAttribute("data-fit-seen")) continue;
      const style = getComputedStyle(el);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      // Всплывающие подсказки о сохранении живут своей жизнью.
      if (el.closest("[data-sonner-toaster]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) continue;
      const scrolls =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight;
      const out: string[] = [];
      if (rect.left < -1) out.push(`слева за краем на ${Math.round(-rect.left)}px`);
      if (rect.right > width + 1)
        out.push(`справа за краем на ${Math.round(rect.right - width)}px`);
      if (rect.top < -1) out.push(`сверху за краем на ${Math.round(-rect.top)}px`);
      // Закреплённое окном (fixed, выпадающие списки Radix) должно помещаться
      // по высоте или прокручиваться само. Absolute прокручивается вместе со
      // страницей — до низа такой панели можно доехать.
      const pinned =
        style.position === "fixed" || el.closest("[data-radix-popper-content-wrapper]");
      if (pinned && rect.bottom > height + 1 && !scrolls) {
        out.push(`снизу за краем на ${Math.round(rect.bottom - height)}px`);
      }
      if (out.length) {
        const label = (
          el.getAttribute("data-testid") ??
          el.getAttribute("role") ??
          el.tagName
        ).toLowerCase();
        found.push(`${label}: ${out.join(", ")}`);
      }
    }
    return found;
  });
}

async function describeTrigger(page: Page, index: number) {
  return page
    .locator(TRIGGERS)
    .nth(index)
    .evaluate((el) =>
      (el.getAttribute("aria-label") ?? el.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40)
    );
}

async function closeEverything(page: Page, index: number) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // Раскрывающиеся блоки Escape не закрывает — их закрывает та же кнопка.
  const trigger = page.locator(TRIGGERS).nth(index);
  if ((await trigger.count()) && (await trigger.getAttribute("aria-expanded")) === "true") {
    await trigger.click({ timeout: 2_000 }).catch(() => undefined);
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route}: всё выпадающее — на экране целиком`, async ({ page }) => {
        test.setTimeout(240_000);
        await seedExampleData(page);
        await openSettled(page, route);

        const problems: string[] = [];
        const total = Math.min(await page.locator(TRIGGERS).count(), MAX_TRIGGERS);
        for (let index = 0; index < total; index++) {
          const trigger = page.locator(TRIGGERS).nth(index);
          if (!(await trigger.count()) || !(await trigger.isVisible())) continue;
          const name = await describeTrigger(page, index);
          await trigger.scrollIntoViewIfNeeded();
          await markSeen(page);
          const clicked = await trigger
            .click({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (!clicked) continue;
          // Если кнопка увела на другой экран — это не выпадающее, вернуться.
          if (new URL(page.url()).pathname !== new URL(route, page.url()).pathname) {
            await openSettled(page, route);
            continue;
          }
          await page.waitForTimeout(350);
          for (const issue of await offscreenPopups(page)) problems.push(`«${name}» → ${issue}`);
          await closeEverything(page, index);
          await page.waitForTimeout(150);
        }

        // Выпадающие списки ВНУТРИ окон: «Новая операция», «Добавить счёт» и
        // прочие. Открываем окна, которые открываются с этого экрана, и в
        // каждом прощёлкиваем его списки.
        const openers = page.locator(DIALOG_OPENERS);
        const dialogs = Math.min(await openers.count(), MAX_DIALOGS);
        for (let which = 0; which < dialogs; which++) {
          const opener = openers.nth(which);
          if (!(await opener.isVisible().catch(() => false))) continue;
          const title =
            (await opener.getAttribute("aria-label")) ?? (await opener.textContent()) ?? "";
          const opened = await opener
            .click({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
          if (!opened) continue;
          const dialog = page.locator('[role="dialog"]').last();
          if (!(await dialog.isVisible().catch(() => false))) {
            await page.keyboard.press("Escape");
            continue;
          }
          await page.waitForTimeout(300);
          const inner = dialog.locator(DIALOG_TRIGGERS);
          const count = Math.min(await inner.count(), MAX_TRIGGERS);
          for (let index = 0; index < count; index++) {
            const trigger = inner.nth(index);
            if (!(await trigger.isVisible().catch(() => false))) continue;
            const name = (
              (await trigger.getAttribute("aria-label")) ??
              (await trigger.textContent()) ??
              ""
            )
              .trim()
              .slice(0, 40);
            await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
            await markSeen(page);
            if (
              !(await trigger
                .click({ timeout: 3_000 })
                .then(() => true)
                .catch(() => false))
            )
              continue;
            await page.waitForTimeout(350);
            for (const issue of await offscreenPopups(page)) {
              problems.push(`окно «${title.trim().slice(0, 30)}» → «${name}» → ${issue}`);
            }
            // Закрыть только список, а не само окно: Escape внутри Radix
            // закрывает верхний слой.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(150);
            if (!(await dialog.isVisible().catch(() => false))) break;
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(250);
          if (new URL(page.url()).pathname !== new URL(route, page.url()).pathname) {
            await openSettled(page, route);
          }
        }

        expect(problems, `${route} на экране «${viewport.name}»`).toEqual([]);
      });
    }
  });
}
