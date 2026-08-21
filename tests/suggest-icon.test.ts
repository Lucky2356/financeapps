import { describe, expect, it } from "vitest";

import { CATEGORY_ICONS } from "@/lib/categories/icons";
import {
  suggestIconForName,
  suggestableIcons,
  unknownSuggestedIcons
} from "@/lib/categories/suggest-icon";

describe("the icon a category name asks for", () => {
  it("dresses the everyday categories", () => {
    expect(suggestIconForName("Продукты")).toBe("ShoppingCart");
    expect(suggestIconForName("Кафе и рестораны")).toBe("Utensils");
    expect(suggestIconForName("Бензин")).toBe("Fuel");
    expect(suggestIconForName("Аптека")).toBe("Pill");
    expect(suggestIconForName("Зарплата")).toBe("Banknote");
    expect(suggestIconForName("Подписки")).toBe("Repeat");
  });

  it("understands English names too", () => {
    expect(suggestIconForName("Groceries")).toBe("ShoppingCart");
    expect(suggestIconForName("Rent")).toBe("Home");
    expect(suggestIconForName("Salary")).toBe("Banknote");
  });

  it("reads a name written the way people actually write it", () => {
    expect(suggestIconForName("ПРОДУКТЫ ДОМОЙ")).toBe("ShoppingCart");
    expect(suggestIconForName("продуктовый магазин")).toBe("ShoppingCart");
    expect(suggestIconForName("Такси / каршеринг")).toBe("Car");
  });

  it("lets the longer, more specific phrase win", () => {
    // "доставка" alone is a parcel; food delivery is a meal.
    expect(suggestIconForName("Доставка")).toBe("Package");
    expect(suggestIconForName("Доставка еды")).toBe("Utensils");
  });

  it("keeps a short word from claiming a longer one", () => {
    // "кот" is a cat; "котлеты" is not.
    expect(suggestIconForName("Кот")).toBe("Cat");
    expect(suggestIconForName("Котлеты")).toBeNull();
  });

  it("says nothing rather than guessing wrong", () => {
    expect(suggestIconForName("Прочее")).toBeNull();
    expect(suggestIconForName("")).toBeNull();
    expect(suggestIconForName("   ")).toBeNull();
    expect(suggestIconForName("Ыъ")).toBeNull();
  });

  it("only ever names a picture the picker actually carries", () => {
    expect(unknownSuggestedIcons()).toEqual([]);
    for (const icon of suggestableIcons()) {
      expect(CATEGORY_ICONS, `unknown icon: ${icon}`).toContain(icon);
    }
  });
});
