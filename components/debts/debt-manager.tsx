"use client";

import { CheckCircle2, CreditCard, Edit2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { LiabilitiesPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { EmptyState } from "@/components/empty-state";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activeDebts, settledDebts } from "@/lib/debts/settled";
import {
  Dialog,
  DialogContent,
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
import { Progress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DebtPayoffService } from "@/services/DebtPayoffService";
import { cn } from "@/lib/utils";

const KIND_VALUES = ["CREDIT_CARD", "LOAN", "MORTGAGE", "INSTALLMENT", "OTHER"] as const;

const payoffService = new DebtPayoffService();

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function payoffHint(
  liability: LiabilitiesPageData["liabilities"][number],
  currency: string,
  t: TFn
): string {
  if (liability.balance <= 0) return t("debt.payoff.paid");
  if (liability.minPayment <= 0) return t("debt.payoff.specify");
  const months = payoffService.monthsToPayoff(
    liability.balance,
    liability.interestRate,
    liability.minPayment
  );
  if (months === null) return t("debt.payoff.notCovering");
  const interest = payoffService.totalInterest(
    liability.balance,
    liability.interestRate,
    liability.minPayment
  );
  const interestPart =
    interest && interest > 0
      ? t("debt.payoff.overpay", { amount: formatCurrency(interest, currency) })
      : "";
  return t("debt.payoff.months", { months, interest: interestPart });
}

export function DebtManager({ data }: { data: LiabilitiesPageData }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/debts");
  const { run } = useApiMutation();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LiabilitiesPageData["liabilities"][number] | null>(null);

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await run(
      () =>
        method === "POST" ? apiClient.post("/debts", payload) : apiClient.put("/debts", payload),
      {
        success: method === "POST" ? t("debt.toast.added") : t("debt.toast.updated"),
        error: t("debt.toast.saveError"),
        onSuccess: async () => {
          if (method === "POST") setAddOpen(false);
          else setEditing(null);
          await refresh();
        }
      }
    );
  }

  // One tap on the card marks a debt repaid (or brings it back). Sends the whole
  // record because the endpoint rebuilds the liability from the payload.
  async function toggleSettled(liability: LiabilitiesPageData["liabilities"][number]) {
    const settled = Boolean(liability.settledAt);
    await run(
      () =>
        apiClient.put("/debts", {
          id: liability.id,
          name: liability.name,
          kind: liability.kind,
          balance: String(liability.balance),
          originalAmount: String(liability.originalAmount),
          interestRate: String(liability.interestRate),
          minPayment: String(liability.minPayment),
          ...(liability.dueDay ? { dueDay: String(liability.dueDay) } : {}),
          currency: liability.currency,
          ...(liability.autoPay ? { autoPay: "true" } : {}),
          ...(liability.paymentAccountId ? { paymentAccountId: liability.paymentAccountId } : {}),
          ...(liability.paymentCategoryId
            ? { paymentCategoryId: liability.paymentCategoryId }
            : {}),
          settled: settled ? "false" : "true"
        }),
      {
        success: settled ? t("debt.toast.reopened") : t("debt.toast.settled"),
        error: t("debt.toast.saveError"),
        onSuccess: refresh
      }
    );
  }

  async function remove(id: string, name: string) {
    const confirmed = await confirm({
      title: t("debt.delete.title"),
      description: t("debt.delete.desc", { name }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    await run(() => apiClient.delete(`/debts?id=${encodeURIComponent(id)}`), {
      success: t("debt.toast.deleted"),
      error: t("debt.toast.deleteError"),
      onSuccess: refresh
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("debt.total")}{" "}
          <span className="font-semibold">{formatCurrency(pageData.total, pageData.currency)}</span>
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              {t("debt.add")}
            </Button>
          </DialogTrigger>
          <DebtDialog title={t("debt.new")} onSubmit={(event) => submit(event, "POST")} />
        </Dialog>
      </div>

      {pageData.liabilities.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t("debt.empty.title")}
          description={t("debt.empty.desc")}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t("debt.add")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...activeDebts(pageData.liabilities), ...settledDebts(pageData.liabilities)].map(
            (liability) => (
              <Card key={liability.id} className={cn(Boolean(liability.settledAt) && "opacity-70")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{liability.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {liability.settledAt
                          ? t("debt.settled.badge", { date: liability.settledAt })
                          : t(`debtKind.${liability.kind}`)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={
                          liability.settledAt ? t("debt.settled.undo") : t("debt.settled.mark")
                        }
                        aria-label={
                          liability.settledAt ? t("debt.settled.undo") : t("debt.settled.mark")
                        }
                        onClick={() => void toggleSettled(liability)}
                      >
                        <CheckCircle2
                          className={cn(
                            "size-4",
                            liability.settledAt ? "text-success-foreground" : "opacity-60"
                          )}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("common.editAria")}
                        aria-label={t("debt.edit")}
                        onClick={() => setEditing(liability)}
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("common.delete")}
                        aria-label={t("debt.deleteAria")}
                        onClick={() => void remove(liability.id, liability.name)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {liability.originalAmount > 0 ? <Progress value={liability.progress} /> : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("debt.balance")}</p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(liability.balance, pageData.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("debt.rate")}</p>
                      <p className="text-sm font-semibold">{liability.interestRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("debt.payment")}</p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(liability.minPayment, pageData.currency)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {payoffHint(liability, pageData.currency, t)}
                  </p>
                  {liability.autoPay && !liability.settledAt ? (
                    <p className="mt-1 text-xs text-primary">
                      {liability.lastPaidMonth
                        ? t("debt.autoPay.lastPaid", { month: liability.lastPaidMonth })
                        : t("debt.autoPay.title")}
                    </p>
                  ) : null}
                  {liability.settledAt ? (
                    <p className="mt-1 text-xs text-success-foreground">{t("debt.settled.note")}</p>
                  ) : null}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DebtDialog
            title={t("debt.edit")}
            liability={editing}
            onSubmit={(event) => submit(event, "PUT")}
          />
        )}
      </Dialog>
    </div>
  );
}

function DebtDialog({
  title,
  liability,
  onSubmit
}: {
  title: string;
  liability?: LiabilitiesPageData["liabilities"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  // Auto-payment needs an account to charge and an expense category to file it
  // under; both are loaded lazily (they aren't part of the debts payload).
  const [autoPay, setAutoPay] = useState(liability?.autoPay ?? false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [accountsData, categoriesData] = await Promise.all([
        apiClient
          .get<{ accounts?: Array<{ id: string; name: string }> }>("/accounts")
          .catch(() => null),
        apiClient
          .get<{ categories?: Array<{ id: string; label: string; kind: string }> }>("/categories")
          .catch(() => null)
      ]);
      if (cancelled) return;
      setAccounts(accountsData?.accounts ?? []);
      setCategories(
        (categoriesData?.categories ?? [])
          .filter((category) => category.kind === "EXPENSE")
          .map((category) => ({ id: category.id, label: category.label }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {liability ? <input type="hidden" name="id" value={liability.id} /> : null}
        <div className="space-y-2">
          <Label>{t("common.name")}</Label>
          <Input name="name" defaultValue={liability?.name ?? ""} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.type")}</Label>
            <Select name="kind" defaultValue={liability?.kind ?? "LOAN"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`debtKind.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("debt.dialog.balance")}</Label>
            {/* step="0.01" (not 100): a coarse step makes the browser reject any
                real-world amount that isn't a round hundred ("281285"). */}
            <AmountInput
              name="balance"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={liability?.balance ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debt.dialog.original")}</Label>
            <AmountInput
              name="originalAmount"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={liability?.originalAmount ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debt.dialog.rate")}</Label>
            <Input
              name="interestRate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={liability?.interestRate ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debt.dialog.payment")}</Label>
            <AmountInput
              name="minPayment"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={liability?.minPayment ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("debt.dialog.dueDay")}</Label>
            {/* `max` alone doesn't stop typing (27678890 got in), so clamp on blur. */}
            <Input
              name="dueDay"
              type="number"
              min="1"
              max="31"
              step="1"
              inputMode="numeric"
              defaultValue={liability?.dueDay ?? ""}
              onBlur={(event) => {
                const raw = event.target.value.trim();
                if (!raw) return;
                const clamped = Math.min(31, Math.max(1, Math.round(Number(raw))));
                event.target.value = Number.isFinite(clamped) ? String(clamped) : "";
              }}
            />
          </div>
        </div>

        {/* Marking a debt as repaid keeps it on the screen as history but takes
            it out of every calculation — capital, health score, planning. */}
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            name="settled"
            value="true"
            className="mt-0.5 size-4 rounded border accent-primary"
            defaultChecked={Boolean(liability?.settledAt)}
          />
          <span>
            <span className="block font-medium">{t("debt.settled.title")}</span>
            <span className="block text-xs text-muted-foreground">{t("debt.settled.desc")}</span>
          </span>
        </label>

        {/* Auto-payment (desktop): post the monthly payment on the due day and
            reduce the balance, instead of entering it by hand every month. */}
        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="autoPay"
              value="true"
              className="mt-0.5 size-4 rounded border accent-primary"
              checked={autoPay}
              onChange={(event) => setAutoPay(event.target.checked)}
            />
            <span>
              <span className="block font-medium">{t("debt.autoPay.title")}</span>
              <span className="block text-xs text-muted-foreground">{t("debt.autoPay.desc")}</span>
            </span>
          </label>
          {autoPay ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("debt.autoPay.account")}</Label>
                <Select
                  name="paymentAccountId"
                  defaultValue={liability?.paymentAccountId ?? accounts[0]?.id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("debt.autoPay.category")}</Label>
                <Select
                  name="paymentCategoryId"
                  defaultValue={liability?.paymentCategoryId ?? categories[0]?.id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="submit">{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
