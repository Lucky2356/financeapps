import { describe, expect, it } from "vitest";

import { CsvImportMapper } from "@/services/import/CsvImportMapper";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

describe("CsvImportMapper", () => {
  const mapper = new CsvImportMapper();

  it("suggests Russian CSV columns and validates rows before import", () => {
    const parsed = mapper.parse(
      "Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-1200,Кофе,Рестораны,Дебетовая карта\nbad,0,Пусто,,"
    );
    const mapping = mapper.suggestColumns(parsed.fields);
    const validation = mapper.validateRows(parsed.rows, mapping);

    expect(mapping).toEqual({
      dateColumn: "Дата",
      amountColumn: "Сумма",
      descriptionColumn: "Описание",
      categoryColumn: "Категория",
      accountColumn: "Счет"
    });
    expect(validation.validRows).toBe(1);
    expect(validation.invalidRows).toBe(1);
    expect(validation.warnings[0]).toContain("Строка 2");
  });

  it("uses shared amount and date parsing rules", () => {
    expect(parseImportedAmount("1 250,50 ₽")).toBe(1250.5);
    expect(parseImportedAmount("not money")).toBeNull();
    const parsedDate = parseImportedDate("27.05.2026");
    expect(parsedDate?.getFullYear()).toBe(2026);
    expect(parsedDate?.getMonth()).toBe(4);
    expect(parsedDate?.getDate()).toBe(27);
    expect(parseImportedDate("bad date")).toBeNull();
  });

  it("applies bank presets before falling back to generic aliases", () => {
    const fields = ["Дата платежа", "Сумма платежа", "Описание операции", "Категория", "Счёт"];
    const mapping = mapper.applyPreset(fields, "tbank");

    expect(mapping).toEqual({
      dateColumn: "Дата платежа",
      amountColumn: "Сумма платежа",
      descriptionColumn: "Описание операции",
      categoryColumn: "Категория",
      accountColumn: "Счёт"
    });
    expect(mapper.presets().map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["sber", "tbank", "alfa", "vtb"])
    );
  });

  describe("detectPreset", () => {
    it("detects a bank-specific preset by its own column names", () => {
      // "Сумма платежа" is T-Bank-specific (not in the generic aliases).
      const fields = ["Дата платежа", "Сумма платежа", "Описание операции", "Категория", "Счёт"];
      expect(mapper.detectPreset(fields)).toBe("tbank");
    });

    it("returns a preset whose mapping resolves date+amount for generic headers", () => {
      const fields = ["Дата операции", "Сумма операции", "Описание", "Категория", "Счет"];
      const detected = mapper.detectPreset(fields);
      expect(detected).not.toBeNull();
      const mapping = mapper.applyPreset(fields, detected!);
      expect(mapping.dateColumn).toBe("Дата операции");
      expect(mapping.amountColumn).toBe("Сумма операции");
    });

    it("returns null when date/amount can't be resolved by any preset", () => {
      expect(mapper.detectPreset(["foo", "bar", "baz"])).toBeNull();
    });
  });

  describe("findDuplicateRows", () => {
    const mapping = {
      dateColumn: "Дата",
      amountColumn: "Сумма",
      descriptionColumn: "Описание",
      categoryColumn: "Категория",
      accountColumn: "Счет"
    };

    it("flags rows matching an existing transaction, ignoring amount sign", () => {
      const { rows } = mapper.parse(
        "Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-1200,Кофе,Рестораны,Карта\n28.05.2026,5000,Книги,Покупки,Карта"
      );
      const existing = [{ date: "2026-05-27T00:00:00.000Z", amount: 1200, description: "Кофе" }];

      const duplicates = mapper.findDuplicateRows(rows, mapping, existing);
      expect(duplicates.has(0)).toBe(true);
      expect(duplicates.has(1)).toBe(false);
      expect(duplicates.size).toBe(1);
    });

    it("keeps identical rows within the same file — two coffees are two purchases", () => {
      // Как и сам импорт (importCsvRows): одинаковые строки выписки — обычное
      // дело, повтором считается только то, что уже лежит в учёте.
      const { rows } = mapper.parse(
        "Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-200,Кофе,Рестораны,Карта\n27.05.2026,-200,Кофе,Рестораны,Карта"
      );

      const duplicates = mapper.findDuplicateRows(rows, mapping, []);
      expect(duplicates.size).toBe(0);
    });

    it("flags only as many rows as there are stored copies", () => {
      const { rows } = mapper.parse(
        "Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-200,Кофе,Рестораны,Карта\n27.05.2026,-200,Кофе,Рестораны,Карта\n27.05.2026,-200,Кофе,Рестораны,Карта"
      );
      const one = [{ date: "2026-05-27T00:00:00.000Z", amount: 200, description: "Кофе" }];

      expect([...mapper.findDuplicateRows(rows, mapping, one)]).toEqual([0]);
      expect([...mapper.findDuplicateRows(rows, mapping, [...one, ...one])]).toEqual([0, 1]);
    });

    it("compares amounts to the kopeck", () => {
      const { rows } = mapper.parse(
        'Дата,Сумма,Описание,Категория,Счет\n27.05.2026,"-199,90",Кофе,,\n27.05.2026,"-1200,50",Обед,,'
      );
      const existing = [
        { date: "2026-05-27T00:00:00.000Z", amount: 200, description: "Кофе" },
        { date: "2026-05-27T00:00:00.000Z", amount: 1200.5, description: "Обед" }
      ];

      // −199,90 — не 200, а −1200,50 — те самые 1200,50 из учёта.
      expect([...mapper.findDuplicateRows(rows, mapping, existing)]).toEqual([1]);
    });

    it("matches a stored day west of Greenwich", () => {
      const zone = process.env.TZ;
      process.env.TZ = "America/New_York";
      try {
        const { rows } = mapper.parse("Дата,Сумма,Описание\n01.09.2026,-1200,Кофе");
        const existing = [{ date: "2026-09-01T00:00:00.000Z", amount: 1200, description: "Кофе" }];
        expect([...mapper.findDuplicateRows(rows, mapping, existing)]).toEqual([0]);
      } finally {
        if (zone === undefined) delete process.env.TZ;
        else process.env.TZ = zone;
      }
    });

    it("returns nothing when date or amount column is unmapped", () => {
      const { rows } = mapper.parse("Дата,Сумма\n27.05.2026,-1200");
      const duplicates = mapper.findDuplicateRows(rows, { ...mapping, amountColumn: "" }, []);
      expect(duplicates.size).toBe(0);
    });
  });
});
