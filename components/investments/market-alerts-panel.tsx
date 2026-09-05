"use client";

import { Flag, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { evaluateAlerts, tickersToFetch, type MarketAlert } from "@/lib/market/alerts";
import { SMARTLAB_FIELDS, type SmartLabFundamentals } from "@/lib/market/smartlab";
import { Button } from "@/components/ui/button";
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

const OPERATORS = [">", ">=", "<", "<="] as const;

// Desktop-only: alert flags on company fundamentals pulled from smart-lab.ru
// (e.g. "ETLN Debt/EBITDA > 3.5"). Reading the site needs the Tauri HTTP plugin
// because it sends no CORS headers, so the whole panel is hidden on the web.
export function MarketAlertsPanel() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<MarketAlert[]>([]);
  const [ticker, setTicker] = useState("");
  const [metric, setMetric] = useState<string>(SMARTLAB_FIELDS[0]);
  const [op, setOp] = useState<(typeof OPERATORS)[number]>(">");
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<Record<string, SmartLabFundamentals | null>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ alerts: MarketAlert[] }>("/market/alerts")
      .then((data) => {
        if (!cancelled) setAlerts(data.alerts ?? []);
      })
      .catch(() => {
        /* nothing stored yet */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addAlert() {
    const cleanTicker = ticker.trim().toUpperCase();
    const numeric = Number(value.replace(",", "."));
    if (!cleanTicker) return toast.error(t("alerts.err.ticker"));
    if (!Number.isFinite(numeric)) return toast.error(t("alerts.err.value"));
    try {
      const created = await apiClient.post<MarketAlert>("/market/alerts", {
        ticker: cleanTicker,
        metric,
        op,
        value: String(numeric)
      });
      setAlerts((prev) => [created, ...prev]);
      setTicker("");
      setValue("");
      toast.success(t("alerts.toast.added"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("alerts.err.save"));
    }
  }

  async function removeAlert(id: string) {
    try {
      await apiClient.delete(`/market/alerts?id=${encodeURIComponent(id)}`);
      setAlerts((prev) => prev.filter((alert) => alert.id !== id));
    } catch {
      toast.error(t("alerts.err.save"));
    }
  }

  // Fetches fresh fundamentals for every watched ticker and reports which flags
  // are currently triggered.
  async function checkNow() {
    if (alerts.length === 0) return;
    setChecking(true);
    try {
      const { fetchManySmartLab } = await import("@/services/market/SmartLabProvider");
      const data = await fetchManySmartLab(tickersToFetch(alerts));
      setLatest(data);
      setCheckedAt(new Date().toLocaleString());
      const hits = evaluateAlerts(alerts, data);
      if (hits.length === 0) toast.success(t("alerts.toast.noHits"));
      else {
        for (const hit of hits) {
          toast.warning(
            t("alerts.toast.hit", {
              ticker: hit.alert.ticker,
              metric: hit.alert.metric,
              actual: hit.actual,
              op: hit.alert.op,
              value: hit.alert.value
            })
          );
        }
      }
    } catch {
      toast.error(t("alerts.err.fetch"));
    } finally {
      setChecking(false);
    }
  }

  return (
    <CollapsibleCard title={t("alerts.title")} icon={Flag} storageKey="inv-alerts">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void checkNow()}
            disabled={checking || alerts.length === 0}
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("alerts.checkNow")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("alerts.hint")}</p>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="alert-ticker">{t("alerts.ticker")}</Label>
            <Input
              id="alert-ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="ETLN"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("alerts.metric")}</Label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMARTLAB_FIELDS.map((field) => (
                  <SelectItem key={field} value={field}>
                    {t(`alerts.metric.${field}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("alerts.condition")}</Label>
            <Select value={op} onValueChange={(next) => setOp(next as (typeof OPERATORS)[number])}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {operator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="alert-value">{t("alerts.value")}</Label>
            <Input
              id="alert-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="decimal"
              placeholder="3.5"
            />
          </div>
          <Button type="button" onClick={() => void addAlert()}>
            {t("common.add")}
          </Button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("alerts.empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {alerts.map((alert) => {
              const actual = latest[alert.ticker]?.metrics[alert.metric]?.latest;
              return (
                <li key={alert.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {alert.ticker} · {t(`alerts.metric.${alert.metric}`)} {alert.op}{" "}
                      <span className="num">{alert.value}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeof actual === "number"
                        ? t("alerts.current", { value: actual })
                        : t("alerts.noData")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    onClick={() => void removeAlert(alert.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {checkedAt ? (
          <p className="text-xs text-muted-foreground">
            {t("alerts.checkedAt", { when: checkedAt })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("alerts.footer")}</p>
      </div>
    </CollapsibleCard>
  );
}
