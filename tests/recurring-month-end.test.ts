import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { formatInputDate } from "@/lib/format";
import type {
  AccountsPageData,
  RecurringTransactionsPageData,
  TransactionsPageData
} from "@/lib/data";
import { RecurringTransactionService } from "@/services/RecurringTransactionService";

// Платёж на 31-е после первого февраля переезжал на 28-е — навсегда: следующая
// дата считалась от предыдущей, а 28 февраля + месяц = 28 марта.

const day = (date: Date) => `${date.getDate()}.${date.getMonth() + 1}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("a monthly payment at the end of the month", () => {
  it("comes back to its own day after a short month", () => {
    const service = new RecurringTransactionService();
    const dates = service.getDueDates(
      new Date(2026, 0, 31),
      "MONTHLY",
      new Date(2026, 5, 30),
      24,
      31
    );
    expect(dates.map(day)).toEqual(["31.1", "28.2", "31.3", "30.4", "31.5", "30.6"]);
  });

  it("keeps the 29th of February for a yearly payment in leap years", () => {
    const service = new RecurringTransactionService();
    const dates = service.getDueDates(
      new Date(2028, 1, 29),
      "YEARLY",
      new Date(2032, 11, 31),
      24,
      29
    );
    expect(dates.map(day)).toEqual(["29.2", "28.2", "28.2", "28.2", "29.2"]);
  });

  it("is posted on the 31st again, even after its amount was edited in February", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 1, 10, 12));

    const client = new LocalApiClient(new MemoryStorageAdapter());
    const account = await client.post<AccountsPageData["accounts"][number]>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const template = {
      amount: "30000",
      type: "EXPENSE",
      accountId: account.id,
      categoryId: "cat-food",
      frequency: "MONTHLY",
      nextDate: "2026-01-31",
      isActive: "true"
    };
    await client.post("/recurring", template);
    await client.post("/recurring/materialize-all", {});

    // Февраль: шаблон стоит на 28-м. Человек правит только сумму — форма
    // присылает ту дату, что показывает, то есть 28 февраля.
    let page = await client.get<RecurringTransactionsPageData>("/recurring");
    const stored = page.recurringTransactions[0];
    expect(day(new Date(stored.nextDate))).toBe("28.2");
    await client.put("/recurring", {
      ...template,
      id: stored.id,
      amount: "32000",
      nextDate: formatInputDate(stored.nextDate)
    });

    vi.setSystemTime(new Date(2026, 4, 1, 12));
    await client.post("/recurring/materialize-all", {});

    const transactions = await client.get<TransactionsPageData>(
      "/transactions?from=2026-01-01&to=2026-12-31"
    );
    const posted = transactions.transactions.map((row) => row.date.slice(0, 10)).sort();
    expect(posted).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);

    page = await client.get<RecurringTransactionsPageData>("/recurring");
    expect(day(new Date(page.recurringTransactions[0].nextDate))).toBe("31.5");
  });
});
