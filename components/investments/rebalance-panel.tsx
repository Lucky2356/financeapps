"use client";

import { Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { computeRebalance } from "@/lib/investments/rebalance";
import type { PortfolioRow, TargetAllocation } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Input } from "@/components/ui/input";

// Rebalancing helper: set a target weight per sector and see how much to
// buy/sell to reach it. Targets persist in LocalState.
//
// Раньше в комментарии стояло «только для компьютера», но панель всё равно
// рисовалась на телефоне — четырьмя колонками, из которых последняя содержит
// целое предложение («Купить на 12 300 ₽»). Теперь на узком экране это
// карточки (components/ui/responsive-table.tsx).

/** Цвет действия: покупать — в плюс, продавать — в минус, ровно — молчим. */
function actionTone(delta: number): string {
  if (Math.abs(delta) < 1) return "text-muted-foreground";
  return delta > 0 ? "font-medium text-success" : "font-medium text-destructive";
}

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

  if (positions.length === 0) return null;

  const targetList = sectors
    .map((sector) => ({ id: sector, sector, targetPct: Number(targets[sector] ?? 0) }))
    .filter((target) => target.targetPct > 0);
  const totalTargetPct = targetList.reduce((sum, target) => sum + target.targetPct, 0);
  const { rows } = computeRebalance(
    positions.map((position) => ({ sector: position.sector, currentValue: position.currentValue })),
    targetList
  );
  const actionable = rows.filter((row) => row.targetPct > 0 || row.currentValue > 0);

  /** Что делать с сектором: цепочка проверок названа, а не вложена в тернарники. */
  function actionLabel(delta: number): string {
    if (Math.abs(delta) < 1) return t("inv.reb.balanced");
    if (delta > 0) return t("inv.reb.buy", { amount: formatCurrency(delta, currency) });
    return t("inv.reb.sell", { amount: formatCurrency(Math.abs(delta), currency) });
  }

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
    <CollapsibleCard title={t("inv.reb.title")} icon={Scale} storageKey="inv-rebalance">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("inv.reb.desc")}</p>
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
          <ResponsiveTable
            rows={actionable}
            rowKey={(row) => row.sector}
            columns={[
              { header: t("inv.reb.sector"), primary: true, cell: (row) => row.sector },
              {
                header: t("inv.reb.actual"),
                align: "right",
                cell: (row) => <span className="tabular-nums">{row.actualPct.toFixed(1)}%</span>
              },
              {
                header: t("inv.reb.target"),
                align: "right",
                cell: (row) => <span className="tabular-nums">{row.targetPct.toFixed(0)}%</span>
              },
              {
                header: t("inv.reb.action"),
                align: "right",
                cell: (row) => (
                  <span className={actionTone(row.deltaValue)}>{actionLabel(row.deltaValue)}</span>
                )
              }
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("inv.reb.empty")}</p>
        )}
      </div>
    </CollapsibleCard>
  );
}
