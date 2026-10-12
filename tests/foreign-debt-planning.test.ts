import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

// Долг хранится в своей валюте, шаблон — в валюте своего счёта. В планах их
// числа складывались с рублями как есть: кредит 500 $ в месяц ложился в
// прогноз платежом 500 ₽, а «ближайшие 7 дней» на «Плановых» складывали 100 $
// подписки и 500 $ кредита в «600». По курсу по умолчанию 1 $ = 90 ₽.
const USD_RATE = 90;

afterEach(() => {
  vi.useRealTimers();
});

async function ledgerWithDollarObligations() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 12));
  const client = new LocalApiClient(new MemoryStorageAdapter());
  const roubles = await client.post("/accounts", {
    name: "Рублёвая карта",
    type: "DEBIT_CARD",
    balance: "100000",
    currency: "RUB"
  });
  const dollars = await client.post("/accounts", {
    name: "Долларовая карта",
    type: "DEBIT_CARD",
    balance: "1000",
    currency: "USD"
  });
  await client.post("/recurring", {
    amount: "100",
    type: "EXPENSE",
    accountId: dollars.id,
    categoryId: "cat-food",
    frequency: "MONTHLY",
    nextDate: "2026-10-15",
    isActive: "true"
  });
  await client.post("/debts", {
    name: "Долларовый кредит",
    kind: "LOAN",
    balance: "5000",
    originalAmount: "5000",
    minPayment: "500",
    dueDay: "16",
    currency: "USD",
    autoPay: "true",
    paymentAccountId: roubles.id,
    paymentCategoryId: "cat-food"
  });
  return client;
}

describe("долги и шаблоны в другой валюте — в планах в основной", () => {
  it("прогноз ставит платёж по долларовому кредиту в рублях", async () => {
    const client = await ledgerWithDollarObligations();
    const forecast = await client.get("/forecast");
    const debt = forecast.events.find((event) => event.id.startsWith("debt-"));
    expect(debt?.amount).toBe(500 * USD_RATE);
    expect(debt?.date.slice(0, 10)).toBe("2026-10-16");
  });

  it("«до зарплаты» и «можно тратить» ждут 54 000 ₽, а не 9 500", async () => {
    const client = await ledgerWithDollarObligations();
    const payday = await client.get("/payday?day=25");
    expect(payday.forecast?.upcoming).toBe((100 + 500) * USD_RATE);
    const allowance = await client.get("/allowance");
    expect(allowance.upcoming).toBe((100 + 500) * USD_RATE);
  });

  it("итоги «Плановых» считают доллары по курсу", async () => {
    const client = await ledgerWithDollarObligations();
    const page = await client.get("/recurring");
    expect(page.debtPayments[0].amount).toBe(500 * USD_RATE);
    expect(page.summary.nextSevenDaysAmount).toBe((100 + 500) * USD_RATE);
    expect(page.summary.monthlyPlannedExpense).toBe((100 + 500) * USD_RATE);
  });

  it("страница долгов по-прежнему показывает долг в его валюте", async () => {
    const client = await ledgerWithDollarObligations();
    const debts = await client.get("/debts");
    expect(debts.liabilities[0]).toMatchObject({ balance: 5000, minPayment: 500, currency: "USD" });
  });
});
