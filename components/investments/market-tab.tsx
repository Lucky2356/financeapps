"use client";

import { Plus, RefreshCw, Star } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SecuritySearch } from "@/components/investments/security-search";
import { WatchlistCard } from "@/components/investments/watchlist-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

import { ownedSecurities } from "@/components/investments/owned-securities";
import { SuggestionPicker } from "@/components/investments/suggestion-picker";
import type { SuggestionPickerState } from "@/components/investments/use-suggestion-picker";

/** Market — watchlist + search + picker. */
export function MarketTab({
  data,
  hasMarketData,
  expandedTicker,
  onToggle,
  watchlistOpen,
  setWatchlistOpen,
  onAddWatchlistTicker,
  onRemoveWatchlistItem,
  onRefreshMarket,
  picker
}: {
  data: InvestmentData;
  hasMarketData: boolean;
  expandedTicker: string | null;
  onToggle: (ticker: string) => void;
  watchlistOpen: boolean;
  setWatchlistOpen: (open: boolean) => void;
  onAddWatchlistTicker: (ticker: string) => void;
  onRemoveWatchlistItem: (ticker: string) => Promise<void>;
  onRefreshMarket: () => void;
  picker: SuggestionPickerState;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
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
            <Button type="button" variant="outline" onClick={() => onRefreshMarket()}>
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
              <WatchlistDialog
                currency={data.currency}
                owned={ownedSecurities(data)}
                onAddTicker={onAddWatchlistTicker}
              />
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
                  onToggle={() => onToggle(security.ticker)}
                  onRemove={() => void onRemoveWatchlistItem(security.ticker)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Picker (suggestions) — a helper to build a diversified portfolio. */}
      <SuggestionPicker picker={picker} currency={data.currency} />
    </div>
  );
}

function WatchlistDialog({
  currency,
  owned,
  onAddTicker
}: {
  currency: string;
  owned: Array<{ ticker: string; name: string }>;
  onAddTicker: (ticker: string) => void;
}) {
  const { t } = useI18n();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("inv.addWatchlist")}</DialogTitle>
        <DialogDescription>{t("inv.watchlistDialog.desc")}</DialogDescription>
      </DialogHeader>
      <SecuritySearch currency={currency} owned={owned} onSelect={(s) => onAddTicker(s.ticker)} />
    </DialogContent>
  );
}
