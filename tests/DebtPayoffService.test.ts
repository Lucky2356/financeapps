import { describe, expect, it } from "vitest";

import { DebtPayoffService } from "@/services/DebtPayoffService";

const service = new DebtPayoffService();

describe("DebtPayoffService.monthsToPayoff", () => {
  it("returns 0 for a cleared balance", () => {
    expect(service.monthsToPayoff(0, 20, 1000)).toBe(0);
  });

  it("divides evenly for an interest-free debt", () => {
    expect(service.monthsToPayoff(10000, 0, 2500)).toBe(4);
  });

  it("accounts for interest (more months than the principal alone implies)", () => {
    // 100k at 24% APR, 5k/mo: amortizes in ~24 months.
    const months = service.monthsToPayoff(100000, 24, 5000);
    expect(months).toBeGreaterThan(20);
    expect(months).toBeLessThan(30);
  });

  it("returns null when the payment never outpaces interest", () => {
    // Monthly interest on 100k at 24% is 2000; a 1500 payment never amortizes.
    expect(service.monthsToPayoff(100000, 24, 1500)).toBeNull();
  });

  it("returns null for a non-positive payment", () => {
    expect(service.monthsToPayoff(1000, 10, 0)).toBeNull();
  });
});

describe("DebtPayoffService.totalInterest", () => {
  it("is zero for an interest-free debt", () => {
    expect(service.totalInterest(10000, 0, 2500)).toBe(0);
  });

  it("is positive when interest accrues", () => {
    expect(service.totalInterest(100000, 24, 5000)).toBeGreaterThan(0);
  });

  it("is null when the debt never amortizes", () => {
    expect(service.totalInterest(100000, 24, 1500)).toBeNull();
  });
});

describe("DebtPayoffService.order", () => {
  const debts = [
    { balance: 50000, interestRate: 12, minPayment: 3000 },
    { balance: 10000, interestRate: 30, minPayment: 1000 },
    { balance: 200000, interestRate: 8, minPayment: 5000 }
  ];

  it("avalanche orders by highest interest rate first", () => {
    expect(service.order(debts, "avalanche").map((d) => d.interestRate)).toEqual([30, 12, 8]);
  });

  it("snowball orders by smallest balance first", () => {
    expect(service.order(debts, "snowball").map((d) => d.balance)).toEqual([10000, 50000, 200000]);
  });

  it("does not mutate the input array", () => {
    const input = [...debts];
    service.order(input, "avalanche");
    expect(input).toEqual(debts);
  });
});
