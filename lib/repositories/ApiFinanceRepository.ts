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
import type { FinanceRepository } from "@/lib/repositories/FinanceRepository";
import type { DashboardData, InvestmentData } from "@/types/finance";

function query(params?: Record<string, string>) {
  const clean = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) clean.set(key, value);
  }
  const serialized = clean.toString();
  return serialized ? `?${serialized}` : "";
}

export class ApiFinanceRepository implements FinanceRepository {
  constructor(private readonly apiClient: ApiClient) {}

  dashboard() {
    return this.apiClient.get<DashboardData>("/dashboard");
  }

  transactions(params?: Record<string, string>) {
    return this.apiClient.get<TransactionsPageData>(`/transactions${query(params)}`);
  }

  recurring() {
    return this.apiClient.get<RecurringTransactionsPageData>("/recurring");
  }

  forecast() {
    return this.apiClient.get<ForecastPageData>("/forecast");
  }

  accounts() {
    return this.apiClient.get<AccountsPageData>("/accounts");
  }

  budgets() {
    return this.apiClient.get<BudgetsPageData>("/budgets");
  }

  goals() {
    return this.apiClient.get<GoalsPageData>("/goals");
  }

  investments() {
    return this.apiClient.get<InvestmentData>("/investments");
  }

  settings() {
    return this.apiClient.get<SettingsPageData>("/settings");
  }

  importReferences() {
    return this.apiClient.get<ImportPageData>("/import");
  }
}
