import Papa from "papaparse";

import type { AccountRow, TransactionRow } from "@/types/finance";
import type { Locale } from "@/lib/i18n/catalog";
import { displayLocale } from "@/lib/i18n/display-locale";
import type { PeriodReport } from "@/lib/reports/period-report";

// CSV formula-injection guard: a spreadsheet treats a cell starting with = + - @
// (or a leading tab/CR) as a formula, so a description like `=cmd|'/c calc'!A1`
// would execute on open. Prefix such values with a single quote to neutralize them.
export function escapeCsvField(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Как писать файл для таблиц на этом языке.
 *
 * Excel с русскими настройками ждёт точку с запятой между столбцами и запятую
 * в дробях: файл через запятые открывался одним столбцом, а «1234.5» — текстом.
 * Остальные выгрузки приложения (Таблица, вычеты) так и пишут. По-английски —
 * как принято там: запятые и точка.
 */
function csvStyle(locale: Locale) {
  const russian = locale !== "en";
  return {
    delimiter: russian ? ";" : ",",
    number: (value: number) => (russian ? String(value).replace(".", ",") : String(value))
  };
}

export class ExportService {
  /**
   * `accounts` names the currency each row is in. An operation is recorded in
   * the currency of its account, so a file of bare numbers put dollars and
   * roubles in one column with nothing to tell them apart.
   */
  transactionsToCsv(
    transactions: TransactionRow[],
    accounts: AccountRow[] = [],
    locale: Locale = displayLocale()
  ) {
    const style = csvStyle(locale);
    const currencyOf = new Map(accounts.map((account) => [account.id, account.currency]));
    const csv = Papa.unparse(
      transactions.map((transaction) => ({
        date: transaction.date,
        amount: style.number(
          transaction.type === "INCOME" ? transaction.amount : -transaction.amount
        ),
        currency: currencyOf.get(transaction.account.id) ?? "",
        type: transaction.type,
        category: escapeCsvField(transaction.category.label),
        account: escapeCsvField(transaction.account.label),
        description: escapeCsvField(transaction.description ?? "")
      })),
      { delimiter: style.delimiter }
    );
    return "﻿" + csv;
  }

  transactionsToJson(transactions: TransactionRow[]) {
    return JSON.stringify({ exportedAt: new Date().toISOString(), transactions }, null, 2);
  }

  // Monthly report rows (income/expense/savings) plus a totals line, as CSV.
  reportToCsv(report: PeriodReport, locale: Locale = displayLocale()) {
    const style = csvStyle(locale);
    const rows = report.monthly.map((month) => ({
      month: month.month,
      income: style.number(month.income),
      expense: style.number(month.expense),
      savings: style.number(month.savings)
    }));
    rows.push({
      month: `${report.from}…${report.to}`,
      income: style.number(report.totals.income),
      expense: style.number(report.totals.expense),
      savings: style.number(report.totals.savings)
    });
    return "﻿" + Papa.unparse(rows, { delimiter: style.delimiter });
  }
}
