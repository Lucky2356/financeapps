"use client";

import { Download, Printer } from "lucide-react";
import { addMonths, startOfYear } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalyticsData, TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { buildPeriodReport, buildYoY } from "@/lib/reports/period-report";
import { ExportService } from "@/services/export/ExportService";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { useI18n } from "@/lib/i18n/context";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function ReportView({
  analytics,
  netWorth
}: {
  analytics: AnalyticsData;
  netWorth: number;
}) {
  const { t, locale } = useI18n();
  const currency = analytics.currency;
  const last = analytics.monthlyCashflow[analytics.monthlyCashflow.length - 1];

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("rep.generated", {
            date: new Date().toLocaleDateString(locale === "en" ? "en-US" : "ru-RU")
          })}
        </p>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("an.print")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("rep.netWorth")} value={formatCurrency(netWorth, currency)} />
        <Stat
          label={t("rep.avgIncome")}
          value={formatCurrency(analytics.avgMonthlyIncome, currency)}
        />
        <Stat
          label={t("rep.avgExpense")}
          value={formatCurrency(analytics.avgMonthlyExpense, currency)}
        />
        <Stat label={t("rep.savingsRate")} value={`${Math.round(analytics.avgSavingsRate)}%`} />
      </div>

      {last && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rep.lastMonth", { month: last.month })}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("rep.income")}</p>
              <p className="font-medium text-success">{formatCurrency(last.income, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("rep.expense")}</p>
              <p className="font-medium text-destructive">
                {formatCurrency(last.expense, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("rep.savingsPct", { pct: Math.round(last.savingsRate) })}
              </p>
              <p className="font-medium">{formatCurrency(last.savings, currency)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rep.structure")}</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topExpenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rep.noExpenses")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">{t("rep.col.category")}</th>
                  <th className="py-2 text-right">{t("rep.col.amount")}</th>
                  <th className="py-2 text-right">{t("rep.col.share")}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topExpenseCategories.map((cat) => (
                  <tr key={cat.categoryId} className="border-b last:border-0">
                    <td className="py-2">
                      <span
                        className="mr-2 inline-block size-2.5 rounded-full align-middle"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.category}
                    </td>
                    <td className="py-2 text-right">{formatCurrency(cat.total, currency)}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {Math.round(cat.share)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rep.cashflowByMonth")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">{t("rep.col.month")}</th>
                <th className="py-2 text-right">{t("rep.income")}</th>
                <th className="py-2 text-right">{t("rep.expense")}</th>
                <th className="py-2 text-right">{t("rep.savings")}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.monthlyCashflow.map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="py-2">{m.month}</td>
                  <td className="py-2 text-right text-success">
                    {formatCurrency(m.income, currency)}
                  </td>
                  <td className="py-2 text-right text-destructive">
                    {formatCurrency(m.expense, currency)}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(m.savings, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ExtendedReport currency={currency} />
    </div>
  );
}

// Interactive report over an arbitrary date range with a year-over-year card and
// CSV export. Pulls recent history client-side (works in both web and desktop).
function ExtendedReport({ currency }: { currency: string }) {
  const { t } = useI18n();
  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  const [transactions, setTransactions] = useState<TransactionsPageData["transactions"]>([]);
  const [from, setFrom] = useState(() => formatInputDate(startOfYear(new Date())));
  const [to, setTo] = useState(() => formatInputDate(new Date()));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const since = formatInputDate(addMonths(new Date(), -25));
        const result = await apiClient.get<TransactionsPageData>(
          `/transactions?limit=100&from=${since}`
        );
        if (!cancelled) setTransactions(result.transactions);
      } catch {
        /* offline / unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const report = useMemo(() => buildPeriodReport(transactions, from, to), [transactions, from, to]);
  const yoy = useMemo(() => buildYoY(transactions, Number(to.slice(0, 4))), [transactions, to]);

  async function exportCsv() {
    const csv = new ExportService().reportToCsv(report);
    await fileSystem.saveTextFile(`report-${from}_${to}.csv`, csv, "text/csv;charset=utf-8");
    toast.success(t("rep.ext.exported"));
  }

  const pctClass = (value: number) =>
    value > 0 ? "text-destructive" : value < 0 ? "text-success" : "text-muted-foreground";
  const savingsPctClass = (value: number) => (value >= 0 ? "text-success" : "text-destructive");

  return (
    <Card className="no-print">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-base">{t("rep.ext.title")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("rep.ext.desc")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="rep-from" className="text-xs">
              {t("tx.from")}
            </Label>
            <Input
              id="rep-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rep-to" className="text-xs">
              {t("tx.to")}
            </Label>
            <Input
              id="rep-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
            <Download className="size-4" />
            {t("rep.ext.exportCsv")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <ReportStat
            label={t("rep.income")}
            value={formatCurrency(report.totals.income, currency)}
          />
          <ReportStat
            label={t("rep.expense")}
            value={formatCurrency(report.totals.expense, currency)}
          />
          <ReportStat
            label={t("rep.savings")}
            value={formatCurrency(report.totals.savings, currency)}
          />
          <ReportStat
            label={t("rep.savingsRate")}
            value={`${report.totals.savingsRate.toFixed(1)}%`}
          />
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">
            {t("rep.ext.yoy", { year: yoy.year, prev: yoy.year - 1 })}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("rep.income")}</p>
              <p className="font-medium">{formatCurrency(yoy.current.income, currency)}</p>
              <p className={`text-xs ${pctClass(-yoy.incomeChangePct)}`}>
                {yoy.incomeChangePct >= 0 ? "+" : ""}
                {yoy.incomeChangePct.toFixed(1)}% {t("rep.ext.vsPrevYear")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("rep.expense")}</p>
              <p className="font-medium">{formatCurrency(yoy.current.expense, currency)}</p>
              <p className={`text-xs ${pctClass(yoy.expenseChangePct)}`}>
                {yoy.expenseChangePct >= 0 ? "+" : ""}
                {yoy.expenseChangePct.toFixed(1)}% {t("rep.ext.vsPrevYear")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("rep.savings")}</p>
              <p className="font-medium">{formatCurrency(yoy.current.savings, currency)}</p>
              <p className={`text-xs ${savingsPctClass(yoy.savingsChangePct)}`}>
                {yoy.savingsChangePct >= 0 ? "+" : ""}
                {yoy.savingsChangePct.toFixed(1)}% {t("rep.ext.vsPrevYear")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
