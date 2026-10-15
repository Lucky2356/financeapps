import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: заголовки карточек на телефоне ничем не закрыты.
//
// На «Счетах» в шапке «Истории остатка» стояли заголовок и два списка в
// одном ряду с переносом. Но у заголовка было flex-1 min-w-0: он сжимался до
// нуля раньше, чем ряд переносился, текст вылезал из своей коробки — и списки
// ложились поверх него («И… с…» под «Все деньги»). Ни один сторож этого не
// видел: коробка заголовка была на экране и ничем не перекрыта — перекрыт был
// его текст.
//
// Здесь меряется сам текст (Range по содержимому заголовка): у каждого
// видимого заголовка точки по краям текста должны принадлежать ему же.

const ROUTES = [
  "/",
  "/transactions",
  "/accounts",
  "/debts",
  "/categories",
  "/budgets",
  "/goals",
  "/recurring",
  "/subscriptions",
  "/analytics",
  "/forecast",
  "/reports",
  "/plan",
  "/investments",
  "/sheet",
  "/settings"
];

for (const width of [360, 412]) {
  test.describe(`телефон ${width}px`, () => {
    test.use({ viewport: { width, height: 915 }, isMobile: true, hasTouch: true });

    for (const route of ROUTES) {
      test(`${route}: заголовки карточек не закрыты`, async ({ page }) => {
        test.setTimeout(120_000);
        await seedExampleData(page);
        await openSettled(page, route);

        // Карточки ниже первого экрана монтируются, когда до них долистали
        // («История остатка» — одна из них). Сначала — вниз до конца.
        await page.evaluate(async () => {
          const frame = () => new Promise((resolve) => setTimeout(resolve, 120));
          for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
            window.scrollTo({ top: y, behavior: "instant" });
            await frame();
          }
        });
        await page.waitForTimeout(500);

        const covered = await page.evaluate(async () => {
          const problems: string[] = [];
          const headings = Array.from(
            document.querySelectorAll<HTMLElement>("main h1, main h2, main h3")
          ).filter((el) => el.offsetParent !== null && (el.textContent ?? "").trim() !== "");
          for (const heading of headings) {
            heading.scrollIntoView({ block: "center" });
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            const range = document.createRange();
            range.selectNodeContents(heading);
            // Каждая строка текста — свой прямоугольник; проверяем края каждой.
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width < 4 || rect.height < 4) continue;
              const y = rect.top + rect.height / 2;
              for (const x of [rect.left + 2, rect.right - 2]) {
                if (y < 0 || y > window.innerHeight) continue;
                const hit = document.elementFromPoint(x, y);
                // Липкая шапка приложения может закрывать на миг — она не в main.
                if (hit && !hit.closest("main")) continue;
                if (!hit || !heading.contains(hit)) {
                  const what = (hit?.getAttribute("aria-label") ?? hit?.textContent ?? "")
                    .trim()
                    .slice(0, 30);
                  problems.push(
                    `«${(heading.textContent ?? "").trim().slice(0, 30)}» закрыт: ${hit?.tagName.toLowerCase() ?? "ничего"} «${what}»`
                  );
                  break;
                }
              }
            }
          }
          // Подписи осей графиков — целиком внутри своего графика: svg режет
          // всё, что за его краем, и «800 тыс. ₽» читалось «) тыс. ₽».
          for (const label of Array.from(
            document.querySelectorAll<SVGTextElement>(
              "main .recharts-cartesian-axis-tick text, main .recharts-cartesian-axis-tick-label text"
            )
          )) {
            const svg = label.ownerSVGElement;
            if (!svg) continue;
            const box = label.getBoundingClientRect();
            // Режет svg — или ближайший предок с обрезкой (карточка).
            let clipper: Element = svg;
            for (let el = svg.parentElement; el; el = el.parentElement) {
              const overflow = getComputedStyle(el).overflowX;
              if (overflow !== "visible") {
                clipper = el;
                break;
              }
            }
            const own = svg.getBoundingClientRect();
            const outer = clipper.getBoundingClientRect();
            const frame = {
              left: Math.max(own.left, outer.left),
              right: Math.min(own.right, outer.right)
            };
            if (box.width === 0) continue;
            if (box.left < frame.left - 1 || box.right > frame.right + 1) {
              problems.push(`подпись оси «${label.textContent ?? ""}» обрезана краем графика`);
            }
          }
          return [...new Set(problems)];
        });

        expect(covered, `${route} на ${width}px`).toEqual([]);
      });
    }
  });
}
