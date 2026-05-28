"use client";

import type { ApiClient } from "@/lib/api/ApiClient";
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
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import type { DashboardData, InvestmentData } from "@/types/finance";

export type LocalSnapshotMetadata = {
  schemaVersion: 1;
  savedAt: string;
  keys: string[];
};

type SnapshotPayload = {
  dashboard: DashboardData;
  transactions: TransactionsPageData;
  recurring: RecurringTransactionsPageData;
  forecast: ForecastPageData;
  accounts: AccountsPageData;
  budgets: BudgetsPageData;
  goals: GoalsPageData;
  investments: InvestmentData;
  settings: SettingsPageData;
  importReferences: ImportPageData;
};

const snapshotEndpoints = {
  dashboard: "/dashboard",
  transactions: "/transactions",
  recurring: "/recurring",
  forecast: "/forecast",
  accounts: "/accounts",
  budgets: "/budgets",
  goals: "/goals",
  investments: "/investments",
  settings: "/settings",
  importReferences: "/import"
} as const;

export class LocalSnapshotService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly storage: StorageAdapter
  ) {}

  async saveFromApi(): Promise<LocalSnapshotMetadata> {
    const payload = await this.fetchSnapshot();
    const keys = Object.keys(payload);

    await Promise.all(keys.map((key) => this.storage.setItem(key, payload[key as keyof SnapshotPayload])));
    const metadata: LocalSnapshotMetadata = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      keys
    };
    await this.storage.setItem("localSnapshot", metadata);

    return metadata;
  }

  async metadata() {
    return this.storage.getItem<LocalSnapshotMetadata>("localSnapshot");
  }

  async clear() {
    await this.storage.clear();
  }

  private async fetchSnapshot(): Promise<SnapshotPayload> {
    const [
      dashboard,
      transactions,
      recurring,
      forecast,
      accounts,
      budgets,
      goals,
      investments,
      settings,
      importReferences
    ] = await Promise.all([
      this.apiClient.get<DashboardData>(snapshotEndpoints.dashboard),
      this.apiClient.get<TransactionsPageData>(snapshotEndpoints.transactions),
      this.apiClient.get<RecurringTransactionsPageData>(snapshotEndpoints.recurring),
      this.apiClient.get<ForecastPageData>(snapshotEndpoints.forecast),
      this.apiClient.get<AccountsPageData>(snapshotEndpoints.accounts),
      this.apiClient.get<BudgetsPageData>(snapshotEndpoints.budgets),
      this.apiClient.get<GoalsPageData>(snapshotEndpoints.goals),
      this.apiClient.get<InvestmentData>(snapshotEndpoints.investments),
      this.apiClient.get<SettingsPageData>(snapshotEndpoints.settings),
      this.apiClient.get<ImportPageData>(snapshotEndpoints.importReferences)
    ]);

    return {
      dashboard,
      transactions,
      recurring,
      forecast,
      accounts,
      budgets,
      goals,
      investments,
      settings,
      importReferences
    };
  }
}
