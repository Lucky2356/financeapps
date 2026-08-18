import { describe, expect, it } from "vitest";

import { countableRows, isTransfer, withoutTransfers } from "@/lib/transactions/transfers";

// A transfer between the owner's own accounts is written as two ordinary rows
// so both balances move. That is right for balances and wrong for every total
// built on them — which is how "Переводы" became the largest category on both
// sides of the same month.
const row = (patch: Partial<{ description: string | null; transferId: string }>) => ({
  description: null,
  ...patch
});

describe("transfers", () => {
  it("recognises a transfer by its id", () => {
    expect(isTransfer(row({ transferId: "transfer-1" }))).toBe(true);
  });

  it("still recognises transfers written before the id existed", () => {
    expect(isTransfer(row({ description: "Перевод на копилку [transfer:transfer-7]" }))).toBe(true);
  });

  it("leaves ordinary operations alone", () => {
    expect(isTransfer(row({ description: "Продукты" }))).toBe(false);
    expect(isTransfer(row({ description: null }))).toBe(false);
    // A description that merely talks about a transfer is not one.
    expect(isTransfer(row({ description: "Перевод другу" }))).toBe(false);
  });

  it("drops both halves of a transfer from a list", () => {
    const rows = [
      row({ description: "Зарплата" }),
      row({ transferId: "t1", description: "в копилку [transfer:t1]" }),
      row({ transferId: "t1", description: "из зарплатной [transfer:t1]" })
    ];
    expect(withoutTransfers(rows)).toHaveLength(1);
  });

  it("honours the reader's choice", () => {
    const rows = [row({ description: "Продукты" }), row({ transferId: "t1" })];
    expect(countableRows(rows, true)).toHaveLength(2);
    expect(countableRows(rows, false)).toHaveLength(1);
  });
});
