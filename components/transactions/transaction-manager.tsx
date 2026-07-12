"use client";

import {
  ArrowRightLeft,
  ChevronDown,
  Download,
  Edit2,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Sparkles,
  Split,
  Star,
  Trash2,
  X
} from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import { criteriaFromParams, matchesCriteria } from "@/lib/transactions/filter";
import { isLocalDesktopMode } from "@/lib/platform/env";
import type { AiProvider } from "@/lib/ai/models";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { TransactionsPageData } from "@/lib/data";

type BudgetWarning = { category: string; spent: number; limit: number };
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALL_OPTION,
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
import { cn } from "@/lib/utils";

export function TransactionManager({ data }: { data: TransactionsPageData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const aiSettings = useAiSettings();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const [pageData, setPageData] = useState(data);
  const clientFilters = {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    type: searchParams.get("type") ?? "ALL",
    categoryId: searchParams.get("categoryId") ?? "",
    accountId: searchParams.get("accountId") ?? "",
    q: searchParams.get("q") ?? "",
    minAmount: searchParams.get("minAmount") ?? "",
    maxAmount: searchParams.get("maxAmount") ?? "",
    tag: searchParams.get("tag") ?? "",
    limit: searchParams.get("limit") ?? String(pageData.pagination.limit)
  };
  const criteria = criteriaFromParams(searchParams);
  const { run, pending: isMutating } = useApiMutation();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    TransactionsPageData["transactions"][number] | null
  >(null);
  // Bulk selection: ids of transactions ticked for a batch action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  // Filter panel is collapsed by default (it's tall); the preference persists.
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(FILTERS_OPEN_KEY) === "1") {
        void Promise.resolve().then(() => setFiltersOpen(true));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggleFilters() {
    setFiltersOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(FILTERS_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }
  // Count of active filters (everything except paging + the "all" defaults) for
  // the collapsed-panel badge.
  const activeFilterCount =
    [
      clientFilters.from,
      clientFilters.to,
      clientFilters.q,
      clientFilters.minAmount,
      clientFilters.maxAmount,
      clientFilters.tag,
      clientFilters.accountId,
      clientFilters.type !== "ALL" ? clientFilters.type : ""
    ].filter(Boolean).length + (criteria.categoryIds?.length ? 1 : 0);
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

  const visibleTransactions = pageData.transactions.filter((transaction) =>
    matchesCriteria(transaction, criteria)
  );

  // Reset the batch selection whenever the filter/page changes so a stale tick
  // never targets a row the user can no longer see.
  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIds(new Set()));
  }, [paramsString]);
  const totals = visibleTransactions.reduce(
    (acc, transaction) => {
      if (transaction.type === "INCOME") acc.income += transaction.amount;
      if (transaction.type === "EXPENSE") acc.expense += transaction.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;

  async function refresh() {
    await loadTransactions(true);
    router.refresh();
  }

  // Filters live in the URL. The themed Select submits a sentinel for "all", so
  // we normalize it to "" and drop empties before navigating.
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = normalizeSelectValues(
      Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    );
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, String(value));
    }
    router.push(`/transactions?${params.toString()}`);
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = normalizeSelectValues(
      Object.fromEntries(new FormData(event.currentTarget).entries())
    );

    await run(
      () =>
        method === "POST"
          ? apiClient.post<{ budgetWarning?: BudgetWarning }>("/transactions", payload)
          : apiClient.put<{ budgetWarning?: BudgetWarning }>("/transactions", payload),
      {
        success: method === "POST" ? t("tx.toast.added") : t("tx.toast.updated"),
        error: t("tx.toast.saveError"),
        onSuccess: async (result) => {
          if (method === "POST") setAddOpen(false);
          else setEditingTransaction(null);
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
      }
    );
  }

  async function removeTransaction(id: string) {
    await run(() => apiClient.delete(`/transactions?id=${encodeURIComponent(id)}`), {
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
      let suggestions: { id: string; categoryId: string }[];
      if (isLocalDesktopMode) {
        const apiKey = aiSettings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestBatchCategorization } = await import("@/services/ai/AiAssistantService");
        suggestions = await requestBatchCategorization({
          items,
          categories,
          locale: locale === "en" ? "en" : "ru",
          apiKey,
          model: aiSettings?.aiModel || undefined,
          provider: (aiSettings?.aiProvider as AiProvider) || undefined,
          effort: aiSettings?.aiEffort || undefined
        });
      } else {
        const res = await apiClient.post<{ suggestions: { id: string; categoryId: string }[] }>(
          "/ai/categorize",
          { items, categories, locale }
        );
        suggestions = res.suggestions;
      }

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

  // A split is N normal EXPENSE transactions sharing a generated splitGroupId —
  // each is counted by every existing aggregation, so nothing double-counts.
  async function submitSplit(payload: {
    date: string;
    accountId: string;
    description: string;
    rows: { categoryId: string; amount: string }[];
  }) {
    const splitGroupId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `split-${Date.now()}`;
    setBulkPending(true);
    let created = 0;
    for (const row of payload.rows) {
      try {
        await apiClient.post("/transactions", {
          type: "EXPENSE",
          amount: row.amount,
          categoryId: row.categoryId,
          accountId: payload.accountId,
          date: payload.date,
          description: payload.description,
          splitGroupId
        });
        created += 1;
      } catch {
        /* continue; summary reports how many landed */
      }
    }
    setBulkPending(false);
    setSplitOpen(false);
    toast.success(t("tx.split.created", { count: created }));
    await refresh();
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      action: "transfer",
      ...normalizeSelectValues(Object.fromEntries(new FormData(event.currentTarget).entries()))
    };

    await run(() => apiClient.post("/transactions", payload), {
      success: t("tx.toast.transferCreated"),
      error: t("tx.toast.transferError"),
      onSuccess: async () => {
        setTransferOpen(false);
        await refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={toggleFilters}
            aria-expanded={filtersOpen}
            className="group flex items-center gap-2 text-left"
          >
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <CardTitle>{t("tx.filters")}</CardTitle>
            {activeFilterCount > 0 ? (
              <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                {activeFilterCount}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                filtersOpen && "rotate-180"
              )}
            />
          </button>
          <div className="flex flex-wrap gap-2">
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowRightLeft className="size-4" />
                  {t("tx.transfer")}
                </Button>
              </DialogTrigger>
              <TransferDialog data={pageData} pending={isMutating} onSubmit={submitTransfer} />
            </Dialog>
            <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Split className="size-4" />
                  {t("tx.split")}
                </Button>
              </DialogTrigger>
              <SplitDialog data={pageData} pending={bulkPending} onSubmit={submitSplit} />
            </Dialog>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  {t("tx.add")}
                </Button>
              </DialogTrigger>
              <TransactionDialog
                title={t("tx.new")}
                description={t("tx.new.desc")}
                data={pageData}
                pending={isMutating}
                onSubmit={(event) => submitTransaction(event, "POST")}
                onRefsReload={() => loadTransactions(true)}
              />
            </Dialog>
          </div>
        </CardHeader>
        {filtersOpen ? (
          <CardContent className="space-y-4">
            <SavedFilters currentParams={paramsString} />
            {/* key remounts the uncontrolled filter inputs when the URL params
              change (e.g. arriving from a drill-down link) so the controls
              reflect the active category/account filter. */}
            <form
              key={paramsString}
              onSubmit={applyFilters}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
            >
              <div className="space-y-2 sm:col-span-2 xl:col-span-6">
                <Label htmlFor="q">{t("tx.search")}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="q"
                    name="q"
                    defaultValue={clientFilters.q}
                    placeholder={t("tx.search.placeholder")}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="from">{t("tx.from")}</Label>
                <Input id="from" name="from" type="date" defaultValue={clientFilters.from} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">{t("tx.to")}</Label>
                <Input id="to" name="to" type="date" defaultValue={clientFilters.to} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{t("tx.type")}</Label>
                <Select name="type" defaultValue={clientFilters.type}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("tx.type.all")}</SelectItem>
                    <SelectItem value="INCOME">{t("tx.type.income")}</SelectItem>
                    <SelectItem value="EXPENSE">{t("tx.type.expense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("common.category")}</Label>
                <CategoryMultiSelect
                  categories={pageData.categories}
                  initial={criteria.categoryIds ?? []}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minAmount">{t("tx.minAmount")}</Label>
                <Input
                  id="minAmount"
                  name="minAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={clientFilters.minAmount}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAmount">{t("tx.maxAmount")}</Label>
                <Input
                  id="maxAmount"
                  name="maxAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={clientFilters.maxAmount}
                  placeholder="∞"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tag">{t("tx.tag")}</Label>
                <Input
                  id="tag"
                  name="tag"
                  defaultValue={clientFilters.tag}
                  placeholder={t("tx.tagPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountId">{t("tx.account")}</Label>
                <Select name="accountId" defaultValue={clientFilters.accountId || ALL_OPTION}>
                  <SelectTrigger id="accountId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>{t("tx.allAccounts")}</SelectItem>
                    {pageData.accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="limit">{t("tx.perPage")}</Label>
                <Select name="limit" defaultValue={clientFilters.limit}>
                  <SelectTrigger id="limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 sm:col-span-2 xl:col-span-6">
                <Button type="submit">{t("tx.apply")}</Button>
                <Button asChild variant="outline">
                  <Link href="/transactions">{t("tx.reset")}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/import">
                    <Download className="size-4" />
                    {t("nav.import")}
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        ) : null}
      </Card>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          label={t("tx.sumIncome")}
          value={formatCurrency(totals.income)}
          tone="success"
        />
        <SummaryTile
          label={t("tx.sumExpense")}
          value={formatCurrency(totals.expense)}
          tone="danger"
        />
        <SummaryTile
          label={t("tx.sumNet")}
          value={formatCurrency(net)}
          tone={net >= 0 ? "success" : "danger"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("tx.title")}</CardTitle>
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
                          {category.label}
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
                      <TableHead className="w-28 text-right">{t("common.actions")}</TableHead>
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
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="flex size-5 shrink-0 items-center justify-center rounded-md text-white"
                              style={{ backgroundColor: transaction.category.color }}
                            >
                              <CategoryIcon name={transaction.category.icon} className="size-3" />
                            </span>
                            {transaction.category.label}
                          </span>
                        </TableCell>
                        <TableCell>{transaction.account.label}</TableCell>
                        <TableCell className="max-w-60 text-muted-foreground">
                          <span className="block truncate">{transaction.description ?? "—"}</span>
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
                              ? "text-right font-semibold text-success-foreground"
                              : "text-right font-semibold"
                          }
                        >
                          {transaction.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("common.editAria")}
                              aria-label={t("tx.editAria")}
                              onClick={() => setEditingTransaction(transaction)}
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void removeTransaction(transaction.id);
                              }}
                            >
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
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

              <div className="space-y-3 md:hidden">
                {visibleTransactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]"
                        checked={selectedIds.has(transaction.id)}
                        onChange={() => toggleSelect(transaction.id)}
                        aria-label={t("tx.bulk.selectRow")}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{transaction.category.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(transaction.date)} · {transaction.account.label}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
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
                      </div>
                      <p
                        className={
                          transaction.type === "INCOME"
                            ? "shrink-0 font-semibold text-success-foreground"
                            : "shrink-0 font-semibold"
                        }
                      >
                        {transaction.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTransaction(transaction)}
                      >
                        <Edit2 className="size-4" />
                        {t("common.edit")}
                      </Button>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void removeTransaction(transaction.id);
                        }}
                      >
                        <Button type="submit" variant="outline" size="sm" disabled={isMutating}>
                          <Trash2 className="size-4 text-destructive" />
                          {t("common.delete")}
                        </Button>
                      </form>
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
            onSubmit={(event) => submitTransaction(event, "PUT")}
            onRefsReload={() => loadTransactions(true)}
          />
        )}
      </Dialog>
    </div>
  );
}

