"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";

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
  const currency = analytics.currency;
  const last = analytics.monthlyCashflow[analytics.monthlyCashflow.length - 1];

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Сформирован {new Date().toLocaleDateString("ru-RU")}
        </p>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" />
          Печать / PDF
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Капитал (net worth)" value={formatCurrency(netWorth, currency)} />
        <Stat
          label="Средний доход / мес"
          value={formatCurrency(analytics.avgMonthlyIncome, currency)}
        />
        <Stat
          label="Средний расход / мес"
          value={formatCurrency(analytics.avgMonthlyExpense, currency)}
        />
        <Stat label="Норма сбережений" value={`${Math.round(analytics.avgSavingsRate)}%`} />
      </div>

      {last && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Последний месяц: {last.month}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Доходы</p>
              <p className="font-medium text-success">{formatCurrency(last.income, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Расходы</p>
              <p className="font-medium text-destructive">
                {formatCurrency(last.expense, currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Сбережения ({Math.round(last.savingsRate)}%)
              </p>
              <p className="font-medium">{formatCurrency(last.savings, currency)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Структура расходов</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topExpenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных о расходах.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Категория</th>
                  <th className="py-2 text-right">Сумма</th>
                  <th className="py-2 text-right">Доля</th>
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
          <CardTitle className="text-base">Денежный поток по месяцам</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">Месяц</th>
                <th className="py-2 text-right">Доходы</th>
                <th className="py-2 text-right">Расходы</th>
                <th className="py-2 text-right">Сбережения</th>
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
    </div>
  );
}
