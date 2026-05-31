"use client";

import { ArrowRightLeft, PiggyBank } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData, GoalsPageData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shown on the dashboard when the free cash balance is positive: lets the user
// move part of it into a savings goal in one step (reuses the goal-deposit
// endpoint, so it behaves the same on web and desktop).
export function DistributeCashflow({ freeCashflowLabel }: { freeCashflowLabel: string }) {
  const router = useRouter();
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
    if (!Number.isFinite(value) || value <= 0) return toast.error("Введите сумму больше нуля");
    if (!goalId) return toast.error("Выберите цель");
    if (!accountId) return toast.error("Выберите счёт");
    setLoading(true);
    try {
      await apiClient.post("/goals", { action: "deposit", goalId, amount: String(value), accountId });
      toast.success("Свободные средства отложены на цель");
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось распределить средства");
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
            <p className="text-sm font-medium">Свободный остаток: {freeCashflowLabel}</p>
            <p className="text-xs text-muted-foreground">Отложите часть на цель, пока деньги не разошлись.</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <ArrowRightLeft className="size-4" />
              Распределить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Отложить на цель</DialogTitle>
            </DialogHeader>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сначала создайте цель на странице «Цели».</p>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="space-y-2">
                  <Label>Цель</Label>
                  <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Со счёта</Label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Сумма</Label>
                  <Input type="number" min="1" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например, 5000" required />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={loading || accounts.length === 0}>Отложить</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
