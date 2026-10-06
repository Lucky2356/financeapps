"use client";

// «Внести платёж» по долгу. Раньше платёж записывался только автоплатежом на
// заранее заданную сумму, а внести лишнюю тысячу или заплатить в другой день
// значило править остаток долга руками и отдельно записывать расход. Здесь одно
// окно: сумма, счёт, дата — и расход записан, а долг стал меньше.

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { keepChoice } from "@/components/transactions/quick-create";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { LiabilitiesPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

type Debt = LiabilitiesPageData["liabilities"][number];

export function PayDebtDialog({
  debt,
  onClose,
  onDone
}: {
  debt: Debt | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  return (
    <Dialog open={debt !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {debt ? <PayForm key={debt.id} debt={debt} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  debt,
  onClose,
  onDone
}: {
  debt: Debt;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useI18n();
  const scheduled = Math.min(debt.minPayment, debt.balance) || debt.balance;
  const [amount, setAmount] = useState(scheduled > 0 ? String(scheduled) : "");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState(debt.paymentAccountId ?? "");
  const [date, setDate] = useState(formatInputDate(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void apiClient
      .get("/accounts")
      .then((result) => {
        if (!alive) return;
        // «/accounts» отдаёт только действующие счета — архивные уже отсеяны.
        const usable = result?.accounts ?? [];
        setAccounts(usable);
        setAccountId((was) =>
          usable.some((account) => account.id === was) ? was : (usable[0]?.id ?? "")
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    setBusy(true);
    try {
      const result = await apiClient.post<{ paid: number; balance: number; closed: boolean }>(
        "/debts/pay",
        { id: debt.id, amount, accountId, date }
      );
      toast.success(
        result.closed
          ? t("debt.pay.closed")
          : t("debt.pay.done", {
              amount: formatCurrency(result.paid, debt.currency),
              balance: formatCurrency(result.balance, debt.currency)
            })
      );
      await onDone();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("debt.toast.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      data-testid="pay-debt"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("debt.pay.title", { name: debt.name })}</DialogTitle>
        <DialogDescription>
          {t("debt.pay.lead", {
            balance: formatCurrency(debt.balance, debt.currency),
            payment: formatCurrency(debt.minPayment, debt.currency)
          })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="pay-amount">{t("debt.pay.amount")}</Label>
        <AmountInput
          id="pay-amount"
          autoFocus
          required
          placeholder="0.00"
          value={amount}
          onValueChange={setAmount}
        />
        <div className="flex flex-wrap gap-2">
          {debt.minPayment > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAmount(String(Math.min(debt.minPayment, debt.balance)))}
            >
              {t("debt.pay.scheduled")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAmount(String(debt.balance))}
          >
            {t("debt.pay.all")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("debt.pay.account")}</Label>
        {/* Radix сообщает пустое значение, когда список счетов подгрузился и
            прежнего значения в нём нет, — это не выбор человека (см. keepChoice). */}
        <Select value={accountId} onValueChange={keepChoice(setAccountId)}>
          <SelectTrigger aria-label={t("debt.pay.account")}>
            <SelectValue placeholder={t("ai.selectAccount")} />
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
        <Label htmlFor="pay-date">{t("common.date")}</Label>
        <Input
          id="pay-date"
          type="date"
          className="w-44"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("tx.dialog.cancel")}
        </Button>
        <Button type="submit" disabled={busy || !amount || !accountId}>
          {t("debt.pay.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
