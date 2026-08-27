import Papa from "papaparse";

import type { AccountRow, TransactionRow } from "@/types/finance";
import type { PeriodReport } from "@/lib/reports/period-report";

// CSV formula-injection guard: a spreadsheet treats a cell starting with = + - @
// (or a leading tab/CR) as a formula, so a description like `=cmd|'/c calc'!A1`
// would execute on open. Prefix such values with a single quote to neutralize them.
function escapeCsvField(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export class ExportService {
  /**
   * `accounts` names the currency each row is in. An operation is recorded in
   * the currency of its account, so a file of bare numbers put dollars and
   * roubles in one column with nothing to tell them apart.
   */
  transactionsToCsv(transactions: TransactionRow[], accounts: AccountRow[] = []) {
    const currencyOf = new Map(accounts.map((account) => [account.id, account.currency]));
    const csv = Papa.unparse(
      transactions.map((transaction) => ({
        date: transaction.date,
        amount: transaction.type === "INCOME" ? transaction.amount : -transaction.amount,
        currency: currencyOf.get(transaction.account.id) ?? "",
        type: transaction.type,
        category: escapeCsvField(transaction.category.label),
        account: escapeCsvField(transaction.account.label),
        description: escapeCsvField(transaction.description ?? "")
      }))
    );
    return "﻿" + csv;
  }

  transactionsToJson(transactions: TransactionRow[]) {
    return JSON.stringify({ exportedAt: new Date().toISOString(), transactions }, null, 2);
  }

  // Monthly report rows (income/expense/savings) plus a totals line, as CSV.
  reportToCsv(report: PeriodReport) {
    const rows = report.monthly.map((month) => ({
      month: month.month,
      income: month.income,
      expense: month.expense,
      savings: month.savings
    }));
    rows.push({
      month: `${report.from}…${report.to}`,
      income: report.totals.income,
      expense: report.totals.expense,
      savings: report.totals.savings
    });
    return "﻿" + Papa.unparse(rows);
  }
}
