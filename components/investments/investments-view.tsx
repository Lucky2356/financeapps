"use client";

import { Edit2, LineChart, Plus, RefreshCw, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PortfolioStructureChart } from "@/components/charts/lazy";
import { RecommendationList } from "@/components/recommendation-list";
import {
  StockDetailDialog,
  type StockDetailSeed
} from "@/components/investments/stock-detail-dialog";
import { SecuritySearch } from "@/components/investments/security-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import {
  InvestmentSuggestionService,
  type InvestmentSuggestion
} from "@/services/InvestmentSuggestionService";
import type { InvestmentData } from "@/types/finance";

const REFRESH_INTERVAL_MS = 45_000;
const RISK_CODES = [
  { value: "CONSERVATIVE" },
  { value: "MODERATE" },
  { value: "AGGRESSIVE" }
] as const;

const riskVariant = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive"
} as const;

export function InvestmentsView({ data: initialData }: { data: InvestmentData }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data, reload } = useApiPageData(initialData, "/investments");
  const { run } = useApiMutation();
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<
    InvestmentData["portfolio"][number] | null
  >(null);
  // Suggestion engine inputs
  const [budget, setBudget] = useState("");
  const [riskCode, setRiskCode] = useState<(typeof RISK_CODES)[number]["value"]>("MODERATE");
  const [suggestions, setSuggestions] = useState<InvestmentSuggestion[]>([]);
  const [suggested, setSuggested] = useState(false);
  const [detailSeed, setDetailSeed] = useState<StockDetailSeed | null>(null);

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
      toast.error(t("inv.toast.enterBudget"));
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
      toast.info(t("inv.toast.noMatch"));
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
        success: t("inv.toast.added", {
          ticker: suggestion.ticker,
          n: suggestion.suggestedQuantity
        }),
        error: t("inv.toast.addError"),
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
      success: t("inv.toast.positionSaved"),
      error: t("inv.toast.positionSaveError"),
      onSuccess: async () => {
        setAddPositionOpen(false);
        setEditingPosition(null);
        await refresh();
      }
    });
  }

  async function removePosition(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "delete", ticker }), {
      success: t("inv.toast.positionRemoved"),
      error: t("inv.toast.positionRemoveError"),
      onSuccess: refresh
    });
  }

  async function addWatchlistTicker(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "addWatchlist", ticker }), {
      success: t("inv.toast.watchlistAdded", { ticker }),
      error: t("inv.toast.watchlistAddError"),
      onSuccess: async () => {
        setWatchlistOpen(false);
        await refresh();
      }
    });
  }

  async function removeWatchlistItem(ticker: string) {
    await run(() => apiClient.post("/investments", { action: "removeWatchlist", ticker }), {
      success: t("inv.toast.watchlistRemoved"),
      error: t("inv.toast.watchlistRemoveError"),
      onSuccess: refresh
    });
  }

  async function refreshMarketPrices(silent = false) {
    try {
      const result = await apiClient.post<{ updated: number; source: string }>("/investments", {
        action: "refreshMarket"
      });
      if (!silent) {
        toast.success(t("inv.toast.marketRefreshed", { n: result.updated, source: result.source }));
      }
      await reload();
      router.refresh();
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : t("inv.toast.marketRefreshError"));
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/12 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-info-foreground" />
        <p className="text-muted-foreground">{t("inv.pageDisclaimer")}</p>
      </div>

      {/* Suggestion engine: budget + risk → securities to strengthen the portfolio */}
      <Card>
        <CardHeader>
          <CardTitle>{t("inv.suggestTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("inv.suggestIntro")}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invest-budget">{t("inv.budgetLabel")}</Label>
              <Input
                id="invest-budget"
                type="number"
                min="0"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={t("inv.budgetPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invest-risk">{t("inv.riskAllowed")}</Label>
              <select
                id="invest-risk"
                value={riskCode}
                onChange={(e) => setRiskCode(e.target.value as typeof riskCode)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {RISK_CODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(`riskProfile.${option.value}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={computeSuggestions}>
              {t("inv.suggestBtn")}
            </Button>
          </div>

          {suggested && suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.ticker}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {suggestion.ticker} · {suggestion.name}
                      <Badge
                        variant={riskVariant[suggestion.risk]}
                        className="ml-2 align-middle text-[11px]"
                      >
                        {t(`riskLevel.${suggestion.risk}`)}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {t("inv.pieces", { n: suggestion.suggestedQuantity })} ·{" "}
                        {formatCurrency(suggestion.suggestedAmount, data.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("inv.atPrice", {
                          price: formatCurrency(suggestion.price, data.currency)
                        })}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void addSuggestion(suggestion)}>
                      <Plus className="size-4" />
                      {t("inv.toPortfolio")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : suggested ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("inv.noSuggestions")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {t("inv.watchlistTitle")}
            {hasMarketData ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("inv.pricesAuto")}
              </span>
            ) : null}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => refreshMarketPrices()}>
              <RefreshCw className="size-4" />
              {t("inv.refreshMarket")}
            </Button>
            <Dialog open={watchlistOpen} onOpenChange={setWatchlistOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="size-4" />
                  {t("inv.addWatchlist")}
                </Button>
              </DialogTrigger>
              <WatchlistDialog currency={data.currency} onAddTicker={addWatchlistTicker} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {data.watchlist.length === 0 ? (
            <EmptyState
              icon={Star}
              title={t("inv.watchlistEmpty.title")}
              description={t("inv.watchlistEmpty.desc")}
              action={
                <Button variant="outline" onClick={() => setWatchlistOpen(true)}>
                  <Plus className="size-4" />
                  {t("inv.addWatchlist")}
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("inv.col.ticker")}</TableHead>
                      <TableHead>{t("inv.col.name")}</TableHead>
                      <TableHead>{t("inv.col.sector")}</TableHead>
                      <TableHead className="text-right">{t("inv.col.price")}</TableHead>
                      <TableHead className="text-right">{t("inv.col.day")}</TableHead>
                      <TableHead className="text-right">{t("inv.col.30d")}</TableHead>
                      <TableHead>{t("inv.col.risk")}</TableHead>
                      <TableHead>{t("inv.col.comment")}</TableHead>
                      <TableHead className="w-16 text-right"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.watchlist.map((security) => (
                      <TableRow key={security.ticker}>
                        <TableCell className="font-semibold">
                          <button
                            type="button"
                            className="hover:text-primary hover:underline"
                            title={t("inv.openChart")}
                            onClick={() => setDetailSeed(security)}
                          >
                            {security.ticker}
                          </button>
                        </TableCell>
                        <TableCell>{security.name}</TableCell>
                        <TableCell className="text-muted-foreground">{security.sector}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(security.price, data.currency)}
                        </TableCell>
                        <TableCell
                          className={
                            security.changeDay >= 0
                              ? "text-right text-success-foreground"
                              : "text-right text-destructive"
                          }
                        >
                          {security.changeDay.toFixed(2)}%
                        </TableCell>
                        <TableCell
                          className={
                            security.change30d >= 0
                              ? "text-right text-success-foreground"
                              : "text-right text-destructive"
                          }
                        >
                          {security.change30d.toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <Badge variant={riskVariant[security.risk]}>
                            {t(`riskLevel.${security.risk}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-96 text-muted-foreground">
                          {security.comment}
                        </TableCell>
                        <TableCell className="text-right">
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void removeWatchlistItem(security.ticker);
                            }}
                          >
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              title={t("inv.removeWatchlist")}
                              aria-label={t("inv.removeWatchlist")}
                            >
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
                      <Badge variant={riskVariant[security.risk]}>
                        {t(`riskLevel.${security.risk}`)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("inv.col.price")}</p>
                        <p className="font-semibold">
                          {formatCurrency(security.price, data.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("inv.col.day")}</p>
                        <p
                          className={
                            security.changeDay >= 0
                              ? "font-semibold text-success-foreground"
                              : "font-semibold text-destructive"
                          }
                        >
                          {security.changeDay.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("inv.col.30d")}</p>
                        <p
                          className={
                            security.change30d >= 0
                              ? "font-semibold text-success-foreground"
                              : "font-semibold text-destructive"
                          }
                        >
                          {security.change30d.toFixed(2)}%
                        </p>
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
                        {t("common.delete")}
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
            <CardTitle>{t("inv.portfolioTitle")}</CardTitle>
            <Dialog open={addPositionOpen} onOpenChange={setAddPositionOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  {t("inv.addPosition")}
                </Button>
              </DialogTrigger>
              <PositionDialog
                title={t("inv.addPosition")}
                description={t("inv.addPosition.desc")}
                data={data}
                currency={data.currency}
                onSubmit={submitPosition}
              />
            </Dialog>
          </CardHeader>
          <CardContent>
            {data.portfolio.length === 0 ? (
              <EmptyState
                icon={LineChart}
                title={t("inv.portfolioEmpty.title")}
                description={t("inv.portfolioEmpty.desc")}
                action={
                  <Button onClick={() => setAddPositionOpen(true)}>
                    <Plus className="size-4" />
                    {t("inv.addPosition")}
                  </Button>
                }
              />
            ) : (
              <>
                <PortfolioSummary portfolio={data.portfolio} currency={data.currency} />
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("inv.col.ticker")}</TableHead>
                        <TableHead>{t("inv.col.sector")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.qty")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.avg")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.current")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.value")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.pnl")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.return")}</TableHead>
                        <TableHead className="text-right">{t("inv.col.share")}</TableHead>
                        <TableHead className="w-28 text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.portfolio.map((position) => {
                        const cost = position.quantity * position.averageBuyPrice;
                        const returnPct = cost > 0 ? (position.pnl / cost) * 100 : 0;
                        return (
                          <TableRow key={position.ticker}>
                            <TableCell className="font-semibold">
                              <button
                                type="button"
                                className="hover:text-primary hover:underline"
                                title={t("inv.openChart")}
                                onClick={() =>
                                  setDetailSeed({
                                    ticker: position.ticker,
                                    name: position.name,
                                    price: position.currentPrice,
                                    sector: position.sector
                                  })
                                }
                              >
                                {position.ticker}
                              </button>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {position.sector}
                            </TableCell>
                            <TableCell className="text-right">
                              {position.quantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(position.averageBuyPrice, data.currency)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(position.currentPrice, data.currency)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(position.currentValue, data.currency)}
                            </TableCell>
                            <TableCell
                              className={
                                position.pnl >= 0
                                  ? "text-right text-success-foreground"
                                  : "text-right text-destructive"
                              }
                            >
                              {formatCurrency(position.pnl, data.currency)}
                            </TableCell>
                            <TableCell
                              className={
                                returnPct >= 0
                                  ? "text-right text-success-foreground"
                                  : "text-right text-destructive"
                              }
                            >
                              {returnPct >= 0 ? "+" : ""}
                              {returnPct.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              {formatPercent(position.share)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={t("inv.editPosition")}
                                  aria-label={t("inv.editPosition")}
                                  onClick={() => setEditingPosition(position)}
                                >
                                  <Edit2 className="size-4" />
                                </Button>
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void removePosition(position.ticker);
                                  }}
                                >
                                  <Button
                                    type="submit"
                                    variant="ghost"
                                    size="icon"
                                    title={t("inv.removePosition")}
                                    aria-label={t("inv.removePosition")}
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                </form>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                          <p className="text-xs text-muted-foreground">{t("inv.col.value")}</p>
                          <p className="font-semibold">
                            {formatCurrency(position.currentValue, data.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("inv.col.pnl")}</p>
                          <p
                            className={
                              position.pnl >= 0
                                ? "font-semibold text-success-foreground"
                                : "font-semibold text-destructive"
                            }
                          >
                            {formatCurrency(position.pnl, data.currency)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingPosition(position)}
                        >
                          <Edit2 className="size-4" />
                          {t("common.edit")}
                        </Button>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void removePosition(position.ticker);
                          }}
                        >
                          <Button type="submit" variant="outline" size="sm">
                            <Trash2 className="size-4 text-destructive" />
                            {t("common.delete")}
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
            <CardTitle>{t("inv.structureTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioStructureChart data={data.structure} />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("inv.riskProfileLabel")} {data.riskProfile}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inv.sectorTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioStructureChart data={data.sectorStructure} />
            <p className="mt-2 text-sm text-muted-foreground">{t("inv.sectorDesc")}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecommendationList titleKey="inv.portfolioRisks" items={data.risks} />
        <RecommendationList titleKey="inv.educationTips" items={data.education} />
      </section>

      {/* Single controlled dialog for editing any portfolio position */}
      <Dialog
        open={editingPosition !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPosition(null);
        }}
      >
        {editingPosition && (
          <PositionDialog
            title={t("inv.editTitle", { ticker: editingPosition.ticker })}
            description={t("inv.editDesc")}
            data={data}
            currency={data.currency}
            position={editingPosition}
            onSubmit={submitPosition}
          />
        )}
      </Dialog>

      <StockDetailDialog
        seed={detailSeed}
        currency={data.currency}
        onClose={() => setDetailSeed(null)}
      />
    </div>
  );
}

function WatchlistDialog({
  currency,
  onAddTicker
}: {
  currency: string;
  onAddTicker: (ticker: string) => void;
}) {
  const { t } = useI18n();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("inv.addWatchlist")}</DialogTitle>
        <DialogDescription>{t("inv.watchlistDialog.desc")}</DialogDescription>
      </DialogHeader>
      <SecuritySearch currency={currency} onSelect={(s) => onAddTicker(s.ticker)} />
    </DialogContent>
  );
}

function PositionDialog({
  title,
  description,
  position,
  currency,
  onSubmit
}: {
  title: string;
  description: string;
  data: InvestmentData;
  position?: InvestmentData["portfolio"][number];
  currency: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  // For a new position the user can pick ANY security listed on MOEX via live
  // search; when editing, the ticker is fixed.
  const [chosen, setChosen] = useState<{ ticker: string; name: string } | null>(null);
  const ticker = position?.ticker ?? chosen?.ticker;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="space-y-2">
          <Label>{t("inv.security")}</Label>
          {ticker ? <input type="hidden" name="ticker" value={ticker} /> : null}
          {position ? (
            <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {position.ticker}
            </div>
          ) : chosen ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{chosen.ticker}</span>{" "}
                <span className="text-muted-foreground">{chosen.name}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(null)}>
                {t("common.edit")}
              </Button>
            </div>
          ) : (
            <SecuritySearch
              currency={currency}
              onSelect={(s) => setChosen({ ticker: s.ticker, name: s.name })}
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("inv.quantity")}</Label>
            <Input
              name="quantity"
              type="number"
              min="0"
              step="0.000001"
              defaultValue={position?.quantity ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("inv.avgPrice")}</Label>
            <Input
              name="averageBuyPrice"
              type="number"
              min="0"
              step="0.0001"
              defaultValue={position?.averageBuyPrice ?? ""}
              required
            />
          </div>
        </div>
        <div className="rounded-lg border border-info/30 bg-info/12 p-3 text-sm text-muted-foreground">
          {t("inv.positionNote")}
        </div>
        <DialogFooter>
          <Button type="submit">{t("inv.savePosition")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// Portfolio-level summary an investor expects: invested (cost basis), current
// market value, and total unrealized return in both currency and percent.
function PortfolioSummary({
  portfolio,
  currency
}: {
  portfolio: InvestmentData["portfolio"];
  currency: string;
}) {
  const { t } = useI18n();
  const cost = portfolio.reduce((sum, p) => sum + p.quantity * p.averageBuyPrice, 0);
  const value = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const pnl = value - cost;
  const returnPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const positive = pnl >= 0;

  const items = [
    { label: t("inv.invested"), value: formatCurrency(cost, currency), tone: "" },
    { label: t("inv.currentValue"), value: formatCurrency(value, currency), tone: "" },
    {
      label: t("inv.pnlLabel"),
      value: `${positive ? "+" : ""}${formatCurrency(pnl, currency)}`,
      tone: positive ? "text-success-foreground" : "text-destructive"
    },
    {
      label: t("inv.returnLabel"),
      value: `${positive ? "+" : ""}${returnPct.toFixed(1)}%`,
      tone: positive ? "text-success-foreground" : "text-destructive"
    }
  ];

  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className={`mt-1 text-sm font-semibold ${item.tone}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
