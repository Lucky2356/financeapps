"use client";

// График портфеля — два вопроса, два вида.
//
// «Стоимость»: сколько портфель стоил на самом деле (снимки по дням) и сколько
// в него было вложено — видно, где рост цены, а где просто новые деньги. Пока
// снимков меньше двух (приложение только начало их вести), показывается
// прикидка: сегодняшние бумаги по прошлым ценам, и так и подписано.
//
// «Против индекса»: ваши бумаги и индекс Мосбиржи в процентах от начала
// периода — обогнали рынок или нет.

import { useEffect, useMemo, useState } from "react";

import { StockPriceChart, type StockPricePoint } from "@/components/charts/stock-price-chart";
import { TwoLinesChart } from "@/components/charts/two-lines-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { compareToIndex } from "@/lib/market/compare-series";
import { historyRangeStart } from "@/lib/market/history-range";
import { combinePortfolioValue } from "@/lib/market/portfolio-value-series";
import type { InvestmentData, PortfolioRow } from "@/types/finance";

const RANGES = [
  { id: "1m", labelKey: "inv.range.1m" },
  { id: "3m", labelKey: "inv.range.3m" },
  { id: "6m", labelKey: "inv.range.6m" },
  { id: "1y", labelKey: "inv.range.1y" },
  { id: "5y", labelKey: "inv.range.5y" }
];

type Mode = "value" | "index";

export function PortfolioValueChart({
  portfolio,
  history = [],
  currency = "RUB"
}: {
  portfolio: PortfolioRow[];
  history?: InvestmentData["history"];
  currency?: string;
}) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState("6m");
  const [mode, setMode] = useState<Mode>("value");
  const [points, setPoints] = useState<StockPricePoint[]>([]);
  const [index, setIndex] = useState<StockPricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable dependency: re-fetch only when the holdings (ticker/qty) or range change,
  // not on every parent re-render (the portfolio array identity is unstable).
  const holdingsKey = portfolio.map((p) => `${p.ticker}:${p.quantity}`).join(",");

  useEffect(() => {
    // Nothing to plot for an empty portfolio (the component renders null below).
    if (portfolio.length === 0) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const series = await Promise.all(
          portfolio.map((position) =>
            apiClient
              .get(
                `/investments/history?ticker=${encodeURIComponent(position.ticker)}&range=${range}`
              )
              .then((res) => ({ quantity: position.quantity, points: res.points ?? [] }))
              .catch(() => ({ quantity: position.quantity, points: [] }))
          )
        );
        if (!cancelled) setPoints(combinePortfolioValue(series));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holdingsKey, range]); // eslint-disable-line react-hooks/exhaustive-deps

  // Индекс — только когда его попросили: лишний запрос к бирже ни к чему.
  useEffect(() => {
    if (mode !== "index" || portfolio.length === 0) return;
    let cancelled = false;
    apiClient
      .get(`/investments/index?range=${range}`)
      .then((res) => {
        if (!cancelled) setIndex(res.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, range, portfolio.length]);

  const since = historyRangeStart(range).toISOString().slice(0, 10);
  const real = useMemo(
    () => (history ?? []).filter((snapshot) => snapshot.date >= since),
    [history, since]
  );
  const compared = useMemo(() => compareToIndex(points, index), [points, index]);

  if (portfolio.length === 0) return null;

  const up = points.length >= 2 ? points[points.length - 1].price >= points[0].price : true;
  const money = (value: number) => formatCurrency(value, currency);
  const axisMoney = (value: number) =>
    Math.abs(value) >= 1000
      ? `${Math.round(value / 1000).toLocaleString(locale)}${t("chart.thousandShort")}`
      : `${Math.round(value)}`;
  const last = compared[compared.length - 1];

  let body: React.ReactNode;
  let hint: string;
  if (mode === "index") {
    hint = last
      ? t("inv.cmp.summary", {
          mine: `${last.a! >= 0 ? "+" : ""}${last.a}`,
          index: `${last.b! >= 0 ? "+" : ""}${last.b}`
        })
      : t("inv.cmp.hint");
    body =
      compared.length >= 2 ? (
        <TwoLinesChart
          data={compared}
          nameA={t("inv.cmp.mine")}
          nameB={t("inv.cmp.index")}
          format={(value) => `${value >= 0 ? "+" : ""}${value}%`}
          axis={(value) => `${value}%`}
          ariaLabel={t("inv.cmp.title")}
        />
      ) : (
        <Empty text={loading ? t("inv.loadingQuotes") : t("inv.noQuotes")} />
      );
  } else if (real.length >= 2) {
    hint = t("inv.value.realHint");
    body = (
      <TwoLinesChart
        data={real.map((snapshot) => ({
          date: snapshot.date,
          a: snapshot.value,
          b: snapshot.invested
        }))}
        nameA={t("inv.value.worth")}
        nameB={t("inv.value.invested")}
        format={money}
        axis={axisMoney}
        ariaLabel={t("inv.valueChartTitle")}
      />
    );
  } else {
    hint = t("inv.value.approxHint");
    body =
      loading && points.length === 0 ? (
        <Empty text={t("inv.loadingQuotes")} />
      ) : points.length >= 2 ? (
        <StockPriceChart data={points} up={up} />
      ) : (
        <Empty text={t("inv.noQuotes")} />
      );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("inv.valueChartTitle")}</CardTitle>
          <Segmented
            ariaLabel={t("inv.cmp.mode")}
            className="w-full sm:w-72"
            value={mode}
            onChange={setMode}
            options={[
              { value: "value", label: t("inv.cmp.value") },
              { value: "index", label: t("inv.cmp.vsIndex") }
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Button
              key={r.id}
              type="button"
              size="sm"
              variant={range === r.id ? "default" : "outline"}
              className="min-w-11"
              onClick={() => setRange(r.id)}
            >
              {t(r.labelKey)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {body}
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
