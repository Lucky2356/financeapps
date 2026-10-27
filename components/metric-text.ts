import type { MetricCard } from "@/types/finance";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

// Подписи плиток главного экрана — по ключу метрики, а не готовой строкой из
// ответа. Строку собирает тот, кто считал числа, и на том языке, который он
// счёл текущим: заготовка статической сборки — всегда по-русски, и на первом
// кадре английского экрана стояли «Общий баланс» и «Доходы за месяц». Ключ от
// языка не зависит, поэтому подпись берётся из словаря экрана здесь.
// Незнакомый ключ (или его нет) — показываем то, что пришло.
const METRIC_TEXT: Record<string, { title: string; detail: string }> = {
  totalBalance: { title: "svc.metric.totalBalance", detail: "svc.metric.totalBalance.detail" },
  monthIncome: { title: "svc.metric.monthIncome", detail: "svc.metric.month.detail" },
  monthExpense: { title: "svc.metric.monthExpense", detail: "svc.metric.month.detail" },
  freeCash: { title: "svc.metric.freeCash", detail: "svc.metric.freeCash.detail" },
  savingsRate: { title: "svc.metric.savingsRate", detail: "svc.metric.savingsRate.detail" },
  emergencyFund: { title: "svc.metric.emergencyFund", detail: "svc.metric.emergencyFund.detail" }
};

export function metricTitle(metric: Pick<MetricCard, "key" | "title">, t: Translate): string {
  const text = metric.key ? METRIC_TEXT[metric.key] : undefined;
  return text ? t(text.title) : metric.title;
}

export function metricDetail(metric: Pick<MetricCard, "key" | "detail">, t: Translate): string {
  const text = metric.key ? METRIC_TEXT[metric.key] : undefined;
  return text ? t(text.detail) : metric.detail;
}
