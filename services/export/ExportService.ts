import Papa from "papaparse";

import type { TransactionRow } from "@/types/finance";

// CSV formula-injection guard: a spreadsheet treats a cell starting with = + - @
// (or a leading tab/CR) as a formula, so a description like `=cmd|'/c calc'!A1`
// would execute on open. Prefix such values with a single quote to neutralize them.
function escapeCsvField(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export class ExportService {
  transactionsToCsv(transactions: TransactionRow[]) {
    const csv = Papa.unparse(
      transactions.map((transaction) => ({
        date: transaction.date,
        amount: transaction.type === "INCOME" ? transaction.amount : -transaction.amount,
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
}
