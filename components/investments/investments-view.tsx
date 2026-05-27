import { ShieldAlert } from "lucide-react";

import { PortfolioStructureChart } from "@/components/charts/portfolio-structure-chart";
import { RecommendationList } from "@/components/recommendation-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INVESTMENT_DISCLAIMER, RISK_LABELS } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { InvestmentData } from "@/types/finance";

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

export function InvestmentsView({ data }: { data: InvestmentData }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/12 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-info-foreground" />
        <p className="text-muted-foreground">{INVESTMENT_DISCLAIMER}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Watchlist российских акций</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="text-right">День</TableHead>
                  <TableHead className="text-right">30 дней</TableHead>
                  <TableHead>Риск</TableHead>
                  <TableHead>Комментарий</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.watchlist.map((security) => (
                  <TableRow key={security.ticker}>
                    <TableCell className="font-semibold">{security.ticker}</TableCell>
                    <TableCell>{security.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(security.price, data.currency)}</TableCell>
                    <TableCell className={security.changeDay >= 0 ? "text-right text-success-foreground" : "text-right text-destructive"}>
                      {security.changeDay.toFixed(2)}%
                    </TableCell>
                    <TableCell className={security.change30d >= 0 ? "text-right text-success-foreground" : "text-right text-destructive"}>
                      {security.change30d.toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={riskVariant[security.risk]}>{RISK_LABELS[security.risk]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-96 text-muted-foreground">{security.comment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {data.watchlist.map((security) => (
              <div key={security.ticker} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{security.ticker}</p>
                    <p className="text-sm text-muted-foreground">{security.name}</p>
                  </div>
                  <Badge variant={riskVariant[security.risk]}>{RISK_LABELS[security.risk]}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Цена</p>
                    <p className="font-semibold">{formatCurrency(security.price, data.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">День</p>
                    <p className={security.changeDay >= 0 ? "font-semibold text-success-foreground" : "font-semibold text-destructive"}>{security.changeDay.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">30 дней</p>
                    <p className={security.change30d >= 0 ? "font-semibold text-success-foreground" : "font-semibold text-destructive"}>{security.change30d.toFixed(2)}%</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{security.comment}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Портфель пользователя</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тикер</TableHead>
                    <TableHead className="text-right">Кол-во</TableHead>
                    <TableHead className="text-right">Средняя</TableHead>
                    <TableHead className="text-right">Текущая</TableHead>
                    <TableHead className="text-right">Стоимость</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">Доля</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.portfolio.map((position) => (
                    <TableRow key={position.ticker}>
                      <TableCell className="font-semibold">{position.ticker}</TableCell>
                      <TableCell className="text-right">{position.quantity.toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.averageBuyPrice, data.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.currentPrice, data.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(position.currentValue, data.currency)}</TableCell>
                      <TableCell className={position.pnl >= 0 ? "text-right text-success-foreground" : "text-right text-destructive"}>
                        {formatCurrency(position.pnl, data.currency)}
                      </TableCell>
                      <TableCell className="text-right">{formatPercent(position.share)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {data.portfolio.map((position) => (
                <div key={position.ticker} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{position.ticker}</p>
                      <p className="text-sm text-muted-foreground">{position.name}</p>
                    </div>
                    <p className="font-semibold">{formatPercent(position.share)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Стоимость</p>
                      <p className="font-semibold">{formatCurrency(position.currentValue, data.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P/L</p>
                      <p className={position.pnl >= 0 ? "font-semibold text-success-foreground" : "font-semibold text-destructive"}>
                        {formatCurrency(position.pnl, data.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Структура портфеля</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioStructureChart data={data.structure} />
            <p className="mt-2 text-sm text-muted-foreground">Риск-профиль: {data.riskProfile}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecommendationList title="Риски портфеля" items={data.risks} />
        <RecommendationList title="Образовательные подсказки" items={data.education} />
      </section>
    </div>
  );
}
