// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TransactionsPageData } from "@/lib/data";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));
const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  })
}));
vi.mock("sonner", () => ({ toast }));

import { metricHref } from "@/components/dashboard-overview";
import { AmountDrilldown } from "@/components/drilldown/amount-drilldown";
import { useBulkActions } from "@/components/transactions/transaction-manager/use-bulk-actions";
import { useTransactionRowActions } from "@/components/transactions/transaction-manager/use-row-actions";

type Row = TransactionsPageData["transactions"][number];

// Ключ и параметры как есть — проверяется, ЧТО спросили, а не перевод.
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key) as never;

function row(id: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    amount: 100,
    type: "EXPENSE",
    date: "2026-10-10T00:00:00.000Z",
    description: null,
    account: { id: "acc", label: "Карта" },
    category: { id: "cat", label: "Еда", color: "#000" },
    ...extra
  } as Row;
}

const part1 = row("part-1", { splitGroupId: "g1" });
const part2 = row("part-2", { splitGroupId: "g1", date: "2026-09-01T00:00:00.000Z" });
const part3 = row("part-3", { splitGroupId: "g1", date: "2026-09-01T00:00:00.000Z" });
const plain = row("plain");

// На странице видна одна часть покупки; в книге их три.
const pageData = {
  source: "database",
  transactions: [part1, plain],
  accounts: [{ id: "acc", name: "Карта", type: "DEBIT_CARD", balance: 0, currency: "RUB" }],
  categories: [],
  rules: [],
  filters: {},
  futureDated: { count: 0, net: 0 },
  pagination: { page: 1, limit: 20, total: 2, hasPreviousPage: false, hasNextPage: false }
} as unknown as TransactionsPageData;
const wholeLedger = { ...pageData, transactions: [part1, part2, part3, plain] };

const run = (async (action: () => Promise<unknown>, options?: { onSuccess?: () => unknown }) => {
  const result = await action();
  await options?.onSuccess?.();
  return result;
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  apiClientMock.get.mockResolvedValue(wholeLedger);
  apiClientMock.delete.mockResolvedValue(undefined);
});

describe("удаление части разделённой покупки", () => {
  it("диалог говорит про всю покупку и число её частей в книге, а не на странице", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useTransactionRowActions({
        pageData,
        run,
        confirm: confirm as never,
        confirmFutureDate: (async () => true) as never,
        t,
        rowAmount: () => "100 ₽",
        refresh: async () => undefined
      })
    );
    await result.current.removeTransaction(part1);
    const description = String(confirm.mock.calls[0][0].description);
    expect(description).toContain("tx.delete.split");
    expect(description).toContain('"count":3');
  });

  it("массовое удаление снимает покупку целиком по splitGroupId и считает все строки", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useBulkActions({
        pageData,
        visibleTransactions: pageData.transactions,
        selectedIds: new Set(["part-1", "plain"]),
        clearSelection: () => undefined,
        confirm: confirm as never,
        aiSettings: null as never,
        t,
        locale: "ru",
        refresh: async () => undefined
      })
    );
    await result.current.bulkDelete();
    const paths = apiClientMock.delete.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/transactions?splitGroupId=g1");
    expect(paths).toContain("/transactions?id=plain");
    expect(paths).not.toContain("/transactions?id=part-1");
    expect(paths).toHaveLength(2);
    expect(String(confirm.mock.calls[0][0].description)).toContain('"count":4');
    expect(toast.success).toHaveBeenCalledWith('tx.bulk.deleted {"count":4}');
  });
});

describe("расшифровка суммы", () => {
  it("итог в основной валюте, строка — в своей с пересчётом, старый перевод отброшен", async () => {
    apiClientMock.get.mockResolvedValue({
      ...pageData,
      accounts: [
        { id: "acc", name: "Карта", type: "DEBIT_CARD", balance: 0, currency: "RUB" },
        { id: "acc-usd", name: "Доллары", type: "DEBIT_CARD", balance: 0, currency: "USD" }
      ],
      transactions: [
        row("rub", { amount: 1000, description: "Рубли" }),
        row("usd", {
          amount: 100,
          baseAmount: 9000,
          description: "Доллары",
          account: { id: "acc-usd", label: "Доллары" }
        } as Partial<Row>),
        row("legacy", { amount: 500, description: "Перевод [transfer:old]" })
      ]
    });
    render(
      <AmountDrilldown
        open
        onOpenChange={() => undefined}
        title="Расходы"
        query="from=2026-10-01"
        excludeTransfers
        currency="RUB"
      />
    );
    const total = await screen.findByTestId("drill-total");
    expect(total.textContent?.replace(/\s/g, "")).toBe("10000₽");
    expect(screen.queryByText(/Перевод \[transfer/)).toBeNull();
    const usd = screen.getAllByText(/\$/);
    expect(usd[0].textContent?.replace(/\s/g, "")).toMatch(/\(9000₽\)/);
  });
});

describe("плитки месяца на главной", () => {
  it("ведут в операции текущего месяца, а не за всё время", () => {
    const today = new Date(2026, 9, 12);
    const income = new URLSearchParams(metricHref("monthIncome", today)!.split("?")[1]);
    expect(income.get("type")).toBe("INCOME");
    expect(income.get("from")).toBe("2026-10-01");
    expect(income.get("to")).toBe("2026-10-31");
    const expense = new URLSearchParams(metricHref("monthExpense", today)!.split("?")[1]);
    expect(expense.get("type")).toBe("EXPENSE");
    expect(expense.get("from")).toBe("2026-10-01");
    expect(metricHref("totalBalance", today)).toBe("/accounts");
  });
});
