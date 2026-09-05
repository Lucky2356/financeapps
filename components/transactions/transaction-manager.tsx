"use client";

import { Edit2, ReceiptText, Sparkles, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CategoryOptionLabel } from "@/components/category-option";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";
import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import { criteriaFromParams, matchesCriteria } from "@/lib/transactions/filter";
import { TransactionFilterBar } from "@/components/transactions/filter-bar";
import type { AiProvider } from "@/lib/ai/models";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { TransactionsPageData } from "@/lib/data";

type BudgetWarning = { category: string; spent: number; limit: number };
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { isFutureDay } from "@/lib/transactions/date";
import { EmptyState } from "@/components/empty-state";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { countableAmount } from "@/lib/transactions/base-amount";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeSelectValues,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export function TransactionManager({ data }: { data: TransactionsPageData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const aiSettings = useAiSettings();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const [pageData, setPageData] = useState(data);
  const criteria = criteriaFromParams(searchParams);
  const { run, pending: isMutating } = useApiMutation();
  const confirm = useConfirm();
  const [editingTransaction, setEditingTransaction] = useState<
    TransactionsPageData["transactions"][number] | null
  >(null);
  // Bulk selection: ids of transactions ticked for a batch action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const loadTransactions = useCallback(
    async (forceApi = false) => {
      if (!paramsString && !forceApi) {
        setPageData(data);
        return;
      }

      try {
        const nextData = await apiClient.get<TransactionsPageData>(
          paramsString ? `/transactions?${paramsString}` : "/transactions"
        );
        setPageData(nextData);
      } catch {
        setPageData(data);
      }
    },
    [data, paramsString]
  );

  useEffect(() => {
    let cancelled = false;

    // Always load from the active API client (LocalApiClient on desktop) so the
    // page shows real data and the forms get real account/category options —
    // the server-rendered `data` is an empty placeholder on the static build.
    void (async () => {
      try {
        const nextData = await apiClient.get<TransactionsPageData>(
          paramsString ? `/transactions?${paramsString}` : "/transactions"
        );
        if (!cancelled) setPageData(nextData);
      } catch {
        if (!cancelled) setPageData(data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, paramsString]);

  // This screen keeps its own copy of the list (filters live in the URL), so it
  // subscribes to writes itself: an operation added from the quick-add button
  // must appear here without a manual reload.
  useEffect(() => onDataChanged(() => void loadTransactions(true)), [loadTransactions]);

  const visibleTransactions = pageData.transactions.filter((transaction) =>
    matchesCriteria(transaction, criteria)
  );

  // Reset the batch selection whenever the filter/page changes so a stale tick
  // never targets a row the user can no longer see.
  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIds(new Set()));
  }, [paramsString]);
  // A row shows the money as it was actually paid. When the account keeps
  // another currency, what it is worth in the base one follows in brackets —
  // otherwise 100 $ would read as "100 ₽" beside totals that count 9 000.
  const currencyOfAccount = new Map(data.accounts.map((account) => [account.id, account.currency]));
  const rowAmount = (transaction: TransactionsPageData["transactions"][number]) => {
    const currency = currencyOfAccount.get(transaction.account.id) ?? "RUB";
    const own = formatCurrency(transaction.amount, currency);
    if (transaction.baseAmount === undefined) return own;
    return `${own} (${formatCurrency(transaction.baseAmount)})`;
  };

  const totals = visibleTransactions.reduce(
    (acc, transaction) => {
      // A dollar operation contributes what it is worth in the base currency,
      // not its number of dollars.
      if (transaction.type === "INCOME") acc.income += countableAmount(transaction);
      if (transaction.type === "EXPENSE") acc.expense += countableAmount(transaction);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;

  async function refresh() {
    await loadTransactions(true);
    router.refresh();
  }

  // Editing only. Adding one goes through the quick-add dialog the round button
  // opens — this screen no longer carries a second door to the same room.
  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = normalizeSelectValues(
      Object.fromEntries(new FormData(event.currentTarget).entries())
    );

    // Editing the date into the future counts the money out of the balance the
    // same way adding it does, so the same question is asked here.
    const day = String(payload.date ?? "");
    if (
      day &&
      isFutureDay(day) &&
      !(await confirm({
        title: t("tx.future.confirm.title"),
        description: t("tx.future.confirm.desc", { date: formatDate(day) }),
        confirmLabel: t("tx.future.confirm.ok")
      }))
    ) {
      return;
    }

    await run(() => apiClient.put<{ budgetWarning?: BudgetWarning }>("/transactions", payload), {
      success: t("tx.toast.updated"),
      error: t("tx.toast.saveError"),
      onSuccess: async (result) => {
        setEditingTransaction(null);
        if (result?.budgetWarning) {
          toast.warning(
            t("tx.toast.budgetWarning", {
              category: result.budgetWarning.category,
              spent: formatCurrency(result.budgetWarning.spent),
              limit: formatCurrency(result.budgetWarning.limit)
            })
          );
        }
        await refresh();
      }
    });
  }

  // Deleting one operation asks first, exactly as deleting several already did.
  // A mis-tap next to the edit pencil used to wipe a record with no way back —
  // the dialog names the operation so it is clear WHICH one is about to go.
  async function removeTransaction(transaction: TransactionsPageData["transactions"][number]) {
    const ok = await confirm({
      title: t("tx.delete.title"),
      description: t("tx.delete.desc", {
        category: transaction.category.label,
        amount: rowAmount(transaction),
        date: formatDate(transaction.date)
      }),
      destructive: true,
      confirmLabel: t("common.delete")
    });
    if (!ok) return;
    await run(() => apiClient.delete(`/transactions?id=${encodeURIComponent(transaction.id)}`), {
      success: t("tx.toast.deleted"),
      error: t("tx.toast.deleteError"),
      onSuccess: refresh
    });
  }

  // Bulk selection helpers.
  const allVisibleSelected =
    visibleTransactions.length > 0 && visibleTransactions.every((tx) => selectedIds.has(tx.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(() =>
      allVisibleSelected ? new Set() : new Set(visibleTransactions.map((tx) => tx.id))
    );
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // PUT payload mirroring the edit dialog's fields, with an overridden category.
  function updatePayload(
    transaction: TransactionsPageData["transactions"][number],
    categoryId: string
  ) {
    return {
      id: transaction.id,
      amount: String(transaction.amount),
      type: transaction.type,
      date: formatInputDate(transaction.date),
      categoryId,
      accountId: transaction.account.id,
      description: transaction.description ?? ""
    };
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: t("tx.bulk.deleteTitle"),
      description: t("tx.bulk.deleteDesc", { count: ids.length }),
      destructive: true,
      confirmLabel: t("common.delete")
    });
    if (!ok) return;
    setBulkPending(true);
    let done = 0;
    for (const id of ids) {
      try {
        await apiClient.delete(`/transactions?id=${encodeURIComponent(id)}`);
        done += 1;
      } catch {
        /* keep going; summary reports how many succeeded */
      }
    }
    setBulkPending(false);
    clearSelection();
    toast.success(t("tx.bulk.deleted", { count: done }));
    await refresh();
  }

  async function bulkCategorize() {
    const category = pageData.categories.find((item) => item.id === bulkCategory);
    if (!category) return;
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    setBulkPending(true);
    let applied = 0;
    let skipped = 0;
    for (const transaction of targets) {
      // A category is income- or expense-typed; skip mismatches rather than fail.
      if (transaction.type !== category.kind) {
        skipped += 1;
        continue;
      }
      try {
        await apiClient.put("/transactions", updatePayload(transaction, category.id));
        applied += 1;
      } catch {
        skipped += 1;
      }
    }
    setBulkPending(false);
    clearSelection();
    setBulkCategory("");
    toast.success(t("tx.bulk.categorized", { applied, skipped }));
    await refresh();
  }

  async function bulkApplyRules() {
    if (pageData.rules.length === 0) {
      toast.info(t("tx.bulk.noRules"));
      return;
    }
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    setBulkPending(true);
    let applied = 0;
    for (const transaction of targets) {
      const ruled = transaction.description
        ? matchRule(transaction.description, pageData.rules)
        : null;
      if (!ruled || ruled === transaction.category.id) continue;
      const category = pageData.categories.find((item) => item.id === ruled);
      if (!category || category.kind !== transaction.type) continue;
      try {
        await apiClient.put("/transactions", updatePayload(transaction, ruled));
        applied += 1;
      } catch {
        /* continue */
      }
    }
    setBulkPending(false);
    clearSelection();
    toast.success(t("tx.bulk.rulesApplied", { count: applied }));
    await refresh();
  }

  // AI batch categorization over the selected rows: asks the model for a category
  // per selected transaction and applies only the confident, valid suggestions.
  async function bulkAiCategorize() {
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    if (targets.length === 0) return;

    // Descriptions leave the device verbatim, and a description is where the
    // counterparty's name lives — "5к, Ларисе" goes as it is written. The
    // insight features send an aggregate instead (averages, savings rate, top
    // categories) and need no such warning; this one does, and it names the
    // provider rather than saying "the AI".
    const confirmed = await confirm({
      title: t("tx.bulk.aiConfirm.title"),
      description: t("tx.bulk.aiConfirm.desc", {
        count: targets.length,
        provider: aiSettings?.aiProvider || "anthropic"
      }),
      confirmLabel: t("tx.bulk.aiConfirm.ok")
    });
    if (!confirmed) return;

    const items = targets.map((tx) => ({
      id: tx.id,
      description: tx.description ?? "",
      type: tx.type
    }));
    const categories = pageData.categories.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind
    }));

    setBulkPending(true);
    try {
      const apiKey = aiSettings?.aiApiKey ?? "";
      if (!apiKey) {
        toast.error(t("ai.err.noKey"));
        return;
      }
      const { requestBatchCategorization } = await import("@/services/ai/AiAssistantService");
      const suggestions = await requestBatchCategorization({
        items,
        categories,
        locale: locale === "en" ? "en" : "ru",
        apiKey,
        model: aiSettings?.aiModel || undefined,
        provider: (aiSettings?.aiProvider as AiProvider) || undefined,
        effort: aiSettings?.aiEffort || undefined
      });

      const byId = new Map(targets.map((tx) => [tx.id, tx]));
      let applied = 0;
      for (const s of suggestions) {
        const tx = byId.get(s.id);
        if (!tx || tx.category.id === s.categoryId) continue;
        try {
          await apiClient.put("/transactions", updatePayload(tx, s.categoryId));
          applied += 1;
        } catch {
          /* skip */
        }
      }
      clearSelection();
      toast.success(t("tx.bulk.aiCategorized", { applied }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* The filters belong to the list they filter. They used to sit on the
          page between two cards, a strip of controls attached to nothing;
          inside the card they read as its own controls. */}
      <Card>
        <CardHeader className="gap-3">
          {/* Every way of adding something — an operation, a transfer, a split
              receipt — is the round "+" button. What stands here instead are
              the filters that decide which rows are below. */}
          <TransactionFilterBar
            title={<CardTitle>{t("tx.title")}</CardTitle>}
            categories={pageData.categories}
            accounts={pageData.accounts}
            defaultLimit={pageData.pagination.limit}
          />

          {/* The totals belong to the rows below them: they follow the filter,
              unlike the month tiles at the top of the screen. */}
          <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("tx.shown", { count: visibleTransactions.length })}
            </span>
            <span className="text-success">+{formatCurrency(totals.income)}</span>
            <span className="text-destructive">-{formatCurrency(totals.expense)}</span>
            <span
              className={net >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}
            >
              {t("tx.sumNet")}: {formatCurrency(net)}
            </span>
          </p>

          {/* Money that has already left the balance for a day that has not
              arrived. Counted over the whole ledger rather than the rows below:
              the screen opens on the current month, so an operation dated a
              year out is not on the page at all — while the home screen has
              already subtracted it. Deliberate post-dating is a real thing, so
              this states the fact and offers the rows; it does not scold. */}
          {pageData.futureDated.count > 0 ? (
            <p
              data-testid="future-dated-notice"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
            >
              <span>
                {t("tx.future.notice", {
                  count: pageData.futureDated.count,
                  sum: formatCurrency(Math.abs(pageData.futureDated.net))
                })}
              </span>
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-4"
                onClick={() => {
                  const from = new Date();
                  from.setDate(from.getDate() + 1);
                  const iso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
                  router.push(`/transactions?from=${iso}&to=2999-12-31`);
                }}
              >
                {t("tx.future.show")}
              </button>
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {visibleTransactions.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={t("tx.empty.title")}
              description={t("tx.empty.desc")}
            />
          ) : (
            <>
              {selectedIds.size > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                  <span className="text-sm font-medium">
                    {t("tx.bulk.selected", { count: selectedIds.size })}
                  </span>
                  <Select value={bulkCategory || undefined} onValueChange={setBulkCategory}>
                    <SelectTrigger className="h-9 w-52">
                      <SelectValue placeholder={t("tx.bulk.pickCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      {pageData.categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <CategoryOptionLabel
                            label={category.label}
                            color={category.color}
                            icon={category.icon}
                          />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bulkCategory || bulkPending}
                    onClick={() => void bulkCategorize()}
                  >
                    {t("tx.bulk.setCategory")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkPending}
                    onClick={() => void bulkApplyRules()}
                  >
                    {t("tx.bulk.applyRules")}
                  </Button>
                  {aiSettings?.aiEnabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkPending}
                      onClick={() => void bulkAiCategorize()}
                    >
                      <Sparkles className="size-4 text-primary" />
                      {t("tx.bulk.aiCategorize")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkPending}
                    onClick={() => void bulkDelete()}
                  >
                    <Trash2 className="size-4 text-destructive" />
                    {t("common.delete")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    {t("tx.bulk.clear")}
                  </Button>
                </div>
              ) : null}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          className="size-4 accent-[hsl(var(--primary))]"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          aria-label={t("tx.bulk.selectAll")}
                        />
                      </TableHead>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("common.category")}</TableHead>
                      <TableHead>{t("tx.account")}</TableHead>
                      <TableHead>{t("tx.col.description")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                      <TableHead className="w-[4.5rem] text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="size-4 accent-[hsl(var(--primary))]"
                            checked={selectedIds.has(transaction.id)}
                            onChange={() => toggleSelect(transaction.id)}
                            aria-label={t("tx.bulk.selectRow")}
                          />
                        </TableCell>
                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        {/* Long names are cut rather than allowed to push the
                            actions column out of the card: between a phone and
                            a wide window the table had more columns than room. */}
                        <TableCell>
                          <span className="flex max-w-[11rem] items-center gap-2">
                            <span
                              className="flex size-5 shrink-0 items-center justify-center rounded-md text-white"
                              style={{ backgroundColor: transaction.category.color }}
                            >
                              <CategoryIcon name={transaction.category.icon} className="size-3" />
                            </span>
                            <span className="truncate">{transaction.category.label}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-[9rem] truncate">
                            {transaction.account.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block max-w-[12rem] truncate">
                            {transaction.description ?? "—"}
                          </span>
                          {(transaction.tags?.length || transaction.splitGroupId) && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {transaction.splitGroupId ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                  {t("tx.split.badge")}
                                </span>
                              ) : null}
                              {transaction.tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            transaction.type === "INCOME"
                              ? "text-right font-semibold text-success"
                              : "text-right font-semibold"
                          }
                        >
                          {transaction.type === "INCOME" ? "+" : "-"}
                          {rowAmount(transaction)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title={t("common.editAria")}
                              aria-label={t("tx.editAria")}
                              onClick={() => setEditingTransaction(transaction)}
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void removeTransaction(transaction);
                              }}
                            >
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title={t("common.delete")}
                                aria-label={t("tx.deleteAria")}
                                disabled={isMutating}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {visibleTransactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]"
                        checked={selectedIds.has(transaction.id)}
                        onChange={() => toggleSelect(transaction.id)}
                        aria-label={t("tx.bulk.selectRow")}
                      />
                      {/* The body of the row opens the editor — correcting an
                          amount is the most common thing done here, and hunting
                          for a pencil on a phone is a poor way to start it. */}
                      <button
                        type="button"
                        onClick={() => setEditingTransaction(transaction)}
                        aria-label={t("common.edit")}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm font-semibold">{transaction.category.label}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {formatDate(transaction.date)} · {transaction.account.label}
                        </p>
                        <p className="mt-1 truncate text-[13px] text-muted-foreground">
                          {transaction.description ?? t("tx.noDescription")}
                        </p>
                        {(transaction.tags?.length || transaction.splitGroupId) && (
                          <span className="mt-2 flex flex-wrap gap-1">
                            {transaction.splitGroupId ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                {t("tx.split.badge")}
                              </span>
                            ) : null}
                            {transaction.tags?.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                              >
                                #{tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p
                          className={
                            transaction.type === "INCOME"
                              ? "font-semibold text-success"
                              : "font-semibold"
                          }
                        >
                          {transaction.type === "INCOME" ? "+" : "-"}
                          {rowAmount(transaction)}
                        </p>
                        <button
                          type="button"
                          aria-label={t("common.delete")}
                          disabled={isMutating}
                          onClick={() => void removeTransaction(transaction)}
                          className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <TransactionPagination data={pageData} searchParams={searchParams} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Single controlled dialog for editing any transaction */}
      <Dialog
        open={editingTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
      >
        {editingTransaction && (
          <TransactionDialog
            title={t("tx.edit")}
            description={t("tx.edit.desc")}
            data={pageData}
            transaction={editingTransaction}
            pending={isMutating}
            onSubmit={submitTransaction}
            onRefsReload={() => loadTransactions(true)}
          />
        )}
      </Dialog>
    </div>
  );
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: "DEBIT_CARD", labelKey: "tx.acctType.DEBIT_CARD" },
  { value: "CASH", labelKey: "tx.acctType.CASH" },
  { value: "SAVINGS", labelKey: "tx.acctType.SAVINGS" },
  { value: "BROKERAGE", labelKey: "tx.acctType.BROKERAGE" }
];

function TransactionDialog({
  title,
  description,
  data,
  transaction,
  pending,
  onSubmit,
  onRefsReload
}: {
  title: string;
  description: string;
  data: TransactionsPageData;
  transaction?: TransactionsPageData["transactions"][number];
  pending?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefsReload?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const type = transaction?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(type);
  const matchingCategories = useMemo(
    () => data.categories.filter((category) => category.kind === selectedType),
    [data.categories, selectedType]
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.category.id ?? matchingCategories[0]?.id ?? ""
  );
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId)
    ? categoryId
    : (matchingCategories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(transaction?.account.id ?? data.accounts[0]?.id ?? "");
  // Auto-categorization: while the user has not manually chosen a category,
  // suggest one from past transactions as they type the description.
  const [manualCategory, setManualCategory] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);

  // Inline creation of a new category / account without leaving the form.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("DEBIT_CARD");
  const [creating, setCreating] = useState(false);

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    setCreating(true);
    try {
      const created = await apiClient.post<{ id: string }>("/categories", {
        name: newCategoryName.trim(),
        kind: selectedType,
        color: selectedType === "INCOME" ? "#16a34a" : "#64748b",
        isEssential: false,
        isSubscription: false
      });
      await onRefsReload?.();
      setCategoryId(created.id);
      setManualCategory(true);
      setNewCategoryName("");
      setShowNewCategory(false);
      toast.success(t("tx.toast.categoryCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.categoryCreateError"));
    } finally {
      setCreating(false);
    }
  }

  async function createAccount() {
    if (!newAccountName.trim()) return;
    setCreating(true);
    try {
      const created = await apiClient.post<{ id: string }>("/accounts", {
        name: newAccountName.trim(),
        type: newAccountType,
        balance: "0"
      });
      await onRefsReload?.();
      setAccountId(created.id);
      setNewAccountName("");
      setShowNewAccount(false);
      toast.success(t("tx.toast.accountCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.accountCreateError"));
    } finally {
      setCreating(false);
    }
  }

  function changeType(value: "INCOME" | "EXPENSE") {
    const nextCategories = data.categories.filter((category) => category.kind === value);
    setSelectedType(value);
    setCategoryId(nextCategories[0]?.id ?? "");
    setManualCategory(false);
    setAutoSuggested(false);
    setShowNewCategory(false);
  }

  function pickCategory(value: string) {
    setCategoryId(value);
    setManualCategory(true);
    setAutoSuggested(false);
  }

  function onDescriptionChange(value: string) {
    // A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
    // wins even after the user manually picked a (wrong) category.
    const ruled = data.rules.length > 0 ? matchRule(value, data.rules) : null;
    if (ruled && matchingCategories.some((category) => category.id === ruled)) {
      setCategoryId(ruled);
      setAutoSuggested(true);
      return;
    }
    // History heuristic is a softer guess — it only fills in while the user has
    // not chosen a category by hand.
    if (manualCategory) return;
    const suggestion = suggestCategoryId(value, data.transactions, {
      type: selectedType,
      rules: data.rules
    });
    if (suggestion && matchingCategories.some((category) => category.id === suggestion)) {
      setCategoryId(suggestion);
      setAutoSuggested(true);
    } else {
      setAutoSuggested(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}
        {/* Submitted values — kept in hidden inputs so they persist even while an
            inline "create new" form is shown in place of the select. */}
        <input type="hidden" name="categoryId" value={effectiveCategoryId} />
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="type" value={selectedType} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${transaction?.id ?? "new"}-amount`}>{t("common.amount")}</Label>
            <AmountInput
              id={`${transaction?.id ?? "new"}-amount`}
              name="amount"
              min="0"
              step="0.01"
              defaultValue={transaction?.amount ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tx.type")}</Label>
            <Select
              value={selectedType}
              onValueChange={(value) => changeType(value as "INCOME" | "EXPENSE")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{t("tx.type.expense")}</SelectItem>
                <SelectItem value="INCOME">{t("tx.type.income")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("common.category")}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowNewCategory((v) => !v)}
              >
                {showNewCategory ? t("tx.dialog.cancel") : t("tx.dialog.newCategory")}
              </button>
            </div>
            {showNewCategory ? (
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={
                    selectedType === "INCOME"
                      ? t("tx.dialog.catPlaceholderIncome")
                      : t("tx.dialog.catPlaceholderExpense")
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void createCategory()}
                  disabled={creating}
                >
                  {t("tx.dialog.create")}
                </Button>
              </div>
            ) : (
              <>
                <Select
                  value={effectiveCategoryId || undefined}
                  onValueChange={(value) => pickCategory(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("tx.dialog.createCategoryFirst")} />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoSuggested ? (
                  <p className="text-xs text-primary">{t("tx.dialog.autoSuggested")}</p>
                ) : null}
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("tx.account")}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowNewAccount((v) => !v)}
              >
                {showNewAccount ? t("tx.dialog.cancel") : t("tx.dialog.newAccount")}
              </button>
            </div>
            {showNewAccount ? (
              <div className="flex gap-2">
                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder={t("tx.dialog.accountPlaceholder")}
                />
                <Select value={newAccountType} onValueChange={setNewAccountType}>
                  <SelectTrigger className="w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void createAccount()}
                  disabled={creating}
                >
                  {t("tx.dialog.create")}
                </Button>
              </div>
            ) : (
              <Select value={accountId || undefined} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tx.dialog.createAccountFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {data.accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("common.date")}</Label>
            <Input
              name="date"
              type="date"
              defaultValue={
                transaction ? formatInputDate(transaction.date) : formatInputDate(new Date())
              }
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("tx.col.description")}</Label>
            <Textarea
              name="description"
              defaultValue={transaction?.description ?? ""}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={t("tx.dialog.descPlaceholder")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${transaction?.id ?? "new"}-tags`}>{t("tx.dialog.tags")}</Label>
            <Input
              id={`${transaction?.id ?? "new"}-tags`}
              name="tags"
              defaultValue={transaction?.tags?.join(", ") ?? ""}
              placeholder={t("tx.dialog.tagsPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? t("tx.dialog.saving") : transaction ? t("common.save") : t("common.add")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function TransactionPagination({
  data,
  searchParams
}: {
  data: TransactionsPageData;
  searchParams: ReturnType<typeof useSearchParams>;
}) {
  const { t } = useI18n();
  const { page, limit, total, hasPreviousPage, hasNextPage } = data.pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    params.set("limit", String(limit));
    const query = params.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{t("tx.page.showing", { from, to, total })}</span>
      <div className="flex gap-2">
        {hasPreviousPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page - 1)}>{t("tx.page.prev")}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {t("tx.page.prev")}
          </Button>
        )}
        {hasNextPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page + 1)}>{t("tx.page.next")}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {t("tx.page.next")}
          </Button>
        )}
      </div>
    </div>
  );
}
