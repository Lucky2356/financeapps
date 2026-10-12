import { describe, expect, it } from "vitest";

import { sheetCsv } from "@/components/sheet/budget-sheet/export-csv";
import { kindCaption } from "@/components/sheet/sheet-text";
import type { DisplayColumn, SheetWords } from "@/components/sheet/sheet-types";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { freeValue } from "@/lib/api/local/sheets";
import { evaluate, roundHalfAway } from "@/lib/sheet/formula";
import {
  buildPayload,
  checkTotals,
  gridFromClipboard,
  gridFromText,
  parseMonth,
  planImport
} from "@/lib/sheet/import";
import { computeSheet, isBalanceKind } from "@/lib/sheet/model";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

describe("вставка из буфера обмена", () => {
  it("одна клетка с копейками — одна клетка, запятая не делит её надвое", () => {
    // Было: [["1500","50"]] — 50 уходило в соседний столбец и затирало его.
    expect(gridFromClipboard("1500,50")).toEqual([["1500,50"]]);
    expect(gridFromClipboard("Купить молоко, хлеб")).toEqual([["Купить молоко, хлеб"]]);
  });

  it("столбец из Excel: строки — по переводу строки, перевод в конце не даёт лишней строки", () => {
    expect(gridFromClipboard("1 500,50\r\n2 000,00\r\n")).toEqual([["1 500,50"], ["2 000,00"]]);
    // Пустая строка в конце стирала клетку под вставленным блоком.
    expect(gridFromClipboard("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("пустая клетка в середине столбца остаётся на своём месте", () => {
    // Было: пустую строку выбрасывало, и 300 вставало на месяц раньше.
    expect(gridFromClipboard("100\r\n\r\n300\r\n")).toEqual([["100"], [""], ["300"]]);
  });
});

describe("CSV-файл", () => {
  it("«;» в кавычках не делает её разделителем файла с запятыми", () => {
    const grid = gridFromText('Месяц,Продукты,Комментарий\n01.08.2026,500,"кофе; торт"');
    expect(grid[0]).toEqual(["Месяц", "Продукты", "Комментарий"]);
    expect(grid[1]).toEqual(["01.08.2026", "500", "кофе; торт"]);
  });

  it("файл с «;» по-прежнему делится по «;»", () => {
    expect(gridFromText("Месяц;Продукты\n01.08.2026;1 500,50")).toEqual([
      ["Месяц", "Продукты"],
      ["01.08.2026", "1 500,50"]
    ]);
  });
});

describe("месяц строки", () => {
  it("месяц только 1–12; американский порядок понимается", () => {
    expect(parseMonth("15.13.2026")).toBeNull();
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("08/15/2026")).toBe("2026-08");
  });

  it("год двумя цифрами", () => {
    expect(parseMonth("01.08.26")).toBe("2026-08");
  });
});

describe("перенос таблицы", () => {
  it("суммы «1 234,00р.» — расход, а не заметки", () => {
    const plan = planImport(
      gridFromText(
        "Месяц;Доходы;Продукты\n01.08.2026;50 000;1 234,00р.\n01.09.2026;50 000;500 руб."
      ),
      []
    );
    expect(plan.columns.find((column) => column.name === "Продукты")?.role).toBe("expense");
  });

  it("свежий месяц сверху: строки по порядку месяцев, Итог сходится", () => {
    const plan = planImport(
      gridFromText(
        [
          "Месяц;Остаток;Доходы;Продукты;Итог",
          "01.10.2026;2000;1000;0;3000",
          "01.09.2026;1000;1000;0;2000",
          "01.08.2026;0;1000;0;1000"
        ].join("\n")
      ),
      []
    );
    expect(plan.rows.map((row) => row.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    const payload = buildPayload(plan);
    expect(checkTotals(plan, payload).mismatched).toEqual([]);
    // Остаток, который следует из прошлого Итога, не переносится числом —
    // иначе правка в августе не дошла бы до октября.
    const opening = payload.columns.find((column) => column.kind === "opening")!;
    expect(payload.rows.filter((row) => opening.key in row.values)).toHaveLength(1);
  });
});

describe("формулы", () => {
  it("«=SUM(1, 2)» — три, а не 1,2", () => {
    expect(evaluate("=SUM(1, 2)")).toEqual({ ok: true, value: 3 });
    expect(evaluate("=SUM(1000, 2000)")).toEqual({ ok: true, value: 3000 });
    // Десятичная запятая без пробела — по-прежнему десятичная.
    expect(evaluate("=СУММ(1,5;2,5)")).toEqual({ ok: true, value: 4 });
  });

  it("округление как в Excel: половина — от нуля", () => {
    expect(evaluate("-0,125")).toEqual({ ok: true, value: -0.13 });
    expect(evaluate("1,005")).toEqual({ ok: true, value: 1.01 });
    expect(evaluate("=ОКРУГЛ(1234,5;-2)")).toEqual({ ok: true, value: 1200 });
    expect(roundHalfAway(-0.001)).toBe(0);
    expect(Object.is(roundHalfAway(-0.001), -0)).toBe(false);
  });
});

describe("свободный лист", () => {
  it("телефон и дата — текст, а не вычитание", () => {
    expect(freeValue("+7 912 345-67-89")).toEqual({ value: null, error: false });
    expect(freeValue("8-912-345-67-89")).toEqual({ value: null, error: false });
    expect(freeValue("2026-08-01")).toEqual({ value: null, error: false });
  });

  it("числа и выражения по-прежнему считаются; с «=» — и дата", () => {
    expect(freeValue("1500-200")).toEqual({ value: 1300, error: false });
    expect(freeValue("1 500,50")).toEqual({ value: 1500.5, error: false });
    expect(freeValue("=2026-08-01")).toEqual({ value: 2017, error: false });
  });
});

describe("выгрузка в Excel", () => {
  const words = { month: "Месяц", total: "Итог", savingsTotal: "Итог сбережений" } as SheetWords;

  it("название с «;» и кавычкой не сдвигает столбцы; текст с «=» — не формула", () => {
    const display: DisplayColumn[] = [
      { type: "column", column: { id: "a", name: "Еда; кафе", kind: "expense", order: 0 } },
      { type: "column", column: { id: "b", name: 'Заметка "важно"', kind: "note", order: 1 } },
      { type: "total" }
    ];
    const computed = computeSheet({
      columns: display.flatMap((item) => (item.type === "column" ? [item.column] : [])),
      months: ["2026-08"],
      cells: [
        { month: "2026-08", columnId: "a", input: "1500,5" },
        { month: "2026-08", columnId: "b", input: '=HYPERLINK("http://x")' }
      ]
    });
    const [header, line] = sheetCsv(display, computed.rows, words).replace(/^﻿/, "").split("\r\n");
    expect(header).toBe('"Месяц";"Еда; кафе";"Заметка ""важно""";"Итог"');
    expect(line).toBe(`01.08.2026;1500,5;"'=HYPERLINK(""http://x"")";-1500,5`);
  });
});

describe("мастер создания таблицы", () => {
  it("две статьи с одним именем — каждая со своей суммой", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    const result = await client.post("/sheet", {
      action: "start",
      from: "2026-10",
      months: 1,
      savings: false,
      articles: [
        { name: "Другое", categoryId: "c1", monthly: 100 },
        { name: "Другое", categoryId: "c2", monthly: 900 }
      ]
    });
    const others = result.columns.filter((column) => column.kind === "expense");
    expect(others).toHaveLength(2);
    const amounts = others.map(
      (column) => result.cells.find((cell) => cell.columnId === column.id)?.input
    );
    expect(amounts).toEqual(["100", "900"]);
  });
});

describe("подписи и итоги столбцов", () => {
  const kinds = {
    opening: "Остаток на начало",
    income: "Доход",
    expense: "Расход",
    toSavings: "В сбережения",
    fromSavings: "Из сбережений",
    savingsOpening: "Подушка на начало",
    savingsIncome: "Проценты по вкладу",
    note: "Заметка (текст)"
  };

  it("подпись вида не повторяет название", () => {
    expect(kindCaption({ kind: "toSavings", name: "В сбережения" }, kinds)).toBeNull();
    expect(kindCaption({ kind: "income", name: "Доходы" }, kinds)).toBeNull();
    expect(kindCaption({ kind: "opening", name: "Остаток" }, kinds)).toBeNull();
    expect(kindCaption({ kind: "income", name: "Зарплата" }, kinds)).toBe("Доход");
    expect(kindCaption({ kind: "toSavings", name: "Копилка" }, kinds)).toBe("В сбережения");
    expect(kindCaption({ kind: "expense", name: "Продукты" }, kinds)).toBeNull();
  });

  it("у остатков нет «Всего» и «В среднем» — это не движение денег", () => {
    expect(isBalanceKind("opening")).toBe(true);
    expect(isBalanceKind("savingsOpening")).toBe(true);
    expect(isBalanceKind("income")).toBe(false);
    expect(isBalanceKind("toSavings")).toBe(false);
  });
});
