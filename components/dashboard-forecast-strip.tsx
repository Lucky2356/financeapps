import { AlertTriangle, ArrowRight, CalendarClock, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { ForecastData } from "@/types/finance";

export function DashboardForecastStrip({ forecast }: { forecast: ForecastData }) {
  const net30 = forecast.plannedIncome30d - forecast.plannedExpense30d;
  const hasCritical = forecast.warnings.some((warning) => warning.severity === "CRITICAL");
  const TrendIcon = forecast.forecast30dBalance >= forecast.startingBalance ? TrendingUp : TrendingDown;

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5 shadow-soft xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4 text-primary" />
            Прогноз на 30 дней
          </p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(forecast.forecast30dBalance, forecast.currency)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Ожидаемый доступный остаток</p>
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendIcon className="size-4 text-primary" />
            Плановый поток
          </p>
          <p className={net30 >= 0 ? "mt-2 text-2xl font-semibold text-success-foreground" : "mt-2 text-2xl font-semibold text-destructive"}>
            {formatCurrency(net30, forecast.currency)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Доходы минус расходы по шаблонам</p>
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <AlertTriangle className={hasCritical ? "size-4 text-destructive" : "size-4 text-primary"} />
            Риски прогноза
          </p>
          <p className="mt-2 text-lg font-semibold">{forecast.warnings[0]?.title ?? "Нет предупреждений"}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{forecast.warnings[0]?.description ?? "Плановые платежи выглядят устойчиво."}</p>
        </div>
      </div>
      <div className="flex items-center xl:justify-end">
        <Button asChild variant="outline">
          <Link href="/forecast">
            Открыть прогноз
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
