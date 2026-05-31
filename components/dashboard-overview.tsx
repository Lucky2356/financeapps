import { Activity, PiggyBank, ShieldCheck, WalletCards } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { DashboardData } from "@/types/finance";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DashboardOverview({ data }: { data: DashboardData }) {
  const balance = data.metrics.find((metric) => metric.title === "Общий баланс") ?? data.metrics[0];
  const freeCash = data.metrics.find((metric) => metric.title === "Свободный остаток");
  const savingsRate = data.metrics.find((metric) => metric.title === "Процент накоплений");
  const cushion = data.metrics.find((metric) => metric.title === "Финансовая подушка");
  const healthTone = data.health.score >= 75 ? "good" : data.health.score >= 50 ? "warning" : "critical";
  // Net worth (accounts + investments) is the headline; the plain account
  // balance and the other signals sit beneath it.
  const signals = [
    balance ? { ...balance, icon: WalletCards } : null,
    freeCash ? { ...freeCash, icon: PiggyBank } : null,
    savingsRate ? { ...savingsRate, icon: Activity } : cushion ? { ...cushion, icon: ShieldCheck } : null
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <section className="overflow-hidden rounded-lg border shadow-soft">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="border-b bg-gradient-to-br from-primary/6 via-card to-card p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <WalletCards className="size-4 text-primary" />
            Чистый капитал
          </div>
          <p className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{formatCurrency(data.netWorth, data.currency)}</p>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Счета и инвестиционный портфель.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {signals.slice(0, 3).map((signal) => (
              <Signal key={signal.title} label={signal.title} value={signal.value} icon={signal.icon} tone={signal.tone} />
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Финансовое здоровье</p>
              <p className="mt-2 text-3xl font-semibold">{data.health.score}/100</p>
            </div>
            <span
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold",
                healthTone === "good" && "bg-success/12 text-success-foreground",
                healthTone === "warning" && "bg-warning/15 text-warning-foreground",
                healthTone === "critical" && "bg-destructive/12 text-destructive"
              )}
            >
              {healthTone === "good" ? "Устойчиво" : healthTone === "warning" ? "Нужен контроль" : "Высокий риск"}
            </span>
          </div>
          <Progress value={data.health.score} className="mt-4" />
          <p className="mt-3 text-sm text-muted-foreground">{data.health.summary}</p>
        </div>
      </div>
    </section>
  );
}

function Signal({
  label,
  value,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  icon: typeof WalletCards;
  tone?: DashboardData["metrics"][number]["tone"];
}) {
  return (
    <div className="rounded-md border bg-muted/35 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon
          className={cn(
            "size-4",
            tone === "success" && "text-success-foreground",
            tone === "warning" && "text-warning-foreground",
            tone === "danger" && "text-destructive",
            (!tone || tone === "default") && "text-primary"
          )}
        />
        {label}
      </div>
      <p className="mt-2 truncate text-base font-semibold">{value}</p>
    </div>
  );
}
