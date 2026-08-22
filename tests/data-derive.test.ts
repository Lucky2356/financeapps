import { describe, expect, it } from "vitest";

import {
  buildAssetKindStructure,
  buildCategoryExpenses,
  buildMonthlyCashflow,
  buildSectorStructure
} from "@/lib/data/derive";
import { ASSET_KIND_COLORS } from "@/lib/charts/palette";
import type { PortfolioRow, TransactionRow } from "@/types/finance";

function tx(
  overrides: Partial<TransactionRow> & Pick<TransactionRow, "id" | "amount" | "type">
): TransactionRow {
  return {
    date: new Date().toISOString(),
    description: null,
    account: { id: "acc-1", label: "Карта" },
    category: { id: "cat-1", label: "Еда", color: "#fff" },
    ...overrides
  } as TransactionRow;
}

const portfolioRow = (sector: string, currentValue: number): PortfolioRow =>
  ({ sector, currentValue }) as PortfolioRow;

describe("buildSectorStructure", () => {
  it("converts portfolio values to sector percentages sorted descending", () => {
    const result = buildSectorStructure([
      portfolioRow("Технологии", 75),
      portfolioRow("Энергетика", 25)
    ]);
    expect(result[0]).toEqual({ name: "Технологии", value: 75 });
    expect(result[1]).toEqual({ name: "Энергетика", value: 25 });
  });

  it("returns an empty array when the portfolio is empty", () => {
    expect(buildSectorStructure([])).toEqual([]);
  });
});

describe("buildAssetKindStructure", () => {
  const holding = (assetKind: PortfolioRow["assetKind"], currentValue: number) =>
    ({ assetKind, currentValue, sector: "Разное" }) as PortfolioRow;

  // The chart used to take its colours from the position of a slice in the ring,
  // and two of the four kinds landed on neighbouring violets — funds and bonds
  // came out the same colour.
  it("gives every kind its own colour, whatever order the slices are in", () => {
    const result = buildAssetKindStructure(
      [holding("FUND", 50), holding("STOCK", 30), holding("BOND", 20)],
      (kind) => kind
    );
    expect(result.map((slice) => slice.name)).toEqual(["FUND", "STOCK", "BOND"]);
    expect(result.map((slice) => slice.fill)).toEqual([
      ASSET_KIND_COLORS.FUND,
      ASSET_KIND_COLORS.STOCK,
      ASSET_KIND_COLORS.BOND
    ]);
    expect(new Set(result.map((slice) => slice.fill)).size).toBe(3);
  });
});

describe("buildCategoryExpenses", () => {
  it("aggregates current-month expenses by category, ignoring income", () => {
    const result = buildCategoryExpenses([
      tx({
        id: "1",
        amount: 1000,
        type: "EXPENSE",
        category: { id: "food", label: "Еда", color: "#a" }
      }),
      tx({
        id: "2",
        amount: 500,
        type: "EXPENSE",
        category: { id: "food", label: "Еда", color: "#a" }
      }),
      tx({
        id: "3",
        amount: 9999,
        type: "INCOME",
        category: { id: "sal", label: "Зарплата", color: "#b" }
      })
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Еда", value: 1500 });
  });
});

describe("buildMonthlyCashflow", () => {
  it("returns three monthly buckets with the current month summed", () => {
    const result = buildMonthlyCashflow([
      tx({ id: "1", amount: 200000, type: "INCOME" }),
      tx({ id: "2", amount: 50000, type: "EXPENSE" })
    ]);
    expect(result).toHaveLength(3);
    const current = result[2];
    expect(current.income).toBe(200000);
    expect(current.expense).toBe(50000);
  });
});
