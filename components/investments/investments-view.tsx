"use client";

import { Edit2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { PortfolioStructureChart } from "@/components/charts/portfolio-structure-chart";
import { RecommendationList } from "@/components/recommendation-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import { INVESTMENT_DISCLAIMER, RISK_LABELS } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { InvestmentData } from "@/types/finance";

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

export function InvestmentsView({ data }: { data: InvestmentData }) {
  const router = useRouter();

  async function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      await apiClient.post("/investments", payload);
      toast.success("Позиция портфеля сохранена");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить позицию");
    }
  }

  async function removePosition(ticker: string) {
    try {
      await apiClient.post("/investments", { action: "delete", ticker });
      toast.success("Позиция удалена из портфеля");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить позицию");
    }
  }

  async function addWatchlistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      await apiClient.post("/investments", { ...payload, action: "addWatchlist" });
      toast.success("Бумага добавлена в watchlist");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось добавить бумагу");
    }
  }

  async function removeWatchlistItem(ticker: string) {
    try {
      await apiClient.post("/investments", { action: "removeWatchlist", ticker });
      toast.success("Бумага удалена из watchlist");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить бумагу");
    }
  }

  const watchlistTickers = new Set(data.watchlist.map((security) => security.ticker));
  const availableForWatchlist = data.securities.filter((security) => !watchlistTickers.has(security.ticker));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/12 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-info-foreground" />
        <p className="text-muted-foreground">{INVESTMENT_DISCLAIMER}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Watchlist российских акций</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="size-4" />
                Добавить в watchlist
              </Button>
            </DialogTrigger>
            <WatchlistDialog securities={availableForWatchlist} onSubmit={addWatchlistItem} />
          </Dialog>
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
                  <TableHead className="w-16 text-right"> </TableHead>
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
                    <TableCell className="text-right">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void removeWatchlistItem(security.ticker);
                        }}
                      >
                        <Button type="submit" variant="ghost" size="icon" title="Удалить из watchlist">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </form>
                    </TableCell>
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
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void removeWatchlistItem(security.ticker);
                  }}
                >
                  <Button type="submit" variant="outline" size="sm">
                    <Trash2 className="size-4 text-destructive" />
                    Удалить
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Портфель пользователя</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  Добавить позицию
                </Button>
              </DialogTrigger>
              <PositionDialog
                title="Добавить позицию"
                description="Укажите бумагу, количество и среднюю цену покупки. Это учетная запись портфеля, не инвестиционный совет."
                data={data}
                onSubmit={submitPosition}
              />
            </Dialog>
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
                    <TableHead className="w-28 text-right">Действия</TableHead>
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
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Редактировать позицию">
                                <Edit2 className="size-4" />
                              </Button>
                            </DialogTrigger>
                            <PositionDialog
                              title={`Редактировать ${position.ticker}`}
                              description="Можно обновить количество и среднюю цену покупки."
                              data={data}
                              position={position}
                              onSubmit={submitPosition}
                            />
                          </Dialog>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void removePosition(position.ticker);
                            }}
                          >
                            <Button type="submit" variant="ghost" size="icon" title="Удалить позицию">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </form>
                        </div>
                      </TableCell>
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
                  <div className="mt-4 flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Edit2 className="size-4" />
                          Изменить
                        </Button>
                      </DialogTrigger>
                      <PositionDialog
                        title={`Редактировать ${position.ticker}`}
                        description="Можно обновить количество и среднюю цену покупки."
                        data={data}
                        position={position}
                        onSubmit={submitPosition}
                      />
                    </Dialog>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void removePosition(position.ticker);
                      }}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        <Trash2 className="size-4 text-destructive" />
                        Удалить
                      </Button>
                    </form>
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

function WatchlistDialog({
  securities,
  onSubmit
}: {
  securities: InvestmentData["securities"];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Добавить в watchlist</DialogTitle>
        <DialogDescription>
          Выберите бумагу из справочника рынка. Это список наблюдения, а не индивидуальная инвестиционная рекомендация.
        </DialogDescription>
      </DialogHeader>
      {securities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          Все бумаги из справочника уже добавлены в watchlist.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label>Бумага</Label>
            <select name="ticker" defaultValue={securities[0]?.ticker} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {securities.map((security) => (
                <option key={security.ticker} value={security.ticker}>
                  {security.ticker} · {security.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit">Добавить</Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}

function PositionDialog({
  title,
  description,
  data,
  position,
  onSubmit
}: {
  title: string;
  description: string;
  data: InvestmentData;
  position?: InvestmentData["portfolio"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="space-y-2">
          <Label>Бумага</Label>
          {position ? <input type="hidden" name="ticker" value={position.ticker} /> : null}
          <select
            name="ticker"
            defaultValue={position?.ticker ?? data.securities[0]?.ticker}
            disabled={Boolean(position)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-70"
          >
            {data.securities.map((security) => (
              <option key={security.ticker} value={security.ticker}>
                {security.ticker} · {security.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Количество</Label>
            <Input name="quantity" type="number" min="0" step="0.000001" defaultValue={position?.quantity ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label>Средняя цена покупки</Label>
            <Input name="averageBuyPrice" type="number" min="0" step="0.0001" defaultValue={position?.averageBuyPrice ?? ""} required />
          </div>
        </div>
        <div className="rounded-lg border border-info/30 bg-info/12 p-3 text-sm text-muted-foreground">
          Данные используются только для учета и анализа рисков портфеля. Информация не является индивидуальной инвестиционной рекомендацией.
        </div>
        <DialogFooter>
          <Button type="submit">Сохранить позицию</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
