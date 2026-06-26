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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { RecurringTransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";

const FREQUENCY_VALUES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;

export function RecurringManager({ data }: { data: RecurringTransactionsPageData }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/recurring");
  const { run } = useApiMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<
    RecurringTransactionsPageData["recurringTransactions"][number] | null
  >(null);

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    await run(
      () =>
        method === "POST"
          ? apiClient.post("/recurring", payload)
          : apiClient.put("/recurring", payload),
      {
        success: method === "POST" ? t("rec.toast.created") : t("rec.toast.updated"),
        error: t("rec.toast.saveError"),
        onSuccess: async () => {
          if (method === "POST") setAddOpen(false);
          else setEditingRecurring(null);
          await refresh();
        }
      }
    );
  }

  async function removeTemplate(id: string) {
    await run(() => apiClient.delete(`/recurring?id=${encodeURIComponent(id)}`), {
      success: t("rec.toast.deleted"),
      error: t("rec.toast.deleteError"),
      onSuccess: refresh
    });
  }

  async function materializeTemplate(id: string) {
    await run(
      () =>
        apiClient.post<{ created: number; nextDate: string }, { id: string }>(
          "/recurring/materialize",
          { id }
        ),
      {
        error: t("rec.toast.materializeError"),
        onSuccess: async (result) => {
          toast.success(
            result.created > 0
              ? t("rec.toast.materialized", { count: result.created })
              : t("rec.toast.noneDue")
          );
          await refresh();
        }
      }
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryTile label={t("rec.summary.active")} value={String(pageData.summary.activeCount)} />
        <SummaryTile
          label={t("rec.summary.dueToday")}
          value={String(pageData.summary.dueCount)}
          tone={pageData.summary.dueCount > 0 ? "warning" : "default"}
        />
        <SummaryTile
          label={t("rec.summary.next7")}
          value={formatCurrency(pageData.summary.nextSevenDaysAmount, pageData.currency)}
        />
        <SummaryTile
          label={t("rec.summary.monthlyFlow")}
          value={formatCurrency(
            pageData.summary.monthlyPlannedIncome - pageData.summary.monthlyPlannedExpense,
            pageData.currency
          )}
          tone={
            pageData.summary.monthlyPlannedIncome >= pageData.summary.monthlyPlannedExpense
              ? "success"
              : "danger"
          }
        />
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("rec.title")}</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("rec.add")}
              </Button>
            </DialogTrigger>
            <RecurringDialog
              title={t("rec.new")}
              description={t("rec.new.desc")}
              data={pageData}
              onSubmit={(event) => submitTemplate(event, "POST")}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {pageData.recurringTransactions.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t("rec.empty.title")}
              description={t("rec.empty.desc")}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("rec.col.nextDate")}</TableHead>
                      <TableHead>{t("rec.col.template")}</TableHead>
                      <TableHead>{t("rec.col.period")}</TableHead>
                      <TableHead>{t("common.account")}</TableHead>
                      <TableHead>{t("rec.col.status")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                      <TableHead className="w-36 text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.recurringTransactions.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.nextDate)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: item.category.color }}
                            />
                            <span>
                              <span className="block font-medium">{item.category.label}</span>
                              <span className="block max-w-60 truncate text-xs text-muted-foreground">
                                {item.description ?? t("tx.noDescription")}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>{t(`recFreq.${item.frequency}`)}</TableCell>
                        <TableCell>{item.account.label}</TableCell>
                        <TableCell>
                          <StatusBadge item={item} />
                        </TableCell>
                        <TableCell
                          className={
                            item.type === "INCOME"
                              ? "text-right font-semibold text-success-foreground"
                              : "text-right font-semibold"
                          }
                        >
                          {item.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(item.amount, pageData.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title={t("rec.materializeAria")}
                              aria-label={t("rec.materializeAria")}
                              disabled={!item.isDue}
                              onClick={() => materializeTemplate(item.id)}
                            >
                              <CheckCircle2 className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("common.editAria")}
                              aria-label={t("rec.editAria")}
                              onClick={() => setEditingRecurring(item)}
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title={t("common.delete")}
                              aria-label={t("rec.deleteAria")}
                              onClick={() => removeTemplate(item.id)}
                            >
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
                {pageData.recurringTransactions.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-card p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.category.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(item.nextDate)} · {t(`recFreq.${item.frequency}`)} ·{" "}
                          {item.account.label}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.description ?? t("tx.noDescription")}
                        </p>
                      </div>
                      <p
                        className={
                          item.type === "INCOME"
                            ? "shrink-0 font-semibold text-success-foreground"
                            : "shrink-0 font-semibold"
                        }
                      >
                        {item.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(item.amount, pageData.currency)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusBadge item={item} />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!item.isDue}
                          onClick={() => materializeTemplate(item.id)}
                        >
                          <CheckCircle2 className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingRecurring(item)}
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeTemplate(item.id)}
                        >
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

      {/* Single controlled dialog for editing any template */}
      <Dialog
        open={editingRecurring !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRecurring(null);
        }}
      >
        {editingRecurring && (
          <RecurringDialog
            title={t("rec.edit")}
            description={t("rec.edit.desc")}
            data={pageData}
            recurring={editingRecurring}
            onSubmit={(event) => submitTemplate(event, "PUT")}
          />
        )}
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("rec.load.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium">{t("rec.load.income")}</p>
            <p className="mt-2 text-2xl font-semibold text-success-foreground">
              {formatCurrency(pageData.summary.monthlyPlannedIncome, pageData.currency)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium">{t("rec.load.expense")}</p>
            <p className="mt-2 text-2xl font-semibold text-destructive">
              {formatCurrency(pageData.summary.monthlyPlannedExpense, pageData.currency)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
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

function StatusBadge({
  item
}: {
  item: RecurringTransactionsPageData["recurringTransactions"][number];
}) {
  const { t } = useI18n();
  if (!item.isActive) {
    return (
      <Badge variant="outline" className="gap-1">
        <Power className="size-3" />
        {t("rec.status.off")}
      </Badge>
    );
  }

  if (item.isDue) {
    return (
      <Badge className="border-warning/30 bg-warning/15 text-warning-foreground">
        {t("rec.status.due")}
      </Badge>
    );
  }

  if (item.daysUntilNext <= 7) {
    return (
      <Badge className="border-info/30 bg-info/12 text-info-foreground">
        {t("rec.status.soon")}
      </Badge>
    );
  }

  return <Badge variant="outline">{t("rec.status.scheduled")}</Badge>;
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
  const { t } = useI18n();
  const initialType = recurring?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(initialType);
  const matchingCategories = useMemo(
    () => data.categories.filter((category) => category.kind === selectedType),
    [data.categories, selectedType]
  );
  const [categoryId, setCategoryId] = useState(
    recurring?.category.id ?? matchingCategories[0]?.id ?? ""
  );
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId)
    ? categoryId
    : (matchingCategories[0]?.id ?? "");

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
            <Label>{t("common.amount")}</Label>
            <Input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={recurring?.amount ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tx.type")}</Label>
            <select
              name="type"
              value={selectedType}
              onChange={(event) => changeType(event.target.value as "INCOME" | "EXPENSE")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="EXPENSE">{t("tx.type.expense")}</option>
              <option value="INCOME">{t("tx.type.income")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("common.category")}</Label>
            <select
              name="categoryId"
              value={effectiveCategoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {matchingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("common.account")}</Label>
            <select
              name="accountId"
              defaultValue={recurring?.account.id ?? data.accounts[0]?.id}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("rec.dialog.period")}</Label>
            <select
              name="frequency"
              defaultValue={recurring?.frequency ?? "MONTHLY"}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {FREQUENCY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`recFreq.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("rec.dialog.nextDate")}</Label>
            <Input
              name="nextDate"
              type="date"
              defaultValue={
                recurring ? formatInputDate(recurring.nextDate) : formatInputDate(new Date())
              }
              required
            />
          </div>
          <label className="flex items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={recurring?.isActive ?? true}
              value="true"
              className="size-4"
            />
            {t("rec.dialog.active")}
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("tx.col.description")}</Label>
            <Textarea name="description" defaultValue={recurring?.description ?? ""} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">{recurring ? t("common.save") : t("common.add")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
