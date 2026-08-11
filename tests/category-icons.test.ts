// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { categoryIconNames } from "@/components/category-icon";
import { CATEGORY_ICONS, ICON_GROUPS } from "@/lib/categories/icons";
import { CATEGORY_COLORS, hslToHex, SEED_CATEGORY_COLORS } from "@/lib/categories/palette";

// The picker offers names; a separate file turns names into pictures. If the
// two drift, the owner picks an icon and gets a blank circle — and nothing in
// the app would say why.
describe("category icons", () => {
  it("every offered icon can actually be drawn", () => {
    const drawable = new Set(categoryIconNames());
    const missing = CATEGORY_ICONS.filter((name) => !drawable.has(name));
    expect(missing, "add these to ICON_MAP in components/category-icon.tsx").toEqual([]);
  });

  it("covers the groups people look under, five deep each", () => {
    const expected = [
      "finance",
      "transport",
      "shopping",
      "food",
      "home",
      "health",
      "beauty",
      "fun",
      "bills",
      "sport",
      "leisure",
      "education",
      "family",
      "farm",
      "other"
    ];
    expect(ICON_GROUPS.map((group) => group.id)).toEqual(expected);
    for (const group of ICON_GROUPS) {
      expect(group.icons.length, `${group.id} is too thin`).toBeGreaterThanOrEqual(5);
      expect(new Set(group.icons).size, `${group.id} repeats an icon`).toBe(group.icons.length);
    }
  });
});

describe("category colours", () => {
  it("offers more than a hundred distinct colours", () => {
    expect(CATEGORY_COLORS.length).toBeGreaterThan(100);
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it("keeps the Nocturne seeds first so a fresh install still looks like itself", () => {
    expect(CATEGORY_COLORS.slice(0, SEED_CATEGORY_COLORS.length)).toEqual([
      ...SEED_CATEGORY_COLORS
    ]);
  });

  it("is all valid hex", () => {
    const bad = CATEGORY_COLORS.filter((color) => !/^#[0-9a-f]{6}$/.test(color));
    expect(bad).toEqual([]);
  });

  it("converts hsl to hex the way a browser does", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 0, 0)).toBe("#000000");
  });
});
