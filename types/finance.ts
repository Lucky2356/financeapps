import type {
  RecommendationSeverity,
  RecurrenceFrequency,
  SecurityRisk,
  TransactionType
} from "@prisma/client";

export type DataSource = "database" | "demo-fallback";

export type MetricCard = {
  /** Stable identifier for matching a metric regardless of display language. */
  key?: string;
  title: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
  trend?: { value: number; label: string };
  /** Optional recent series (e.g. monthly income/expense) for an inline sparkline. */
  spark?: number[];
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

export type HealthFactor = {
  label: string;
  /** Points deducted from the 100-point score by this factor (0 when healthy). */
  deduction: number;
  /** True when this factor currently costs points. */
  applied: boolean;
};

export type HealthScore = {
  score: number;
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    status: "good" | "warning" | "critical";
  }>;
  /** Per-factor point deductions, explaining how the score was reached. */
  factors: HealthFactor[];
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
  /** Total outstanding liabilities subtracted from assets to get net worth. */
  liabilitiesTotal: number;
  /** Net worth split into its components (assets minus debts). */
  netWorthBreakdown: NetWorthBreakdown;
  netWorthTrend: NetWorthPoint[];
  emergencyFund: EmergencyFundStatus;
};

export type NetWorthBreakdown = {
  /** Liquid account balances. */
  liquid: number;
  /** Market value of the investment portfolio. */
  portfolio: number;
  /** Money set aside in savings goals. */
  goals: number;
  /** Outstanding debts (positive number, subtracted from assets). */
  debts: number;
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
  tags?: string[];
  splitGroupId?: string;
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

export type LiabilityKind = "CREDIT_CARD" | "LOAN" | "MORTGAGE" | "INSTALLMENT" | "OTHER";

export type LiabilityRow = {
  id: string;
  name: string;
  kind: LiabilityKind;
  balance: number; // outstanding amount still owed
  originalAmount: number; // original principal (0 if unknown)
  interestRate: number; // annual %, 0 if interest-free
  minPayment: number; // minimum monthly payment
  dueDay?: number; // day of month the payment is due (1–31)
  currency: string;
  // Derived: 0..100 share of the original principal already repaid.
  progress: number;
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
  // Carry the previous month's unspent remainder into this month's limit.
  rollover: boolean;
  // Amount carried over from the previous month (0 when rollover is off / none).
  rolloverAmount: number;
};

export type GoalRow = {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  progress: number;
  monthlyContribution: number;
  linkedAccountId?: string;
  plannedContribution?: number;
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

// A realized investment event (desktop tax ledger): a sale or a dividend.
export type RealizedInvestmentEvent = {
  id: string;
  type: "SELL" | "DIVIDEND";
  ticker: string;
  name: string;
  date: string;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  amount: number;
  fee: number;
  currency: string;
};

export type ExpectedDividend = {
  id: string;
  ticker: string;
  name: string;
  date: string;
  amount: number;
  currency: string;
};

export type TargetAllocation = {
  id: string;
  sector: string;
  targetPct: number;
};
