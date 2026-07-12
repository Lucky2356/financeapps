"use client";

import { Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { computeRebalance } from "@/lib/investments/rebalance";
import type { PortfolioRow, TargetAllocation } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Desktop-only rebalancing helper: set a target weight per sector and see how
// much to buy/sell to reach it. Targets persist in LocalState.
export function RebalancePanel({
  positions,
  currency
}: {
  positions: PortfolioRow[];
  currency: string;
}) {
  const { t } = useI18n();
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const sectors = useMemo(
    () => Array.from(new Set(positions.map((position) => position.sector))).sort(),
    [positions]
  );

  useEffect(() => {
    if (!isLocalDesktopMode) return;
    void apiClient
      .get<{ targets: TargetAllocation[] }>("/investments/targets")
      .then((data) => {
        const map: Record<string, string> = {};
        for (const target of data.targets) map[target.sector] = String(target.targetPct);
        setTargets(map);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  if (!isLocalDesktopMode || positions.length === 0) return null;

  const targetList = sectors
    .map((sector) => ({ id: sector, sector, targetPct: Number(targets[sector] ?? 0) }))
    .filter((target) => target.targetPct > 0);
  const totalTargetPct = targetList.reduce((sum, target) => sum + target.targetPct, 0);
  const { rows } = computeRebalance(
    positions.map((position) => ({ sector: position.sector, currentValue: position.currentValue })),
    targetList
  );
  const actionable = rows.filter((row) => row.targetPct > 0 || row.currentValue > 0);

  async function save() {
    try {
      setSaving(true);
      await apiClient.post("/investments/targets", { targets: targetList });
      toast.success(t("inv.reb.saved"));
    } catch {
      toast.error(t("inv.reb.err"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" />
          {t("inv.reb.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("inv.reb.desc")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectors.map((sector) => (
            <div key={sector} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{sector}</span>
              <Input
                type="number"
                min="0"
                max="100"
                value={targets[sector] ?? ""}
                onChange={(event) =>
                  setTargets((prev) => ({ ...prev, [sector]: event.target.value }))
                }
                className="h-9 w-20"
                placeholder="%"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {t("inv.reb.save")}
          </Button>
          <span
            className={
              Math.round(totalTargetPct) === 100
                ? "text-sm text-success"
                : "text-sm text-muted-foreground"
            }
          >
            {t("inv.reb.sum", { pct: totalTargetPct.toFixed(0) })}
          </span>
        </div>

        {targetList.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">{t("inv.reb.sector")}</th>
                  <th className="p-2 text-right">{t("inv.reb.actual")}</th>
                  <th className="p-2 text-right">{t("inv.reb.target")}</th>
                  <th className="p-2 text-right">{t("inv.reb.action")}</th>
                </tr>
              </thead>
              <tbody>
                {actionable.map((row) => (
                  <tr key={row.sector} className="border-t">
                    <td className="p-2 font-medium">{row.sector}</td>
                    <td className="p-2 text-right tabular-nums">{row.actualPct.toFixed(1)}%</td>
                    <td className="p-2 text-right tabular-nums">{row.targetPct.toFixed(0)}%</td>
                    <td
                      className={
                        Math.abs(row.deltaValue) < 1
                          ? "p-2 text-right text-muted-foreground"
                          : row.deltaValue > 0
                            ? "p-2 text-right font-medium text-success"
                            : "p-2 text-right font-medium text-destructive"
                      }
                    >
                      {Math.abs(row.deltaValue) < 1
                        ? t("inv.reb.balanced")
                        : row.deltaValue > 0
                          ? t("inv.reb.buy", { amount: formatCurrency(row.deltaValue, currency) })
                          : t("inv.reb.sell", {
                              amount: formatCurrency(Math.abs(row.deltaValue), currency)
                            })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("inv.reb.empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
