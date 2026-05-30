"use client";

import { Edit2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { GoalsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export function GoalManager({ data }: { data: GoalsPageData }) {
  const router = useRouter();
  const { data: pageData, reload } = useApiPageData(data, "/goals");

  async function submitGoal(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      if (method === "POST") {
        await apiClient.post("/goals", payload);
        toast.success("Цель добавлена");
      } else {
        await apiClient.put("/goals", payload);
        toast.success("Цель обновлена");
      }
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить цель");
    }
  }

  async function removeGoal(id: string, title: string) {
    if (!window.confirm(`Удалить цель «${title}»?`)) return;
    try {
      await apiClient.delete(`/goals?id=${encodeURIComponent(id)}`);
      toast.success("Цель удалена");
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить цель");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Добавить цель
            </Button>
          </DialogTrigger>
          <GoalDialog title="Новая цель" onSubmit={(event) => submitGoal(event, "POST")} />
        </Dialog>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pageData.goals.map((goal) => (
          <Card key={goal.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{goal.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Дедлайн: {formatDate(goal.deadline)}</p>
                </div>
                <div className="flex gap-1">
                  <DepositDialog goal={goal} currency={pageData.currency} onSuccess={async () => { await reload(); router.refresh(); }} />
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Редактировать" aria-label="Редактировать цель">
                        <Edit2 className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <GoalDialog title="Редактировать цель" goal={goal} onSubmit={(event) => submitGoal(event, "PUT")} />
                  </Dialog>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void removeGoal(goal.id, goal.title);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="icon" title="Удалить" aria-label="Удалить цель">
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
                  <p className="text-xs text-muted-foreground">Накоплено</p>
                  <p className="text-sm font-semibold">{formatCurrency(goal.currentAmount, pageData.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Цель</p>
                  <p className="text-sm font-semibold">{formatCurrency(goal.targetAmount, pageData.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">В месяц</p>
                  <p className="text-sm font-semibold">{formatCurrency(goal.monthlyContribution, pageData.currency)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const remaining = goal.targetAmount - goal.currentAmount;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const depositAmount = Number(amount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      toast.error("Введите сумму больше нуля");
      return;
    }
    setLoading(true);
    try {
      await apiClient.put("/goals", {
        id: goal.id,
        title: goal.title,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount + depositAmount,
        deadline: formatInputDate(goal.deadline)
      });
      toast.success("Пополнение сохранено");
      setOpen(false);
      setAmount("");
      await onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить пополнение");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Пополнить" aria-label="Пополнить цель">
          <PiggyBank className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Пополнить: {goal.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Накоплено {formatCurrency(goal.currentAmount, currency)} из {formatCurrency(goal.targetAmount, currency)}
        </p>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label>Сумма пополнения</Label>
            <Input
              type="number"
              min="1"
              max={remaining > 0 ? remaining : undefined}
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Например, 5000"
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>Пополнить</Button>
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
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {goal ? <input type="hidden" name="id" value={goal.id} /> : null}
        <div className="space-y-2">
          <Label>Название</Label>
          <Input name="title" defaultValue={goal?.title ?? ""} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Целевая сумма</Label>
            <Input name="targetAmount" type="number" min="0" step="100" defaultValue={goal?.targetAmount ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label>Текущая сумма</Label>
            <Input name="currentAmount" type="number" min="0" step="100" defaultValue={goal?.currentAmount ?? 0} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Дедлайн</Label>
          <Input name="deadline" type="date" defaultValue={goal ? formatInputDate(goal.deadline) : formatInputDate(new Date())} required />
        </div>
        <DialogFooter>
          <Button type="submit">Сохранить</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
