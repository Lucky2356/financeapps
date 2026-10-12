import { describe, expect, it } from "vitest";

import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

/** День разобранной даты в местном календаре — так его и запишет учёт. */
function day(value: unknown) {
  const date = parseImportedDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

describe("parseImportedDate", () => {
  it("keeps the day of a date written with a time", () => {
    // `new Date` читал первое как 10 мая, а второе не читал вовсе.
    expect(day("05.10.2026 14:35")).toBe("2026-10-05");
    expect(day("25.10.2026 14:35:00")).toBe("2026-10-25");
    expect(day("05.10.2026, 14:35")).toBe("2026-10-05");
    expect(day("2026-10-05 14:35:00")).toBe("2026-10-05");
    expect(day("2026-10-05T23:59:00Z")).toBe("2026-10-05");
    expect(day("2026-10-05T14:35:00+03:00")).toBe("2026-10-05");
  });

  it("reads a two-digit year as this century", () => {
    expect(day("12.10.26")).toBe("2026-10-12");
    expect(day("12/10/26")).toBe("2026-10-12");
  });

  it("still reads the plain formats", () => {
    expect(day("27.05.2026")).toBe("2026-05-27");
    expect(day("5.9.2026")).toBe("2026-09-05");
    expect(day("2026-05-27")).toBe("2026-05-27");
    expect(day("27/05/2026")).toBe("2026-05-27");
    expect(day("5 Oct 2026")).toBe("2026-10-05");
  });

  it("refuses what cannot be a day of an operation", () => {
    expect(parseImportedDate("31.02.2026")).toBeNull();
    expect(parseImportedDate("01.01.0026")).toBeNull();
    expect(parseImportedDate("01.01.1969")).toBeNull();
    // Дробь, которая не сложилась в «день/месяц», не отдаётся `new Date`:
    // он прочёл бы её как американскую дату 25 октября.
    expect(parseImportedDate("10/25/2026")).toBeNull();
    expect(parseImportedDate("10.25.2026 14:35")).toBeNull();
    expect(parseImportedDate("bad date")).toBeNull();
    expect(parseImportedDate("")).toBeNull();
  });
});

describe("parseImportedAmount", () => {
  it("reads accounting parentheses as a minus", () => {
    expect(parseImportedAmount("(1 200,00)")).toBe(-1200);
    expect(parseImportedAmount("(1 200,00) ₽")).toBe(-1200);
    expect(parseImportedAmount("(350)")).toBe(-350);
    expect(parseImportedAmount("1 200,00")).toBe(1200);
  });
});
