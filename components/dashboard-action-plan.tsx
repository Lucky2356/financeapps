import { ArrowRight, CheckCircle2, CircleAlert, Landmark, Target } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardData, RecommendationView } from "@/types/finance";

const actionBySignal = [
  { test: "бюджет", href: "/budgets", label: "Проверить бюджеты", icon: CircleAlert },
  { test: "подуш", href: "/goals", label: "Проверить цели", icon: Target },
  { test: "цели", href: "/goals", label: "Проверить цели", icon: Target },
  { test: "инвест", href: "/investments", label: "Открыть аналитику", icon: Landmark }
];

const badgeVariant = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "destructive"
} as const;

export function DashboardActionPlan({ data }: { data: DashboardData }) {
  const important = [...data.recommendations]
    .sort((left, right) => severityRank(right) - severityRank(left))
    .slice(0, 3);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Следующие шаги</p>
            <h2 className="mt-1 text-lg font-semibold">Что стоит проверить в первую очередь</h2>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/budgets">
              Все бюджеты
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {important.map((item) => (
            <ActionCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-soft">
        <p className="text-sm font-medium text-muted-foreground">Контрольные точки</p>
        <div className="mt-4 space-y-3">
          {data.health.checks.slice(0, 3).map((check) => (
            <div key={check.label} className="flex items-start gap-3 rounded-md border bg-muted/25 p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{check.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{check.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionCard({ item }: { item: RecommendationView }) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const action = actionBySignal.find((entry) => text.includes(entry.test)) ?? {
    href: "/transactions",
    label: "Открыть операции",
    icon: CircleAlert
  };
  const Icon = action.icon;

  return (
    <article className="flex min-h-48 flex-col rounded-lg border bg-muted/25 p-4">
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-4 text-primary" />
        <Badge variant={badgeVariant[item.severity]}>{severityLabel(item.severity)}</Badge>
      </div>
      <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
      <Button asChild variant="ghost" size="sm" className="mt-auto justify-start px-0">
        <Link href={action.href}>
          {action.label}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </article>
  );
}

function severityRank(item: RecommendationView) {
  return { INFO: 1, SUCCESS: 0, WARNING: 2, CRITICAL: 3 }[item.severity];
}

function severityLabel(severity: RecommendationView["severity"]) {
  return {
    INFO: "Инфо",
    SUCCESS: "Ок",
    WARNING: "Важно",
    CRITICAL: "Срочно"
  }[severity];
}
