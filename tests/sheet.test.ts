import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { SheetPageData } from "@/lib/api/local/sheet";
import { evaluate } from "@/lib/sheet/formula";
import { computeSheet, type SheetColumn } from "@/lib/sheet/model";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

import { OWNER_SHEET_HEADER, OWNER_SHEET_ROWS } from "./fixtures/budget-sheet";

describe("формула в ячейке", () => {
  const value = (input: string) => {
    const result = evaluate(input);
    return result && result.ok ? result.value : result;
  };

  it("числа как их печатают", () => {
    expect(value("20000")).toBe(20000);
    expect(value("20 000")).toBe(20000);
    expect(value("1 500,50")).toBe(1500.5);
    expect(value("1500.5")).toBe(1500.5);
    expect(value("")).toBeNull();
  });

  it("арифметика и функции Excel", () => {
    expect(value("20000+1500")).toBe(21500);
    expect(value("=20000-1500*2")).toBe(17000);
    expect(value("=(1000+500)/3")).toBe(500);
    expect(value("=СУММ(1000;2000;3,5)")).toBe(3003.5);
    expect(value("=SUM(1;2)")).toBe(3);
    expect(value("=45000*13%")).toBe(5850);
    expect(value("-500")).toBe(-500);
  });

  it("ошибка — словами, а не NaN", () => {
    expect(evaluate("=1/0")).toEqual({ ok: false, error: "Деление на ноль" });
    expect(evaluate("=ЧТОТО(1)")).toMatchObject({ ok: false });
    expect(evaluate("=(1+2")).toMatchObject({ ok: false, error: "Не хватает «)»" });
  });
});

/** Его таблица в модель: Остаток только в первой строке, как и надо. */
function ownerSheet() {
  const kinds: Record<string, SheetColumn["kind"]> = {
    Остаток: "opening",
    Доходы: "income",
    "Возврат на вклад": "toSavings"
  };
  const columns: SheetColumn[] = OWNER_SHEET_HEADER.slice(1, -1).map((name, index) => ({
    id: `c${index}`,
    name,
    kind: kinds[name] ?? "expense",
    order: index
  }));
  const months = OWNER_SHEET_ROWS.map((row) => {
    const [day, month, year] = String(row[0]).split(".");
    void day;
    return `${year}-${month}`;
  });
  const cells = OWNER_SHEET_ROWS.flatMap((row, rowIndex) =>
    columns
      .map((column, index) => ({
        month: months[rowIndex],
        columnId: column.id,
        input: String(row[index + 1])
      }))
      // Остаток пишется только в первую строку — дальше таблица считает сама.
      .filter((cell) => cell.input !== "" && (cell.columnId !== "c0" || rowIndex === 0))
  );
  return { columns, cells, months };
}

describe("таблица считает как его Excel", () => {
  it("Итог каждого месяца совпадает с его таблицей", () => {
    const sheet = computeSheet(ownerSheet());
    expect(sheet.rows.map((row) => row.total)).toEqual(
      OWNER_SHEET_ROWS.map((row) => row[row.length - 1])
    );
  });

  it("Остаток следующего месяца — Итог прошлого, посчитанный, а не вписанный", () => {
    const sheet = computeSheet(ownerSheet());
    expect(sheet.rows[1].opening).toBe(52796);
    expect(sheet.rows[1].cells.c0).toMatchObject({ value: 52796, auto: true });
    // А вписанный руками — вписанный.
    expect(sheet.rows[0].cells.c0).toMatchObject({ value: 12396, input: "12396" });
  });

  it("возврат на вклад уходит из основных в сбережения", () => {
    const sheet = computeSheet(ownerSheet());
    const april = sheet.rows.find((row) => row.month === "2027-04")!;
    expect(april.toSavings).toBe(70000);
    // Сбережения копятся: март 30 000, апрель ещё 70 000.
    expect(april.savingsTotal).toBe(100000);
  });

  it("итоги по столбцу: сумма и среднее", () => {
    const sheet = computeSheet(ownerSheet());
    // c4 — «Продукты».
    expect(sheet.totals.c4).toEqual({ sum: 23807 + 25000 * 10, average: 24891.55, filled: 11 });
  });
});

describe("таблица в книге", () => {
  const api = () => new LocalApiClient(new MemoryStorageAdapter());

  it("чистый лист: Остаток, Доходы, подушка и год вперёд", async () => {
    const client = api();
    const sheet = await client.post<SheetPageData>("/sheet", { action: "start", from: "2026-10" });
    expect(sheet.columns.map((column) => column.name)).toEqual([
      "Остаток",
      "Доходы",
      "Подушка на начало"
    ]);
    expect(sheet.months).toHaveLength(12);
    expect(sheet.months[0]).toBe("2026-10");
    expect(sheet.months[11]).toBe("2027-09");
  });

  it("ячейки, столбцы и месяцы правятся и переживают перечитывание", async () => {
    const client = api();
    const start = await client.post<SheetPageData>("/sheet", { action: "start", from: "2026-10" });
    const food = await client.post<SheetColumn>("/sheet", {
      action: "addColumn",
      name: "Продукты",
      kind: "expense"
    });
    const income = start.columns.find((column) => column.kind === "income")!;
    await client.post("/sheet", {
      action: "setCells",
      cells: [
        { month: "2026-10", columnId: food.id, input: "=20000+5000" },
        { month: "2026-10", columnId: income.id, input: "100000" }
      ]
    });
    const read = await client.get("/sheet");
    // Новый расход — в конце основных, перед сбережениями.
    expect(read.columns.map((column) => column.name)).toEqual([
      "Остаток",
      "Доходы",
      "Продукты",
      "Подушка на начало"
    ]);
    const computed = computeSheet(read);
    expect(computed.rows[0].total).toBe(75000);
    expect(computed.rows[1].opening).toBe(75000);

    // Пустой ввод стирает ячейку.
    await client.post("/sheet", {
      action: "setCells",
      cells: [{ month: "2026-10", columnId: food.id, input: "" }]
    });
    expect((await client.get("/sheet")).cells).toHaveLength(1);

    // Удалённый столбец уносит свои ячейки.
    await client.post("/sheet", { action: "removeColumn", id: income.id });
    expect((await client.get("/sheet")).cells).toHaveLength(0);
  });
});
