import { expect, test, type Page } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// GUARD: узкие телефоны. Соседние проверки (responsive, cramping) ловят страницу,
// которая шире экрана, и содержимое, обрезанное предком. Мимо них проходили две
// другие поломки, которые владелец увидел на телефоне 2.4.0:
//  • текст вплотную к рамке карточки — у карточки нет внутреннего отступа;
//  • слова длиннее своей кнопки — кнопка «не переносит», слово торчит за её край
//    и наезжает на соседа.
// Обе видны только глазами и только на узком экране, поэтому смотрим на 320, 360 и
// 412 px — самый узкий, ходовой и широкий телефон.

const SIZES = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 412, height: 915 }
];

const ROUTES = [
  "/",
  "/transactions",
  "/budgets",
  "/plan",
  "/sheet",
  "/investments",
  "/deductions",
  "/what-if",
  "/family",
  "/settings?section=general",
  "/settings?section=finance",
  "/settings?section=sync",
  "/settings?section=data",
  "/settings?section=security",
  "/settings?section=about"
];

async function findNarrowDefects(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const describe = (el: Element) => {
      const cls =
        typeof el.className === "string"
          ? el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
      return `${el.tagName.toLowerCase()}.${cls} «${text}»`;
    };
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 1 &&
        rect.height > 1
      );
    };
    // Слово, обрезанное многоточием или прокруткой предка, — осознанное решение, а
    // не торчащий наружу текст.
    const clippedByDesign = (node: Node, stop: Element) => {
      for (let el = node.parentElement; el && el !== stop.parentElement; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.textOverflow === "ellipsis") return true;
        if (style.overflowX === "hidden" || style.overflowX === "clip") return true;
        if (style.webkitLineClamp && style.webkitLineClamp !== "none") return true;
      }
      return false;
    };

    // 1. Слова шире своей кнопки/ссылки/подписи.
    for (const el of Array.from(
      document.querySelectorAll("button,a,label,[role=tab],[role=radio]")
    )) {
      if (!visible(el) || el.closest(".sr-only")) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === "hidden" || style.overflowX === "clip") continue;
      const box = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node.textContent ?? "").trim() || clippedByDesign(node, el)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && (rect.right > box.right + 1.5 || rect.left < box.left - 1.5)) {
          out.push(`слово шире кнопки (${Math.round(rect.right - box.right)}px): ${describe(el)}`);
          break;
        }
      }
    }

    // 2. Текст вплотную к рамке карточки.
    const boxed = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) > 0 &&
        parseFloat(style.borderTopLeftRadius) > 0
      );
    };
    for (const el of Array.from(document.querySelectorAll("p,span,h1,h2,h3,li,div"))) {
      if (!visible(el) || el.closest("button,a,input,select,textarea,label,th,td,[role]")) continue;
      const own = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 2
      );
      if (!own) continue;
      let card: Element | null = el;
      while (card && card !== document.body && !boxed(card)) card = card.parentElement;
      if (!card || card === document.body || card.matches("[data-sonner-toast]")) continue;
      const range = document.createRange();
      range.selectNodeContents(own);
      const text = range.getClientRects()[0];
      const frame = card.getBoundingClientRect();
      if (text && frame.width > 60 && text.left - frame.left < 6) {
        out.push(
          `текст вплотную к рамке (${(text.left - frame.left).toFixed(1)}px): ${describe(el)}`
        );
      }
    }
    return Array.from(new Set(out));
  });
}

test("узкие телефоны: слова не вылезают за кнопки, текст не липнет к рамкам", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedExampleData(page);

  const failures: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const route of ROUTES) {
      await openSettled(page, route);
      await page.waitForTimeout(300);
      for (const defect of await findNarrowDefects(page)) {
        failures.push(`${size.width}×${size.height} ${route} — ${defect}`);
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
