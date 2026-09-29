import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { SheetPageData } from "@/lib/api/local/sheet";
import {
  buildPayload,
  checkTotals,
  gridFromCells,
  gridFromText,
  guessRole,
  parseAmount,
  parseMonth,
  planImport
} from "@/lib/sheet/import";
import { computeSheet } from "@/lib/sheet/model";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

import { OWNER_SHEET_TSV } from "./fixtures/budget-sheet";

const CATEGORIES = [
  { id: "cat-food", label: "Продукты", kind: "EXPENSE" as const },
  { id: "cat-salary", label: "Зарплата", kind: "INCOME" as const },
  { id: "cat-transport", label: "Транспорт", kind: "EXPENSE" as const },
  { id: "cat-health", label: "Здоровье и аптека", kind: "EXPENSE" as const }
];

describe("разбор клеток", () => {
  it("месяцы во всех видах, в каких их пишут", () => {
    expect(parseMonth("01.08.2026")).toBe("2026-08");
    expect(parseMonth("08.2026")).toBe("2026-08");
    expect(parseMonth("2026-08")).toBe("2026-08");
    expect(parseMonth("авг 2026")).toBe("2026-08");
    expect(parseMonth("Август 26")).toBe("2026-08");
    expect(parseMonth("46235")).toBe("2026-08");
    expect(parseMonth("Продукты")).toBeNull();
  });

  it("суммы с пробелами, копейками и знаком рубля", () => {
    expect(parseAmount("12 396")).toBe(12396);
    expect(parseAmount("12 396,50 ₽")).toBe(12396.5);
    expect(parseAmount("-500")).toBe(-500);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("много")).toBeNull();
  });

  it("роль столбца по названию", () => {
    expect(guessRole("Месяц")).toBe("month");
    expect(guessRole("Остаток")).toBe("opening");
    expect(guessRole("Доходы")).toBe("income");
    expect(guessRole("Итог")).toBe("total");
    expect(guessRole("Возврат на вклад")).toBe("toSavings");
    expect(guessRole("Продукты")).toBe("expense");
  });

  it("даты из xlsx превращаются в текст, как в Excel", () => {
    expect(gridFromCells([[new Date(Date.UTC(2026, 7, 1)), 12396, null]])).toEqual([
      ["01.08.2026", "12396", ""]
    ]);
  });
});

describe("перенос таблицы владельца", () => {
  const plan = planImport(gridFromText(OWNER_SHEET_TSV), CATEGORIES);

  it("шапка, 11 месяцев и «Подушка» над шапкой найдены", () => {
    expect(plan.rows.map((row) => row.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06"
    ]);
    expect(plan.markers).toEqual([
      { label: "Подушка", date: "2026-08-31", amount: 49653 },
      { label: "Подушка", date: "2028-12-31", amount: 1549653 }
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("столбцы поняты: остаток, доходы, итог, вклад и категории", () => {
    const role = (name: string) => plan.columns.find((column) => column.name === name);
    expect(role("Остаток")?.role).toBe("opening");
    expect(role("Доходы")?.role).toBe("income");
    expect(role("Итог")?.role).toBe("total");
    expect(role("Возврат на вклад")?.role).toBe("toSavings");
    expect(role("Продукты")).toMatchObject({ categoryId: "cat-food", createCategory: null });
    // «Здоровье» — начало «Здоровье и аптека».
    expect(role("Здоровье")?.categoryId).toBe("cat-health");
    // «Подписки» в учёте нет — создать.
    expect(role("Подписки")).toMatchObject({ categoryId: null, createCategory: "EXPENSE" });
  });

  it("итоги сходятся с Excel во всех месяцах", () => {
    const payload = buildPayload(plan);
    expect(checkTotals(plan, payload)).toEqual({ checked: 11, matched: 11, mismatched: [] });
  });

  it("Остаток переносится только в первую строку — дальше считается", () => {
    const payload = buildPayload(plan);
    const opening = payload.columns.find((column) => column.kind === "opening")!;
    const withOpening = payload.rows.filter((row) => row.values[opening.key] !== undefined);
    expect(withOpening.map((row) => row.month)).toEqual(["2026-08"]);
  });

  it("подушка на 31.08 — сбережения августа, дальняя дата — цель", () => {
    const payload = buildPayload(plan);
    expect(payload.targets).toEqual([{ label: "Подушка", date: "2028-12-31", amount: 1549653 }]);
    const sheet = computeSheet({
      columns: payload.columns.map((column, order) => ({
        id: column.key,
        name: column.name,
        kind: column.kind,
        order
      })),
      months: payload.rows.map((row) => row.month),
      cells: payload.rows.flatMap((row) =>
        Object.entries(row.values).map(([columnId, input]) => ({
          month: row.month,
          columnId,
          input
        }))
      )
    });
    expect(sheet.rows[0].savingsTotal).toBe(49653);
    // Март: +30 000 на вклад.
    expect(sheet.rows[7].savingsTotal).toBe(79653);
  });

  it("в книге: заводит нужные категории и отменяется целиком", async () => {
    const client = new LocalApiClient(new MemoryStorageAdapter());
    await client.post("/sheet", { action: "start", from: "2026-10" });
    const imported = await client.post<SheetPageData>("/sheet", {
      action: "import",
      payload: buildPayload(plan)
    });
    expect(imported.months).toHaveLength(11);
    expect(imported.canUndoImport).toBe(true);
    const food = imported.columns.find((column) => column.name === "Продукты")!;
    // В книге без категорий пример не создан — «Продукты» заведены переносом.
    expect(food.categoryId).toBeTruthy();
    expect(
      computeSheet(imported)
        .rows.map((row) => row.total)
        .at(-1)
    ).toBe(91977);

    const undone = await client.post<SheetPageData>("/sheet", { action: "undoImport" });
    expect(undone.months).toHaveLength(12);
    expect(undone.columns.map((column) => column.name)).toEqual([
      "Остаток",
      "Доходы",
      "Подушка на начало"
    ]);
    expect(undone.canUndoImport).toBe(false);
  });
});
