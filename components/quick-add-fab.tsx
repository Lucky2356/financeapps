"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { ImportPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";

type BudgetWarning = { category: string; spent: number; limit: number };
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountOption = ImportPageData["accounts"][number];
type CategoryOption = ImportPageData["categories"][number];

export function QuickAddFab({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("quick-add-open", handler);
    return () => window.removeEventListener("quick-add-open", handler);
  }, []);

  const activeAccounts = accounts.filter((a) => !(a as AccountOption & { isArchived?: boolean }).isArchived);
  const filteredCategories = categories.filter((c) => c.kind === type);
  const today = formatInputDate(new Date());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await apiClient.post<{ budgetWarning?: BudgetWarning }>("/transactions", { ...payload, type });
      toast.success("Операция добавлена");
      if (result?.budgetWarning) {
        toast.warning(
          `Превышен лимит «${result.budgetWarning.category}»: потрачено ${formatCurrency(result.budgetWarning.spent)} из ${formatCurrency(result.budgetWarning.limit)}`
        );
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить операцию");
    }
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-20 right-4 z-40 size-14 rounded-full shadow-lg md:bottom-6 md:right-6"
        onClick={() => setOpen(true)}
        aria-label="Быстрое добавление операции"
      >
        <Plus className="size-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Быстрое добавление</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {/* Type toggle */}
            <div className="space-y-2">
              <Label>Тип</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={type === "EXPENSE" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setType("EXPENSE")}
                >
                  Расход
                </Button>
                <Button
                  type="button"
                  variant={type === "INCOME" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setType("INCOME")}
                >
                  Доход
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-amount">Сумма</Label>
              <Input
                id="fab-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-category">Категория</Label>
              <select
                id="fab-category"
                name="categoryId"
                required
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Выберите категорию</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-account">Счет</Label>
              <select
                id="fab-account"
                name="accountId"
                required
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Выберите счет</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-date">Дата</Label>
              <Input id="fab-date" name="date" type="date" defaultValue={today} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-description">Описание (необязательно)</Label>
              <Input id="fab-description" name="description" maxLength={180} placeholder="Например: продукты" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Добавить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
