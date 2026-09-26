import { afterEach, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { AccountsPageData, TransactionsPageData } from "@/lib/data";

afterEach(() => {
  vi.useRealTimers();
});

// Операции одного дня стояли в порядке строк массива. Синхронизация кладёт
// пришедшую строку туда, где она оказалась при слиянии, — и только что
// добавленная на телефоне операция на ПК вставала третьей.
it("puts the operation recorded last on top of its day, wherever its row sits", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 26, 9));
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const account = await client.post<AccountsPageData["accounts"][number]>("/accounts", {
    name: "Карта",
    type: "DEBIT_CARD",
    balance: "10000"
  });
  const add = (description: string) =>
    client.post("/transactions", {
      amount: "100",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      date: "2026-09-26",
      description
    });
  await add("утром");
  vi.setSystemTime(new Date(2026, 8, 26, 12));
  await add("днём");
  vi.setSystemTime(new Date(2026, 8, 26, 18));
  await add("вечером");

  // Как после слияния: самая свежая строка оказалась в конце массива.
  const document = await client.get<{ transactions: unknown[] }>("/backup");
  const rows = document.transactions;
  rows.push(rows.shift());
  const other = new LocalApiClient(new MemoryStorageAdapter());
  await other.post("/backup", { backup: document });

  const ledger = await other.get<TransactionsPageData>("/transactions?from=2026-09-01");
  expect(ledger.transactions.map((row) => row.description)).toEqual(["вечером", "днём", "утром"]);
});
