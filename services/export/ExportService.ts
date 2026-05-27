import Papa from "papaparse";

import type { TransactionRow } from "@/types/finance";

export class ExportService {
  transactionsToCsv(transactions: TransactionRow[]) {
    return Papa.unparse(
      transactions.map((transaction) => ({
        date: transaction.date,
        amount: transaction.type === "INCOME" ? transaction.amount : -transaction.amount,
        type: transaction.type,
        category: transaction.category.label,
        account: transaction.account.label,
        description: transaction.description ?? ""
      }))
    );
  }

  transactionsToJson(transactions: TransactionRow[]) {
    return JSON.stringify({ exportedAt: new Date().toISOString(), transactions }, null, 2);
  }
}
