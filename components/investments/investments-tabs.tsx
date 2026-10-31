"use client";

import { HandCoins, LayoutDashboard, PieChart, Store } from "lucide-react";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

// Three plain tabs with icons: Overview (everything that matters at a glance),
// Market (search + watchlist + picker) and Analytics (deeper breakdowns).
// Четыре вкладки — по вопросам, которые задают: «сколько у меня», «сколько
// я на этом заработал», «как устроен портфель», «что купить».
export const TABS = [
  { id: "overview", labelKey: "inv.tab.overview", icon: LayoutDashboard },
  { id: "income", labelKey: "inv.tab.income", icon: HandCoins },
  { id: "analytics", labelKey: "inv.tab.analytics", icon: PieChart },
  { id: "market", labelKey: "inv.tab.market", icon: Store }
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function InvestmentsTabBar({
  activeTab,
  onSelect
}: {
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const { t } = useI18n();
  // Tabs cut the endless scroll: Overview / Market / Analytics. They wrap
  // instead of scrolling sideways, so none is hidden off a phone screen.
  return (
    <div
      data-testid="section-tabs"
      className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex min-w-0 grow basis-[calc(50%-0.125rem)] items-center min-[400px]:basis-[calc(25%-0.1875rem)] justify-center gap-1.5 rounded-md px-1.5 py-2 text-xs font-medium transition-colors",
              "sm:basis-0 sm:gap-2 sm:px-3 sm:text-sm",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
