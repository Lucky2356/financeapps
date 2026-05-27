import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricCard as MetricCardType } from "@/types/finance";
import { cn } from "@/lib/utils";

const toneIcon = {
  default: Minus,
  success: ArrowUpRight,
  warning: ArrowDownRight,
  danger: ArrowDownRight
};

export function MetricCard({ metric }: { metric: MetricCardType }) {
  const tone = metric.tone ?? "default";
  const Icon = toneIcon[tone];

  return (
    <Card className="min-h-32">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-md",
            tone === "success" && "bg-success/12 text-success-foreground",
            tone === "warning" && "bg-warning/15 text-warning-foreground",
            tone === "danger" && "bg-destructive/12 text-destructive",
            tone === "default" && "bg-secondary text-secondary-foreground"
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{metric.value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
      </CardContent>
    </Card>
  );
}
