"use client";

import {
  LayoutDashboard,
  LineChart,
  PieChart,
  Plus,
  RefreshCw,
  ShieldAlert,
  Star,
  Store
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PortfolioStructureChart } from "@/components/charts/lazy";
import { RecommendationList } from "@/components/recommendation-list";
import { AllocationBar } from "@/components/investments/allocation-bar";
import { HoldingCard } from "@/components/investments/holding-card";
import { PortfolioHero } from "@/components/investments/portfolio-hero";
import { PortfolioValueChart } from "@/components/investments/portfolio-value-chart";
import { TaxEstimateCard } from "@/components/investments/tax-estimate-card";
import { SecuritySearch } from "@/components/investments/security-search";
import { WatchlistCard } from "@/components/investments/watchlist-card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
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

// Three plain tabs with icons: Overview (everything that matters at a glance),
// Market (search + watchlist + picker) and Analytics (deeper breakdowns).
const TABS = [
  { id: "overview", labelKey: "inv.tab.overview", icon: LayoutDashboard },
  { id: "market", labelKey: "inv.tab.market", icon: Store },
  { id: "analytics", labelKey: "inv.tab.analytics", icon: PieChart }
] as const;
type TabId = (typeof TABS)[number]["id"];

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
  // Active tab + the single security whose inline price chart is expanded.
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const toggleExpand = (ticker: string) =>
    setExpandedTicker((prev) => (prev === ticker ? null : ticker));
  const selectTab = (id: TabId) => {
    setActiveTab(id);
    setExpandedTicker(null);
  };

  const hasMarketData = data.watchlist.length > 0 || data.portfolio.length > 0;

  // Day-change% per ticker, gathered from the curated board + watchlist, so the
  // portfolio hero/cards can show today's move on held positions (best-effort).
  const dayChangeByTicker = new Map<string, number>();
  for (const s of [...data.securities, ...data.watchlist])
    dayChangeByTicker.set(s.ticker, s.changeDay);

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

  // Real-time updates: keep prices fresh while the page is VISIBLE. Polling is
  // paused when the tab/window is hidden (other tab, minimized desktop) to save
  // network and battery, and resumes — with an immediate refresh — on return.
  useEffect(() => {
    if (!hasMarketData) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => void refreshMarketPrices(true), REFRESH_INTERVAL_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshMarketPrices(true);
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
      {/* Tabs cut the endless scroll: Overview / Market / Analytics. */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* ── Overview — value, today's move, trend, allocation, holdings ─────── */}
      {activeTab === "overview" ? (
        data.portfolio.length === 0 ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={LineChart}
                title={t("inv.overviewEmpty.title")}
                description={t("inv.overviewEmpty.desc")}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setAddPositionOpen(true)}>
                      <Plus className="size-4" />
                      {t("inv.overviewEmpty.cta")}
                    </Button>
                    <Button variant="outline" onClick={() => selectTab("market")}>
                      {t("inv.overviewEmpty.toMarket")}
                    </Button>
                  </div>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <PortfolioHero
              portfolio={data.portfolio}
              currency={data.currency}
              dayChangeByTicker={dayChangeByTicker}
            />
            <PortfolioValueChart portfolio={data.portfolio} />
            <AllocationBar data={data.structure} />

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{t("inv.holdingsTitle")}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => refreshMarketPrices()}>
                    <RefreshCw className="size-4" />
                    {t("inv.refreshMarket")}
                  </Button>
                  <Button onClick={() => setAddPositionOpen(true)}>
                    <Plus className="size-4" />
                    {t("inv.addSecurity")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {data.portfolio.map((position) => (
                  <HoldingCard
                    key={position.ticker}
                    position={position}
                    currency={data.currency}
                    dayChange={dayChangeByTicker.get(position.ticker)}
                    expanded={expandedTicker === position.ticker}
                    onToggle={() => toggleExpand(position.ticker)}
                    onEdit={() => setEditingPosition(position)}
                    onRemove={() => void removePosition(position.ticker)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )
      ) : null}

      {/* ── Market — watchlist + search + picker ───────────────────────────── */}
      {activeTab === "market" ? (
        <div className="space-y-5">
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
                <div className="grid gap-3">
                  {data.watchlist.map((security) => (
                    <WatchlistCard
                      key={security.ticker}
                      security={security}
                      currency={data.currency}
                      expanded={expandedTicker === security.ticker}
                      onToggle={() => toggleExpand(security.ticker)}
                      onRemove={() => void removeWatchlistItem(security.ticker)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Picker (suggestions) — a helper to build a diversified portfolio. */}
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
                  <Select
                    value={riskCode}
                    onValueChange={(value) => setRiskCode(value as typeof riskCode)}
                  >
                    <SelectTrigger id="invest-risk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_CODES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(`riskProfile.${option.value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void addSuggestion(suggestion)}
                        >
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
        </div>
      ) : null}

      {/* ── Analytics — structure, sectors, risks & education ──────────────── */}
      {activeTab === "analytics" ? (
        <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-2">
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

          {data.portfolio.length > 0 && (
            <TaxEstimateCard positions={data.portfolio} currency={data.currency} />
          )}

          <section className="grid gap-5 xl:grid-cols-2">
            <RecommendationList titleKey="inv.portfolioRisks" items={data.risks} />
            <RecommendationList titleKey="inv.educationTips" items={data.education} />
          </section>
        </div>
      ) : null}

      {/* Disclaimer — legal boilerplate lives at the bottom, out of the way. */}
      <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <p>{t("inv.pageDisclaimer")}</p>
      </div>

      {/* Controlled "add position" dialog, opened from Overview (header + empty). */}
      <Dialog open={addPositionOpen} onOpenChange={setAddPositionOpen}>
        <PositionDialog
          title={t("inv.addPosition")}
          description={t("inv.addPosition.desc")}
          data={data}
          currency={data.currency}
          onSubmit={submitPosition}
        />
      </Dialog>

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
