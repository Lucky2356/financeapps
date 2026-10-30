import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { freeValue } from "@/lib/api/local/sheets";
import { evaluateFreeGrid } from "@/lib/sheet/free-grid";
import { evaluate, roundHalfAway } from "@/lib/sheet/formula";
import { computeSheet, type SheetColumn } from "@/lib/sheet/model";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Таблица: найденное разбором 2.8.3. Каждая проверка падала до исправления.

describe("очень малые и очень большие числа", () => {
  it("округление не превращает остаток двоичной дроби в «не число»", () => {
    expect(roundHalfAway(0.1 + 0.2 - 0.3)).toBe(0);
    expect(roundHalfAway(1e-7)).toBe(0);
    expect(roundHalfAway(1e17)).toBe(1e17);
    // Прежнее поведение — на месте.
    expect(roundHalfAway(1.005)).toBe(1.01);
    expect(roundHalfAway(-0.125)).toBe(-0.13);
    expect(evaluate("=0,1+0,2-0,3")).toEqual({ ok: true, value: 0 });
  });

  it("итог месяца с дробями не ломает остатки всех следующих месяцев", () => {
    const columns: SheetColumn[] = [
      { id: "op", name: "Остаток", kind: "opening", order: 0 },
      { id: "in", name: "Доходы", kind: "income", order: 1 },
      { id: "a", name: "Кофе", kind: "expense", order: 2 },
      { id: "b", name: "Чай", kind: "expense", order: 3 }
    ];
    const computed = computeSheet({
      columns,
      months: ["2026-01", "2026-02"],
      cells: [
        { month: "2026-01", columnId: "op", input: "0,3" },
        { month: "2026-01", columnId: "a", input: "0,1" },
        { month: "2026-01", columnId: "b", input: "0,2" },
        { month: "2026-02", columnId: "in", input: "1000" }
      ]
    });
    expect(computed.rows[0].total).toBe(0);
    expect(computed.rows[1].total).toBe(1000);
  });

  it("номер карты или счёта — текст, а не «не число»", () => {
    expect(freeValue("4276123412341234")).toEqual({ value: null, error: false });
    expect(freeValue("4276 1234 1234 1234")).toEqual({ value: null, error: false });
    expect(freeValue("40817810099910004312")).toEqual({ value: null, error: false });
    // Обычные суммы — числа, как и были.
    expect(freeValue("1 500 000")).toEqual({ value: 1500000, error: false });
  });
});

describe("x — умножение, а не клетка X", () => {
  it("«=1200 x3» — 3 600, как до ссылок", () => {
    const shown = evaluateFreeGrid(
      new Map([
        ["0|0", "=1200 x3"],
        ["0|1", "=5 x2"]
      ]),
      freeValue
    );
    expect(shown.get("0|0")?.value).toBe(3600);
    expect(shown.get("0|1")?.value).toBe(10);
  });

  it("ссылка рядом с числом без знака — ошибка, а не склейка в другое число", () => {
    const shown = evaluateFreeGrid(new Map([["0|0", "=Q3 2024"]]), freeValue);
    expect(shown.get("0|0")?.value).not.toBe(2024);
  });
});

describe("вставка в заполненный до края лист", () => {
  it("отказывает, а не стирает клетки с края", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const tab = await api.post("/sheets", { action: "create", name: "Длинный", kind: "free" });
    await api.post("/sheet", {
      sheetId: tab.id,
      action: "setFree",
      cells: [{ r: 1999, c: 0, input: "последняя" }]
    });
    await expect(
      api.post("/sheet", { sheetId: tab.id, action: "insertFreeRow", index: 0 })
    ).rejects.toThrow(/заполнен/);
    const page = await api.get(`/workbook?sheet=${tab.id}`);
    expect(page.free!.cells.map((cell) => cell.input)).toEqual(["последняя"]);
  });
});

describe("большие диапазоны", () => {
  it("МАКС и СУММ по 300 000 чисел не падают; МИН пустого — ноль", () => {
    const inputs = new Map<string, string>();
    for (let r = 0; r < 300; r += 1) inputs.set(`${r}|0`, String(r));
    inputs.set("0|1", "=МАКС(A1:A300)");
    inputs.set("1|1", "=МИН(C1:C5)");
    const shown = evaluateFreeGrid(inputs, freeValue);
    expect(shown.get("0|1")?.value).toBe(299);
    expect(shown.get("1|1")?.value).toBe(0);
    expect(evaluate(`=МАКС(${Array.from({ length: 300_000 }, (_, i) => i).join(";")})`)).toEqual({
      ok: true,
      value: 299_999
    });
  });
});
