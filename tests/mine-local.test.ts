// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { mineKey, readMine, rememberWho, removeMine, writeMine } from "@/lib/storage/mine";
import { PERSON_MARK } from "@/lib/storage/NamespacedStorageAdapter";

const FILTERS = "tx-saved-filters";

describe("мелочи в localStorage — по одному человеку", () => {
  beforeEach(() => {
    localStorage.clear();
    rememberWho("");
  });

  it("первый человек читает там же, где лежало всегда", () => {
    // Обещание «переносить нечего» касается и мелочей: сохранённые фильтры
    // человека, который на устройстве один, обязаны найтись после обновления.
    localStorage.setItem(FILTERS, '[{"name":"Еда"}]');

    expect(readMine(FILTERS)).toBe('[{"name":"Еда"}]');
    expect(mineKey(FILTERS)).toBe(FILTERS);
  });

  it("второй человек кладёт под своим именем", () => {
    rememberWho("маша");
    writeMine(FILTERS, '[{"name":"Её еда"}]');

    expect(localStorage.getItem(`${PERSON_MARK}маша/${FILTERS}`)).toBe('[{"name":"Её еда"}]');
    expect(localStorage.getItem(FILTERS)).toBeNull();
  });

  it("сосед не видит чужих фильтров", () => {
    // Здесь лежат НАЗВАНИЯ КАТЕГОРИЙ И СУММЫ — то, ради чего разделение и
    // затевалось. Увидеть их соседу нельзя ни при каком стечении.
    writeMine(FILTERS, '[{"name":"Его еда","min":15000}]');
    rememberWho("маша");

    expect(readMine(FILTERS)).toBeNull();
  });

  it("удаление снимает своё, а не чужое", () => {
    writeMine(FILTERS, "его");
    rememberWho("маша");
    writeMine(FILTERS, "её");

    removeMine(FILTERS);

    expect(readMine(FILTERS)).toBeNull();
    rememberWho("");
    expect(readMine(FILTERS)).toBe("его");
  });

  it("настройки вида остаются общими", () => {
    // Плотность, язык, свёрнутые колонки — про окно, а не про человека. Дели
    // мы и их, каждый настраивал бы вид заново, ничего взамен не получая.
    localStorage.setItem("ui-density", "compact");
    rememberWho("маша");

    expect(localStorage.getItem("ui-density")).toBe("compact");
  });
});

/**
 * Сторож: личные мелочи не возвращаются к общему localStorage.
 *
 * Разделение здесь держится не на слое, а на том, что семь мест зовут обёртки.
 * Допиши кто-нибудь восьмое место напрямую — и оно молча станет общим: ошибка
 * не уронит ни одну проверку и обнаружится только чужими категориями на
 * экране соседа. Поэтому сторож читает сами исходники.
 */
const PERSONAL_FILES = [
  "components/transactions/filter-bar.tsx",
  "lib/backup/AutoBackupService.ts",
  "components/settings/cloud-sync-panel.tsx",
  "components/quick-add-fab.tsx",
  "components/automation-runner.tsx",
  "components/onboarding-tour.tsx"
];

function withoutComments(source: string): string {
  return source.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("сторож личных мелочей", () => {
  it.each(PERSONAL_FILES)("%s не трогает localStorage напрямую", (file) => {
    const code = withoutComments(readFileSync(file, "utf8"));

    expect(
      code.includes("localStorage"),
      `${file} хранит личные мелочи. Обращение к localStorage напрямую минует приставку, ` +
        "и это станет чужими категориями на экране соседа. Нужны readMine/writeMine/removeMine."
    ).toBe(false);
  });
});
