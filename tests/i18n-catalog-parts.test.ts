import { describe, expect, it } from "vitest";

import { CATALOGS, loadLocale } from "@/lib/i18n/catalog";
import { ru as ruApi } from "@/lib/i18n/catalog-api";
import { en as enApi } from "@/lib/i18n/catalog-api-en";
import { ru as ruData } from "@/lib/i18n/catalog-data";
import { en as enData } from "@/lib/i18n/catalog-data-en";
import { ru as ruUi } from "@/lib/i18n/catalog-ui";
import { en as enUi } from "@/lib/i18n/catalog-ui-en";

// Словари частей приложения: у каждой русской строки есть английская и
// наоборот — английская версия полная, а не «где успели». И ни одна часть не
// перекрывает ключ основного словаря или другой части: перекрытие молча
// заменило бы чужую строку.

const PARTS = [
  ["api", ruApi, enApi],
  ["data", ruData, enData],
  ["ui", ruUi, enUi]
] as const;

describe("словари частей", () => {
  for (const [name, ru, en] of PARTS) {
    it(`${name}: русский и английский — одни и те же ключи`, () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
      for (const [key, value] of Object.entries(en)) {
        expect(value.trim(), `пустой перевод: ${key}`).not.toBe("");
      }
    });
  }

  it("ключи частей не повторяют друг друга", () => {
    const seen = new Map<string, string>();
    for (const [name, ru] of PARTS) {
      for (const key of Object.keys(ru)) {
        expect(seen.get(key), `${key} есть и в ${seen.get(key)}, и в ${name}`).toBeUndefined();
        seen.set(key, name);
      }
    }
  });

  it("английский подгружается вместе со всеми частями", async () => {
    await loadLocale("en");
    for (const [, , en] of PARTS) {
      for (const [key, value] of Object.entries(en)) expect(CATALOGS.en[key]).toBe(value);
    }
  });
});
