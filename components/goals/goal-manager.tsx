"use client";

import { Edit2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { GoalsPageData } from "@/lib/data";
import { formatCurrency, formatDate, formatInputDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export function GoalManager({ data }: { data: GoalsPageData }) {
  const router = useRouter();

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
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить цель");
    }
  }

  async function removeGoal(id: string) {
    try {
      await apiClient.delete(`/goals?id=${encodeURIComponent(id)}`);
      toast.success("Цель удалена");
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
        {data.goals.map((goal) => (
          <Card key={goal.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{goal.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Дедлайн: {formatDate(goal.deadline)}</p>
                </div>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Редактировать">
                        <Edit2 className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <GoalDialog title="Редактировать цель" goal={goal} onSubmit={(event) => submitGoal(event, "PUT")} />
                  </Dialog>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void removeGoal(goal.id);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="icon" title="Удалить">
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
                  <p className="text-sm font-semibold">{formatCurrency(goal.currentAmount, data.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Цель</p>
                  <p className="text-sm font-semibold">{formatCurrency(goal.targetAmount, data.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">В месяц</p>
                  <p className="text-sm font-semibold">{formatCurrency(goal.monthlyContribution, data.currency)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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
