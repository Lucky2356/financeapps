import type {
  AccountsPageData,
  BudgetsPageData,
  GoalsPageData,
  ImportPageData,
  SettingsPageData,
  TransactionsPageData
} from "@/lib/data";
import type { DashboardData, InvestmentData } from "@/types/finance";

export interface FinanceRepository {
  dashboard(): Promise<DashboardData>;
  transactions(params?: Record<string, string>): Promise<TransactionsPageData>;
  accounts(): Promise<AccountsPageData>;
  budgets(): Promise<BudgetsPageData>;
  goals(): Promise<GoalsPageData>;
  investments(): Promise<InvestmentData>;
  settings(): Promise<SettingsPageData>;
  importReferences(): Promise<ImportPageData>;
}
