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
import { AmountInput } from "@/components/ui/amount-input";
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
  const [deletingGoal, setDeletingGoal] = useState<GoalsPageData["goals"][number] | null>(null);

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

  async function removeGoal(goal: GoalsPageData["goals"][number]) {
    // A goal holding money cannot simply disappear — that money left an account
    // to get there. Where it goes back to is asked before anything is deleted.
    if (goal.currentAmount > 0) {
      setDeletingGoal(goal);
      return;
    }
    const confirmed = await confirm({
      title: t("goal.delete.title"),
      description: t("goal.delete.desc", { title: goal.title }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    await run(() => apiClient.delete(`/goals?id=${encodeURIComponent(goal.id)}`), {
      success: t("goal.toast.deleted"),
      error: t("goal.toast.deleteError"),
      onSuccess: refresh
    });
  }

  async function confirmDelete(goalId: string, destination: string) {
    const query =
      destination === "writeOff" ? `writeOff=1` : `accountId=${encodeURIComponent(destination)}`;
    await run(() => apiClient.delete(`/goals?id=${encodeURIComponent(goalId)}&${query}`), {
      success: t("goal.toast.deleted"),
      error: t("goal.toast.deleteError"),
      onSuccess: async () => {
        setDeletingGoal(null);
        await refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              {t("goal.add")}
            </Button>
          </DialogTrigger>
          <GoalDialog
            title={t("goal.new")}
            currency={pageData.currency}
            onSubmit={(event) => submitGoal(event, "POST")}
          />
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
                          void removeGoal(goal);
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
                              ? "text-xs text-success"
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
            currency={pageData.currency}
            onSubmit={(event) => submitGoal(event, "PUT")}
          />
        )}
      </Dialog>

      <Dialog
        open={deletingGoal !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingGoal(null);
        }}
      >
        {deletingGoal && (
          <DeleteGoalDialog
            goal={deletingGoal}
            currency={pageData.currency}
            onConfirm={(destination) => void confirmDelete(deletingGoal.id, destination)}
          />
        )}
      </Dialog>
    </div>
  );
}

// The account a goal's money moves through by default. "Связанный счёт" is the
// owner's own answer to that question, so it wins — but only while it is still
// an account money can move to: an archived one is not offered anywhere else
// either, and picking it would fail on submit.
function defaultAccountId(
  accounts: AccountsPageData["accounts"],
  linkedAccountId: string | undefined
): string {
  const linked = accounts.find((account) => account.id === linkedAccountId);
  return linked?.id ?? accounts[0]?.id ?? "";
}

// Deleting a goal that still holds money asks the only question that matters:
// where does the money go? Onto an account, or written off on purpose.
function DeleteGoalDialog({
  goal,
  currency,
  onConfirm
}: {
  goal: GoalsPageData["goals"][number];
  currency: string;
  onConfirm: (destination: string) => void;
}) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  const [destination, setDestination] = useState("");

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<AccountsPageData>("/accounts")
      .then((data) => {
        if (cancelled) return;
        setAccounts(data.accounts);
        setDestination(defaultAccountId(data.accounts, goal.linkedAccountId) || "writeOff");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [goal.linkedAccountId]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("goal.delete.title")}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        {t("goal.delete.holding", {
          title: goal.title,
          amount: formatCurrency(goal.currentAmount, currency)
        })}
      </p>
      <div className="space-y-2">
        <Label>{t("goal.delete.destination")}</Label>
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
            <SelectItem value="writeOff">{t("goal.delete.writeOff")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button
          variant="destructive"
          disabled={!destination}
          onClick={() => onConfirm(destination)}
        >
          {t("common.delete")}
        </Button>
      </DialogFooter>
    </DialogContent>
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
  // Money goes into a jar and comes back out of it. Taking it back out was the
  // one direction the app had no way to record: the figure had to be typed over
  // in the edit form, which moved nothing and left capital wrong.
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

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
        setAccountId((current) => current || defaultAccountId(data.accounts, goal.linkedAccountId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, goal.linkedAccountId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
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
        action: mode,
        goalId: goal.id,
        amount: String(value),
        accountId
      });
      toast.success(mode === "deposit" ? t("goal.deposit.success") : t("goal.withdraw.success"));
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
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "deposit" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("deposit")}
            >
              {t("goal.move.deposit")}
            </Button>
            <Button
              type="button"
              variant={mode === "withdraw" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("withdraw")}
              disabled={goal.currentAmount <= 0}
            >
              {t("goal.move.withdraw")}
            </Button>
          </div>
          <div className="space-y-2">
            <Label>{t("goal.deposit.amount")}</Label>
            <AmountInput
              min="0.01"
              max={mode === "withdraw" ? goal.currentAmount : remaining > 0 ? remaining : undefined}
              step="0.01"
              value={amount}
              onValueChange={setAmount}
              placeholder={t("goal.deposit.placeholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>
              {mode === "deposit" ? t("goal.deposit.fromAccount") : t("goal.withdraw.toAccount")}
            </Label>
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
              {mode === "deposit" ? t("goal.deposit.submit") : t("goal.withdraw.submit")}
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
  currency,
  onSubmit
}: {
  title: string;
  goal?: GoalsPageData["goals"][number];
  currency: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  const [saved, setSaved] = useState(String(goal?.currentAmount ?? 0));

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
            <AmountInput
              name="targetAmount"
              min="0"
              step="0.01"
              defaultValue={goal?.targetAmount ?? ""}
              required
            />
          </div>
          {goal ? (
            <div className="space-y-2">
              <Label>{t("goal.saved")}</Label>
              <AmountInput
                name="currentAmount"
                min="0"
                step="0.01"
                value={saved}
                onValueChange={setSaved}
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
        {/* A goal holds money that left an account, so a change to the figure
            above is a top-up or a withdrawal — it has to say through which
            account, or capital would grow from a number being typed. */}
        {goal && Number(saved) !== goal.currentAmount ? (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Label>{t("goal.edit.viaAccount")}</Label>
            <Select
              name="accountId"
              defaultValue={defaultAccountId(accounts, goal.linkedAccountId)}
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
            <p className="text-xs text-muted-foreground">
              {t("goal.edit.viaAccountHint", {
                amount: formatCurrency(Math.abs(Number(saved) - goal.currentAmount), currency),
                direction:
                  Number(saved) > goal.currentAmount
                    ? t("goal.edit.fromAccount")
                    : t("goal.edit.toAccount")
              })}
            </p>
          </div>
        ) : null}
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
            <AmountInput
              name="plannedContribution"
              min="0"
              step="0.01"
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
