"use client";

import {
  CalendarClock,
  CheckCircle2,
  Edit2,
  Landmark,
  PiggyBank,
  Plus,
  Power,
  Trash2
} from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { AmountInput } from "@/components/ui/amount-input";
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
import { apiClient } from "@/lib/api/client";
import type { RecurringTransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { useConfirm } from "@/components/ui/confirm-dialog";

const FREQUENCY_VALUES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;

export function RecurringManager({ data }: { data: RecurringTransactionsPageData }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/recurring");
  const { run } = useApiMutation();
  const confirm = useConfirm();
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
    // A template is a standing instruction, not a single record: deleting one
    // silently stops future postings, so it asks first and says which one.
    const template = pageData.recurringTransactions.find((item) => item.id === id);
    const ok = await confirm({
      title: t("rec.delete.title"),
      description: t("rec.delete.desc", {
        name: template?.description?.trim() || (template?.category.label ?? ""),
        amount: template ? formatCurrency(template.amount, pageData.currency) : ""
      }),
      destructive: true,
      confirmLabel: t("common.delete")
    });
    if (!ok) return;
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
    <div className="space-y-4">
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
                              ? "text-right font-semibold text-success"
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
                              onClick={() => void removeTemplate(item.id)}
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
                            ? "shrink-0 font-semibold text-success"
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
                          onClick={() => void removeTemplate(item.id)}
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

      {/* Debts are obligations with a date, so they show up here automatically.
          They are edited on the debts page — this list is read-only on purpose. */}
      {(pageData.debtPayments ?? []).length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("rec.debts.title")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("rec.debts.desc")}</p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/debts">
                <Landmark className="size-4" />
                {t("rec.debts.manage")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {pageData.debtPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{payment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.dueDate)} · {t("recFreq.MONTHLY")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={payment.autoPay ? "border-success/30 text-success" : ""}
                  >
                    {payment.autoPay ? t("rec.debts.auto") : t("rec.debts.manual")}
                  </Badge>
                  {payment.isDue ? (
                    <Badge className="border-warning/30 bg-warning/15 text-warning">
                      {t("rec.status.due")}
                    </Badge>
                  ) : payment.daysUntilNext <= 7 ? (
                    <Badge className="border-info/30 bg-info/12 text-info">
                      {t("rec.status.soon")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("rec.status.scheduled")}</Badge>
                  )}
                  <p className="font-semibold">
                    -{formatCurrency(payment.amount, pageData.currency)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* The mirror image of debts: a savings account with a rate credits money
          on known dates. Read-only here — the rate is set on the accounts page. */}
      {(pageData.interestAccruals ?? []).length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t("rec.interest.title")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("rec.interest.desc")}</p>
              <p className="mt-1 text-sm font-medium">
                {t("rec.interest.year", {
                  total: formatCurrency(
                    pageData.interestAccruals.reduce((sum, item) => sum + item.amount, 0),
                    pageData.currency
                  )
                })}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/accounts">
                <PiggyBank className="size-4" />
                {t("rec.interest.manage")}
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Only the next few accruals: the full year would be a wall of rows. */}
            {pageData.interestAccruals.slice(0, 6).map((accrual) => (
              <div
                key={`${accrual.accountId}-${accrual.date}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{accrual.accountName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(accrual.date)} ·{" "}
                    {t("rec.interest.on", {
                      balance: formatCurrency(accrual.onBalance, pageData.currency)
                    })}
                  </p>
                </div>
                <p className="font-semibold text-success">
                  +{formatCurrency(accrual.amount, pageData.currency)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("rec.load.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium">{t("rec.load.income")}</p>
            <p className="mt-2 text-2xl font-semibold text-success">
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
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
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
      <Badge className="border-warning/30 bg-warning/15 text-warning">{t("rec.status.due")}</Badge>
    );
  }

  if (item.daysUntilNext <= 7) {
    return <Badge className="border-info/30 bg-info/12 text-info">{t("rec.status.soon")}</Badge>;
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
  const budgetByCategory = useMemo(
    () => new Map((data.budgetHints ?? []).map((hint) => [hint.categoryId, hint.amount])),
    [data.budgetHints]
  );
  const initialCategoryId = recurring?.category.id ?? matchingCategories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId)
    ? categoryId
    : (matchingCategories[0]?.id ?? "");
  // The budget for a category already answers "how much per month" — prefill it,
  // but never overwrite a number the user typed themselves.
  const [amount, setAmount] = useState(() =>
    recurring
      ? String(recurring.amount)
      : (budgetByCategory.get(initialCategoryId)?.toString() ?? "")
  );
  const [amountEdited, setAmountEdited] = useState(false);
  const budgetHint = budgetByCategory.get(effectiveCategoryId);

  function applyBudgetAmount(nextCategoryId: string) {
    if (amountEdited) return;
    const hint = budgetByCategory.get(nextCategoryId);
    setAmount(hint === undefined ? "" : String(hint));
  }

  function changeType(value: "INCOME" | "EXPENSE") {
    const nextCategories = data.categories.filter((category) => category.kind === value);
    const nextCategoryId = nextCategories[0]?.id ?? "";
    setSelectedType(value);
    setCategoryId(nextCategoryId);
    applyBudgetAmount(nextCategoryId);
  }

  function changeCategory(value: string) {
    setCategoryId(value);
    applyBudgetAmount(value);
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
            <AmountInput
              name="amount"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onValueChange={(next) => {
                setAmount(next);
                setAmountEdited(true);
              }}
              required
            />
            {budgetHint !== undefined ? (
              <p className="text-xs text-muted-foreground">
                {t("rec.dialog.fromBudget", {
                  amount: formatCurrency(budgetHint, data.currency)
                })}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{t("tx.type")}</Label>
            <Select
              name="type"
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
            <Label>{t("common.category")}</Label>
            <Select
              name="categoryId"
              value={effectiveCategoryId || undefined}
              onValueChange={changeCategory}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matchingCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("common.account")}</Label>
            <Select name="accountId" defaultValue={recurring?.account.id ?? data.accounts[0]?.id}>
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
            <Label>{t("rec.dialog.period")}</Label>
            <Select name="frequency" defaultValue={recurring?.frequency ?? "MONTHLY"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`recFreq.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
