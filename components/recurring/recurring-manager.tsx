"use client";

import { CalendarClock, CheckCircle2, Edit2, Plus, Power, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { RECURRENCE_FREQUENCY_LABELS } from "@/lib/constants";
import { apiClient } from "@/lib/api/client";
import type { RecurringTransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";

export function RecurringManager({ data }: { data: RecurringTransactionsPageData }) {
  const router = useRouter();

  async function submitTemplate(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      if (method === "POST") {
        await apiClient.post("/recurring", payload);
        toast.success("Плановый платеж добавлен");
      } else {
        await apiClient.put("/recurring", payload);
        toast.success("Плановый платеж обновлен");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить шаблон");
    }
  }

  async function removeTemplate(id: string) {
    try {
      await apiClient.delete(`/recurring?id=${encodeURIComponent(id)}`);
      toast.success("Шаблон удален");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить шаблон");
    }
  }

  async function materializeTemplate(id: string) {
    try {
      const result = await apiClient.post<{ created: number; nextDate: string }, { id: string }>("/recurring/materialize", { id });
      toast.success(result.created > 0 ? `Создано операций: ${result.created}` : "Нет наступивших платежей");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать операции");
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryTile label="Активные шаблоны" value={String(data.summary.activeCount)} />
        <SummaryTile label="К созданию сегодня" value={String(data.summary.dueCount)} tone={data.summary.dueCount > 0 ? "warning" : "default"} />
        <SummaryTile label="Ближайшие 7 дней" value={formatCurrency(data.summary.nextSevenDaysAmount, data.currency)} />
        <SummaryTile
          label="Плановый поток / мес."
          value={formatCurrency(data.summary.monthlyPlannedIncome - data.summary.monthlyPlannedExpense, data.currency)}
          tone={data.summary.monthlyPlannedIncome >= data.summary.monthlyPlannedExpense ? "success" : "danger"}
        />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Плановые операции</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Добавить шаблон
              </Button>
            </DialogTrigger>
            <RecurringDialog
              title="Новый шаблон"
              description="Для зарплаты, аренды, подписок, ЖКХ и других повторяющихся операций."
              data={data}
              onSubmit={(event) => submitTemplate(event, "POST")}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {data.recurringTransactions.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Плановых операций пока нет"
              description="Добавьте повторяющиеся доходы и расходы, чтобы видеть будущую нагрузку заранее."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Следующая дата</TableHead>
                      <TableHead>Шаблон</TableHead>
                      <TableHead>Период</TableHead>
                      <TableHead>Счет</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead className="w-36 text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recurringTransactions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.nextDate)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: item.category.color }} />
                            <span>
                              <span className="block font-medium">{item.category.label}</span>
                              <span className="block max-w-60 truncate text-xs text-muted-foreground">{item.description ?? "Без описания"}</span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>{RECURRENCE_FREQUENCY_LABELS[item.frequency]}</TableCell>
                        <TableCell>{item.account.label}</TableCell>
                        <TableCell>
                          <StatusBadge item={item} />
                        </TableCell>
                        <TableCell className={item.type === "INCOME" ? "text-right font-semibold text-success-foreground" : "text-right font-semibold"}>
                          {item.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(item.amount, data.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Создать наступившие операции"
                              disabled={!item.isDue}
                              onClick={() => materializeTemplate(item.id)}
                            >
                              <CheckCircle2 className="size-4" />
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="Редактировать">
                                  <Edit2 className="size-4" />
                                </Button>
                              </DialogTrigger>
                              <RecurringDialog
                                title="Редактировать шаблон"
                                description="Изменения применятся к будущим операциям."
                                data={data}
                                recurring={item}
                                onSubmit={(event) => submitTemplate(event, "PUT")}
                              />
                            </Dialog>
                            <Button type="button" variant="ghost" size="icon" title="Удалить" onClick={() => removeTemplate(item.id)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {data.recurringTransactions.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-card p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.category.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(item.nextDate)} · {RECURRENCE_FREQUENCY_LABELS[item.frequency]} · {item.account.label}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{item.description ?? "Без описания"}</p>
                      </div>
                      <p className={item.type === "INCOME" ? "shrink-0 font-semibold text-success-foreground" : "shrink-0 font-semibold"}>
                        {item.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(item.amount, data.currency)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusBadge item={item} />
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={!item.isDue} onClick={() => materializeTemplate(item.id)}>
                          <CheckCircle2 className="size-4" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Edit2 className="size-4" />
                            </Button>
                          </DialogTrigger>
                          <RecurringDialog
                            title="Редактировать шаблон"
                            description="Изменения применятся к будущим операциям."
                            data={data}
                            recurring={item}
                            onSubmit={(event) => submitTemplate(event, "PUT")}
                          />
                        </Dialog>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeTemplate(item.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Плановая нагрузка</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium">Плановые доходы в месяц</p>
            <p className="mt-2 text-2xl font-semibold text-success-foreground">{formatCurrency(data.summary.monthlyPlannedIncome, data.currency)}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium">Плановые расходы в месяц</p>
            <p className="mt-2 text-2xl font-semibold text-destructive">{formatCurrency(data.summary.monthlyPlannedExpense, data.currency)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const color =
    tone === "success"
      ? "text-success-foreground"
      : tone === "warning"
        ? "text-warning-foreground"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ item }: { item: RecurringTransactionsPageData["recurringTransactions"][number] }) {
  if (!item.isActive) {
    return (
      <Badge variant="outline" className="gap-1">
        <Power className="size-3" />
        Отключен
      </Badge>
    );
  }

  if (item.isDue) {
    return <Badge className="border-warning/30 bg-warning/15 text-warning-foreground">Нужно создать</Badge>;
  }

  if (item.daysUntilNext <= 7) {
    return <Badge className="border-info/30 bg-info/12 text-info-foreground">Скоро</Badge>;
  }

  return <Badge variant="outline">Запланирован</Badge>;
}

function RecurringDialog({
  title,
  description,
  data,
  recurring,
  onSubmit
}: {
  title: string;
  description: string;
  data: RecurringTransactionsPageData;
  recurring?: RecurringTransactionsPageData["recurringTransactions"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initialType = recurring?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(initialType);
  const matchingCategories = useMemo(() => data.categories.filter((category) => category.kind === selectedType), [data.categories, selectedType]);
  const [categoryId, setCategoryId] = useState(recurring?.category.id ?? matchingCategories[0]?.id ?? "");
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
        {recurring ? <input type="hidden" name="id" value={recurring.id} /> : null}
        <input type="hidden" name="isActive" value="false" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Сумма</Label>
            <Input name="amount" type="number" min="0" step="0.01" defaultValue={recurring?.amount ?? ""} required />
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
            <select name="accountId" defaultValue={recurring?.account.id ?? data.accounts[0]?.id} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Период</Label>
            <select name="frequency" defaultValue={recurring?.frequency ?? "MONTHLY"} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {Object.entries(RECURRENCE_FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Следующая дата</Label>
            <Input name="nextDate" type="date" defaultValue={recurring ? formatInputDate(recurring.nextDate) : formatInputDate(new Date())} required />
          </div>
          <label className="flex items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2">
            <input name="isActive" type="checkbox" defaultChecked={recurring?.isActive ?? true} value="true" className="size-4" />
            Активный шаблон
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label>Описание</Label>
            <Textarea name="description" defaultValue={recurring?.description ?? ""} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">{recurring ? "Сохранить" : "Добавить"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
