import { isValid } from "date-fns";
import Papa from "papaparse";

import { formatInputDate } from "@/lib/format";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";
import { translate, type Locale } from "@/lib/i18n/catalog";

export type ExistingTransactionLike = {
  date: string | Date;
  amount: number;
  description?: string | null;
};

// Ключ для поиска повторов. Знак суммы не учитывается: в файле строки со знаком
// (−1200), а в учёте сумма положительная и отдельно тип расход/доход. Сумма —
// в копейках: округление до рубля склеивало −199,90 и −200, а Math.round(−1200,5)
// даёт −1200, тогда как 1200,5 из учёта — 1201, и такая пара не сходилась вовсе.
// День — тот, что хранится (formatInputDate читает полночь UTC как день): через
// местное время к западу от Гринвича операция из учёта числилась вчерашней.
function dedupKey(date: string | Date, amount: number, description: string): string {
  return `${formatInputDate(date)}|${Math.round(Math.abs(amount) * 100)}|${description.trim().toLowerCase()}`;
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

  // Auto-detects the best-matching bank preset from the CSV headers: the preset
  // that resolves date+amount via its own aliases and matches the most columns.
  // Returns null when no preset confidently resolves date+amount (caller then
  // falls back to the generic suggestColumns). Column output is correct even when
  // several banks tie, since presets mostly differ in alias lists, not targets.
  detectPreset(fields: string[]): string | null {
    let best: { id: string; score: number } | null = null;
    for (const preset of presets) {
      let score = 0;
      let hasDate = false;
      let hasAmount = false;
      for (const key of Object.keys(preset.aliases) as Array<keyof CsvColumnMapping>) {
        if (this.findByCandidates(fields, preset.aliases[key])) {
          score += 1;
          if (key === "dateColumn") hasDate = true;
          if (key === "amountColumn") hasAmount = true;
        }
      }
      if (!hasDate || !hasAmount) continue;
      if (!best || score > best.score) best = { id: preset.id, score };
    }
    return best?.id ?? null;
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
    mapping: CsvColumnMapping,
    locale: Locale = "ru"
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
        warnings.push(translate(locale, "imp.warn.amount", { row: rowNumber }));
        return;
      }

      if (!date) {
        warnings.push(translate(locale, "imp.warn.date", { row: rowNumber }));
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

  // Номера строк файла, которые уже есть в учёте, по ключу (день, |сумма|,
  // описание). Повтор считается так же, как при самом импорте (importCsvRows):
  // строка — повтор, только пока таких же в учёте больше, чем уже встречено в
  // файле. Два кофе по 200 ₽ за день в выписке — две покупки, а не одна; а если
  // в учёте уже лежит один, повтором будет только первый из двух. Раньше вторая
  // одинаковая строка файла отсекалась всегда, и включённый по умолчанию фильтр
  // молча терял настоящие траты. Строки, которые не разобрались, не отмечаются.
  findDuplicateRows(
    rows: Array<Record<string, unknown>>,
    mapping: CsvColumnMapping,
    existing: ExistingTransactionLike[]
  ): Set<number> {
    const duplicates = new Set<number>();
    if (!mapping.dateColumn || !mapping.amountColumn) return duplicates;

    const stored = new Map<string, number>();
    for (const transaction of existing) {
      if (!isValid(new Date(transaction.date))) continue;
      const key = dedupKey(transaction.date, transaction.amount, transaction.description ?? "");
      stored.set(key, (stored.get(key) ?? 0) + 1);
    }

    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      const amount = parseImportedAmount(row[mapping.amountColumn]);
      const date = parseImportedDate(row[mapping.dateColumn]);
      if (amount === null || !date) return;

      const description = mapping.descriptionColumn
        ? String(row[mapping.descriptionColumn] ?? "")
        : "";
      const key = dedupKey(date, amount, description);

      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count < (stored.get(key) ?? 0)) duplicates.add(index);
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
