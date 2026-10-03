"use client";

// «Из уведомлений банка»: заплатили — трата ждёт здесь, записать одним
// нажатием. Категорию подбирают правила и прошлые операции; не нашлась —
// откроется окно быстрого добавления с уже вписанной суммой и местом.
// То, что уже записано руками (та же сумма в тот же день), не предлагается.

import { BellRing, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FAMILY_ME_KEY } from "@/components/family/family-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import type { BankSuggestion } from "@/lib/bank/notification-parse";
import {
  alreadyRecorded,
  BANK_EVENT,
  BANK_SUGGESTIONS_KEY,
  parseStored,
  resolveTarget
} from "@/lib/bank/suggestions";
import type { ImportPageData, TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { LAST_ACCOUNT_KEY, readMine, writeMine } from "@/lib/storage/mine";
import { requestQuickAdd } from "@/lib/transactions/quick-add-request";

const SHOWN = 5;

export function BankSuggestionsCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<BankSuggestion[]>([]);
  const [ledger, setLedger] = useState<TransactionsPageData | null>(null);
  const [refs, setRefs] = useState<ImportPageData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const stored = parseStored(readMine(BANK_SUGGESTIONS_KEY));
    setItems(stored);
    if (stored.length === 0) return;
    const since = formatInputDate(new Date(Date.now() - 16 * 86_400_000));
    const [recent, references] = await Promise.all([
      apiClient
        .get<TransactionsPageData>(`/transactions?from=${since}&limit=all`)
        .catch(() => null),
      apiClient.get<ImportPageData>("/import").catch(() => null)
    ]);
    setLedger(recent);
    setRefs(references);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const onChange = () => void load();
    window.addEventListener(BANK_EVENT, onChange);
    // Записали ту же трату руками или с другого устройства — предложение уходит.
    const stop = onDataChanged(onChange);
    return () => {
      window.removeEventListener(BANK_EVENT, onChange);
      stop();
    };
  }, [load]);

  function forget(id: string) {
    const next = parseStored(readMine(BANK_SUGGESTIONS_KEY)).filter((item) => item.id !== id);
    writeMine(BANK_SUGGESTIONS_KEY, JSON.stringify(next));
    setItems(next);
  }

  const pending = items.filter(
    (item) =>
      !alreadyRecorded(
        item,
        (ledger?.transactions ?? []).map((row) => ({
          amount: row.amount,
          date: row.date,
          type: row.type
        }))
      )
  );
  if (pending.length === 0) return null;

  const money = (value: number) => formatCurrency(value, currency);
  const when = (item: BankSuggestion) =>
    new Date(item.at).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });

  function target(item: BankSuggestion) {
    return resolveTarget(item, {
      accounts: (refs?.accounts ?? []) as Array<{ id: string; name: string; isArchived?: boolean }>,
      categories: refs?.categories ?? [],
      rules: ledger?.rules ?? [],
      history: (ledger?.transactions ?? []).map((row) => ({
        description: row.description,
        type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
        category: { id: row.category.id }
      })),
      lastAccount: readMine(LAST_ACCOUNT_KEY)
    });
  }

  function edit(item: BankSuggestion) {
    const { accountId, categoryId } = target(item);
    forget(item.id);
    requestQuickAdd({
      type: item.type,
      prefill: {
        amount: item.amount,
        description: item.merchant,
        date: item.date,
        accountId,
        categoryId
      }
    });
  }

  async function record(item: BankSuggestion) {
    const { accountId, categoryId } = target(item);
    if (!accountId || !categoryId) return edit(item);
    setBusy(item.id);
    try {
      const created = await apiClient.post<{ id: string }>("/transactions", {
        type: item.type,
        accountId,
        categoryId,
        amount: String(item.amount),
        date: item.date,
        description: item.merchant,
        memberId: readMine(FAMILY_ME_KEY) ?? undefined
      });
      writeMine(LAST_ACCOUNT_KEY, accountId);
      forget(item.id);
      const category = refs?.categories.find((entry) => entry.id === categoryId)?.label ?? "";
      toast.success(t("bank.recorded", { amount: money(item.amount), category }), {
        action: {
          label: t("fav.undo"),
          onClick: () =>
            void apiClient
              .delete(`/transactions?id=${encodeURIComponent(created.id)}`)
              .then(() => toast.success(t("fav.undone")))
              .catch(() => undefined)
        }
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="bank-suggestions">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4" />
          {t("bank.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y rounded-lg border">
          {pending.slice(0, SHOWN).map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
              data-testid="bank-suggestion"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {item.merchant || (item.type === "INCOME" ? t("bank.income") : t("bank.expense"))}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={item.source}>
                  {when(item)} · {item.app}
                </p>
              </div>
              <span
                className={
                  item.type === "INCOME"
                    ? "font-semibold tabular-nums text-success"
                    : "font-semibold tabular-nums"
                }
              >
                {item.type === "INCOME" ? "+" : "−"}
                {money(item.amount)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === item.id}
                  onClick={() => void record(item)}
                  data-testid="bank-record"
                >
                  {t("bank.record")}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("bank.edit")}
                  onClick={() => edit(item)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("bank.dismiss")}
                  onClick={() => forget(item.id)}
                  data-testid="bank-dismiss"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {pending.length > SHOWN ? (
          <p className="text-xs text-muted-foreground">
            {t("bank.more", { count: pending.length - SHOWN })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
