"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";

// Lazy chart wrappers: Recharts (~150KB gz) is heavy and only needed where a
// chart is actually rendered, so it is code-split out of the initial bundle and
// loaded on demand (client-only). Consumers import the chart from here instead
// of the implementation module; the public component API is unchanged.

export const NetWorthChart = dynamic(
  () => import("@/components/charts/net-worth-chart").then((m) => m.NetWorthChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const CashflowChart = dynamic(
  () => import("@/components/charts/cashflow-chart").then((m) => m.CashflowChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const ExpenseCategoryChart = dynamic(
  () => import("@/components/charts/expense-category-chart").then((m) => m.ExpenseCategoryChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const ForecastBalanceChart = dynamic(
  () => import("@/components/charts/forecast-balance-chart").then((m) => m.ForecastBalanceChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const PortfolioStructureChart = dynamic(
  () =>
    import("@/components/charts/portfolio-structure-chart").then((m) => m.PortfolioStructureChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const StockPriceChart = dynamic(
  () => import("@/components/charts/stock-price-chart").then((m) => m.StockPriceChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// История остатка — внизу «Счетов», и тянуть ради неё Recharts в начальную
// загрузку экрана незачем.
export const BalanceHistoryCard = dynamic(
  () => import("@/components/accounts/balance-history-card").then((m) => m.BalanceHistoryCard),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// График портфеля с переключателем «стоимость / против индекса» — тоже Recharts.
export const PortfolioValueChart = dynamic(
  () => import("@/components/investments/portfolio-value-chart").then((m) => m.PortfolioValueChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
