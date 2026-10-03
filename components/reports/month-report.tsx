"use client";

// Отчёт за месяц на одну страницу — распечатать или сохранить в PDF.
//
// Итоги месяца (lib/analytics/month-recap.ts), план и факт по статьям (тот же
// план/факт, что на своём экране) и самые крупные траты. На бумаге — светлая
// палитра и шапка с названием и периодом (globals.css, @media print).

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PrintHeader } from "@/components/reports/print-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { previousMonth, type MonthRecap } from "@/lib/analytics/month-recap";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { isAndroidShell } from "@/lib/platform/device";
import type { PlanFactPageData } from "@/types/finance";

function monthsBack(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, step) => {
    const date = new Date(now.getFullYear(), now.getMonth() - step, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthEnd(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, index, 0).getDate()).padStart(2, "0")}`;
}

const EMPTY_RECAP: MonthRecap = {
  month: "",
  income: 0,
  expense: 0,
  saved: 0,
  savedRate: null,
  previous: { income: 0, expense: 0, savedRate: null },
  top: [],
  grew: null,
  overBudget: [],
  operations: 0,
  asOfDay: null
};

export function MonthReport() {
  const { t, locale } = useI18n();
  const months = useMemo(() => monthsBack(24), []);
  const [month, setMonth] = useState(() => previousMonth(months[0]));
  const { data: recap } = useApiPageData<MonthRecap>(EMPTY_RECAP, `/month-recap?month=${month}`);
  const { data: plan } = useApiPageData<PlanFactPageData | null>(null, "/plan");
  const { data: ledger } = useApiPageData<TransactionsPageData | null>(
    null,
    `/transactions?from=${month}-01&to=${monthEnd(month)}&limit=all`
  );
  const currency = plan?.currency ?? "RUB";
  const money = (value: number) => formatCurrency(value, currency);
  const name = (value: string) =>
    new Date(`${value}-01T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
      month: "long",
      year: "numeric"
    });

  const row = plan?.months.find((item) => item.month === month);
  const lines = (plan?.columns ?? [])
    .map((column) => ({ column, cell: row?.cells[column.categoryId] }))
    .filter(({ cell }) => cell && (cell.plan > 0 || cell.fact > 0));
  const biggest = (ledger?.transactions ?? [])
    .filter((item) => item.type === "EXPENSE" && !item.transferId)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return (
    <div className="space-y-4" data-testid="month-report">
      <PrintHeader titleKey="mr.title" period={name(month)} />
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/reports">
            <ArrowLeft className="size-4" />
            {t("nav.reports")}
          </Link>
        </Button>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-48 capitalize" aria-label={t("mr.month")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((item) => (
              <SelectItem key={item} value={item} className="capitalize">
                {name(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" className="ml-auto" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t("mr.print")}
        </Button>
      </div>
      {isAndroidShell() ? (
        <p className="no-print text-xs text-muted-foreground">{t("mr.phoneHint")}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">{name(month)}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t("yr.income")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(recap.income)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("yr.expense")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(recap.expense)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("yr.saved")}</dt>
              <dd className="text-lg font-semibold tabular-nums" data-testid="month-report-saved">
                {money(recap.saved)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("mr.rate")}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {recap.savedRate === null ? "—" : `${recap.savedRate}%`}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mr.planFact")}</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("mr.noPlan")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 font-medium">{t("mr.category")}</th>
                    <th className="py-1.5 text-right font-medium">{t("mr.plan")}</th>
                    <th className="py-1.5 text-right font-medium">{t("mr.fact")}</th>
                    <th className="py-1.5 text-right font-medium">{t("mr.diff")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ column, cell }) => {
                    const over =
                      column.kind === "EXPENSE"
                        ? cell!.plan > 0 && cell!.fact > cell!.plan
                        : cell!.plan > 0 && cell!.fact < cell!.plan;
                    return (
                      <tr key={column.categoryId} className="border-b last:border-0">
                        <td className="py-1.5">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: column.color }}
                            />
                            {column.label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {cell!.plan > 0 ? money(cell!.plan) : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{money(cell!.fact)}</td>
                        <td
                          className={
                            over
                              ? "py-1.5 text-right tabular-nums text-destructive"
                              : "py-1.5 text-right tabular-nums"
                          }
                        >
                          {cell!.plan > 0 ? money(cell!.fact - cell!.plan) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mr.biggest")}</CardTitle>
        </CardHeader>
        <CardContent>
          {biggest.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cmp.empty")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {biggest.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {formatDate(item.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.description || item.category.label}
                  </span>
                  <span className="text-muted-foreground">{item.category.label}</span>
                  <span className="w-28 text-right font-medium tabular-nums">
                    {money(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
