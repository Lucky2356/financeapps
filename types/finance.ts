import type { RecommendationSeverity, RecurrenceFrequency, SecurityRisk, TransactionType } from "@prisma/client";

export type DataSource = "database" | "demo-fallback";

export type MetricCard = {
  title: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
  trend?: { value: number; label: string };
};

export type CategoryRow = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string;
  isEssential: boolean;
  isSubscription: boolean;
  transactionCount: number;
};

export type ChartDatum = {
  name: string;
  value: number;
  fill?: string;
};

export type MonthlyCashflowDatum = {
  month: string;
  income: number;
  expense: number;
};

export type RecommendationView = {
  id: string;
  title: string;
  description: string;
  severity: RecommendationSeverity;
};

export type HealthScore = {
  score: number;
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    status: "good" | "warning" | "critical";
  }>;
};

export type NetWorthPoint = {
  month: string;
  value: number;
};

export type DashboardData = {
  source: DataSource;
  currency: string;
  metrics: MetricCard[];
  categoryExpenses: ChartDatum[];
  monthlyCashflow: MonthlyCashflowDatum[];
  recommendations: RecommendationView[];
  health: HealthScore;
  netWorth: number;
  netWorthTrend: NetWorthPoint[];
  emergencyFund: EmergencyFundStatus;
};

export type EmergencyFundStatus = {
  amount: number; // current reserve (liquid savings)
  months: number; // how many months of average expense it covers
  targetMonths: number;
  targetAmount: number; // targetMonths × average monthly expense
  progress: number; // 0..100
};

export type ForecastPoint = {
  date: string;
  label: string;
  balance: number;
  income: number;
  expense: number;
};

export type ForecastEvent = {
  id: string;
  date: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  account: string;
};

export type ForecastWarning = {
  id: string;
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
};

export type ForecastData = {
  source: DataSource;
  currency: string;
  startingBalance: number;
  forecast30dBalance: number;
  forecast90dBalance: number;
  plannedIncome30d: number;
  plannedExpense30d: number;
  plannedIncome90d: number;
  plannedExpense90d: number;
  points: ForecastPoint[];
  upcomingEvents: ForecastEvent[];
  // Full set of planned events across the horizon (used by the calendar so it
  // matches the totals; upcomingEvents is the short "ближайшие" list).
  events: ForecastEvent[];
  warnings: ForecastWarning[];
};

export type Option = {
  id: string;
  label: string;
};

export type TransactionRow = {
  id: string;
  amount: number;
  type: TransactionType;
  date: string;
  description: string | null;
  account: Option;
  category: Option & { color: string; icon?: string };
};

export type RecurringTransactionRow = {
  id: string;
  amount: number;
  type: TransactionType;
  frequency: RecurrenceFrequency;
  nextDate: string;
  description: string | null;
  isActive: boolean;
  daysUntilNext: number;
  isDue: boolean;
  account: Option;
  category: Option & { color: string };
};

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
};

export type BudgetRow = {
  id: string;
  categoryId: string;
  category: string;
  color: string;
  icon?: string;
  limitAmount: number;
  spent: number;
  progress: number;
  isExceeded: boolean;
  // Suggested monthly limit derived from average spend in this category.
  suggestedLimit: number;
};

export type GoalRow = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  progress: number;
  monthlyContribution: number;
};

export type WatchlistRow = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changeDay: number;
  change30d: number;
  risk: SecurityRisk;
  comment: string;
};

export type PortfolioRow = {
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  share: number;
  risk: SecurityRisk;
};

export type InvestmentData = {
  source: DataSource;
  currency: string;
  riskProfile: string;
  securities: WatchlistRow[];
  watchlist: WatchlistRow[];
  portfolio: PortfolioRow[];
  structure: ChartDatum[];
  sectorStructure: ChartDatum[];
  risks: RecommendationView[];
  education: RecommendationView[];
};
