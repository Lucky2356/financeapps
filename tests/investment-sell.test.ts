import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { InvestmentData } from "@/types/finance";
import type { TransactionsPageData } from "@/lib/data";

// Recording a sale used to touch the tax ledger and nothing else: the shares
// stayed in the portfolio, the money arrived nowhere, and the same gain was
// counted both as realized and as still-to-come in "if you sold today".
async function withPosition() {
  const api = new LocalApiClient(new MemoryStorageAdapter());
  const account = await api.post<{ id: string }>("/accounts", {
    name: "Брокерский",
    type: "BROKERAGE",
    balance: "0"
  });
  await api.post("/investments", {
    action: "addPosition",
    ticker: "SBER",
    quantity: "100",
    averageBuyPrice: "250",
    lots: JSON.stringify([
      { date: "2024-01-10", quantity: 60, price: 200 },
      { date: "2025-06-01", quantity: 40, price: 325 }
    ])
  });
  return { api, accountId: account.id };
}

describe("recording a sale", () => {
  it("takes the shares out of the portfolio, oldest purchases first", async () => {
    const { api } = await withPosition();

    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "70",
      sellPrice: "300",
      buyPrice: "250",
      fee: "0",
      date: "2026-08-01"
    });

    const data = await api.get<InvestmentData>("/investments");
    const position = data.portfolio.find((row) => row.ticker === "SBER");
    expect(position?.quantity).toBe(30);
    // 60 from the 2024 lot and 10 from the 2025 one — what is left is the rest
    // of the newer purchase.
    expect(position?.lots).toEqual([{ date: "2025-06-01", quantity: 30, price: 325 }]);
  });

  it("empties the position when everything is sold", async () => {
    const { api } = await withPosition();

    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "100",
      sellPrice: "300",
      buyPrice: "250",
      fee: "0",
      date: "2026-08-01"
    });

    const data = await api.get<InvestmentData>("/investments");
    expect(data.portfolio.find((row) => row.ticker === "SBER")).toBeUndefined();
  });

  it("refuses to sell more than is held", async () => {
    const { api } = await withPosition();

    await expect(
      api.post("/investments/events", {
        type: "SELL",
        ticker: "SBER",
        quantity: "150",
        sellPrice: "300",
        buyPrice: "250",
        date: "2026-08-01"
      })
    ).rejects.toThrow(/продать больше нельзя/i);
  });

  it("puts the proceeds on the account that was named", async () => {
    const { api, accountId } = await withPosition();

    await api.post("/investments/events", {
      type: "SELL",
      ticker: "SBER",
      quantity: "10",
      sellPrice: "300",
      buyPrice: "250",
      fee: "50",
      accountId,
      date: "2026-08-01"
    });

    const accounts = await api.get<{ accounts: Array<{ id: string; balance: number }> }>(
      "/accounts"
    );
    // 10 × 300 − 50 of commission.
    expect(accounts.accounts.find((item) => item.id === accountId)?.balance).toBe(2_950);

    const ledger = await api.get<TransactionsPageData>("/transactions?limit=all");
    expect(ledger.transactions.some((row) => row.description === "Продажа SBER")).toBe(true);
  });
});
