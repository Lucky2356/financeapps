"use client";

import { Edit2, LineChart, Plus, RefreshCw, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PortfolioStructureChart } from "@/components/charts/lazy";
import { RecommendationList } from "@/components/recommendation-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { INVESTMENT_DISCLAIMER, RISK_LABELS } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";
import { InvestmentSuggestionService, type InvestmentSuggestion } from "@/services/InvestmentSuggestionService";
import type { InvestmentData } from "@/types/finance";

const REFRESH_INTERVAL_MS = 45_000;
const RISK_CODES = [
  { value: "CONSERVATIVE", label: "Консервативный" },
  { value: "MODERATE", label: "Умеренный" },
  { value: "AGGRESSIVE", label: "Агрессивный" }
] as const;

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

export function InvestmentsView({ data: initialData }: { data: InvestmentData }) {
  const router = useRouter();
  const { data, reload } = useApiPageData(initialData, "/investments");
  const { run } = useApiMutation();
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<InvestmentData["portfolio"][number] | null>(null);
  // Suggestion engine inputs
  const [budget, setBudget] = useState("");
  const [riskCode, setRiskCode] = useState<(typeof RISK_CODES)[number]["value"]>("MODERATE");
  const [suggestions, setSuggestions] = useState<InvestmentSuggestion[]>([]);
  const [suggested, setSuggested] = useState(false);

  const hasMarketData = data.watchlist.length > 0 || data.portfolio.length > 0;

  // Auto-refresh only when the user has investments to update (avoids confusing
  // "updated 10 stocks" toast when user has never added any data)
  const autoRefreshed = useRef(false);
  useEffect(() => {
    if (autoRefreshed.current) return;
    autoRefreshed.current = true;
    if (hasMarketData) {
      // Silent: refresh prices in the background without a toast on every visit
      void refreshMarketPrices(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time updates: keep prices fresh while the page is open.
  useEffect(() => {
    if (!hasMarketData) return;
    const id = setInterval(() => void refreshMarketPrices(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasMarketData]); // eslint-disable-line react-hooks/exhaustive-deps

  function computeSuggestions() {
    const value = Number(budget);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Введите сумму бюджета на инвестиции");
      return;
    }
    const result = new InvestmentSuggestionService().suggest({
      budget: value,
      riskProfile: riskCode,
      portfolio: data.portfolio,
      securities: data.securities
    });
    setSuggestions(result);
    setSuggested(true);
    if (result.length === 0) {
      toast.info("Не удалось подобрать бумаги — увеличьте бюджет или смягчите ограничение риска.");
    }
  }

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function addSuggestion(suggestion: InvestmentSuggestion) {
    await run(
      () =>
        apiClient.post("/investments", {
          ticker: suggestion.ticker,
          quantity: String(suggestion.suggestedQuantity),
          averageBuyPrice: String(suggestion.price)
        }),
      {
        success: `${suggestion.ticker}: добавлено ${suggestion.suggestedQuantity} шт. в портфель`,
        error: "Не удалось добавить позицию",
        onSuccess: async () => {
          setSuggestions((prev) => prev.filter((item) => item.ticker !== suggestion.ticker));
          await refresh();
        }
      }
    );
  }

  async function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    await run(() => apiClient.post("/investments", payload), {
      success: "Позиция портфеля сохранена",
      error: "Не удалось сохранить позицию",
      onSuccess: async () => {
        setAddPositionOpen(false);
        setEditingPosition(null);
        await refresh();
      }
    });
  }

  async function removePosition(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "delete", ticker }), {
      success: "Позиция удалена из портфеля",
      error: "Не удалось удалить позицию",
      onSuccess: refresh
    });
  }

  async function addWatchlistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    await run(() => apiClient.post("/investments", { ...payload, action: "addWatchlist" }), {
      success: "Бумага добавлена в watchlist",
      error: "Не удалось добавить бумагу",
      onSuccess: async () => {
        setWatchlistOpen(false);
        await refresh();
      }
    });
  }

  async function removeWatchlistItem(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "removeWatchlist", ticker }), {
      success: "Бумага удалена из watchlist",
      error: "Не удалось удалить бумагу",
      onSuccess: refresh
    });
  }

  async function refreshMarketPrices(silent = false) {
    try {
      const result = await apiClient.post<{ updated: number; source: string }>("/investments", { action: "refreshMarket" });
      if (!silent) {
        toast.success(`Рыночные данные обновлены: ${result.updated} бумаг, источник ${result.source}`);
      }
      await reload();
      router.refresh();
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Не удалось обновить рыночные данные");
      }
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

      {/* Suggestion engine: budget + risk → securities to strengthen the portfolio */}
      <Card>
        <CardHeader>
          <CardTitle>Подбор бумаг для портфеля</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Укажите сумму на инвестиции в этом месяце и допустимый риск — подберём бумаги, которые сделают портфель более
            диверсифицированным и устойчивым с учётом уже имеющихся позиций.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invest-budget">Бюджет на инвестиции, ₽</Label>
              <Input id="invest-budget" type="number" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Например, 50000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invest-risk">Допустимый риск</Label>
              <select id="invest-risk" value={riskCode} onChange={(e) => setRiskCode(e.target.value as typeof riskCode)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {RISK_CODES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={computeSuggestions}>Подобрать</Button>
          </div>

          {suggested && suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div key={suggestion.ticker} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {suggestion.ticker} · {suggestion.name}
                      <Badge variant={riskVariant[suggestion.risk]} className="ml-2 align-middle text-[11px]">{RISK_LABELS[suggestion.risk]}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-medium">{suggestion.suggestedQuantity} шт. · {formatCurrency(suggestion.suggestedAmount, data.currency)}</p>
                      <p className="text-xs text-muted-foreground">по {formatCurrency(suggestion.price, data.currency)}</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void addSuggestion(suggestion)}>
                      <Plus className="size-4" />
                      В портфель
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : suggested ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Подходящих бумаг не нашлось. Попробуйте увеличить бюджет или выбрать более высокий допустимый риск.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            Watchlist российских акций
            {hasMarketData ? <span className="ml-2 text-xs font-normal text-muted-foreground">· цены обновляются автоматически</span> : null}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => refreshMarketPrices()}>
              <RefreshCw className="size-4" />
              Обновить рынок
            </Button>
            <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="size-4" />
                  Добавить в watchlist
                </Button>
              </DialogTrigger>
              <WatchlistDialog securities={availableForWatchlist} onSubmit={addWatchlistItem} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {data.watchlist.length === 0 ? (
            <EmptyState
              icon={Star}
              title="Watchlist пуст"
              description="Добавьте интересные бумаги в список наблюдения, чтобы следить за ценой и динамикой. Это не инвестиционная рекомендация."
              action={
                <Button variant="outline" onClick={() => setWatchlistOpen(true)}>
                  <Plus className="size-4" />
                  Добавить в watchlist
                </Button>
              }
            />
          ) : (
          <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Сектор</TableHead>
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
                    <TableCell className="text-muted-foreground">{security.sector}</TableCell>
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
                        <Button type="submit" variant="ghost" size="icon" title="Удалить из watchlist" aria-label="Удалить из watchlist">
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
                    <p className="text-xs text-muted-foreground">{security.sector}</p>
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
          </>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Портфель пользователя</CardTitle>
            <Dialog open={addPositionOpen} onOpenChange={setAddPositionOpen}>
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
            {data.portfolio.length === 0 ? (
              <EmptyState
                icon={LineChart}
                title="Портфель пуст"
                description="Подберите бумаги по бюджету и риску в блоке выше или добавьте позицию вручную — стоимость и P/L будут обновляться автоматически."
                action={
                  <Button onClick={() => setAddPositionOpen(true)}>
                    <Plus className="size-4" />
                    Добавить позицию
                  </Button>
                }
              />
            ) : (
            <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тикер</TableHead>
                    <TableHead>Сектор</TableHead>
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
                      <TableCell className="text-muted-foreground">{position.sector}</TableCell>
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
                          <Button variant="ghost" size="icon" title="Редактировать позицию" aria-label="Редактировать позицию" onClick={() => setEditingPosition(position)}>
                            <Edit2 className="size-4" />
                          </Button>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void removePosition(position.ticker);
                            }}
                          >
                            <Button type="submit" variant="ghost" size="icon" title="Удалить позицию" aria-label="Удалить позицию">
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
                    <Button variant="outline" size="sm" onClick={() => setEditingPosition(position)}>
                      <Edit2 className="size-4" />
                      Изменить
                    </Button>
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
            </>
            )}
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

        <Card>
          <CardHeader>
            <CardTitle>Секторная структура</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioStructureChart data={data.sectorStructure} />
            <p className="mt-2 text-sm text-muted-foreground">Показывает долю отраслей в текущей стоимости портфеля.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecommendationList title="Риски портфеля" items={data.risks} />
        <RecommendationList title="Образовательные подсказки" items={data.education} />
      </section>

      {/* Single controlled dialog for editing any portfolio position */}
      <Dialog open={editingPosition !== null} onOpenChange={(open) => { if (!open) setEditingPosition(null); }}>
        {editingPosition && (
          <PositionDialog
            title={`Редактировать ${editingPosition.ticker}`}
            description="Можно обновить количество и среднюю цену покупки."
            data={data}
            position={editingPosition}
            onSubmit={submitPosition}
          />
        )}
      </Dialog>
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
