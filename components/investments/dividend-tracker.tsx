"use client";

import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { summarizeDividendIncome, upcomingDividends } from "@/lib/investments/dividends";
import type { ExpectedDividend, RealizedInvestmentEvent } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DividendsResponse = {
  dividends: ExpectedDividend[];
  realized: RealizedInvestmentEvent[];
  currency: string;
};

// Desktop-only dividend tracker: annual income from the realized-dividend journal
// plus a small list of upcoming expected payouts (which also surface on the
// financial calendar).
export function DividendTracker() {
  const { t } = useI18n();
  const [expected, setExpected] = useState<ExpectedDividend[]>([]);
  const [realized, setRealized] = useState<RealizedInvestmentEvent[]>([]);
  const [currency, setCurrency] = useState("RUB");
  const [saving, setSaving] = useState(false);

  const load = () =>
    apiClient
      .get<DividendsResponse>("/investments/dividends")
      .then((data) => {
        setExpected(data.dividends);
        setRealized(data.realized);
        setCurrency(data.currency || "RUB");
      })
      .catch(() => {
        /* ignore */
      });

  useEffect(() => {
    if (!isLocalDesktopMode) return;
    void load();
  }, []);

  if (!isLocalDesktopMode) return null;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (!String(body.ticker ?? "").trim()) return toast.error(t("inv.div.err.ticker"));
    try {
      setSaving(true);
      await apiClient.post("/investments/dividends", body);
      (event.target as HTMLFormElement).reset();
      await load();
      toast.success(t("inv.div.added"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inv.div.err.save"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiClient.delete(`/investments/dividends?id=${encodeURIComponent(id)}`);
      await load();
    } catch {
      toast.error(t("inv.div.err.save"));
    }
  }

  const income = summarizeDividendIncome(realized);
  const upcoming = upcomingDividends(expected);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          {t("inv.div.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("inv.div.desc")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{t("inv.div.ltm")}</p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(income.lastTwelveMonths, currency)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{t("inv.div.total")}</p>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(income.total, currency)}</p>
          </div>
        </div>

        {income.byYear.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {income.byYear.map((year) => (
              <span key={year.year} className="rounded-full border px-3 py-1 text-sm">
                {year.year}: <strong>{formatCurrency(year.total, currency)}</strong>
              </span>
            ))}
          </div>
        ) : null}

        {/* Add an expected payout */}
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="div-ticker">{t("inv.div.ticker")}</Label>
            <Input id="div-ticker" name="ticker" placeholder="SBER" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="div-date">{t("inv.div.payDate")}</Label>
            <Input id="div-date" name="date" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="div-amount">{t("inv.div.amount")}</Label>
            <Input id="div-amount" name="amount" type="number" step="any" min="0" required />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="w-full">
              <Plus className="size-4" />
              {t("inv.div.add")}
            </Button>
          </div>
        </form>

        {upcoming.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("inv.div.upcoming")}</p>
            {upcoming.map((dividend) => (
              <div
                key={dividend.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-sm"
              >
                <span className="truncate">
                  {formatDate(dividend.date)} · {dividend.ticker} ·{" "}
                  {formatCurrency(dividend.amount, dividend.currency)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => void remove(dividend.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("inv.div.noUpcoming")}</p>
        )}
      </CardContent>
    </Card>
  );
}
