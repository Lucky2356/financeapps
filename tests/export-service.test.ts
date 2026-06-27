import { describe, expect, it } from "vitest";

import { ExportService } from "@/services/export/ExportService";
import type { TransactionRow } from "@/types/finance";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t1",
    amount: 100,
    type: "EXPENSE",
    date: "2026-01-01",
    description: null,
    account: { id: "a1", label: "Cash" },
    category: { id: "c1", label: "Food", color: "#000" },
    ...overrides
  };
}

describe("ExportService CSV formula-injection guard", () => {
  const service = new ExportService();

  it("prefixes a description that starts with = to neutralize formulas", () => {
    const csv = service.transactionsToCsv([row({ description: "=cmd|'/c calc'!A1" })]);
    expect(csv).toContain("'=cmd|");
    // The raw, unescaped formula must not appear as a cell value.
    expect(csv).not.toMatch(/,=cmd\|/);
  });

  it("escapes leading + - @ in category/account labels", () => {
    const csv = service.transactionsToCsv([
      row({
        category: { id: "c1", label: "+SUM(A1)", color: "#000" },
        account: { id: "a1", label: "@evil" }
      })
    ]);
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@evil");
  });

  it("leaves ordinary values untouched", () => {
    const csv = service.transactionsToCsv([row({ description: "Groceries" })]);
    expect(csv).toContain("Groceries");
    expect(csv).not.toContain("'Groceries");
  });
});
