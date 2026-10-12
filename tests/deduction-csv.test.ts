import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { deductionCsv, type DeductionKind, type DeductionSpend } from "@/lib/tax/deductions";

const labels: Record<DeductionKind, string> = {
  MEDICAL: "Лечение",
  EXPENSIVE_MEDICAL: "Дорогостоящее лечение",
  EDUCATION: "Обучение",
  SPORT: "Спорт",
  CHILD_EDUCATION: "Обучение детей",
  IIS: "ИИС"
};

const spend = (over: Partial<DeductionSpend>): DeductionSpend => ({
  id: "s1",
  date: "2026-03-01T00:00:00.000Z",
  amount: 1234.5,
  kind: "MEDICAL",
  description: null,
  category: "Аптека",
  ...over
});

/** Файл так, как его прочтёт Excel: «;» — разделитель, кавычки снимаются. */
function cells(csv: string): string[][] {
  return Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    delimiter: ";",
    skipEmptyLines: true
  }).data;
}

describe("deductionCsv", () => {
  it("keeps a category with ';' in its own column", () => {
    const csv = deductionCsv([spend({ category: "Аптека; оптика" })], 2026, labels);
    const [header, row] = cells(csv);
    expect(header).toHaveLength(5);
    expect(row).toEqual(["2026-03-01", "Лечение", "Аптека; оптика", "", "1234,50"]);
  });

  it("neutralises formulas in what a person typed", () => {
    const csv = deductionCsv(
      [spend({ category: "=HYPERLINK(1)", description: "+7 999 приём\nврача" })],
      2026,
      labels
    );
    const [, row] = cells(csv);
    expect(row[2]).toBe("'=HYPERLINK(1)");
    expect(row[3]).toBe("'+7 999 приём врача");
  });

  it("writes the header it is given, Russian by default", () => {
    expect(deductionCsv([], 2026, labels).startsWith("\uFEFFДата;Вид вычета;")).toBe(true);
    const english = deductionCsv([spend({})], 2026, labels, [
      "Date",
      "Deduction kind",
      "Category",
      "Description",
      "Amount"
    ]);
    expect(cells(english)[0]).toEqual([
      "Date",
      "Deduction kind",
      "Category",
      "Description",
      "Amount"
    ]);
  });
});
