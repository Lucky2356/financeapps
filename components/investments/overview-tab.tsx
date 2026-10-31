"use client";

import { LineChart, Plus, RefreshCw } from "lucide-react";

import { PortfolioValueChart } from "@/components/charts/lazy";
import { EmptyState } from "@/components/empty-state";
import { InfoHint } from "@/components/info-hint";
import { AllocationBar } from "@/components/investments/allocation-bar";
import { HoldingCard } from "@/components/investments/holding-card";
import { HoldingsTable } from "@/components/investments/holdings-table";
import { PortfolioHero } from "@/components/investments/portfolio-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

/** Overview — value, today's move, trend, allocation, holdings. */
export function OverviewTab({
  data,
  dayChangeByTicker,
  expandedTicker,
  onToggle,
  onEdit,
  onRemove,
  onAddPosition,
  onGoToMarket,
  onRefreshMarket
}: {
  data: InvestmentData;
  dayChangeByTicker: Map<string, number>;
  expandedTicker: string | null;
  onToggle: (ticker: string) => void;
  onEdit: (position: InvestmentData["portfolio"][number]) => void;
  onRemove: (ticker: string) => Promise<void>;
  onAddPosition: () => void;
  onGoToMarket: () => void;
  onRefreshMarket: () => void;
}) {
  const { t } = useI18n();
  return data.portfolio.length === 0 ? (
    // The head of the screen stays put when the portfolio is empty: the
    // card reads zero instead of vanishing, so adding a first position
    // does not rebuild the layout under the owner's finger.
    <div className="space-y-4">
      <PortfolioHero
        portfolio={data.portfolio}
        currency={data.currency}
        dayChangeByTicker={dayChangeByTicker}
        totals={data.totals}
        history={data.history}
      />
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={LineChart}
            title={t("inv.overviewEmpty.title")}
            description={t("inv.overviewEmpty.desc")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onAddPosition}>
                  <Plus className="size-4" />
                  {t("inv.overviewEmpty.cta")}
                </Button>
                <Button variant="outline" onClick={onGoToMarket}>
                  {t("inv.overviewEmpty.toMarket")}
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  ) : (
    <div className="space-y-4">
      <PortfolioHero
        portfolio={data.portfolio}
        currency={data.currency}
        dayChangeByTicker={dayChangeByTicker}
        totals={data.totals}
        history={data.history}
      />
      <PortfolioValueChart
        portfolio={data.portfolio}
        history={data.history}
        currency={data.currency}
      />
      <AllocationBar data={data.structure} />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-1.5">
            {t("inv.holdingsTitle")}
            <InfoHint text="tip.inv.holdingsTitle" />
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onRefreshMarket()}>
              <RefreshCw className="size-4" />
              {t("inv.refreshMarket")}
            </Button>
            <Button onClick={onAddPosition}>
              <Plus className="size-4" />
              {t("inv.addSecurity")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* ПК — таблица с сортировкой; телефон — карточки под палец. */}
          <div className="hidden md:block">
            <HoldingsTable
              portfolio={data.portfolio}
              currency={data.currency}
              dayChangeByTicker={dayChangeByTicker}
              expandedTicker={expandedTicker}
              onToggle={onToggle}
              onEdit={onEdit}
              onRemove={(ticker) => void onRemove(ticker)}
            />
          </div>
          <div className="stagger grid gap-3 md:hidden">
            {data.portfolio.map((position) => (
              <HoldingCard
                key={position.ticker}
                position={position}
                currency={data.currency}
                dayChange={dayChangeByTicker.get(position.ticker)}
                expanded={expandedTicker === position.ticker}
                onToggle={() => onToggle(position.ticker)}
                onEdit={() => onEdit(position)}
                onRemove={() => void onRemove(position.ticker)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
