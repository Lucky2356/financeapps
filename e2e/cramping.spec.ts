import { devices, expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: экран может не вылезать за края и всё равно быть негодным.
//
// Соседний e2e/responsive.spec.ts проверяет ровно одно — что ничто не шире
// экрана. Этого мало: всё, что нашлось при разборе 1.27.0, эту проверку
// проходило. Командная строка не выходила за края — она была обрезана изнутри,
// без прокрутки, и 75 px списка становились недостижимы. Плитки не выходили за
// края — они писали «Прогноз через 90…» вместо заголовка. Своё же окно
// приложения не выходило за края — оно просто на 15 px не дотягивало до
// брейкпоинта и всегда показывало узкую раскладку.
//
// Здесь проверяется не ширина, а годность: не обрезано ли, влезает ли диалог,
// попадёт ли палец, та ли раскладка в том окне, в котором приложение и
// открывается.

/** Настоящее окно приложения: 1280 из tauri.conf.json минус полоса прокрутки. */
const APP_WINDOW = { width: 1265, height: 780 };

/** Всё, что обрезано непрокручиваемым предком, — то есть потеряно насовсем. */
async function findClipped(page: Page) {
  return page.evaluate(() => {
    const lost: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // Подписи для чтения с экрана: класс sr-only — это как раз коробка 1×1 с
      // обрезкой. Она ничего не показывает глазами и показывать не должна.
      if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
      const hiddenY = style.overflowY === "hidden" || style.overflowY === "clip";
      const hiddenX = style.overflowX === "hidden" || style.overflowX === "clip";
      // Обрезка по горизонтали с многоточием — это осознанное «уместить в
      // строку», а не потеря: у неё есть text-overflow. Потеря — это когда
      // содержимое просто не показано и добраться до него нечем.
      const ellipsis = style.textOverflow === "ellipsis";
      const lostY = hiddenY && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0;
      const lostX =
        hiddenX && !ellipsis && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0;
      if (!lostY && !lostX) continue;
      // -webkit-line-clamp — тоже осознанное решение: столько-то строк и хватит.
      if (style.webkitLineClamp && style.webkitLineClamp !== "none") continue;
      const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
      lost.push(
        `${el.tagName.toLowerCase()}.${cls} — скрыто ${Math.max(
          el.scrollHeight - el.clientHeight,
          el.scrollWidth - el.clientWidth
        )}px, добраться нечем`
      );
    }
    return lost.slice(0, 6);
  });
}

/** Прямоугольник открытого диалога и то, помещается ли он в окно. */
async function dialogBox(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrolls: getComputedStyle(dialog).overflowY === "auto",
      hiddenContent: dialog.scrollHeight - dialog.clientHeight
    };
  });
}

// Диалог, у которого верх выше нуля, недостижим совсем: слой, который его
// центрирует, не прокручивается. Низ ниже экрана — то же самое для кнопки
// сохранения.
async function expectDialogFits(page: Page, what: string) {
  const box = await dialogBox(page);
  expect(box, `${what}: диалог не открылся`).not.toBeNull();
  if (!box) return;
  expect(box.top, `${what}: верх диалога за экраном (${box.top}px)`).toBeGreaterThanOrEqual(-1);
  expect(box.bottom, `${what}: низ диалога за экраном`).toBeLessThanOrEqual(box.viewportHeight + 1);
  expect(box.left, `${what}: левый край за экраном`).toBeGreaterThanOrEqual(-1);
  expect(box.right, `${what}: правый край за экраном`).toBeLessThanOrEqual(box.viewportWidth + 1);
  // Не влез — обязан прокручиваться. Иначе спрятанное потеряно.
  if (box.hiddenContent > 1) {
    expect(box.scrolls, `${what}: не влезло ${box.hiddenContent}px, и прокрутки нет`).toBe(true);
  }
}

const SHORT_SCREENS = [
  { name: "телефон", width: 360, height: 640 },
  // Альбомная ориентация — тот случай, на котором командная строка теряла
  // список: высоты вдвое меньше, а диалог тот же.
  { name: "телефон боком", width: 640, height: 360 }
];

for (const screen of SHORT_SCREENS) {
  test(`${screen.name}: диалоги влезают и не теряют содержимое`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await seedExampleData(page);
    await openSettled(page, "/");

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectDialogFits(page, "командная строка");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.keyboard.press("Alt+n");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectDialogFits(page, "быстрое добавление");

    const lost = await findClipped(page);
    expect(lost, `Потеряно внутри диалога:\n  ${lost.join("\n  ")}`).toEqual([]);
  });
}

test("телефон: подписи плиток не обрезаны", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedExampleData(page);

  for (const route of ["/", "/forecast", "/transactions", "/investments"]) {
    await openSettled(page, route);
    const cut = await page.evaluate(() => {
      const bad: string[] = [];
      for (const grid of Array.from(document.querySelectorAll('[data-testid="stat-grid"]'))) {
        for (const line of Array.from(grid.querySelectorAll("p"))) {
          // Сумма обрезаться не должна вовсе, подпись и заголовок — тоже: у них
          // есть запас строк. Если содержимое всё равно не поместилось, человек
          // читает огрызок и не знает, что это было.
          if (line.scrollHeight > line.clientHeight + 1 && line.clientHeight > 0) {
            bad.push(`«${(line.textContent ?? "").trim().slice(0, 40)}»`);
          }
        }
      }
      return bad;
    });
    expect(cut, `Обрезано на ${route}: ${cut.join(", ")}`).toEqual([]);
  }
});

test("окно приложения получает широкую раскладку, а не телефонную", async ({ page }) => {
  await page.setViewportSize(APP_WINDOW);
  await seedExampleData(page);
  await openSettled(page, "/");

  // Приложение открывается окном 1280, и с полосой прокрутки это 1265 — на
  // пятнадцать пикселей меньше брейкпоинта xl. Раскладки, заведённые от xl,
  // в своём же окне не включались никогда: «Обзор» показывал две плитки в ряд
  // вместо четырёх, а экраны оставались одноколоночными.
  const columns = await page
    .getByTestId("stat-grid")
    .first()
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(columns, `В окне ${APP_WINDOW.width}px плиток в ряду: ${columns}`).toBeGreaterThanOrEqual(
    4
  );
});

test.describe("палец", () => {
  // Мобильная эмуляция Chromium — единственное, что включает pointer: coarse,
  // а правило про размер кнопок написано именно под него. Берутся только те
  // поля, что не меняют браузер: целиком devices[...] тянет defaultBrowserType
  // и требует отдельного рабочего процесса.
  test.use({
    viewport: devices["Pixel 7"].viewport,
    isMobile: true,
    hasTouch: true
  });

  test("главные кнопки не мельче пальца", async ({ page }) => {
    await seedExampleData(page);
    await openSettled(page, "/transactions");

    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
      "эмуляция не дала coarse pointer — проверка ничего не проверяет"
    ).toBe(true);

    const small = await page.evaluate(() => {
      const tooSmall: string[] = [];
      for (const el of Array.from(document.querySelectorAll(".tap-target"))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < 40 || rect.height < 40) {
          tooSmall.push(
            `${el.getAttribute("aria-label") ?? el.tagName} — ${Math.round(
              rect.width
            )}×${Math.round(rect.height)}`
          );
        }
      }
      return tooSmall;
    });
    expect(small, `Мельче пальца:\n  ${small.join("\n  ")}`).toEqual([]);
  });
});
