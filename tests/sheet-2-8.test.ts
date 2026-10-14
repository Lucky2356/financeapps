import { describe, expect, it } from "vitest";

import { sheetCsv } from "@/components/sheet/budget-sheet/export-csv";
import { monthLabel, monthShort, sheetCount } from "@/components/sheet/sheet-text";
import type { DisplayColumn, SheetWords } from "@/components/sheet/sheet-types";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { aboveUsual, median, unusualExpenses } from "@/lib/sheet/highlight";
import { totalSeries } from "@/lib/sheet/insights";
import { cellKey, computeSheet, type SheetCell, type SheetColumn } from "@/lib/sheet/model";
import { matchCategory, sheetTemplate, SHEET_TEMPLATES } from "@/lib/sheet/templates";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// «Таблица» 2.8: подсветка «выше обычного», единые сокращения месяцев, слова
// при числе, график итогов и шаблоны мастера.

describe("выше обычного", () => {
  it("медиана: нечётное, чётное и пустое", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 40, 20, 30])).toBe(25);
    expect(median([])).toBeNull();
  });

  it("подсвечивает с 1,3 обычного и пишет, на сколько процентов", () => {
    expect(aboveUsual(13_400, [10_000, 10_000, 10_000])).toEqual({ usual: 10_000, percent: 34 });
    // Ровно порог — уже подсветка; чуть ниже — нет.
    expect(aboveUsual(13_000, [10_000, 10_000, 10_000])?.percent).toBe(30);
    expect(aboveUsual(12_999, [10_000, 10_000, 10_000])).toBeNull();
  });

  it("обычное — медиана, а не среднее: один дорогой месяц его не задирает", () => {
    // Среднее 40 000 спрятало бы 14 000; медиана 10 000 — нет.
    expect(aboveUsual(14_000, [10_000, 100_000, 10_000, 10_000, 70_000])?.usual).toBe(10_000);
  });

  it("меньше трёх месяцев истории — «обычного» ещё нет", () => {
    expect(aboveUsual(50_000, [10_000, 10_000])).toBeNull();
  });

  it("пусто, ноль, минус и нулевая история — не подсвечиваются", () => {
    expect(aboveUsual(null, [1, 1, 1])).toBeNull();
    expect(aboveUsual(0, [1, 1, 1])).toBeNull();
    expect(aboveUsual(-5, [1, 1, 1])).toBeNull();
    expect(aboveUsual(5_000, [0, 0, 0])).toBeNull();
  });

  const columns: SheetColumn[] = [
    { id: "in", name: "Доходы", kind: "income", order: 0 },
    { id: "food", name: "Продукты", kind: "expense", order: 1 },
    { id: "save", name: "В сбережения", kind: "toSavings", order: 2 }
  ];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const cells = (food: Array<string | null>, other: string): SheetCell[] =>
    months.flatMap((month, index) => [
      ...(food[index] === null ? [] : [{ month, columnId: "food", input: food[index]! }]),
      { month, columnId: "in", input: other },
      { month, columnId: "save", input: other }
    ]);

  it("по таблице: только расходы, только после трёх заполненных месяцев", () => {
    const sheet = computeSheet({
      columns,
      months,
      // Апрель пустой — не «ноль потратили»: в историю не идёт.
      cells: cells(["10000", "12000", "40000", null, "16000", "15600"], "900000")
    });
    const found = unusualExpenses(sheet.rows, columns);
    // Март — всего два месяца до него: рано. Май: медиана 10 000/12 000/40 000 —
    // 12 000, 16 000 выше на 33%. Июнь: медиана четырёх — 14 000, 15 600 ниже порога.
    expect([...found.keys()]).toEqual([cellKey("2026-05", "food")]);
    expect(found.get(cellKey("2026-05", "food"))).toEqual({ usual: 12_000, percent: 33 });
  });

  it("формула считается числом, ошибка — не история и не подсветка", () => {
    const sheet = computeSheet({
      columns,
      months,
      cells: cells(["10000", "=5000+5000", "10000", "=1/0", "=10000*2", "10000"], "1")
    });
    const found = unusualExpenses(sheet.rows, columns);
    expect([...found.keys()]).toEqual([cellKey("2026-05", "food")]);
    expect(found.get(cellKey("2026-05", "food"))?.percent).toBe(100);
  });
});

