import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { SheetPageData } from "@/lib/api/local/sheet";
import { clearMonth, copyMonth, factFill } from "@/lib/sheet/fill";
import { guessRole, planImport } from "@/lib/sheet/import";
import { firstShortfall, focusRow, monthsAhead } from "@/lib/sheet/insights";
import { computeSheet, type SheetColumn } from "@/lib/sheet/model";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

const columns: SheetColumn[] = [
  { id: "op", name: "Остаток", kind: "opening", order: 0 },
  { id: "in", name: "Доходы", kind: "income", order: 1 },
  { id: "food", name: "Продукты", kind: "expense", categoryId: "cat-food", order: 2 },
  { id: "note", name: "Комментарии", kind: "note", order: 3 }
];

const sheet = (cells: Array<[string, string, string]>, months: string[]) =>
  computeSheet({
    columns,
    months,
    cells: cells.map(([month, columnId, input]) => ({ month, columnId, input }))
  });

describe("столбец «Заметка»", () => {
  const computed = sheet(
    [
      ["2026-09", "op", "1000"],
      ["2026-09", "in", "500"],
      ["2026-09", "food", "200"],
      ["2026-09", "note", "купили торт на день рождения"]
    ],
    ["2026-09"]
  );

  it("текст — не формула: ни ошибки, ни числа", () => {
    expect(computed.rows[0].cells.note).toEqual({
      input: "купили торт на день рождения",
      value: null,
      text: true
    });
  });

  it("ничего не считает и не попадает в итоги", () => {
    expect(computed.rows[0].total).toBe(1300);
    expect(computed.totals.note).toBeUndefined();
  });
});

describe("перенос из Excel узнаёт заметки", () => {
  it("по названию", () => {
    for (const name of ["Комментарии", "Заметки", "Примечание", "Comment"]) {
      expect(guessRole(name)).toBe("note");
    }
    expect(guessRole("Продукты")).toBe("expense");
  });

  it("по содержимому: сплошной текст под непонятным названием — не расход", () => {
    const plan = planImport(
      [
        ["Месяц", "Продукты", "Что было"],
        ["01.08.2026", "5000", "ездили на дачу"],
        ["01.09.2026", "6000", "день рождения"],
        ["01.10.2026", "5500", ""]
      ],
      []
    );
    expect(plan.columns.find((column) => column.name === "Что было")?.role).toBe("note");
    expect(plan.columns.find((column) => column.name === "Продукты")?.role).toBe("expense");
  });
});

describe("что говорит таблица сама", () => {
  const rows = sheet(
    [
      ["2026-08", "op", "1000"],
      ["2026-08", "in", "500"],
      ["2026-08", "food", "300"],
      ["2026-09", "food", "2000"],
      ["2026-10", "in", "100"]
    ],
    ["2026-08", "2026-09", "2026-10"]
  ).rows;

  it("сводка — нынешний месяц, иначе ближайший прошлый, иначе первый", () => {
    expect(focusRow(rows, "2026-09")?.month).toBe("2026-09");
    expect(focusRow(rows, "2026-12")?.month).toBe("2026-10");
    expect(focusRow(rows, "2026-01")?.month).toBe("2026-08");
    expect(focusRow([], "2026-09")).toBeNull();
  });

  it("предупреждает о первом месяце, где денег не хватит, — прошлые не считаются", () => {
    // Август 1200, сентябрь −800, октябрь −700.
    expect(firstShortfall(rows, "2026-09")).toEqual({ month: "2026-09", total: -800 });
    expect(firstShortfall(rows, "2026-10")).toEqual({ month: "2026-10", total: -700 });
    expect(firstShortfall(rows, "2026-11")).toBeNull();
  });

  it("сколько месяцев впереди", () => {
    expect(monthsAhead(rows, "2026-08")).toBe(2);
    expect(monthsAhead(rows, "2026-10")).toBe(0);
  });
});

describe("копия и очистка месяца", () => {
  const rows = sheet(
    [
      ["2026-08", "op", "1000"],
      ["2026-08", "in", "500"],
      ["2026-08", "food", "300"],
      ["2026-08", "note", "тот месяц"],
      ["2026-09", "food", "999"]
    ],
    ["2026-08", "2026-09"]
  ).rows;

  it("копирует числа, не трогая остаток и заметки, и заменяет уже вписанное", () => {
    expect(copyMonth(rows, columns, "2026-08", "2026-09")).toEqual([
      { month: "2026-09", columnId: "in", input: "500" },
      { month: "2026-09", columnId: "food", input: "300" }
    ]);
  });

  it("не копирует то, что уже совпадает, и месяц сам в себя", () => {
    expect(copyMonth(rows, columns, "2026-08", "2026-08")).toEqual([]);
    expect(copyMonth(rows, columns, "2026-07", "2026-09")).toEqual([]);
  });

  it("очищает вписанное, но не начальный остаток", () => {
    expect(clearMonth(rows, columns, "2026-08")).toEqual([
      { month: "2026-08", columnId: "in", input: "" },
      { month: "2026-08", columnId: "food", input: "" },
      { month: "2026-08", columnId: "note", input: "" }
    ]);
  });
});

