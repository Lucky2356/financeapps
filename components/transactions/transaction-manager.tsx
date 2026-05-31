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
import type { TransactionsPageData } from "@/lib/data";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export function TransactionManager({ data }: { data: TransactionsPageData }) {
  const router = useRouter();
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
  const [isMutating, setIsMutating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionsPageData["transactions"][number] | null>(null);
  const loadTransactions = useCallback(async (forceApi = false) => {
    if (!paramsString && !forceApi) {
      setPageData(data);
      return;
    }

    try {
      const nextData = await apiClient.get<TransactionsPageData>(paramsString ? `/transactions?${paramsString}` : "/transactions");
      setPageData(nextData);
    } catch {
      setPageData(data);
    }
  }, [data, paramsString]);

  useEffect(() => {
    let cancelled = false;

    // Always load from the active API client (LocalApiClient on desktop) so the
    // page shows real data and the forms get real account/category options —
    // the server-rendered `data` is an empty placeholder on the static build.
    void (async () => {
      try {
        const nextData = await apiClient.get<TransactionsPageData>(paramsString ? `/transactions?${paramsString}` : "/transactions");
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
    if (clientFilters.categoryId && transaction.category.id !== clientFilters.categoryId) return false;
    if (clientFilters.accountId && transaction.account.id !== clientFilters.accountId) return false;
    if (clientFilters.q) {
      const query = clientFilters.q.toLowerCase();
      const haystack = `${transaction.description ?? ""} ${transaction.account.label} ${transaction.category.label}`.toLowerCase();
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

  async function submitTransaction(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      setIsMutating(true);
      let budgetWarning: { category: string; spent: number; limit: number } | undefined;
      if (method === "POST") {
        const result = await apiClient.post<{ budgetWarning?: typeof budgetWarning }>("/transactions", payload);
        budgetWarning = result?.budgetWarning;
        toast.success("Операция добавлена");
        setAddOpen(false);
      } else {
        const result = await apiClient.put<{ budgetWarning?: typeof budgetWarning }>("/transactions", payload);
        budgetWarning = result?.budgetWarning;
        toast.success("Операция обновлена");
        setEditingTransaction(null);
      }
      if (budgetWarning) {
        toast.warning(
          `Превышен лимит «${budgetWarning.category}»: потрачено ${formatCurrency(budgetWarning.spent)} из ${formatCurrency(budgetWarning.limit)}`
        );
      }
      await loadTransactions(true);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить операцию");
    } finally {
      setIsMutating(false);
    }
  }

  async function removeTransaction(id: string) {
    try {
      setIsMutating(true);
      await apiClient.delete(`/transactions?id=${encodeURIComponent(id)}`);
      toast.success("Операция удалена");
      await loadTransactions(true);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить операцию");
    } finally {
      setIsMutating(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      action: "transfer",
      ...Object.fromEntries(new FormData(event.currentTarget).entries())
    };

    try {
      setIsMutating(true);
      await apiClient.post("/transactions", payload);
      toast.success("Перевод между счетами создан");
      setTransferOpen(false);
      await loadTransactions(true);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать перевод");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Фильтры</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowRightLeft className="size-4" />
                  Перевод
                </Button>
              </DialogTrigger>
              <TransferDialog data={pageData} pending={isMutating} onSubmit={submitTransfer} />
            </Dialog>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  Добавить операцию
                </Button>
              </DialogTrigger>
              <TransactionDialog
                title="Новая операция"
                description="Доход или расход с привязкой к счету и категории."
                data={pageData}
                pending={isMutating}
                onSubmit={(event) => submitTransaction(event, "POST")}
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
              <Label htmlFor="q">Поиск</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="q" name="q" defaultValue={clientFilters.q} placeholder="Описание, счет или категория" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">С</Label>
              <Input id="from" name="from" type="date" defaultValue={clientFilters.from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">По</Label>
              <Input id="to" name="to" type="date" defaultValue={clientFilters.to} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Тип</Label>
              <select id="type" name="type" defaultValue={clientFilters.type} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="ALL">Все</option>
                <option value="INCOME">Доход</option>
                <option value="EXPENSE">Расход</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Категория</Label>
              <select id="categoryId" name="categoryId" defaultValue={clientFilters.categoryId} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Все категории</option>
                {pageData.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Счет</Label>
              <select id="accountId" name="accountId" defaultValue={clientFilters.accountId} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Все счета</option>
                {pageData.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">На странице</Label>
              <select id="limit" name="limit" defaultValue={clientFilters.limit} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-6">
              <Button type="submit">Применить</Button>
              <Button asChild variant="outline">
                <Link href="/transactions">Сбросить</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/import">
                  <Download className="size-4" />
                  Импорт
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryTile label="Доходы в выборке" value={formatCurrency(totals.income)} tone="success" />
        <SummaryTile label="Расходы в выборке" value={formatCurrency(totals.expense)} tone="danger" />
        <SummaryTile label="Итоговый поток" value={formatCurrency(net)} tone={net >= 0 ? "success" : "danger"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Операции</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleTransactions.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Операции не найдены"
              description="Измените фильтры, добавьте операцию вручную или загрузите CSV на странице импорта."
            />
          ) : (
            <>
              <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Счет</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead className="w-28 text-right">Действия</TableHead>
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
                    <TableCell className="max-w-60 truncate text-muted-foreground">{transaction.description ?? "—"}</TableCell>
                    <TableCell className={transaction.type === "INCOME" ? "text-right font-semibold text-success-foreground" : "text-right font-semibold"}>
                      {transaction.type === "INCOME" ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Редактировать"
                          aria-label="Редактировать операцию"
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
                          <Button type="submit" variant="ghost" size="icon" title="Удалить" aria-label="Удалить операцию" disabled={isMutating}>
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
                    <p className="mt-2 text-sm text-muted-foreground">{transaction.description ?? "Без описания"}</p>
                  </div>
                  <p className={transaction.type === "INCOME" ? "shrink-0 font-semibold text-success-foreground" : "shrink-0 font-semibold"}>
                    {transaction.type === "INCOME" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingTransaction(transaction)}>
                    <Edit2 className="size-4" />
                    Изменить
                  </Button>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void removeTransaction(transaction.id);
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm" disabled={isMutating}>
                      <Trash2 className="size-4 text-destructive" />
                      Удалить
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
      <Dialog open={editingTransaction !== null} onOpenChange={(open) => { if (!open) setEditingTransaction(null); }}>
        {editingTransaction && (
          <TransactionDialog
            title="Редактировать операцию"
            description="Изменение пересчитает баланс счета."
            data={pageData}
            transaction={editingTransaction}
            pending={isMutating}
            onSubmit={(event) => submitTransaction(event, "PUT")}
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
      <p className={tone === "success" ? "mt-2 text-xl font-semibold text-success-foreground" : "mt-2 text-xl font-semibold text-destructive"}>{value}</p>
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
  const defaultFromAccount = data.accounts[0]?.id ?? "";
  const defaultToAccount = data.accounts.find((account) => account.id !== defaultFromAccount)?.id ?? "";

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Перевод между счетами</DialogTitle>
        <DialogDescription>
          Создаст две связанные операции: расход со счета списания и доход на счет зачисления.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Сумма</Label>
            <Input name="amount" type="number" min="0" step="0.01" required />
          </div>
          <div className="space-y-2">
            <Label>Дата</Label>
            <Input name="date" type="date" defaultValue={formatInputDate(new Date())} required />
          </div>
          <div className="space-y-2">
            <Label>Списать со счета</Label>
            <select name="fromAccountId" defaultValue={defaultFromAccount} className="h-10 w-full rounded-md border bg-background px-3 text-sm" required>
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Зачислить на счет</Label>
            <select name="toAccountId" defaultValue={defaultToAccount} className="h-10 w-full rounded-md border bg-background px-3 text-sm" required>
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Описание</Label>
            <Textarea name="description" placeholder="Например: перевод в накопления" />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending || data.accounts.length < 2}>
            {pending ? "Создание..." : "Создать перевод"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function TransactionDialog({
  title,
  description,
  data,
  transaction,
  pending,
  onSubmit
}: {
  title: string;
  description: string;
  data: TransactionsPageData;
  transaction?: TransactionsPageData["transactions"][number];
  pending?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const type = transaction?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(type);
  const matchingCategories = useMemo(() => data.categories.filter((category) => category.kind === selectedType), [data.categories, selectedType]);
  const [categoryId, setCategoryId] = useState(transaction?.category.id ?? matchingCategories[0]?.id ?? "");
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId) ? categoryId : matchingCategories[0]?.id ?? "";
  // Auto-categorization: while the user has not manually chosen a category,
  // suggest one from past transactions as they type the description.
  const [manualCategory, setManualCategory] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);

  function changeType(value: "INCOME" | "EXPENSE") {
    const nextCategories = data.categories.filter((category) => category.kind === value);
    setSelectedType(value);
    setCategoryId(nextCategories[0]?.id ?? "");
    setManualCategory(false);
    setAutoSuggested(false);
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${transaction?.id ?? "new"}-amount`}>Сумма</Label>
            <Input id={`${transaction?.id ?? "new"}-amount`} name="amount" type="number" min="0" step="0.01" defaultValue={transaction?.amount ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label>Тип</Label>
            <select name="type" value={selectedType} onChange={(event) => changeType(event.target.value as "INCOME" | "EXPENSE")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            <select name="categoryId" value={effectiveCategoryId} onChange={(event) => pickCategory(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {matchingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            {autoSuggested ? <p className="text-xs text-primary">Категория подобрана по описанию</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Счет</Label>
            <select name="accountId" defaultValue={transaction?.account.id ?? data.accounts[0]?.id} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Дата</Label>
            <Input name="date" type="date" defaultValue={transaction ? formatInputDate(transaction.date) : formatInputDate(new Date())} required />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Описание</Label>
            <Textarea
              name="description"
              defaultValue={transaction?.description ?? ""}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Например, «Пятёрочка продукты» — категория подберётся сама"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>{pending ? "Сохранение..." : transaction ? "Сохранить" : "Добавить"}</Button>
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
      <span>
        Показано {from}-{to} из {total}
      </span>
      <div className="flex gap-2">
        {hasPreviousPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page - 1)}>Назад</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Назад
          </Button>
        )}
        {hasNextPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page + 1)}>Дальше</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Дальше
          </Button>
        )}
      </div>
    </div>
  );
}
