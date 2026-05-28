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
import type { DashboardData, InvestmentData } from "@/types/finance";

export interface FinanceRepository {
  dashboard(): Promise<DashboardData>;
  transactions(params?: Record<string, string>): Promise<TransactionsPageData>;
  recurring(): Promise<RecurringTransactionsPageData>;
  forecast(): Promise<ForecastPageData>;
  accounts(): Promise<AccountsPageData>;
  budgets(): Promise<BudgetsPageData>;
  goals(): Promise<GoalsPageData>;
  investments(): Promise<InvestmentData>;
  settings(): Promise<SettingsPageData>;
  importReferences(): Promise<ImportPageData>;
}
