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
});
