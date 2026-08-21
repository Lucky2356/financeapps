"use client";

import { useState } from "react";

import { PortfolioStructureChart } from "@/components/charts/lazy";
import { Card, CardContent } from "@/components/ui/card";
import { CHART_PALETTE } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { ChartDatum } from "@/types/finance";

type Slice = { id: string; titleKey: string; descKey?: string; data: ChartDatum[] };

/**
 * The three ways of cutting a portfolio — by holding, by industry, by kind of
 * asset — as one card with a switch instead of three donuts stacked down the
 * screen.
 *
 * They answer different questions, so none of them could simply go; but they
 * are never compared side by side either, and three charts of eighty percent
 * screen height each pushed everything else below the fold. Switching between
 * them costs one tap and keeps the reading position.
 */
export function PortfolioBreakdown({
  structure,
  sectorStructure,
  assetStructure,
  riskProfile
}: {
  structure: ChartDatum[];
  sectorStructure: ChartDatum[];
  assetStructure: ChartDatum[];
  riskProfile: string;
}) {
  const { t } = useI18n();
  const slices: Slice[] = [
    { id: "holdings", titleKey: "inv.structureTitle", data: structure },
    {
      id: "sectors",
      titleKey: "inv.sectorTitle",
      descKey: "inv.sectorDesc",
      data: sectorStructure
    },
    { id: "assets", titleKey: "inv.assetTitle", descKey: "inv.assetDesc", data: assetStructure }
  ];
  const [active, setActive] = useState(slices[0].id);
  const slice = slices.find((item) => item.id === active) ?? slices[0];
  const items = slice.data.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div
          data-testid="breakdown-switch"
          className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
        >
          {slices.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              aria-pressed={active === item.id}
              className={cn(
                "min-w-0 grow basis-[calc(33.333%-0.167rem)] truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:basis-0 sm:text-sm",
                active === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(item.titleKey)}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("inv.emptyChart")}</p>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]">
            <div className="h-44">
              <PortfolioStructureChart data={slice.data} />
            </div>
            {/* The donut alone never said which slice was which; the list does,
                in the order that matters, and takes the space the second and
                third donuts used to. */}
            <ul className="min-w-0 space-y-1.5 text-sm">
              {items.map((item, index) => (
                <li key={item.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: item.fill ?? CHART_PALETTE[index % CHART_PALETTE.length]
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.name}</span>
                  <span className="num shrink-0 font-medium">{item.value.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {slice.descKey ? t(slice.descKey) : `${t("inv.riskProfileLabel")} ${riskProfile}`}
        </p>
      </CardContent>
    </Card>
  );
}
