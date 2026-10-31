"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecommendationList } from "@/components/recommendation-list";
import { PortfolioBreakdown } from "@/components/investments/portfolio-breakdown";
import { RealizedTaxReport } from "@/components/investments/realized-tax-report";
import { UpcomingPayouts } from "@/components/investments/upcoming-payouts";
import { DividendTracker } from "@/components/investments/dividend-tracker";
import { MarketAlertsPanel } from "@/components/investments/market-alerts-panel";
import { RebalancePanel } from "@/components/investments/rebalance-panel";
import { TaxEstimateCard } from "@/components/investments/tax-estimate-card";
import { Dialog } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { useI18n } from "@/lib/i18n/context";
import type { InvestmentData } from "@/types/finance";

import { InvestmentsTabBar, type TabId } from "@/components/investments/investments-tabs";
import { MarketTab } from "@/components/investments/market-tab";
import { OverviewTab } from "@/components/investments/overview-tab";
import { ownedSecurities } from "@/components/investments/owned-securities";
import { PositionDialog } from "@/components/investments/position-dialog";
import { useInvestmentActions } from "@/components/investments/use-investment-actions";
import { useMarketRefresh } from "@/components/investments/use-market-refresh";
import { useSuggestionPicker } from "@/components/investments/use-suggestion-picker";

// Вкладки, окна и подборщик лежат рядом, в своих файлах: здесь — сборка экрана.
export function InvestmentsView({ data: initialData }: { data: InvestmentData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data, reload } = useApiPageData(initialData, "/investments");
  const { run } = useApiMutation();
  const {
    watchlistOpen,
    setWatchlistOpen,
    addPositionOpen,
    setAddPositionOpen,
    editingPosition,
    setEditingPosition,
    refresh,
    submitPosition,
    removePosition,
    addWatchlistTicker,
    removeWatchlistItem
  } = useInvestmentActions({ reload, router, run, t });
  const picker = useSuggestionPicker({ data, locale, run, t, refresh });
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

  const { refreshMarketPrices } = useMarketRefresh({ hasMarketData, reload, router, t });

  return (
    <div className="space-y-4">
      <InvestmentsTabBar activeTab={activeTab} onSelect={selectTab} />

      {/* ── Overview — value, today's move, trend, allocation, holdings ─────── */}
      {activeTab === "overview" ? (
        <OverviewTab
          data={data}
          dayChangeByTicker={dayChangeByTicker}
          expandedTicker={expandedTicker}
          onToggle={toggleExpand}
          onEdit={setEditingPosition}
          onRemove={removePosition}
          onAddPosition={() => setAddPositionOpen(true)}
          onGoToMarket={() => selectTab("market")}
          onRefreshMarket={() => refreshMarketPrices()}
        />
      ) : null}

      {/* ── Market — watchlist + search + picker ───────────────────────────── */}
      {activeTab === "market" ? (
        <MarketTab
          data={data}
          hasMarketData={hasMarketData}
          expandedTicker={expandedTicker}
          onToggle={toggleExpand}
          watchlistOpen={watchlistOpen}
          setWatchlistOpen={setWatchlistOpen}
          onAddWatchlistTicker={addWatchlistTicker}
          onRemoveWatchlistItem={removeWatchlistItem}
          onRefreshMarket={() => refreshMarketPrices()}
          picker={picker}
        />
      ) : null}

      {/* ── Доход — выплаты, продажи, налоги ─────────────────────────────── */}
      {activeTab === "income" ? (
        <div className="space-y-4">
          <UpcomingPayouts />
          <DividendTracker />
          <RealizedTaxReport />
          {data.portfolio.length > 0 && (
            <TaxEstimateCard positions={data.portfolio} currency={data.currency} />
          )}
        </div>
      ) : null}

      {/* ── Analytics — structure, sectors, risks & education ──────────────── */}
      {activeTab === "analytics" ? (
        <div className="space-y-4">
          {/* Полоса распределения — на «Обзоре»; здесь — разбор по разрезам. */}
          <PortfolioBreakdown
            structure={data.structure}
            sectorStructure={data.sectorStructure}
            assetStructure={data.assetStructure}
            riskProfile={data.riskProfile}
          />

          <RebalancePanel positions={data.portfolio} currency={data.currency} />
          <MarketAlertsPanel />

          <section className="grid items-start gap-4 lg:grid-cols-2">
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
        {/* Mounted only while open. The form keeps its state in the component
            itself, and leaving it mounted meant the second security you added
            opened with the first one already chosen — and its quantity still in
            the field. */}
        {addPositionOpen && (
          <PositionDialog
            title={t("inv.addPosition")}
            description={t("inv.addPosition.desc")}
            data={data}
            currency={data.currency}
            owned={ownedSecurities(data)}
            onSubmit={submitPosition}
          />
        )}
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
            owned={ownedSecurities(data)}
            position={editingPosition}
            onSubmit={submitPosition}
          />
        )}
      </Dialog>
    </div>
  );
}