describe("сокращения месяцев", () => {
  it("по-русски — три буквы у всех, без точек и вразнобойных «Нояб», «Февр»", () => {
    const all = Array.from({ length: 12 }, (_, index) =>
      monthShort(`2026-${String(index + 1).padStart(2, "0")}`, "ru")
    );
    expect(all).toEqual([
      "Янв",
      "Фев",
      "Мар",
      "Апр",
      "Май",
      "Июн",
      "Июл",
      "Авг",
      "Сен",
      "Окт",
      "Ноя",
      "Дек"
    ]);
    expect(monthLabel("2026-11", "ru")).toBe("Ноя 2026");
    expect(monthLabel("2027-02", "ru")).toBe("Фев 2027");
    expect(monthLabel("2026-09", "ru", "long")).toBe("Сентябрь 2026");
  });

  it("по-английски — Jan…Dec", () => {
    expect(monthLabel("2026-11", "en")).toBe("Nov 2026");
    expect(monthShort("2026-06", "en")).toBe("Jun");
    expect(monthLabel("2026-06", "en", "long")).toBe("June 2026");
  });
});

describe("слова при числе", () => {
  it("месяцы, клетки, статьи и столбцы — в нужной форме", () => {
    expect(sheetCount(1, "months")).toBe("1 месяц");
    expect(sheetCount(3, "months")).toBe("3 месяца");
    expect(sheetCount(12, "months")).toBe("12 месяцев");
    expect(sheetCount(21, "monthsIn")).toBe("21 месяце");
    expect(sheetCount(11, "monthsIn")).toBe("11 месяцах");
    expect(sheetCount(2, "cells")).toBe("2 клетки");
    expect(sheetCount(5, "articles")).toBe("5 статей");
    expect(sheetCount(1, "columns")).toBe("1 столбец");
    expect(sheetCount(1, "months", "en")).toBe("1 month");
    expect(sheetCount(6, "cells", "en")).toBe("6 cells");
  });
});

describe("Итог — одним словом", () => {
  it("в выгрузке столбец называется так же, как в таблице", () => {
    const words = { month: "Месяц", total: "Итог", savingsTotal: "Итог сбережений" } as SheetWords;
    const display: DisplayColumn[] = [{ type: "total" }];
    const csv = sheetCsv(display, [], words);
    expect(csv.replace("﻿", "")).toBe('"Месяц";"Итог"');
  });
});

describe("график итогов", () => {
  it("месяц за месяцем, минус отмечен, нынешний — тоже", () => {
    const sheet = computeSheet({
      columns: [
        { id: "o", name: "Остаток", kind: "opening", order: 0 },
        { id: "e", name: "Жильё", kind: "expense", order: 1 }
      ],
      months: ["2026-09", "2026-10", "2026-11"],
      cells: [
        { month: "2026-09", columnId: "o", input: "10000" },
        { month: "2026-09", columnId: "e", input: "4000" },
        { month: "2026-10", columnId: "e", input: "4000" },
        { month: "2026-11", columnId: "e", input: "4000" }
      ]
    });
    expect(totalSeries(sheet.rows, "2026-10")).toEqual([
      { month: "2026-09", total: 6000, negative: false, now: false },
      { month: "2026-10", total: 2000, negative: false, now: true },
      { month: "2026-11", total: -2000, negative: true, now: false }
    ]);
  });
});

