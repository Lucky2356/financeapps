"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { buildRealizedTaxReport } from "@/services/InvestmentTaxReportService";
import { convert, DEFAULT_CURRENCY_RATES, type CurrencyRates } from "@/lib/currency";
import type { RealizedInvestmentEvent } from "@/types/finance";
import type { AccountsPageData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { DataView } from "@/components/ui/data-view";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type EventsResponse = {
  events: RealizedInvestmentEvent[];
  currency: string;
  rates?: CurrencyRates;
};

// Desktop-only realized-income ledger + tax report: record sells and dividends,
// see the year-by-year НДФЛ estimate on actually realized income. Kept separate
// from the current-holdings list (the app has no automatic trade ledger).
export function RealizedTaxReport() {
  const { t } = useI18n();
  const [events, setEvents] = useState<RealizedInvestmentEvent[]>([]);
  const [currency, setCurrency] = useState("RUB");
  const [rates, setRates] = useState(DEFAULT_CURRENCY_RATES);
  const [type, setType] = useState<"SELL" | "DIVIDEND">("SELL");
  const [saving, setSaving] = useState(false);
  // A sale takes the shares out of the portfolio; the money it brought in can
  // land on an account, which is where the owner will look for it.
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  const [accountId, setAccountId] = useState("none");

  const load = () =>
    apiClient
      .get<EventsResponse>("/investments/events")
      .then((data) => {
        setEvents(data.events);
        setCurrency(data.currency || "RUB");
        if (data.rates) setRates(data.rates);
      })
      .catch(() => {
        /* ignore */
      });

  useEffect(() => {
    void load();
    void apiClient
      .get<AccountsPageData>("/accounts")
      .then((data) => setAccounts(data.accounts))
      .catch(() => {
        /* offline or empty — the sale is recorded without an account */
      });
  }, []);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (!String(body.ticker ?? "").trim()) return toast.error(t("inv.rt.err.ticker"));
    try {
      setSaving(true);
      await apiClient.post("/investments/events", {
        ...body,
        type,
        ...(type === "SELL" && accountId !== "none" ? { accountId } : {})
      });
      (event.target as HTMLFormElement).reset();
      await load();
      toast.success(t("inv.rt.added"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("inv.rt.err.save"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(eventId: string) {
    try {
      await apiClient.delete(`/investments/events?id=${encodeURIComponent(eventId)}`);
      await load();
    } catch {
      toast.error(t("inv.rt.err.save"));
    }
  }

  // Events keep the currency they were booked in; the report is read in the
  // app's, and the rouble threshold in the tax scale only means anything there.
  const report = buildRealizedTaxReport(events, (amount, from) =>
    convert(amount, from ?? currency, currency, rates)
  );

  return (
    <CollapsibleCard title={t("inv.rt.title")} storageKey="inv-realized">
      <div className="space-y-4">
        {/* Add form */}
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>{t("inv.rt.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as "SELL" | "DIVIDEND")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SELL">{t("inv.rt.type.sell")}</SelectItem>
                <SelectItem value="DIVIDEND">{t("inv.rt.type.dividend")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rt-ticker">{t("inv.rt.ticker")}</Label>
            <Input id="rt-ticker" name="ticker" placeholder="SBER" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rt-date">{t("common.date")}</Label>
            <Input id="rt-date" name="date" type="date" required />
          </div>
          {type === "SELL" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="rt-qty">{t("inv.rt.qty")}</Label>
                <Input id="rt-qty" name="quantity" type="number" step="any" min="0" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rt-sell">{t("inv.rt.sellPrice")}</Label>
                <Input id="rt-sell" name="sellPrice" type="number" step="any" min="0" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rt-buy">{t("inv.rt.buyPrice")}</Label>
                <Input id="rt-buy" name="buyPrice" type="number" step="any" min="0" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rt-fee">{t("inv.rt.fee")}</Label>
                <Input id="rt-fee" name="fee" type="number" step="any" min="0" defaultValue={0} />
              </div>
              <div className="space-y-1">
                <Label>{t("inv.rt.toAccount")}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("inv.rt.noAccount")}</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="rt-amount">{t("inv.rt.amount")}</Label>
              <Input id="rt-amount" name="amount" type="number" step="any" min="0" required />
            </div>
          )}
          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="w-full">
              <Plus className="size-4" />
              {t("inv.rt.add")}
            </Button>
          </div>
          {type === "SELL" ? (
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {t("inv.rt.sellNote")}
            </p>
          ) : null}
        </form>

        {/* Per-year report */}
        {report.years.length > 0 ? (
          <div className="space-y-3">
            <DataView
              rows={report.years}
              rowKey={(y) => String(y.year)}
              columns={[
                { header: t("inv.rt.year"), primary: true, cell: (y) => y.year },
                {
                  header: t("inv.rt.gain"),
                  align: "right",
                  cell: (y) => (
                    <span className="tabular-nums">{formatCurrency(y.realizedGain, currency)}</span>
                  )
                },
                {
                  header: t("inv.rt.dividends"),
                  align: "right",
                  cell: (y) => (
                    <span className="tabular-nums">{formatCurrency(y.dividends, currency)}</span>
                  )
                },
                {
                  header: t("inv.rt.tax"),
                  align: "right",
                  cell: (y) => (
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(y.estimatedTax, currency)}
                    </span>
                  )
                }
              ]}
            />
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              {t("inv.rt.disclaimer")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("inv.rt.empty")}</p>
        )}

        {/* Ledger */}
        {events.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("inv.rt.ledger")}</p>
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-sm"
              >
                <span className="truncate">
                  {e.date} · {e.ticker} ·{" "}
                  {e.type === "SELL"
                    ? t("inv.rt.type.sell")
                    : `${t("inv.rt.type.dividend")} ${formatCurrency(e.amount, e.currency)}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="tap-target size-7 shrink-0"
                  onClick={() => void remove(e.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
