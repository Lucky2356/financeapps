import { describe, expect, it } from "vitest";

import { CATALOGS, translate } from "@/lib/i18n/catalog";
import { pluralizeTemplate } from "@/lib/i18n/plural";

// Строки словаря с числом: «1 строк», «2 дней», "1 rows" — так было. Формы
// слова теперь в самой строке: {n:строка|строки|строк}, {n:row|rows}.

describe("формы слова в строке словаря", () => {
  it("русский: по последним цифрам, падеж — какой написан", () => {
    const t = (n: number) => pluralizeTemplate("{n} {n:строка|строки|строк}", { n }, "ru");
    expect([1, 2, 5, 11, 21, 22, 25, 101, 111].map(t)).toEqual([
      "{n} строка",
      "{n} строки",
      "{n} строк",
      "{n} строк",
      "{n} строка",
      "{n} строки",
      "{n} строк",
      "{n} строка",
      "{n} строк"
    ]);
  });

  it("английский: две формы", () => {
    expect(pluralizeTemplate("{n:row|rows}", { n: 1 }, "en")).toBe("row");
    expect(pluralizeTemplate("{n:row|rows}", { n: 0 }, "en")).toBe("rows");
    expect(pluralizeTemplate("{n:row|rows}", { n: 2 }, "en")).toBe("rows");
  });

  it("число строкой: целое, дробь из toFixed, тысячи с разделителем", () => {
    expect(pluralizeTemplate("{m:month|months}", { m: "1" }, "en")).toBe("month");
    // Дробь, которую видно, — дробь: "1.0 months", «1,0 месяца».
    expect(pluralizeTemplate("{m:month|months}", { m: "1.0" }, "en")).toBe("months");
    expect(pluralizeTemplate("{m:месяц|месяца|месяцев}", { m: "1.0" }, "ru")).toBe("месяца");
    expect(pluralizeTemplate("{m:месяц|месяца|месяцев}", { m: "2,5" }, "ru")).toBe("месяца");
    // По-английски запятая — тысячи: 1,001 — это одна тысяча один.
    expect(pluralizeTemplate("{n:row|rows}", { n: "1,001" }, "en")).toBe("rows");
    expect(pluralizeTemplate("{n:строка|строки|строк}", { n: "1 001" }, "ru")).toBe("строка");
    // Не число — форма «много», а не исключение.
    expect(pluralizeTemplate("{n:row|rows}", { n: "—" }, "en")).toBe("rows");
  });

  it("без переменной — разметка остаётся как есть", () => {
    expect(pluralizeTemplate("{n:row|rows}", {}, "en")).toBe("{n:row|rows}");
  });
});

describe("строки приложения", () => {
  it("импорт CSV", () => {
    expect(translate("ru", "imp.importBtn", { n: 1 })).toBe("Импортировать 1 строку");
    expect(translate("ru", "imp.importBtn", { n: 3 })).toBe("Импортировать 3 строки");
    expect(translate("ru", "imp.importBtn", { n: 5 })).toBe("Импортировать 5 строк");
    expect(translate("en", "imp.importBtn", { n: 1 })).toBe("Import 1 row");
    expect(translate("en", "imp.importBtn", { n: 7 })).toBe("Import 7 rows");
    expect(translate("ru", "imp.readyToImport", { valid: 1, total: 21 })).toBe(
      "Готово к импорту: 1 из 21 строки"
    );
    expect(translate("ru", "imp.readyToImport", { valid: 2, total: 2 })).toBe(
      "Готово к импорту: 2 из 2 строк"
    );
    expect(translate("ru", "imp.skippedRows", { n: 2 })).toBe(
      "Пропущено: 2 строки (дубликаты или ошибки формата)"
    );
    expect(translate("ru", "imp.toast.imported", { imported: 1, skipped: 0 })).toBe(
      "CSV импортирован: 1 строка, пропущено: 0"
    );
    expect(translate("en", "imp.toast.undone", { removed: 1 })).toBe(
      "Last import undone: 1 transaction removed"
    );
  });

  it("категории и уведомления", () => {
    expect(translate("ru", "cat.cantDelete", { count: 1 })).toBe("Нельзя удалить: 1 операция");
    expect(translate("ru", "cat.cantDelete", { count: 4 })).toBe("Нельзя удалить: 4 операции");
    expect(translate("en", "cat.count", { count: 1 })).toBe("1 txn");
    expect(translate("en", "cat.delete.descUsed", { name: "Еда", count: 2 })).toBe(
      "Category “Еда” is used in 2 transactions. This cannot be undone."
    );
    expect(translate("ru", "notif.ariaSome", { count: 1 })).toBe("1 важное уведомление");
    expect(translate("ru", "notif.ariaSome", { count: 3 })).toBe("3 важных уведомления");
    expect(translate("en", "notif.ariaSome", { count: 1 })).toBe("1 important notification");
    expect(translate("en", "notif.due.inDays", { days: 1 })).toBe("in 1 day");
  });

  it("месяцы и дни", () => {
    expect(translate("ru", "set.risk.fund.months", { n: 3 })).toBe("3 месяца расходов");
    expect(translate("ru", "set.risk.fund.months", { n: 12 })).toBe("12 месяцев расходов");
    expect(translate("en", "set.risk.fund.months", { n: 3 })).toBe("3 months of expenses");
    expect(translate("en", "svc.goal.monthsLeft", { n: 1 })).toBe("1 month left");
    expect(translate("en", "deposit.daysLeft", { days: 1 })).toBe("1 day left");
    expect(translate("en", "ef.reached", { months: "6.0" })).toBe(
      "Goal reached: the reserve covers 6.0 months of expenses."
    );
    expect(translate("ru", "inv.toast.marketRefreshed", { n: 21, source: "MOEX" })).toBe(
      "Рыночные данные обновлены: 21 бумага, источник MOEX"
    );
  });

  it("строка без перевода берёт русские формы", () => {
    const key = "test.plural.untranslated";
    CATALOGS.ru[key] = "{n} {n:день|дня|дней}";
    try {
      expect(translate("en", key, { n: 2 })).toBe("2 дня");
    } finally {
      delete CATALOGS.ru[key];
    }
  });

  it("у каждой строки с формами — столько же форм-подстановок в обоих языках", () => {
    const marks = (text: string) => (text.match(/\{\w+:[^{}]+\}/g) ?? []).length;
    for (const [key, ru] of Object.entries(CATALOGS.ru)) {
      const en = CATALOGS.en[key];
      if (en === undefined) continue;
      // Русская строка с формами и английская без них — значит, в одном языке
      // число со словом не согласуется. Обратное (только в английском) бывает:
      // по-русски слово стоит до числа, «Удалено операций: 3».
      if (marks(ru) > 0) expect(marks(en), key).toBeGreaterThan(0);
    }
  });
});
