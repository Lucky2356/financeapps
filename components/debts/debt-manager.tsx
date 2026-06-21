"use client";

import { CreditCard, Edit2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { LiabilitiesPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DebtPayoffService } from "@/services/DebtPayoffService";

const KIND_LABELS: Record<LiabilitiesPageData["liabilities"][number]["kind"], string> = {
  CREDIT_CARD: "Кредитная карта",
  LOAN: "Кредит",
  MORTGAGE: "Ипотека",
  INSTALLMENT: "Рассрочка",
  OTHER: "Другое"
};

const payoffService = new DebtPayoffService();

function payoffHint(
  liability: LiabilitiesPageData["liabilities"][number],
  currency: string
): string {
  if (liability.balance <= 0) return "Погашено";
  if (liability.minPayment <= 0) return "Укажите платёж для расчёта";
  const months = payoffService.monthsToPayoff(
    liability.balance,
    liability.interestRate,
    liability.minPayment
  );
  if (months === null) return "Платёж не покрывает проценты";
  const interest = payoffService.totalInterest(
    liability.balance,
    liability.interestRate,
    liability.minPayment
  );
  const interestPart =
    interest && interest > 0 ? `, переплата ${formatCurrency(interest, currency)}` : "";
  return `≈ ${months} мес.${interestPart}`;
}

export function DebtManager({ data }: { data: LiabilitiesPageData }) {
  const router = useRouter();
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
        success: method === "POST" ? "Обязательство добавлено" : "Обязательство обновлено",
        error: "Не удалось сохранить обязательство",
        onSuccess: async () => {
          if (method === "POST") setAddOpen(false);
          else setEditing(null);
          await refresh();
        }
      }
    );
  }

  async function remove(id: string, name: string) {
    const confirmed = await confirm({
      title: "Удалить обязательство?",
      description: `«${name}» будет удалено из списка долгов.`,
      confirmLabel: "Удалить",
      destructive: true
    });
    if (!confirmed) return;
    await run(() => apiClient.delete(`/debts?id=${encodeURIComponent(id)}`), {
      success: "Обязательство удалено",
      error: "Не удалось удалить обязательство",
      onSuccess: refresh
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Всего обязательств:{" "}
          <span className="font-semibold">{formatCurrency(pageData.total, pageData.currency)}</span>
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Добавить долг
            </Button>
          </DialogTrigger>
          <DebtDialog title="Новое обязательство" onSubmit={(event) => submit(event, "POST")} />
        </Dialog>
      </div>

      {pageData.liabilities.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Пока нет обязательств"
          description="Добавьте кредиты, рассрочки или ипотеку — они вычитаются из чистого капитала, а мы поможем спланировать погашение."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Добавить долг
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pageData.liabilities.map((liability) => (
            <Card key={liability.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{liability.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {KIND_LABELS[liability.kind]}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Редактировать"
                      aria-label="Редактировать обязательство"
                      onClick={() => setEditing(liability)}
                    >
                      <Edit2 className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Удалить"
                      aria-label="Удалить обязательство"
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
                    <p className="text-xs text-muted-foreground">Остаток</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(liability.balance, pageData.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ставка</p>
                    <p className="text-sm font-semibold">{liability.interestRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Платёж/мес</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(liability.minPayment, pageData.currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {payoffHint(liability, pageData.currency)}
                </p>
              </CardContent>
            </Card>
          ))}
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
            title="Редактировать обязательство"
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
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {liability ? <input type="hidden" name="id" value={liability.id} /> : null}
        <div className="space-y-2">
          <Label>Название</Label>
          <Input name="name" defaultValue={liability?.name ?? ""} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Тип</Label>
            <select
              name="kind"
              defaultValue={liability?.kind ?? "LOAN"}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Остаток долга</Label>
            <Input
              name="balance"
              type="number"
              min="0"
              step="100"
              defaultValue={liability?.balance ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Первоначальная сумма</Label>
            <Input
              name="originalAmount"
              type="number"
              min="0"
              step="100"
              defaultValue={liability?.originalAmount ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Ставка, % годовых</Label>
            <Input
              name="interestRate"
              type="number"
              min="0"
              step="0.1"
              defaultValue={liability?.interestRate ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Платёж в месяц</Label>
            <Input
              name="minPayment"
              type="number"
              min="0"
              step="100"
              defaultValue={liability?.minPayment ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>День платежа</Label>
            <Input
              name="dueDay"
              type="number"
              min="1"
              max="31"
              defaultValue={liability?.dueDay ?? ""}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Сохранить</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
