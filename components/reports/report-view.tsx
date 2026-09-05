"use client";

import { Download, Printer } from "lucide-react";
import { addMonths, startOfYear } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { CashflowChart } from "@/components/charts/lazy";
import { PrintHeader } from "@/components/reports/print-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalyticsData, TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { buildPeriodReport, buildYoY } from "@/lib/reports/period-report";
import { countableRows } from "@/lib/transactions/transfers";
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
  netWorth,
  includeTransfers = false
}: {
  analytics: AnalyticsData;
  netWorth: number;
  includeTransfers?: boolean;
}) {
  const { t, locale } = useI18n();
  const currency = analytics.currency;
  const last = analytics.monthlyCashflow[analytics.monthlyCashflow.length - 1];

  return (
    <div className="space-y-4">
      <PrintHeader titleKey="rep.printTitle" />

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

      {/* По две на телефоне, как в «Обзоре» на всех остальных экранах: четыре
          карточки в столбик — это четыре экрана прокрутки ради четырёх чисел. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      {analytics.monthlyCashflow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rep.cashflowChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowChart data={analytics.monthlyCashflow} />
          </CardContent>
        </Card>
      )}

      {/* Две таблицы отчёта — структура расходов и поток по месяцам — стояли
          лентой одна под другой во всю ширину: на широком мониторе это метр
          пустоты справа от четырёх колонок цифр. Рядом они помещаются с lg,
          но обе довольно широкие, поэтому здесь именно xl. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rep.structure")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              rows={analytics.topExpenseCategories}
              rowKey={(cat) => cat.categoryId}
              empty={<p className="text-sm text-muted-foreground">{t("rep.noExpenses")}</p>}
              columns={[
                {
                  header: t("rep.col.category"),
                  primary: true,
                  cell: (cat) => (
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="min-w-0 break-words">{cat.category}</span>
                    </span>
                  )
                },
                {
                  header: t("rep.col.amount"),
                  align: "right",
                  cell: (cat) => formatCurrency(cat.total, currency)
                },
                {
                  header: t("rep.col.share"),
                  align: "right",
                  cell: (cat) => (
                    /* The share as a number and as a length: on paper the bar
                       is what makes the table readable at a glance. */
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-2 w-16 overflow-hidden rounded-full bg-muted sm:w-24">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(2, cat.share))}%`,
                            backgroundColor: cat.color
                          }}
                        />
                      </span>
                      <span className="num w-9 text-right text-muted-foreground">
                        {Math.round(cat.share)}%
                      </span>
                    </span>
                  )
                }
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rep.cashflowByMonth")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              rows={analytics.monthlyCashflow}
              rowKey={(m) => m.month}
              columns={[
                { header: t("rep.col.month"), primary: true, cell: (m) => m.month },
                {
                  header: t("rep.income"),
                  align: "right",
                  cell: (m) => (
                    <span className="text-success">{formatCurrency(m.income, currency)}</span>
                  )
                },
                {
                  header: t("rep.expense"),
                  align: "right",
                  cell: (m) => (
                    <span className="text-destructive">{formatCurrency(m.expense, currency)}</span>
                  )
                },
                {
                  header: t("rep.savings"),
                  align: "right",
                  cell: (m) => formatCurrency(m.savings, currency)
                }
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <ExtendedReport currency={currency} includeTransfers={includeTransfers} />
    </div>
  );
}

// Interactive report over an arbitrary date range with a year-over-year card and
// CSV export. Pulls recent history client-side (works in both web and desktop).
function ExtendedReport({
  currency,
  includeTransfers
}: {
  currency: string;
  includeTransfers: boolean;
}) {
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
        // One page holds a hundred operations at most, so a busy year used to
        // be reported from its hundred most recent rows and quietly understate
        // every total. Walk the pages instead, with a ceiling so a bad
        // `hasNextPage` can never spin here forever.
        const collected: TransactionsPageData["transactions"] = [];
        for (let page = 1; page <= 60; page += 1) {
          const result = await apiClient.get<TransactionsPageData>(
            `/transactions?limit=100&page=${page}&from=${since}`
          );
          if (cancelled) return;
          collected.push(...result.transactions);
          if (!result.pagination.hasNextPage) break;
        }
        if (!cancelled) setTransactions(collected);
      } catch {
        /* offline / unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The same choice the rest of the page follows: a transfer between own
  // accounts is not earning and not spending.
  const counted = useMemo(
    () => countableRows(transactions, includeTransfers),
    [transactions, includeTransfers]
  );
  const report = useMemo(() => buildPeriodReport(counted, from, to), [counted, from, to]);
  const yoy = useMemo(() => buildYoY(counted, Number(to.slice(0, 4))), [counted, to]);

  async function exportCsv() {
    const csv = new ExportService().reportToCsv(report);
    await fileSystem.saveTextFile(`report-${from}_${to}.csv`, csv, "text/csv;charset=utf-8");
    toast.success(t("rep.ext.exported"));
  }

  const pctClass = (value: number) =>
    value > 0 ? "text-destructive" : value < 0 ? "text-success" : "text-muted-foreground";
  const savingsPctClass = (value: number) => (value >= 0 ? "text-success" : "text-destructive");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-base">{t("rep.ext.title")}</CardTitle>
          <p className="no-print mt-1 text-sm text-muted-foreground">{t("rep.ext.desc")}</p>
          {/* The dates are controls on screen and a fact on paper. */}
          <p className="print-only mt-1 hidden text-sm text-muted-foreground">
            {t("rep.period", { from: formatDate(from), to: formatDate(to) })}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
