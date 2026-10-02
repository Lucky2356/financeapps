import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { columnLetter, freeValue, type WorkbookPage } from "@/lib/api/local/sheets";
import type { SheetPageData } from "@/lib/api/local/sheet";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Книга таблиц: несколько листов, перенос Excel целиком, корзина для листов.

const client = () => new LocalApiClient(new MemoryStorageAdapter());

describe("листы", () => {
  it("главная таблица есть всегда; новый бюджетный лист не трогает её", async () => {
    const api = client();
    await api.post("/sheet", { action: "start", from: "2026-10" });
    const main = await api.get<SheetPageData>("/sheet");
    expect(main.months).toHaveLength(12);

    const tab = await api.post<{ id: string }>("/sheets", {
      action: "create",
      name: "Отпуск",
      kind: "budget"
    });
    await api.post("/sheet", { sheetId: tab.id, action: "start", from: "2027-01" });
    const book = await api.get<WorkbookPage>(`/workbook?sheet=${tab.id}`);
    expect(book.sheets.map((sheet) => sheet.name)).toEqual(["Бюджет", "Отпуск"]);
    expect(book.sheet.id).toBe(tab.id);
    expect(book.budget!.months[0]).toBe("2027-01");

    // Ячейка на листе «Отпуск» — только там.
    const column = book.budget!.columns.find((item) => item.kind === "income")!;
    await api.post("/sheet", {
      sheetId: tab.id,
      action: "setCells",
      cells: [{ month: "2027-01", columnId: column.id, input: "5000" }]
    });
    const again = await api.get<WorkbookPage>(`/workbook?sheet=${tab.id}`);
    expect(again.budget!.cells).toEqual([{ month: "2027-01", columnId: column.id, input: "5000" }]);
    const mainAgain = await api.get<SheetPageData>("/sheet");
    expect(mainAgain.months[0]).toBe("2026-10");
    expect(mainAgain.cells).toEqual([]);
    expect(mainAgain.columns.map((item) => item.id)).not.toContain(column.id);
  });

  it("свободный лист: числа, формулы и текст; удалить строку — остальные сдвигаются", async () => {
    const api = client();
    const tab = await api.post<{ id: string }>("/sheets", {
      action: "create",
      name: "Расчёты",
      kind: "free"
    });
    await api.post("/sheet", {
      sheetId: tab.id,
      action: "setFree",
      cells: [
        { r: 0, c: 0, input: "Ипотека" },
        { r: 0, c: 1, input: "=СУММ(1000;2000)" },
        { r: 1, c: 1, input: "1 500,50" },
        { r: 2, c: 1, input: "=СУММ(" }
      ]
    });
    const page = await api.get<WorkbookPage>(`/workbook?sheet=${tab.id}`);
    const cell = (r: number, c: number) =>
      page.free!.cells.find((item) => item.r === r && item.c === c);
    expect(cell(0, 0)).toMatchObject({ value: null, error: false });
    expect(cell(0, 1)).toMatchObject({ value: 3000 });
    expect(cell(1, 1)).toMatchObject({ value: 1500.5 });
    expect(cell(2, 1)).toMatchObject({ error: true });

    await api.post("/sheet", { sheetId: tab.id, action: "removeFreeRow", index: 0 });
    const after = await api.get<WorkbookPage>(`/workbook?sheet=${tab.id}`);
    expect(after.free!.cells.find((item) => item.r === 0 && item.c === 1)?.input).toBe("1 500,50");
  });

  it("перенос книги целиком: бюджет — в пустую главную, остальное — свободными листами", async () => {
    const api = client();
    await api.post("/sheets", {
      action: "importWorkbook",
      sheets: [
        {
          name: "Бюджет 2026",
          kind: "budget",
          payload: {
            columns: [
              { key: "o", name: "Остаток", kind: "opening" },
              { key: "i", name: "Доходы", kind: "income" },
              { key: "f", name: "Еда", kind: "expense" }
            ],
            rows: [{ month: "2026-08", values: { o: "1000", i: "5000", f: "2000" } }]
          }
        },
        {
          name: "Кредиты",
          kind: "free",
          grid: [
            ["Банк", "Остаток"],
            ["Сбер", "120000"]
          ]
        }
      ]
    });
    const book = await api.get<WorkbookPage>("/workbook");
    expect(book.sheets.map((sheet) => `${sheet.name}:${sheet.kind}`)).toEqual([
      "Бюджет 2026:budget",
      "Кредиты:free"
    ]);
    expect(book.budget!.months).toEqual(["2026-08"]);
    const loans = await api.get<WorkbookPage>(`/workbook?sheet=${book.sheets[1].id}`);
    expect(loans.free!.cells.find((item) => item.r === 1 && item.c === 1)?.value).toBe(120000);
  });

  it("удалённый лист возвращается из корзины целиком", async () => {
    const api = client();
    const tab = await api.post<{ id: string }>("/sheets", {
      action: "create",
      name: "Лишний",
      kind: "free"
    });
    await api.post("/sheet", {
      sheetId: tab.id,
      action: "setFree",
      cells: [{ r: 0, c: 0, input: "важно" }]
    });
    await api.post("/sheets", { action: "remove", id: tab.id });
    expect((await api.get<WorkbookPage>("/workbook")).sheets.map((sheet) => sheet.name)).toEqual([
      "Бюджет"
    ]);

    const trash = await api.get<{
      entries: Array<{ id: string; collection: string; title: string }>;
    }>("/trash");
    // Одна запись — сам лист, без россыпи клеток.
    expect(trash.entries.map((entry) => `${entry.collection}:${entry.title}`)).toEqual([
      "sheets:Лишний"
    ]);
    await api.post("/trash", { action: "restore", ids: [trash.entries[0].id] });
    const back = await api.get<WorkbookPage>(`/workbook?sheet=${tab.id}`);
    expect(back.sheet.name).toBe("Лишний");
    expect(back.free!.cells[0]).toMatchObject({ r: 0, c: 0, input: "важно" });
  });

  it("главную таблицу удалить нельзя", async () => {
    await expect(client().post("/sheets", { action: "remove", id: "main" })).rejects.toThrow(
      /нельзя/
    );
  });

  it("буквы столбцов и значения клеток — как в Excel", () => {
    expect([0, 25, 26, 27, 701].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
    expect(freeValue("Продукты")).toEqual({ value: null, error: false });
    expect(freeValue("12%")).toMatchObject({ error: false });
  });
});