// Multi-category filter: toggleable chips that mirror the selection into a
// hidden `categoryId` input (comma-separated) so it submits with the filter form.
// A single `?categoryId=x` (from a drill-down link) still selects that one chip.
function CategoryMultiSelect({
  categories,
  initial
}: {
  categories: { id: string; label: string }[];
  initial: string[];
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>(initial);

  function toggle(categoryId: string) {
    setSelected((prev) =>
      prev.includes(categoryId) ? prev.filter((x) => x !== categoryId) : [...prev, categoryId]
    );
  }

  return (
    <div>
      <input type="hidden" name="categoryId" value={selected.join(",")} />
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
        {categories.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("tx.allCategories")}</span>
        ) : (
          categories.map((category) => {
            const active = selected.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(category.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                )}
              >
                {category.label}
              </button>
            );
          })
        )}
      </div>
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={() => setSelected([])}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {t("tx.clearCategories")}
        </button>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{t("tx.allCategories")}</p>
      )}
    </div>
  );
}

type SavedFilter = { name: string; params: string };
const SAVED_FILTERS_KEY = "tx-saved-filters";
const FILTERS_OPEN_KEY = "tx-filters-open";

// Named filter presets persisted in localStorage. Saving snapshots the currently
// applied URL params; applying navigates to them. No server involved.
function SavedFilters({ currentParams }: { currentParams: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVED_FILTERS_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedFilter[];
      if (Array.isArray(parsed)) void Promise.resolve().then(() => setSaved(parsed));
    } catch {
      /* ignore malformed */
    }
  }, []);

  function persist(next: SavedFilter[]) {
    setSaved(next);
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }

  function confirmSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...saved.filter((f) => f.name !== trimmed), { name: trimmed, params: currentParams }]);
    setName("");
    setNaming(false);
    toast.success(t("tx.saved.savedToast"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("tx.saved.title")}</span>
      {saved.map((filter) => (
        <span
          key={filter.name}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs"
        >
          <button
            type="button"
            className="hover:text-primary"
            onClick={() => router.push(`/transactions?${filter.params}`)}
          >
            {filter.name}
          </button>
          <button
            type="button"
            aria-label={t("common.delete")}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => persist(saved.filter((f) => f.name !== filter.name))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {naming ? (
        <form onSubmit={confirmSave} className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tx.saved.namePlaceholder")}
            className="h-8 w-40"
            autoFocus
          />
          <Button type="submit" size="sm">
            {t("tx.dialog.create")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            {t("tx.dialog.cancel")}
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (!currentParams) {
              toast.info(t("tx.saved.empty"));
              return;
            }
            setNaming(true);
          }}
        >
          <Star className="size-3.5" />
          {t("tx.saved.save")}
        </Button>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p
        className={
          tone === "success"
            ? "mt-2 text-xl font-semibold text-success-foreground"
            : "mt-2 text-xl font-semibold text-destructive"
        }
      >
        {value}
      </p>
    </div>
  );
}

function TransferDialog({
  data,
  pending,
  onSubmit
}: {
  data: TransactionsPageData;
  pending?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const defaultFromAccount = data.accounts[0]?.id ?? "";
  const defaultToAccount =
    data.accounts.find((account) => account.id !== defaultFromAccount)?.id ?? "";

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("tx.transfer.title")}</DialogTitle>
        <DialogDescription>{t("tx.transfer.desc")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.amount")}</Label>
            <Input name="amount" type="number" min="0" step="0.01" required />
          </div>
          <div className="space-y-2">
            <Label>{t("common.date")}</Label>
            <Input name="date" type="date" defaultValue={formatInputDate(new Date())} required />
          </div>
          <div className="space-y-2">
            <Label>{t("tx.transfer.from")}</Label>
            <Select name="fromAccountId" defaultValue={defaultFromAccount} required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("tx.transfer.to")}</Label>
            <Select name="toAccountId" defaultValue={defaultToAccount} required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("tx.col.description")}</Label>
            <Textarea name="description" placeholder={t("tx.transfer.descPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending || data.accounts.length < 2}>
            {pending ? t("tx.transfer.creating") : t("tx.transfer.create")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SplitDialog({
  data,
  pending,
  onSubmit
}: {
  data: TransactionsPageData;
  pending?: boolean;
  onSubmit: (payload: {
    date: string;
    accountId: string;
    description: string;
    rows: { categoryId: string; amount: string }[];
  }) => void;
}) {
  const { t } = useI18n();
  const expenseCategories = useMemo(
    () => data.categories.filter((category) => category.kind === "EXPENSE"),
    [data.categories]
  );
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [date, setDate] = useState(formatInputDate(new Date()));
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<{ categoryId: string; amount: string }[]>([
    { categoryId: expenseCategories[0]?.id ?? "", amount: "" },
    { categoryId: expenseCategories[1]?.id ?? expenseCategories[0]?.id ?? "", amount: "" }
  ]);

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const valid =
    accountId && rows.length >= 2 && rows.every((row) => row.categoryId && Number(row.amount) > 0);

  function updateRow(index: number, patch: Partial<{ categoryId: string; amount: string }>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("tx.split.title")}</DialogTitle>
        <DialogDescription>{t("tx.split.desc")}</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit({ date, accountId, description, rows });
        }}
        className="grid gap-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("tx.account")}</Label>
            <Select value={accountId || undefined} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("tx.col.description")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("tx.split.descPlaceholder")}
            />
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-2">
              <Select
                value={row.categoryId || undefined}
                onValueChange={(value) => updateRow(index, { categoryId: value })}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("common.category")} />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={row.amount}
                onChange={(e) => updateRow(index, { amount: e.target.value })}
                placeholder={t("common.amount")}
                className="w-32"
              />
              {rows.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { categoryId: expenseCategories[0]?.id ?? "", amount: "" }
              ])
            }
          >
            <Plus className="size-4" />
            {t("tx.split.addRow")}
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("tx.split.total")}</span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={pending || !valid}>
            {pending ? t("tx.dialog.saving") : t("tx.split.submit")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
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
            <Input
              id={`${transaction?.id ?? "new"}-amount`}
              name="amount"
              type="number"
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
