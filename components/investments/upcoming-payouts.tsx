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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

/** Налог, который брокер удерживает с дивидендов и купонов резидента. */
const TAX_WITHHELD = 0.13;

const toNumber = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));

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
  const { data, reload } = useApiPageData(EMPTY, "/investments/payouts");
  const [busy, setBusy] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, data.currency);
  const when = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "long"
    });
  const kind = (payout: Payout) =>
    payout.kind === "COUPON" ? t("inv.pay.coupon") : t("inv.pay.dividend");

  // «Получено» — не сразу запись, а короткое подтверждение: брокер присылает
  // выплату уже без 13 % налога, и записать надо то, что пришло на счёт, — иначе
  // «Весь доход» завышен. Сумма «на руки» подставлена, её можно поправить.
  const [confirm, setConfirm] = useState<Payout | null>(null);
  const [netAmount, setNetAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");

  function askReceived(payout: Payout) {
    setConfirm(payout);
    setNetAmount(String(Math.round(payout.amount * (1 - TAX_WITHHELD) * 100) / 100));
    // Сегодня — по местному времени: toISOString дал бы вчера до трёх ночи
    // по Москве.
    setPaidOn(formatInputDate(new Date()));
  }

  async function markReceived(payout: Payout) {
    const key = `${payout.ticker}-${payout.date}`;
    const amount = toNumber(netAmount);
    if (!(amount > 0)) {
      toast.error(t("inv.pay.errAmount"));
      return;
    }
    setBusy(key);
    try {
      await apiClient.post("/investments/events", {
        type: "DIVIDEND",
        ticker: payout.ticker,
        name: payout.name,
        amount: String(amount),
        date: paidOn || formatInputDate(new Date()),
        currency: data.currency
      });
      toast.success(t("inv.pay.marked", { amount: money(amount) }));
      setConfirm(null);
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
                    onClick={() => askReceived(payout)}
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

      <Dialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirm ? t("inv.pay.confirmTitle", { ticker: confirm.ticker }) : ""}
            </DialogTitle>
            <DialogDescription>
              {confirm ? t("inv.pay.confirmHint", { gross: money(confirm.amount) }) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payout-net">{t("inv.pay.net")}</Label>
              <Input
                id="payout-net"
                inputMode="decimal"
                value={netAmount}
                onChange={(event) => setNetAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-date">{t("inv.pay.paidOn")}</Label>
              <Input
                id="payout-date"
                type="date"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={confirm !== null && busy === `${confirm.ticker}-${confirm.date}`}
              onClick={() => confirm && void markReceived(confirm)}
            >
              {t("inv.pay.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
