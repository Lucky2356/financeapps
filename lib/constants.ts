export const APP_NAME = "Финансовый помощник";
// Sourced from package.json via next.config (NEXT_PUBLIC_APP_VERSION) so the
// displayed version always matches the real release.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

// Public GitHub repo that hosts the signed desktop releases. Used to offer a
// ".exe" download on the web auth pages and to resolve the latest installer.
export const GITHUB_REPO = "Lucky2356/financeapps";
export const DESKTOP_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

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
