"use client";

import { ArrowRightLeft, Download, Edit2, Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { suggestCategoryId } from "@/lib/category-suggest";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
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
  const { t } = useI18n();
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
    limit: searchParams.get("limit") ?? String(pageData.pagination.limit)
  };
  const { run, pending: isMutating } = useApiMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<
    TransactionsPageData["transactions"][number] | null
  >(null);
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

  const visibleTransactions = pageData.transactions.filter((transaction) => {
    const date = transaction.date.slice(0, 10);
    if (clientFilters.from && date < clientFilters.from) return false;
    if (clientFilters.to && date > clientFilters.to) return false;
    if (clientFilters.type !== "ALL" && transaction.type !== clientFilters.type) return false;
    if (clientFilters.categoryId && transaction.category.id !== clientFilters.categoryId)
      return false;
    if (clientFilters.accountId && transaction.account.id !== clientFilters.accountId) return false;
    if (clientFilters.q) {
      const query = clientFilters.q.toLowerCase();
      const haystack =
        `${transaction.description ?? ""} ${transaction.account.label} ${transaction.category.label}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
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

  async function submitTransaction(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

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

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      action: "transfer",
      ...Object.fromEntries(new FormData(event.currentTarget).entries())
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
          <CardTitle>{t("tx.filters")}</CardTitle>
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
        <CardContent>
          {/* key remounts the uncontrolled filter inputs when the URL params
              change (e.g. arriving from a drill-down link) so the controls
              reflect the active category/account filter. */}
          <form key={paramsString} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
              <select
                id="type"
                name="type"
                defaultValue={clientFilters.type}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="ALL">{t("tx.type.all")}</option>
                <option value="INCOME">{t("tx.type.income")}</option>
                <option value="EXPENSE">{t("tx.type.expense")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">{t("common.category")}</Label>
              <select
                id="categoryId"
                name="categoryId"
                defaultValue={clientFilters.categoryId}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t("tx.allCategories")}</option>
                {pageData.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">{t("tx.account")}</Label>
              <select
                id="accountId"
                name="accountId"
                defaultValue={clientFilters.accountId}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t("tx.allAccounts")}</option>
                {pageData.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">{t("tx.perPage")}</Label>
              <select
                id="limit"
                name="limit"
                defaultValue={clientFilters.limit}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
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
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell className="max-w-60 truncate text-muted-foreground">
                          {transaction.description ?? "—"}
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
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{transaction.category.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(transaction.date)} · {transaction.account.label}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {transaction.description ?? t("tx.noDescription")}
                        </p>
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
            <select
              name="fromAccountId"
              defaultValue={defaultFromAccount}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              required
            >
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("tx.transfer.to")}</Label>
            <select
              name="toAccountId"
              defaultValue={defaultToAccount}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              required
            >
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
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
    if (manualCategory) return;
    const suggestion = suggestCategoryId(value, data.transactions, { type: selectedType });
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
            <select
              value={selectedType}
              onChange={(event) => changeType(event.target.value as "INCOME" | "EXPENSE")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="EXPENSE">{t("tx.type.expense")}</option>
              <option value="INCOME">{t("tx.type.income")}</option>
            </select>
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
                <select
                  value={effectiveCategoryId}
                  onChange={(event) => pickCategory(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {matchingCategories.length === 0 ? (
                    <option value="">{t("tx.dialog.createCategoryFirst")}</option>
                  ) : null}
                  {matchingCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
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
                <select
                  value={newAccountType}
                  onChange={(e) => setNewAccountType(e.target.value)}
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                >
                  {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
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
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {data.accounts.length === 0 ? (
                  <option value="">{t("tx.dialog.createAccountFirst")}</option>
                ) : null}
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
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
