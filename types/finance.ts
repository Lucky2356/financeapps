import type { RecommendationSeverity, RecurrenceFrequency, SecurityRisk, TransactionType } from "@prisma/client";

export type DataSource = "database" | "demo-fallback";

export type MetricCard = {
  title: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
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

export type DashboardData = {
  source: DataSource;
  currency: string;
  metrics: MetricCard[];
  categoryExpenses: ChartDatum[];
  monthlyCashflow: MonthlyCashflowDatum[];
  recommendations: RecommendationView[];
  health: HealthScore;
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
  category: Option & { color: string };
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
  limitAmount: number;
  spent: number;
  progress: number;
  isExceeded: boolean;
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
