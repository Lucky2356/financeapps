import { describe, expect, it } from "vitest";

import { CsvImportMapper } from "@/services/import/CsvImportMapper";

describe("CsvImportMapper", () => {
  const mapper = new CsvImportMapper();

  it("suggests Russian CSV columns and validates rows before import", () => {
    const parsed = mapper.parse("Дата,Сумма,Описание,Категория,Счет\n27.05.2026,-1200,Кофе,Рестораны,Дебетовая карта\nbad,0,Пусто,,");
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
});
