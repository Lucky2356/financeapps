import { format, isValid } from "date-fns";
import Papa from "papaparse";

import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";

export type ExistingTransactionLike = {
  date: string | Date;
  amount: number;
  description?: string | null;
};

// Stable key for duplicate detection. Amount sign is ignored because imported
// rows are often signed (-1200) while stored transactions keep a positive amount
// plus a separate INCOME/EXPENSE type.
function dedupKey(date: Date, amount: number, description: string): string {
  return `${format(date, "yyyy-MM-dd")}|${Math.abs(Math.round(amount))}|${description.trim().toLowerCase()}`;
}

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

export type CsvImportPreset = {
  id: string;
  label: string;
  description: string;
  aliases: Partial<Record<keyof CsvColumnMapping, string[]>>;
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

const presets: CsvImportPreset[] = [
  {
    id: "sber",
    label: "Сбер",
    description: "Типовые выгрузки СберБанк Онлайн",
    aliases: {
      dateColumn: ["Дата операции", "Дата"],
      amountColumn: ["Сумма операции", "Сумма"],
      descriptionColumn: ["Описание", "Назначение платежа", "Операция"],
      categoryColumn: ["Категория"],
      accountColumn: ["Карта", "Счет", "Счёт"]
    }
  },
  {
    id: "tbank",
    label: "Т-Банк",
    description: "Выписки Т-Банка / Т-Инвестиций",
    aliases: {
      dateColumn: ["Дата операции", "Дата платежа", "Дата"],
      amountColumn: ["Сумма операции", "Сумма платежа", "Сумма"],
      descriptionColumn: ["Описание операции", "Описание", "Место операции"],
      categoryColumn: ["Категория"],
      accountColumn: ["Счет", "Счёт", "Карта"]
    }
  },
  {
    id: "alfa",
    label: "Альфа-Банк",
    description: "CSV-выгрузки операций Альфа-Банка",
    aliases: {
      dateColumn: ["Дата операции", "Дата проводки", "Дата"],
      amountColumn: ["Сумма", "Сумма в валюте счета", "Сумма операции"],
      descriptionColumn: ["Описание", "Назначение", "Контрагент"],
      categoryColumn: ["Категория"],
      accountColumn: ["Счет", "Счёт", "Номер счета"]
    }
  },
  {
    id: "vtb",
    label: "ВТБ",
    description: "Базовые CSV/Excel-поля из выписок ВТБ",
    aliases: {
      dateColumn: ["Дата операции", "Дата"],
      amountColumn: ["Сумма операции", "Сумма"],
      descriptionColumn: ["Описание операции", "Описание", "Назначение платежа"],
      categoryColumn: ["Категория"],
      accountColumn: ["Счет списания", "Счет", "Счёт", "Карта"]
    }
  }
];

export class CsvImportMapper {
  presets(): CsvImportPreset[] {
    return presets;
  }

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

  applyPreset(fields: string[], presetId: string): CsvColumnMapping {
    const preset = presets.find((item) => item.id === presetId);
    const suggested = this.suggestColumns(fields);
    if (!preset) return suggested;

    return {
      dateColumn: this.findByCandidates(fields, preset.aliases.dateColumn) || suggested.dateColumn,
      amountColumn:
        this.findByCandidates(fields, preset.aliases.amountColumn) || suggested.amountColumn,
      descriptionColumn:
        this.findByCandidates(fields, preset.aliases.descriptionColumn) ||
        suggested.descriptionColumn,
      categoryColumn:
        this.findByCandidates(fields, preset.aliases.categoryColumn) || suggested.categoryColumn,
      accountColumn:
        this.findByCandidates(fields, preset.aliases.accountColumn) || suggested.accountColumn
    };
  }

  validateRows(
    rows: Array<Record<string, unknown>>,
    mapping: CsvColumnMapping
  ): CsvValidationResult {
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

  // Returns the indices of imported rows that look like duplicates — either of an
  // already-stored transaction or of an earlier row in the same file — keyed on
  // (date, |amount|, description). Rows that cannot be parsed are never flagged.
  findDuplicateRows(
    rows: Array<Record<string, unknown>>,
    mapping: CsvColumnMapping,
    existing: ExistingTransactionLike[]
  ): Set<number> {
    const duplicates = new Set<number>();
    if (!mapping.dateColumn || !mapping.amountColumn) return duplicates;

    const existingKeys = new Set<string>();
    for (const transaction of existing) {
      const date = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
      if (!isValid(date)) continue;
      existingKeys.add(dedupKey(date, transaction.amount, transaction.description ?? ""));
    }

    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const amount = parseImportedAmount(row[mapping.amountColumn]);
      const date = parseImportedDate(row[mapping.dateColumn]);
      if (amount === null || !date) return;

      const description = mapping.descriptionColumn
        ? String(row[mapping.descriptionColumn] ?? "")
        : "";
      const key = dedupKey(date, amount, description);

      if (existingKeys.has(key) || seen.has(key)) {
        duplicates.add(index);
      } else {
        seen.add(key);
      }
    });

    return duplicates;
  }

  private findByAlias(fields: string[], target: keyof CsvColumnMapping) {
    return this.findByCandidates(fields, aliases[target]);
  }

  private findByCandidates(fields: string[], candidates: string[] = []) {
    const normalized = fields.map((field) => ({ field, value: field.trim().toLowerCase() }));
    const normalizedCandidates = candidates.map((candidate) => candidate.trim().toLowerCase());
    return normalized.find((item) => normalizedCandidates.includes(item.value))?.field ?? "";
  }
}
