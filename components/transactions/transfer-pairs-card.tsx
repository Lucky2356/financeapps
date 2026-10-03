"use client";

// «Это перевод?» на экране «Учёт»: пары операций, похожие на перевод между
// своими счетами (lib/transactions/transfer-pairs.ts). Связать — и они перестают
// считаться доходом и тратой; «Нет» — и пара больше не предлагается на этом
// устройстве.

import { ArrowRightLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import type { TransferPair } from "@/lib/transactions/transfer-pairs";
import { cn } from "@/lib/utils";

export const TRANSFER_PAIRS_DISMISSED_KEY = "transfer-pairs-dismissed";
const DISMISSED_LIMIT = 300;

function readDismissed(): string[] {
  try {
    const list: unknown = JSON.parse(readMine(TRANSFER_PAIRS_DISMISSED_KEY) ?? "[]");
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function TransferPairsCard() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, reload } = useApiPageData<{ pairs: TransferPair[] }>(
    { pairs: [] },
    `/transfer-pairs?dismissed=${encodeURIComponent(dismissed.join(","))}`
  );
  const pairs = data.pairs ?? [];
  if (pairs.length === 0) return null;

  function dismiss(key: string) {
    const next = [...dismissed.filter((item) => item !== key), key].slice(-DISMISSED_LIMIT);
    writeMine(TRANSFER_PAIRS_DISMISSED_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  async function link(pair: TransferPair) {
    setBusy(pair.key);
    try {
      await apiClient.post("/transactions", {
        action: "linkTransfer",
        expenseId: pair.expense.id,
        incomeId: pair.income.id
      });
      toast.success(t("tp.linked"));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="transfer-pairs">
      <CardContent className="space-y-3 p-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ArrowRightLeft className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("tp.title", { count: pairs.length })}</span>
            <span className="block text-sm text-muted-foreground">{t("tp.hint")}</span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        {open ? (
          <ul className="stagger divide-y rounded-lg border">
            {pairs.map((pair) => (
              <li
                key={pair.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                data-testid="transfer-pair"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium tabular-nums">
                    {formatCurrency(pair.expense.amount)} · {pair.expense.account.label} →{" "}
                    {pair.income.account.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(pair.expense.date)}
                    {pair.expense.description ? ` · ${pair.expense.description}` : ""}
                    {pair.income.description && pair.income.description !== pair.expense.description
                      ? ` / ${pair.income.description}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === pair.key}
                    onClick={() => void link(pair)}
                    data-testid="transfer-pair-link"
                  >
                    {t("tp.link")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => dismiss(pair.key)}
                    data-testid="transfer-pair-dismiss"
                  >
                    {t("tp.dismiss")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
