import { describe, expect, it } from "vitest";

import { encodeHidden, HIDEABLE_SECTIONS, parseHidden, visibleItems } from "@/lib/nav-visibility";

describe("разделы меню", () => {
  it("сохраняется и читается как было", () => {
    const hidden = new Set(["/investments", "/trips"]);
    expect(parseHidden(encodeHidden(hidden))).toEqual(hidden);
  });

  it("мусор и чужое отбрасываются: главную и учёт скрыть нельзя", () => {
    expect(parseHidden(null)).toEqual(new Set());
    expect(parseHidden("не json")).toEqual(new Set());
    expect(parseHidden('{"a":1}')).toEqual(new Set());
    expect(parseHidden('["/", "/transactions", "/settings", 5, "/trips"]')).toEqual(
      new Set(["/trips"])
    );
    expect(encodeHidden(new Set(["/", "/accounts", "/sheet"]))).toBe('["/sheet"]');
  });

  it("скрытое пропадает из пунктов, остальное остаётся в своём порядке", () => {
    const items = [{ href: "/" }, { href: "/sheet" }, { href: "/goals" }, { href: "/settings" }];
    expect(visibleItems(items, new Set(["/sheet"]))).toEqual([
      { href: "/" },
      { href: "/goals" },
      { href: "/settings" }
    ]);
    expect(visibleItems(items, new Set())).toEqual(items);
  });

  it("убрать можно только необязательное", () => {
    const hrefs = HIDEABLE_SECTIONS.map((section) => section.href);
    for (const core of [
      "/",
      "/transactions",
      "/accounts",
      "/budgets",
      "/settings",
      "/categories"
    ]) {
      expect(hrefs).not.toContain(core);
    }
    expect(hrefs).toContain("/investments");
  });
});
