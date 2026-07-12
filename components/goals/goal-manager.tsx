"use client";

import { Edit2, Flag, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, GoalsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { describeGoalPace } from "@/lib/goal-pace";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { AiGoalPlanButton } from "@/components/ai/ai-goal-plan-button";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export function GoalManager({ data }: { data: GoalsPageData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/goals");
  const { run } = useApiMutation();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalsPageData["goals"][number] | null>(null);

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    // "none" is the sentinel for an unlinked goal (empty Select value).
    if (payload.linkedAccountId === "none") payload.linkedAccountId = "";

    await run(
      () =>
        method === "POST" ? apiClient.post("/goals", payload) : apiClient.put("/goals", payload),
      {
        success: method === "POST" ? t("goal.toast.added") : t("goal.toast.updated"),
        error: t("goal.toast.saveError"),
        onSuccess: async () => {
          if (method === "POST") setAddOpen(false);
          else setEditingGoal(null);
          await refresh();
        }
      }
    );
  }

  async function removeGoal(id: string, title: string) {
    const confirmed = await confirm({
      title: t("goal.delete.title"),
      description: t("goal.delete.desc", { title }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    await run(() => apiClient.delete(`/goals?id=${encodeURIComponent(id)}`), {
      success: t("goal.toast.deleted"),
      error: t("goal.toast.deleteError"),
      onSuccess: refresh
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              {t("goal.add")}
            </Button>
          </DialogTrigger>
          <GoalDialog title={t("goal.new")} onSubmit={(event) => submitGoal(event, "POST")} />
        </Dialog>
      </div>

      {pageData.goals.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={t("goal.empty.title")}
          description={t("goal.empty.desc")}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t("goal.empty.cta")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pageData.goals.map((goal) => {
            const pace = describeGoalPace(goal, new Date(), locale);
            return (
              <Card key={goal.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{goal.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("goal.deadline", { date: formatDate(goal.deadline) })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <AiGoalPlanButton goal={goal} currency={pageData.currency} />
                      <DepositDialog
                        goal={goal}
                        currency={pageData.currency}
                        onSuccess={async () => {
                          await reload();
                          router.refresh();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("common.editAria")}
                        aria-label={t("goal.edit")}
                        onClick={() => setEditingGoal(goal)}
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void removeGoal(goal.id, goal.title);
                        }}
                      >
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          title={t("common.delete")}
                          aria-label={t("goal.deleteAria")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </form>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={goal.progress} />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("goal.saved")}</p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(goal.currentAmount, pageData.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("goal.target")}</p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(goal.targetAmount, pageData.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("goal.perMonth")}</p>
                      <p className="text-sm font-semibold">
                        {pace.isComplete
                          ? "—"
                          : formatCurrency(goal.monthlyContribution, pageData.currency)}
                      </p>
                      <p
                        className={
                          pace.isOverdue
                            ? "text-xs text-destructive"
                            : pace.isComplete
                              ? "text-xs text-success-foreground"
                              : "text-xs text-muted-foreground"
                        }
                      >
                        {pace.hint}
                      </p>
                      {goal.plannedContribution ? (
                        <p className="mt-1 text-xs text-primary">
                          {t("goal.plannedLine", {
                            amount: formatCurrency(goal.plannedContribution, pageData.currency)
                          })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Single controlled dialog for editing any goal */}
      <Dialog
        open={editingGoal !== null}
        onOpenChange={(open) => {
          if (!open) setEditingGoal(null);
        }}
      >
        {editingGoal && (
          <GoalDialog
            title={t("goal.edit")}
            goal={editingGoal}
            onSubmit={(event) => submitGoal(event, "PUT")}
          />
        )}
      </Dialog>
    </div>
  );
}

function DepositDialog({
  goal,
  currency,
  onSuccess
}: {
  goal: GoalsPageData["goals"][number];
  currency: string;
  onSuccess: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  const [accountId, setAccountId] = useState("");

  const remaining = goal.targetAmount - goal.currentAmount;

  // Load real accounts when the dialog opens so the deposit can be debited
  // from one of them (keeping balances and goal progress in sync).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void apiClient
      .get<AccountsPageData>("/accounts")
      .then((data) => {
        if (cancelled) return;
        // The /accounts endpoint already excludes archived accounts.
        setAccounts(data.accounts);
        setAccountId((current) => current || data.accounts[0]?.id || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const depositAmount = Number(amount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      toast.error(t("goal.deposit.enterAmount"));
      return;
    }
    if (!accountId) {
      toast.error(t("goal.deposit.selectAccount"));
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/goals", {
        action: "deposit",
        goalId: goal.id,
        amount: String(depositAmount),
        accountId
      });
      toast.success(t("goal.deposit.success"));
      setOpen(false);
      setAmount("");
      await onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("goal.deposit.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title={t("goal.deposit.tooltip")}
          aria-label={t("goal.deposit.aria")}
        >
          <PiggyBank className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("goal.deposit.title", { title: goal.title })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("goal.deposit.progress", {
            current: formatCurrency(goal.currentAmount, currency),
            target: formatCurrency(goal.targetAmount, currency)
          })}
        </p>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label>{t("goal.deposit.amount")}</Label>
            <Input
              type="number"
              min="1"
              max={remaining > 0 ? remaining : undefined}
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("goal.deposit.placeholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("goal.deposit.fromAccount")}</Label>
            {accounts.length > 0 ? (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} — {formatCurrency(account.balance, currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">{t("goal.deposit.noAccounts")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("goal.deposit.note")}</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || accounts.length === 0}>
              {t("goal.deposit.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({
  title,
  goal,
  onSubmit
}: {
  title: string;
  goal?: GoalsPageData["goals"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<AccountsPageData>("/accounts")
      .then((data) => {
        if (!cancelled) setAccounts(data?.accounts ?? []);
      })
      .catch(() => {});
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
        {goal ? <input type="hidden" name="id" value={goal.id} /> : null}
        <div className="space-y-2">
          <Label>{t("common.name")}</Label>
          <Input name="title" defaultValue={goal?.title ?? ""} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("goal.dialog.target")}</Label>
            <Input
              name="targetAmount"
              type="number"
              min="0"
              step="100"
              defaultValue={goal?.targetAmount ?? ""}
              required
            />
          </div>
          {goal ? (
            <div className="space-y-2">
              <Label>{t("goal.saved")}</Label>
              <Input
                name="currentAmount"
                type="number"
                min="0"
                step="100"
                defaultValue={goal.currentAmount}
                required
              />
            </div>
          ) : (
            // New goals start at 0 and grow only through deposits, so the saved
            // amount is always backed by money moved out of an account (net
            // worth is never inflated by a manually-typed balance).
            <input type="hidden" name="currentAmount" value="0" />
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("goal.dialog.deadline")}</Label>
          <Input
            name="deadline"
            type="date"
            defaultValue={goal ? formatInputDate(goal.deadline) : formatInputDate(new Date())}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("goal.dialog.linkedAccount")}</Label>
            <Select name="linkedAccountId" defaultValue={goal?.linkedAccountId || "none"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("goal.dialog.noAccount")}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("goal.dialog.planned")}</Label>
            <Input
              name="plannedContribution"
              type="number"
              min="0"
              step="100"
              defaultValue={goal?.plannedContribution ?? ""}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
