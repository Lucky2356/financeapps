"use client";

import { ArrowRightLeft, PiggyBank } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, GoalsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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

// Shown on the dashboard when the free cash balance is positive: lets the user
// move part of it into a savings goal in one step (reuses the goal-deposit
// endpoint, so it behaves the same on web and desktop).
export function DistributeCashflow({ freeCashflowLabel }: { freeCashflowLabel: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<GoalsPageData["goals"]>([]);
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  const [goalId, setGoalId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [goalsData, accountsData] = await Promise.all([
          apiClient.get<GoalsPageData>("/goals"),
          apiClient.get<AccountsPageData>("/accounts")
        ]);
        if (cancelled) return;
        setGoals(goalsData.goals);
        setAccounts(accountsData.accounts);
        setGoalId((current) => current || goalsData.goals[0]?.id || "");
        setAccountId((current) => current || accountsData.accounts[0]?.id || "");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error(t("goal.deposit.enterAmount"));
    if (!goalId) return toast.error(t("dc.err.goal"));
    if (!accountId) return toast.error(t("goal.deposit.selectAccount"));
    setLoading(true);
    try {
      await apiClient.post("/goals", {
        action: "deposit",
        goalId,
        amount: String(value),
        accountId
      });
      toast.success(t("dc.success"));
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dc.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <PiggyBank className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">{t("dc.free", { label: freeCashflowLabel })}</p>
            <p className="text-xs text-muted-foreground">{t("dc.hint")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <ArrowRightLeft className="size-4" />
              {t("dc.distribute")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dc.title")}</DialogTitle>
            </DialogHeader>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dc.createGoalFirst")}</p>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="space-y-2">
                  <Label>{t("dc.goal")}</Label>
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {goals.map((goal) => (
                        <SelectItem key={goal.id} value={goal.id}>
                          {goal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("dc.fromAccount")}</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
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
                  <Label>{t("common.amount")}</Label>
                  <Input
                    type="number"
                    min="1"
                    step="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t("goal.deposit.placeholder")}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={loading || accounts.length === 0}>
                    {t("dc.submit")}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
