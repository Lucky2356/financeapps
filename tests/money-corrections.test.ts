import { describe, expect, it } from "vitest";

import { DebtPayoffService } from "@/services/DebtPayoffService";
import { storedTransactionDate } from "@/lib/transactions/date";
import { parseImportedAmount } from "@/services/import/CsvParsing";
import { encryptString, decryptString } from "@/lib/sync/crypto";

// The arithmetic the app was getting wrong, each case written down as the number
// a person with a calculator would get.
describe("debt overpayment", () => {
  const service = new DebtPayoffService();

  it("an interest-free debt costs nothing extra", () => {
    // 100 000 ₽ at 30 000 ₽ a month clears in four payments, the last one being
    // 10 000 ₽. Counting that last payment in full reported 20 000 ₽ of interest
    // on a debt that has none.
    expect(service.monthsToPayoff(100_000, 0, 30_000)).toBe(4);
    expect(service.totalInterest(100_000, 0, 30_000)).toBe(0);
  });

  it("interest is what the balance actually accrues", () => {
    const interest = service.totalInterest(100_000, 12, 30_000);
    expect(interest).not.toBeNull();
    expect(interest as number).toBeGreaterThan(2_200);
    expect(interest as number).toBeLessThan(2_300);
  });

  it("says nothing when the payment never outpaces the interest", () => {
    expect(service.totalInterest(100_000, 24, 1_000)).toBeNull();
  });
});

describe("the day an operation is stored on", () => {
  it("keeps a typed day exactly as typed", () => {
    expect(storedTransactionDate("2026-09-01")).toBe("2026-09-01T00:00:00.000Z");
  });

  it("stores the local calendar day, not the moment", () => {
    // Whatever the machine's offset, a Date built for local noon on 1 September
    // belongs to September — serialising it raw put it in August east of
    // Greenwich, where the ledger showed «1 сентября» and the budgets counted
    // August.
    const local = new Date(2026, 8, 1, 12, 30);
    expect(storedTransactionDate(local)).toBe("2026-09-01T00:00:00.000Z");
    expect(storedTransactionDate(local).slice(0, 7)).toBe("2026-09");
  });

  it("puts an old timestamp on the day it is displayed as", () => {
    // This is the shape the app used to write for itself. Whatever the machine's
    // offset, what comes back is midnight of the day the ledger shows.
    const raw = "2026-08-31T17:00:00.000Z";
    const shown = new Date(raw);
    expect(storedTransactionDate(raw)).toBe(
      new Date(Date.UTC(shown.getFullYear(), shown.getMonth(), shown.getDate())).toISOString()
    );
    expect(storedTransactionDate(raw).endsWith("T00:00:00.000Z")).toBe(true);
  });
});

describe("amounts read out of a statement", () => {
  it("understands every separator a bank uses", () => {
    expect(parseImportedAmount("1 234,56")).toBe(1234.56);
    expect(parseImportedAmount("1.234,56")).toBe(1234.56);
    expect(parseImportedAmount("1,234.56")).toBe(1234.56);
    expect(parseImportedAmount("-1 234.56 ₽")).toBe(-1234.56);
    expect(parseImportedAmount("500-")).toBe(-500);
    expect(parseImportedAmount("1 000")).toBe(1000);
  });

  it("still refuses what is not a number", () => {
    expect(parseImportedAmount("—")).toBeNull();
    expect(parseImportedAmount("")).toBeNull();
  });
});

describe("the sync envelope", () => {
  it("is decrypted with the rounds it was written with", async () => {
    const payload = await encryptString("привет", "пароль");
    const envelope = JSON.parse(payload) as { iterations: number };
    expect(envelope.iterations).toBeGreaterThan(0);
    await expect(decryptString(payload, "пароль")).resolves.toBe("привет");
    await expect(decryptString(payload, "не тот")).rejects.toThrow();
  });
});