describe("шаблоны новой таблицы", () => {
  const api = () => new LocalApiClient(new MemoryStorageAdapter());
  const shape = (columns: SheetColumn[]) =>
    columns.map((column) => `${column.kind}:${column.name}`);

  it("у каждого шаблона — понятные виды столбцов", () => {
    for (const template of Object.values(SHEET_TEMPLATES)) {
      expect(template.lead[0].kind).toBe("opening");
      expect(template.lead.slice(1).every((column) => column.kind === "income")).toBe(true);
      expect(template.tail.every((column) => column.kind === "note")).toBe(true);
      expect(
        template.savings.every((column) =>
          ["savingsOpening", "toSavings", "savingsIncome", "fromSavings"].includes(column.kind)
        )
      ).toBe(true);
      expect(new Set(template.articles).size).toBe(template.articles.length);
    }
    expect(sheetTemplate("renovation")?.id).toBe("renovation");
    expect(sheetTemplate("чужое")).toBeNull();
  });

  it("«Ремонт» одним запросом: статьи шаблона, заметка, без сбережений, полгода", async () => {
    const result = await api().post("/sheet", {
      action: "start",
      template: "renovation",
      from: "2026-10"
    });
    expect(shape(result.columns)).toEqual([
      "opening:Отложено на ремонт",
      "income:Откладываю в месяц",
      "expense:Черновые материалы",
      "expense:Чистовые материалы",
      "expense:Работа мастеров",
      "expense:Сантехника и электрика",
      "expense:Мебель",
      "expense:Техника",
      "expense:Доставка и вывоз мусора",
      "expense:Непредвиденное",
      "note:Что сделано"
    ]);
    expect(result.months).toHaveLength(6);
  });

  it("«Семейный бюджет» из мастера: снятые статьи не попадают, суммы — в клетки", async () => {
    const result = await api().post("/sheet", {
      action: "start",
      template: "family",
      from: "2026-10",
      months: 12,
      opening: 40000,
      income: 150000,
      savings: true,
      articles: [
        { name: "Продукты", categoryId: "cat-food", monthly: 30000 },
        { name: "Дети", categoryId: null, monthly: "" }
      ]
    });
    expect(shape(result.columns)).toEqual([
      "opening:Остаток",
      "income:Зарплата",
      "income:Прочие доходы",
      "expense:Продукты",
      "expense:Дети",
      "note:Заметки",
      "savingsOpening:Подушка на начало",
      "toSavings:В сбережения",
      "savingsIncome:Проценты по вкладу"
    ]);
    // Доход мастера — в первый столбец доходов, «Зарплату».
    const salary = result.columns.find((column) => column.name === "Зарплата")!;
    expect(result.cells.filter((cell) => cell.columnId === salary.id)).toHaveLength(12);
    const sheet = computeSheet(result);
    expect(sheet.rows[0].total).toBe(40000 + 150000 - 30000);
    expect(result.columns.find((column) => column.name === "Продукты")?.categoryId).toBe(
      "cat-food"
    );
  });

  it("«Отпуск» и «С нуля»", async () => {
    const vacation = await api().post("/sheet", {
      action: "start",
      template: "vacation",
      from: "2026-10"
    });
    expect(shape(vacation.columns)).toContain("expense:Билеты");
    expect(shape(vacation.columns)).toContain("note:Заметки");
    expect(vacation.columns.some((column) => column.kind === "toSavings")).toBe(false);

    const blank = await api().post("/sheet", {
      action: "start",
      template: "blank",
      from: "2026-10",
      articles: []
    });
    expect(shape(blank.columns)).toEqual([
      "opening:Остаток",
      "income:Доходы",
      "savingsOpening:Подушка на начало",
      "toSavings:В сбережения"
    ]);
    expect(blank.months).toHaveLength(12);
  });

  it("статья шаблона находит свою категорию учёта по названию", () => {
    const categories = [
      { id: "1", label: "продукты" },
      { id: "2", label: "Жилье" }
    ];
    expect(matchCategory("Продукты", categories)?.id).toBe("1");
    expect(matchCategory("Жильё", categories)?.id).toBe("2");
    expect(matchCategory("Дети", categories)).toBeNull();
  });
});
