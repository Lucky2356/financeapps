import { describe, expect, it } from "vitest";

import { CATALOGS, LOCALES, translate } from "@/lib/i18n/catalog";

describe("i18n translate", () => {
  it("returns the locale string when present", () => {
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("ru", "nav.home")).toBe("Главная");
  });

  it("returns the key itself when it is missing everywhere", () => {
    expect(translate("en", "definitely.missing.key")).toBe("definitely.missing.key");
  });

  it("every English key has a Russian counterpart (no orphan keys)", () => {
    const ruKeys = new Set(Object.keys(CATALOGS.ru));
    for (const key of Object.keys(CATALOGS.en)) {
      expect(ruKeys.has(key), `ru is missing key: ${key}`).toBe(true);
    }
  });

  it("covers exactly the two supported locales", () => {
    expect([...LOCALES].sort()).toEqual(["en", "ru"]);
  });
});
