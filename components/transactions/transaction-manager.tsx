"use client";

import { Edit2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
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

  async function submitTransaction(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      if (method === "POST") {
        await apiClient.post("/transactions", payload);
        toast.success("Операция добавлена");
      } else {
        await apiClient.put("/transactions", payload);
        toast.success("Операция обновлена");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить операцию");
    }
  }

  async function removeTransaction(id: string) {
    try {
      await apiClient.delete(`/transactions?id=${encodeURIComponent(id)}`);
      toast.success("Операция удалена");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить операцию");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Фильтры</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Добавить операцию
              </Button>
            </DialogTrigger>
            <TransactionDialog
              title="Новая операция"
              description="Доход или расход с привязкой к счету и категории."
              data={data}
              onSubmit={(event) => submitTransaction(event, "POST")}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="from">С</Label>
              <Input id="from" name="from" type="date" defaultValue={data.filters.from ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">По</Label>
              <Input id="to" name="to" type="date" defaultValue={data.filters.to ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Тип</Label>
              <select id="type" name="type" defaultValue={data.filters.type ?? "ALL"} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="ALL">Все</option>
                <option value="INCOME">Доход</option>
                <option value="EXPENSE">Расход</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Категория</Label>
              <select id="categoryId" name="categoryId" defaultValue={data.filters.categoryId ?? ""} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Все категории</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Счет</Label>
              <select id="accountId" name="accountId" defaultValue={data.filters.accountId ?? ""} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Все счета</option>
                {data.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
              <Button type="submit">Применить</Button>
              <Button asChild variant="outline">
                <Link href="/transactions">Сбросить</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Операции</CardTitle>
        </CardHeader>
        <CardContent>
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
                {data.transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatDate(transaction.date)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: transaction.category.color }} />
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
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Редактировать">
                              <Edit2 className="size-4" />
                            </Button>
                          </DialogTrigger>
                          <TransactionDialog
                            title="Редактировать операцию"
                            description="Изменение пересчитает баланс счета."
                            data={data}
                            transaction={transaction}
                            onSubmit={(event) => submitTransaction(event, "PUT")}
                          />
                        </Dialog>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void removeTransaction(transaction.id);
                          }}
                        >
                          <Button type="submit" variant="ghost" size="icon" title="Удалить">
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
            {data.transactions.map((transaction) => (
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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Edit2 className="size-4" />
                        Изменить
                      </Button>
                    </DialogTrigger>
                    <TransactionDialog
                      title="Редактировать операцию"
                      description="Изменение пересчитает баланс счета."
                      data={data}
                      transaction={transaction}
                      onSubmit={(event) => submitTransaction(event, "PUT")}
                    />
                  </Dialog>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void removeTransaction(transaction.id);
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4 text-destructive" />
                      Удалить
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionDialog({
  title,
  description,
  data,
  transaction,
  onSubmit
}: {
  title: string;
  description: string;
  data: TransactionsPageData;
  transaction?: TransactionsPageData["transactions"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const type = transaction?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(type);
  const matchingCategories = useMemo(() => data.categories.filter((category) => category.kind === selectedType), [data.categories, selectedType]);
  const [categoryId, setCategoryId] = useState(transaction?.category.id ?? matchingCategories[0]?.id ?? "");
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId) ? categoryId : matchingCategories[0]?.id ?? "";

  function changeType(value: "INCOME" | "EXPENSE") {
    const nextCategories = data.categories.filter((category) => category.kind === value);
    setSelectedType(value);
    setCategoryId(nextCategories[0]?.id ?? "");
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
            <select name="categoryId" value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {matchingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
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
            <Textarea name="description" defaultValue={transaction?.description ?? ""} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">{transaction ? "Сохранить" : "Добавить"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
