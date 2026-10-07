"use client";

// Новый счёт и новая категория — не выходя из формы операции.
//
// Раньше это была строка прямо в форме: поле названия, выбор типа и кнопка
// «Создать» в один ряд. На ПК — терпимо, на телефоне поле названия сжималось
// до «Напр», и набирать было негде. Теперь — небольшое окно поверх формы: поля
// одно под другим, название в фокусе, «Создать» — и новый счёт или категория
// сразу выбраны в операции. Форма под окном остаётся как была, с уже
// введённой суммой.

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
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
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";

/**
 * Не дать выпадающему списку сбросить выбор.
 *
 * Список Radix, получив значение, которого среди пунктов ЕЩЁ нет (счёт только
 * что создан, а перечитанный список приедет следующим кадром), сам присылает
 * пустую строку — и выбранный счёт тут же слетал на «Выберите счёт». Пустого
 * выбора человек сделать не может: такой пункт не показывается. Значит, пустая
 * строка — всегда этот сброс, и принимать её незачем.
 */
export function keepChoice(set: (value: string) => void) {
  return (value: string) => {
    if (value) set(value);
  };
}

const ACCOUNT_TYPES = ["DEBIT_CARD", "CASH", "SAVINGS", "BROKERAGE"] as const;

export function NewAccountDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Счёт заведён: перечитать списки и выбрать его. */
  onCreated: (id: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("DEBIT_CARD");
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await apiClient.post("/accounts", {
        name: name.trim(),
        type,
        balance: balance.replace(",", ".").trim() || "0"
      });
      await onCreated(created.id);
      toast.success(t("tx.toast.accountCreated"));
      setName("");
      setBalance("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.accountCreateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="new-account-dialog">
        <DialogHeader>
          <DialogTitle>{t("qc.account.title")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void create(event)}>
          <div className="space-y-2">
            <Label htmlFor="qc-account-name">{t("qc.name")}</Label>
            <Input
              id="qc-account-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("tx.dialog.accountPlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-account-type">{t("qc.account.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="qc-account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`tx.acctType.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-account-balance">{t("qc.account.balance")}</Label>
            <Input
              id="qc-account-balance"
              inputMode="decimal"
              placeholder="0"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("tx.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCategoryDialog({
  open,
  onOpenChange,
  kind,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "INCOME" | "EXPENSE";
  /** Категория заведена: перечитать списки и выбрать её. */
  onCreated: (id: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await apiClient.post("/categories", {
        name: name.trim(),
        kind,
        color: kind === "INCOME" ? "#16a34a" : "#64748b",
        isEssential: false,
        isSubscription: false
      });
      await onCreated(created.id);
      toast.success(t("tx.toast.categoryCreated"));
      setName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.categoryCreateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="new-category-dialog">
        <DialogHeader>
          <DialogTitle>
            {kind === "INCOME" ? t("qc.category.titleIncome") : t("qc.category.titleExpense")}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void create(event)}>
          <div className="space-y-2">
            <Label htmlFor="qc-category-name">{t("qc.name")}</Label>
            <Input
              id="qc-category-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                kind === "INCOME"
                  ? t("tx.dialog.catPlaceholderIncome")
                  : t("tx.dialog.catPlaceholderExpense")
              }
              required
            />
            <p className="text-xs text-muted-foreground">{t("qc.category.hint")}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("tx.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
