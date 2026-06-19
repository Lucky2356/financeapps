export const APP_NAME = "Финансовый помощник";
export const APP_VERSION = "1.0.0";

export const INVESTMENT_DISCLAIMER =
  "Информация в этом разделе не является индивидуальной инвестиционной рекомендацией. Решения об инвестициях пользователь принимает самостоятельно.";

export const ACCOUNT_TYPE_LABELS = {
  CASH: "Наличные",
  DEBIT_CARD: "Дебетовая карта",
  SAVINGS: "Накопительный счет",
  BROKERAGE: "Брокерский счет"
} as const;

export const RISK_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий"
} as const;

export const RISK_PROFILE_LABELS = {
  CONSERVATIVE: "Консервативный",
  MODERATE: "Умеренный",
  AGGRESSIVE: "Агрессивный"
} as const;

export const RECURRENCE_FREQUENCY_LABELS = {
  WEEKLY: "Еженедельно",
  MONTHLY: "Ежемесячно",
  YEARLY: "Ежегодно"
} as const;

export const SEVERITY_STYLES = {
  INFO: "bg-info/12 text-info-foreground border-info/30",
  SUCCESS: "bg-success/12 text-success-foreground border-success/30",
  WARNING: "bg-warning/15 text-warning-foreground border-warning/30",
  CRITICAL: "bg-destructive/12 text-destructive border-destructive/30"
} as const;
