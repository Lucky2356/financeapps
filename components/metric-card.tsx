import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { METRIC_HINT_KEY, InfoHint } from "@/components/info-hint";
import type { MetricCard as MetricCardType } from "@/types/finance";
import { cn } from "@/lib/utils";

const toneText = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive"
} as const;

const toneIcon = {
  default: Minus,
  success: ArrowUpRight,
  warning: ArrowDownRight,
  danger: ArrowDownRight
};

export function MetricCard({ metric }: { metric: MetricCardType }) {
  const tone = metric.tone ?? "default";
  const Icon = toneIcon[tone];
  const trend = metric.trend;
  const trendPositive = trend && trend.value > 0;
  const trendNegative = trend && trend.value < 0;
  const TrendIcon = trendPositive ? TrendingUp : TrendingDown;

  return (
    <Card
      className={cn(
        "card-hover min-h-32 overflow-hidden",
        tone === "success" &&
          "metric-accent-success bg-gradient-to-br from-success/5 to-transparent",
        tone === "warning" &&
          "metric-accent-warning bg-gradient-to-br from-warning/8 to-transparent",
        tone === "danger" &&
          "metric-accent-danger bg-gradient-to-br from-destructive/6 to-transparent",
        tone === "default" && "card-accent-top"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {metric.title}
          {metric.key && METRIC_HINT_KEY[metric.key] ? (
            <InfoHint text={METRIC_HINT_KEY[metric.key]} />
          ) : null}
        </CardTitle>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone === "success" && "bg-success/15 text-success",
            tone === "warning" && "bg-warning/18 text-warning",
            tone === "danger" && "bg-destructive/12 text-destructive",
            tone === "default" && "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div className="stat text-2xl">{metric.value}</div>
          {metric.spark && metric.spark.length > 1 ? (
            <Sparkline values={metric.spark} className={cn("shrink-0", toneText[tone])} />
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
        {trend && (
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
              trendPositive && "bg-success/12 text-success-foreground",
              trendNegative && "bg-destructive/10 text-destructive",
              !trendPositive && !trendNegative && "bg-secondary text-secondary-foreground"
            )}
          >
            {(trendPositive || trendNegative) && <TrendIcon className="size-3" />}
            <span>
              {trendPositive ? "+" : ""}
              {trend.value.toFixed(1)}% {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
