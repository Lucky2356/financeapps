"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function BudgetManager({ data }: { data: BudgetsPageData }) {
  const router = useRouter();

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      await apiClient.post("/budgets", payload);
      toast.success("Лимит бюджета сохранен");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить лимит");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Лимиты по категориям</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Категория</TableHead>
                <TableHead>Прогресс</TableHead>
                <TableHead className="text-right">Потрачено</TableHead>
                <TableHead className="w-56">Лимит</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.budgets.map((budget) => (
                <TableRow key={budget.categoryId}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: budget.color }} />
                      {budget.category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(budget.progress, 100)} className="h-2" />
                      <span className={budget.isExceeded ? "w-14 text-right text-sm font-semibold text-destructive" : "w-14 text-right text-sm text-muted-foreground"}>
                        {Math.round(budget.progress)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(budget.spent, data.currency)}</TableCell>
                  <TableCell>
                      <BudgetForm budget={budget} onSubmit={submitBudget} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {data.budgets.map((budget) => (
            <div key={budget.categoryId} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{budget.category}</p>
                <p className={budget.isExceeded ? "font-semibold text-destructive" : "font-semibold"}>
                  {Math.round(budget.progress)}%
                </p>
              </div>
              <Progress value={Math.min(budget.progress, 100)} className="mt-3" />
              <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                <span>{formatCurrency(budget.spent, data.currency)}</span>
                <span>{formatCurrency(budget.limitAmount, data.currency)}</span>
              </div>
              <div className="mt-3">
                <BudgetForm budget={budget} onSubmit={submitBudget} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetForm({
  budget,
  onSubmit
}: {
  budget: BudgetsPageData["budgets"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input type="hidden" name="categoryId" value={budget.categoryId} />
      <Input name="limitAmount" type="number" min="0" step="100" defaultValue={budget.limitAmount} className="min-w-0" />
      <Button type="submit" size="icon" variant="outline" title="Сохранить лимит">
        <Save className="size-4" />
      </Button>
    </form>
  );
}