describe("заполнение прошлого фактом из учёта", () => {
  const rows = sheet([["2026-08", "food", "100"]], ["2026-07", "2026-08", "2026-09"]).rows;
  const facts = {
    "2026-07": { "cat-food": 4200.456, "cat-salary": 90000, "cat-bonus": 10000 },
    "2026-08": { "cat-food": 5000 },
    "2026-09": { "cat-food": 777 }
  };

  it("только прошедшие месяцы и только пустые клетки", () => {
    expect(factFill(rows, columns, facts, { before: "2026-09" })).toEqual([
      { month: "2026-07", columnId: "food", input: "4200.46" }
    ]);
  });

  it("поверх написанного — по просьбе (мастер создания)", () => {
    expect(factFill(rows, columns, facts, { before: "2026-09", overwrite: true })).toEqual([
      { month: "2026-07", columnId: "food", input: "4200.46" },
      { month: "2026-08", columnId: "food", input: "5000" }
    ]);
  });

  it("«Доходы» без категории — сумма всех доходов учёта", () => {
    const changes = factFill(rows, columns, facts, {
      before: "2026-09",
      incomeCategoryIds: new Set(["cat-salary", "cat-bonus"])
    });
    expect(changes).toContainEqual({ month: "2026-07", columnId: "in", input: "100000" });
  });

  it("нули не пишутся: нет учёта — не «ничего не потратил»", () => {
    expect(
      factFill(rows, columns, { "2026-07": { "cat-food": 0 } }, { before: "2026-09" })
    ).toEqual([]);
  });
});

describe("мастер создания таблицы", () => {
  const api = () => new LocalApiClient(new MemoryStorageAdapter());

  it("собирает столбцы, месяцы и суммы из ответов", async () => {
    const client = api();
    const result = await client.post<SheetPageData>("/sheet", {
      action: "start",
      from: "2026-10",
      months: 6,
      opening: "50 000",
      income: 120000,
      savings: true,
      savingsOpening: 30000,
      articles: [
        { name: "Продукты", categoryId: "c1", monthly: 25000 },
        { name: "Транспорт", categoryId: null, monthly: null }
      ]
    });
    expect(result.columns.map((column) => `${column.kind}:${column.name}`)).toEqual([
      "opening:Остаток",
      "income:Доходы",
      "expense:Продукты",
      "expense:Транспорт",
      "savingsOpening:Подушка на начало",
      "toSavings:В сбережения"
    ]);
    expect(result.months).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03"
    ]);
    const food = result.columns.find((column) => column.name === "Продукты")!;
    const income = result.columns.find((column) => column.kind === "income")!;
    const opening = result.columns.find((column) => column.kind === "opening")!;
    expect(result.columns.find((column) => column.name === "Продукты")?.categoryId).toBe("c1");
    expect(result.cells.filter((cell) => cell.columnId === food.id)).toHaveLength(6);
    expect(result.cells.filter((cell) => cell.columnId === income.id)).toHaveLength(6);
    // Остаток — один раз, в первом месяце; дальше тянется из Итога.
    expect(result.cells.filter((cell) => cell.columnId === opening.id)).toEqual([
      { month: "2026-10", columnId: opening.id, input: "50000" }
    ]);
    const computed = computeSheet(result);
    expect(computed.rows[0].total).toBe(50000 + 120000 - 25000);
    expect(computed.rows[1].opening).toBe(145000);
  });

  it("без сбережений — без их столбцов; количество месяцев ограничено", async () => {
    const client = api();
    const result = await client.post<SheetPageData>("/sheet", {
      action: "start",
      from: "2026-10",
      months: 999,
      savings: false,
      articles: [{ name: "Продукты", categoryId: null }]
    });
    expect(result.columns.map((column) => column.kind)).toEqual(["opening", "income", "expense"]);
    expect(result.months).toHaveLength(60);
  });

  it("на уже созданной таблице ничего не затирает", async () => {
    const client = api();
    await client.post("/sheet", { action: "start", from: "2026-10" });
    const again = await client.post<SheetPageData>("/sheet", {
      action: "start",
      from: "2026-10",
      articles: [{ name: "Лишнее", categoryId: null, monthly: 5 }]
    });
    expect(again.columns.map((column) => column.name)).toEqual([
      "Остаток",
      "Доходы",
      "Подушка на начало"
    ]);
    expect(again.cells).toEqual([]);
  });
});
