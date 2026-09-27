"use client";

// «Выплаты» — дивиденды и купоны по бумагам портфеля, сами, с биржи.
//
// Раньше ожидаемый дивиденд надо было вписать руками. Теперь приложение само
// знает, когда и сколько придёт на ваше количество, а пришедшую выплату
// отмечаешь одним нажатием — и она попадает во «Весь доход» и в налог.

import { CalendarClock, Check, HandCoins } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

type Payout = {
  ticker: string;
  name: string;
  kind: "DIVIDEND" | "COUPON";
  date: string;
  perShare: number;
  quantity: number;
  amount: number;
};
type Payouts = { currency: string; upcoming: Payout[]; recent: Payout[]; yearAhead: number };

const EMPTY: Payouts = { currency: "RUB", upcoming: [], recent: [], yearAhead: 0 };

export function UpcomingPayouts() {
  const { t, locale } = useI18n();
  const { data, reload } = useApiPageData<Payouts>(EMPTY, "/investments/payouts");
  const [busy, setBusy] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, data.currency);
  const when = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "long"
    });
  const kind = (payout: Payout) =>
    payout.kind === "COUPON" ? t("inv.pay.coupon") : t("inv.pay.dividend");

  async function markReceived(payout: Payout) {
    const key = `${payout.ticker}-${payout.date}`;
    setBusy(key);
    try {
      await apiClient.post("/investments/events", {
        type: "DIVIDEND",
        ticker: payout.ticker,
        name: payout.name,
        amount: String(payout.amount),
        date: new Date().toISOString().slice(0, 10),
        currency: data.currency
      });
      toast.success(t("inv.pay.marked", { amount: money(payout.amount) }));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inv.pay.error"));
    } finally {
      setBusy(null);
    }
  }

  if (data.upcoming.length === 0 && data.recent.length === 0) return null;

  return (
    <Card data-testid="upcoming-payouts">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="size-4 text-primary" />
          {t("inv.pay.title")}
        </CardTitle>
        {data.yearAhead > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("inv.pay.yearAhead", { amount: money(data.yearAhead) })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {data.recent.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">{t("inv.pay.recentTitle")}</p>
            {data.recent.map((payout) => {
              const key = `${payout.ticker}-${payout.date}`;
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium">{payout.ticker}</span> · {kind(payout)} ·{" "}
                    {when(payout.date)} ·{" "}
                    <span className="font-medium tabular-nums">{money(payout.amount)}</span>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === key}
                    onClick={() => void markReceived(payout)}
                  >
                    <Check className="size-4" />
                    {t("inv.pay.received")}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}

        {data.upcoming.length > 0 ? (
          <ul className="space-y-2">
            {data.upcoming.map((payout) => (
              <li
                key={`${payout.ticker}-${payout.date}-${payout.kind}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="font-medium">{when(payout.date)}</span> · {payout.ticker} ·{" "}
                    {kind(payout)}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {payout.quantity.toLocaleString()} × {money(payout.perShare)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-success">
                  +{money(payout.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("inv.pay.note")}</p>
      </CardContent>
    </Card>
  );
}
