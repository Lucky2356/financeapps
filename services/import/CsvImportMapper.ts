import Papa from "papaparse";

import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

export type ParsedCsv = {
  fields: string[];
  rows: Array<Record<string, unknown>>;
  errors: string[];
};

export type CsvColumnMapping = {
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  categoryColumn: string;
  accountColumn: string;
};

export type CsvValidationResult = {
  validRows: number;
  invalidRows: number;
  warnings: string[];
};

const aliases: Record<keyof CsvColumnMapping, string[]> = {
  dateColumn: ["date", "дата", "дата операции", "operation date"],
  amountColumn: ["amount", "сумма", "сумма операции", "value"],
  descriptionColumn: ["description", "описание", "назначение", "комментарий", "details"],
  categoryColumn: ["category", "категория", "mcc category"],
  accountColumn: ["account", "счет", "счёт", "карта", "кошелек"]
};

export class CsvImportMapper {
  parse(content: string): ParsedCsv {
    const result = Papa.parse<Record<string, unknown>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    return {
      fields: result.meta.fields ?? [],
      rows: result.data,
      errors: result.errors.map((error) => `${error.row ?? "-"}: ${error.message}`)
    };
  }

  suggestColumns(fields: string[]): CsvColumnMapping {
    return {
      dateColumn: this.findByAlias(fields, "dateColumn"),
      amountColumn: this.findByAlias(fields, "amountColumn"),
      descriptionColumn: this.findByAlias(fields, "descriptionColumn"),
      categoryColumn: this.findByAlias(fields, "categoryColumn"),
      accountColumn: this.findByAlias(fields, "accountColumn")
    };
  }

  validateRows(rows: Array<Record<string, unknown>>, mapping: CsvColumnMapping): CsvValidationResult {
    const warnings: string[] = [];
    let validRows = 0;

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const amount = mapping.amountColumn ? parseImportedAmount(row[mapping.amountColumn]) : null;
      const date = mapping.dateColumn ? parseImportedDate(row[mapping.dateColumn]) : null;

      if (!mapping.dateColumn || !mapping.amountColumn) {
        return;
      }

      if (amount === null || amount === 0) {
        warnings.push(`Строка ${rowNumber}: сумма пустая, нулевая или не распознана`);
        return;
      }

      if (!date) {
        warnings.push(`Строка ${rowNumber}: дата не распознана`);
        return;
      }

      validRows += 1;
    });

    return {
      validRows,
      invalidRows: rows.length - validRows,
      warnings: warnings.slice(0, 20)
    };
  }

  private findByAlias(fields: string[], target: keyof CsvColumnMapping) {
    const normalized = fields.map((field) => ({ field, value: field.trim().toLowerCase() }));
    return normalized.find((item) => aliases[target].includes(item.value))?.field ?? "";
  }
}
