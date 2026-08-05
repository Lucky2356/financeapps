import { expect, test } from "@playwright/test";

import { openSettled, seedExampleData } from "./helpers";

// Guards the promise that the same bundle is usable on a small phone, a large
// phone and a tablet: nothing may be wider than the screen. A single
// overflowing element pushes the whole document sideways — the page then pans
// horizontally and fixed chrome (header, bottom bar) gets clipped, which is
// exactly what shipped in 1.5.0.
const VIEWPORTS = [
  { name: "small phone", width: 360, height: 740 },
  { name: "large phone", width: 430, height: 932 },
  { name: "tablet", width: 820, height: 1180 },
  // `lg` is where the sidebar and the single-row tab strip both appear — the
  // narrowest layout in which every section tab has to fit one line.
  { name: "laptop", width: 1024, height: 768 }
];

const ROUTES = [
  "/",
  "/transactions",
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
  "/investments",
  "/settings"
];

// Reports every element whose right edge sticks out past the viewport, ignoring
// the ones that legitimately scroll inside their own box (tables, tab strips).
async function findOverflow(page: import("@playwright/test").Page, width: number) {
  return page.evaluate((viewportWidth) => {
    const offenders: Array<{ selector: string; text: string; right: number; width: number }> = [];

    function describe(el: Element) {
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 4).join(".")}`
          : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    }

    // Wide content is allowed as long as some ancestor scrolls it — that is the
    // intended escape hatch for tables and tab strips. Only content that pushes
    // the page itself sideways counts as a defect.
    function scrollsItsOwnContent(el: Element) {
      for (
        let node: Element | null = el;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true;
      }
      return false;
    }

    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (style.position === "fixed") continue;
      // Floating overlays follow the pointer and are painted above the page —
      // they do not widen the layout.
      if (style.position === "absolute" && style.pointerEvents === "none") continue;
      if (scrollsItsOwnContent(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      // 1px of tolerance absorbs sub-pixel rounding of borders and shadows.
      if (rect.right > viewportWidth + 1) {
        // Only report the outermost offender in a chain — a wide child inside a
        // wide parent is one problem, not two.
        const parentOverflows =
          el.parentElement && el.parentElement.getBoundingClientRect().right > viewportWidth + 1;
        if (!parentOverflows) {
          offenders.push({
            selector: describe(el),
            text: (el.textContent ?? "").trim().slice(0, 40),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          });
        }
      }
    }

    return {
      documentWidth: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 10)
    };
  }, width);
}

// Section tabs must be readable at a glance on a phone: none may sit off the
// right edge behind a sideways scroll, and no label may be cut mid-word (1.5.1
// shipped a strip where the active tab read "ерации" instead of "Операции").
// The strip may scroll; a label may never be cut.
async function findUnreadableTabs(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const bars = document.querySelectorAll(
      '[data-testid="hub-tabs"], [data-testid="section-tabs"]'
    );
    for (const bar of Array.from(bars)) {
      // The hub strip scrolls sideways by design (the owner chose the mockup's
      // behaviour), so width alone is not a defect — a CLIPPED LABEL is.
      for (const tab of Array.from(bar.querySelectorAll("a, button"))) {
        const label = (tab.textContent ?? "").trim();
        // The label lives in its own span when it can truncate; otherwise the
        // control itself must not clip.
        const box = tab.querySelector("span") ?? tab;
        if (box.scrollWidth > box.clientWidth + 1) problems.push(`«${label}» обрезана`);
      }
    }
    return problems;
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    for (const route of ["/transactions", "/budgets", "/analytics", "/investments", "/settings"]) {
      test(`${route}: вкладки разделов видны целиком`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await seedExampleData(page);
        await openSettled(page, route);

        const problems = await findUnreadableTabs(page);
        expect(problems, `Вкладки на ${route}:\n  ${problems.join("\n  ")}`).toEqual([]);
      });
    }

    for (const route of ROUTES) {
      test(`${route} fits the screen`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await seedExampleData(page);
        await openSettled(page, route);

        const { documentWidth, offenders } = await findOverflow(page, viewport.width);

        expect(
          offenders,
          `Элементы шире экрана на ${route}:\n${offenders
            .map(
              (o) => `  ${o.selector} «${o.text}» — ширина ${o.width}px, правый край ${o.right}px`
            )
            .join("\n")}`
        ).toEqual([]);
        expect(documentWidth, `Документ шире экрана на ${route}`).toBeLessThanOrEqual(
          viewport.width + 1
        );
      });
    }
  });
}
