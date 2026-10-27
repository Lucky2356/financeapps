import { describe, expect, it } from "vitest";

import { CATALOGS, translate } from "@/lib/i18n/catalog";
import { en as enApi } from "@/lib/i18n/catalog-api-en";
import { en as enData } from "@/lib/i18n/catalog-data-en";
import { en } from "@/lib/i18n/catalog-en";
import { ru as ui } from "@/lib/i18n/catalog-ui";
import { en as uiEn } from "@/lib/i18n/catalog-ui-en";

// Строка без перевода не ломает экран — она просто остаётся русской. Поэтому
// её и не замечают: английский интерфейс годами показывал русские слова там,
// где ключа в английском словаре не завели. Здесь — что каждому русскому ключу
// есть английская пара, и что английские строки действительно английские.

// Названия языков в переключателе пишутся на своём языке: «Русский» — и в
// английском интерфейсе.
const CYRILLIC_ALLOWED = new Set(["settings.language.ru"]);

describe("английский словарь полон", () => {
  it("у каждого ключа русского словаря есть английский перевод", () => {
    // Основной словарь и все части (api, data, ui) вместе.
    const english = { ...en, ...enApi, ...enData, ...uiEn };
    const missing = Object.keys(CATALOGS.ru).filter((key) => !(key in english));
    expect(missing).toEqual([]);
  });

  it("слова экранов (catalog-ui) — те же ключи в обоих языках и с приставкой ui.", () => {
    expect(Object.keys(uiEn).sort()).toEqual(Object.keys(ui).sort());
    for (const key of Object.keys(ui)) expect(key.startsWith("ui."), key).toBe(true);
  });

  it("английские строки не по-русски", () => {
    const cyrillic = Object.entries({ ...en, ...enApi, ...enData, ...uiEn })
      .filter(([key, value]) => !CYRILLIC_ALLOWED.has(key) && /[А-Яа-яЁё]/.test(value))
      .map(([key]) => key);
    expect(cyrillic).toEqual([]);
  });

  it("слова экранов подгружаются вместе с английским словарём", () => {
    expect(translate("en", "ui.rep.noPrevYear", { prev: 2025 })).toBe("no data for 2025");
    expect(translate("ru", "ui.rep.noPrevYear", { prev: 2025 })).toBe("за 2025 нет данных");
  });
});
