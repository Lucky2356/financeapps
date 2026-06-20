import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { HealthScore } from "@/types/finance";
import { cn } from "@/lib/utils";

export function FinanceHealthCard({ health }: { health: HealthScore }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Финансовое здоровье
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-28 shrink-0 items-center justify-center rounded-full border-8 border-primary/20 bg-primary/10 text-3xl font-semibold">
            {health.score}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{health.summary}</p>
            <Progress value={health.score} className="mt-4" />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {health.checks.map((check) => (
                <div key={check.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{check.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-sm font-semibold",
                      check.status === "good" && "text-success-foreground",
                      check.status === "warning" && "text-warning-foreground",
                      check.status === "critical" && "text-destructive"
                    )}
                  >
                    {check.value}
                  </p>
                </div>
              ))}
            </div>
            <HealthFactorsBreakdown factors={health.factors} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthFactorsBreakdown({ factors }: { factors: HealthScore["factors"] }) {
  if (factors.length === 0) return null;

  const applied = factors.filter((factor) => factor.applied);

  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Что влияет на оценку</p>
      {applied.length === 0 ? (
        <p className="mt-2 text-sm text-success-foreground">
          Все факторы в норме — баллы не теряются.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {applied.map((factor) => (
            <li key={factor.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{factor.label}</span>
              <span className="shrink-0 font-semibold text-destructive">−{factor.deduction}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
