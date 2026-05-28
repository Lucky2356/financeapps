import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import type {
  AccountsPageData,
  BudgetsPageData,
  ForecastPageData,
  GoalsPageData,
  ImportPageData,
  RecurringTransactionsPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { FinanceRepository } from "@/lib/repositories/FinanceRepository";
import type { DashboardData, InvestmentData } from "@/types/finance";

export class LocalFinanceRepository implements FinanceRepository {
  constructor(private readonly storage: StorageAdapter) {}

  dashboard() {
    return this.required<DashboardData>("dashboard");
  }

  transactions() {
    return this.required<TransactionsPageData>("transactions");
  }

  recurring() {
    return this.required<RecurringTransactionsPageData>("recurring");
  }

  forecast() {
    return this.required<ForecastPageData>("forecast");
  }

  accounts() {
    return this.required<AccountsPageData>("accounts");
  }

  budgets() {
    return this.required<BudgetsPageData>("budgets");
  }

  goals() {
    return this.required<GoalsPageData>("goals");
  }

  investments() {
    return this.required<InvestmentData>("investments");
  }

  settings() {
    return this.required<SettingsPageData>("settings");
  }

  importReferences() {
    return this.required<ImportPageData>("importReferences");
  }

  private async required<T>(key: string): Promise<T> {
    const value = await this.storage.getItem<T>(key);
    if (!value) {
      throw new Error(`Local mode data is not initialized for ${key}. SQLite/IndexedDB sync is TODO for MVP.`);
    }
    return value;
  }
}
