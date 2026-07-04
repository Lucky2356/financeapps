"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { buildRealizedTaxReport } from "@/services/InvestmentTaxReportService";
import type { RealizedInvestmentEvent } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type EventsResponse = { events: RealizedInvestmentEvent[]; currency: string };

// Desktop-only realized-income ledger + tax report: record sells and dividends,
// see the year-by-year НДФЛ estimate on actually realized income. Kept separate
// from the current-holdings list (the app has no automatic trade ledger).
export function RealizedTaxReport() {
  const { t } = useI18n();
  const [events, setEvents] = useState<RealizedInvestmentEvent[]>([]);
  const [currency, setCurrency] = useState("RUB");
  const [type, setType] = useState<"SELL" | "DIVIDEND">("SELL");
  const [saving, setSaving] = useState(false);

  const load = () =>
    apiClient
      .get<EventsResponse>("/investments/events")
      .then((data) => {
        setEvents(data.events);
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
    if (!String(body.ticker ?? "").trim()) return toast.error(t("inv.rt.err.ticker"));
    try {
      setSaving(true);
      await apiClient.post("/investments/events", { ...body, type });
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

  const report = buildRealizedTaxReport(events);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inv.rt.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
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
        </form>

        {/* Per-year report */}
        {report.years.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">{t("inv.rt.year")}</th>
                    <th className="p-2 text-right">{t("inv.rt.gain")}</th>
                    <th className="p-2 text-right">{t("inv.rt.dividends")}</th>
                    <th className="p-2 text-right">{t("inv.rt.tax")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.years.map((y) => (
                    <tr key={y.year} className="border-t">
                      <td className="p-2 font-medium">{y.year}</td>
                      <td className="p-2 text-right tabular-nums">
                        {formatCurrency(y.realizedGain, currency)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatCurrency(y.dividends, currency)}
                      </td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {formatCurrency(y.estimatedTax, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
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
                  className="size-7 shrink-0"
                  onClick={() => void remove(e.id)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
