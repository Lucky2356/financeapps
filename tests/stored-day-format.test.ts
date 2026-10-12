import { afterEach, describe, expect, it } from "vitest";

import { updatePayload } from "@/components/transactions/transaction-manager/helpers";
import { formatDate, formatInputDate, formatMonth } from "@/lib/format";
import { dayAsLocalDate, storedTransactionDate } from "@/lib/transactions/date";
import { ExportService } from "@/services/export/ExportService";
import { CsvImportMapper } from "@/services/import/CsvImportMapper";
import { parseImportedDate } from "@/services/import/CsvParsing";
import type { TransactionRow } from "@/types/finance";

// Даты операций хранятся полночью UTC своего дня. К западу от Гринвича это
// вечер накануне, и всё, что показывало или пересохраняло дату через местное
// время, сдвигало операцию на день назад — при каждой правке. Каждая проверка
// идёт в двух поясах: в Москве ничего не должно было поменяться.
const ZONES = ["Europe/Moscow", "America/New_York"] as const;
const originalZone = process.env.TZ;

afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

const transaction = {
  id: "t1",
  amount: 1200,
  type: "EXPENSE",
  date: "2026-09-01T00:00:00.000Z",
  description: "Кофе",
  account: { id: "card", label: "Карта" },
  category: { id: "food", label: "Еда", color: "#000" }
} as unknown as TransactionRow;

describe.each(ZONES)("stored dates in %s", (zone) => {
  it("shows and edits the stored day, not the evening before", () => {
    process.env.TZ = zone;
    expect(formatInputDate("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
    expect(formatInputDate("2026-09-01T00:00:00Z")).toBe("2026-09-01");
    expect(formatInputDate("2026-09-01")).toBe("2026-09-01");
    expect(formatDate("2026-09-01T00:00:00.000Z")).toBe("01 сент. 2026");
    expect(formatMonth("2026-09-01T00:00:00.000Z")).toMatch(/^сент/);
  });

  it("does not move the day on save or bulk categorize", () => {
    process.env.TZ = zone;
    const payload = updatePayload(transaction, "other");
    expect(payload.date).toBe("2026-09-01");
    // Пересохранение той же записи — тот же день, сколько раз ни правь.
    expect(storedTransactionDate(payload.date)).toBe(transaction.date);
  });

  it("keeps a local Date as the local day", () => {
    process.env.TZ = zone;
    expect(formatInputDate(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(formatInputDate(new Date(2026, 8, 1, 23, 30))).toBe("2026-09-01");
  });

  it("survives a CSV export and import with the same day", () => {
    process.env.TZ = zone;
    const csv = new ExportService().transactionsToCsv([transaction]);
    const mapper = new CsvImportMapper();
    const { rows } = mapper.parse(csv.replace(/^﻿/, ""));
    const date = parseImportedDate(rows[0].date);
    expect(date).not.toBeNull();
    expect(storedTransactionDate(date!)).toBe(transaction.date);
  });
});

describe("dayAsLocalDate", () => {
  it("reads a real moment in local time, as before", () => {
    // Старая запись, сделанная до storedTransactionDate: местная полночь
    // 1 сентября в Москве. Её день — 1-е, и таким он и должен остаться.
    process.env.TZ = "Europe/Moscow";
    expect(formatInputDate("2026-08-31T21:00:00.000Z")).toBe("2026-09-01");
    const moment = dayAsLocalDate("2026-09-01T21:30:00.000Z");
    expect(moment.getDate()).toBe(2);
    expect(moment.getHours()).toBe(0);
    expect(moment.getMinutes()).toBe(30);
  });
});
