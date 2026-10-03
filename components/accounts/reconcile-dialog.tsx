"use client";

// «Сверить с банком»: в банке одно, в приложении другое — где разница?
//
// Человек вводит остаток, который показывает банк. Сошлось — отмечаем дату
// сверки (на этом устройстве). Не сошлось — видна разница и последние операции
// счёта: чаще всего разница — это забытая трата, и найти её проще глазами.
// Не нашлась — разницу можно записать одной операцией «Сверка с банком», и
// остатки сойдутся, а история честно скажет, откуда взялись деньги.

import { Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";

type Account = { id: string; name: string; balance: number; currency: string };

const reconciledKey = (accountId: string) => `reconciled-${accountId}`;

/** Когда счёт последний раз сходился с банком — на этом устройстве. */
export function lastReconciled(accountId: string): string | null {
  return readMine(reconciledKey(accountId));
}

function parseAmount(text: string): number | null {
  const value = Number(text.replace(/[\s ]/g, "").replace(",", "."));
  return text.trim() && Number.isFinite(value) ? value : null;
}

export function ReconcileDialog({
  account,
  onOpenChange,
  onDone
}: {
  account: Account | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [bank, setBank] = useState("");
  const [recent, setRecent] = useState<TransactionsPageData["transactions"] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    void apiClient
      .get<TransactionsPageData>(
        `/transactions?accountId=${encodeURIComponent(account.id)}&period=all&limit=10`
      )
      .then((page) => (alive ? setRecent(page.transactions.slice(0, 10)) : undefined))
      .catch(() => (alive ? setRecent([]) : undefined));
    return () => {
      alive = false;
      setRecent(null);
      setBank("");
    };
  }, [account]);

  const money = (value: number) => formatCurrency(value, account?.currency ?? "RUB");
  const bankValue = parseAmount(bank);
  const difference =
    account && bankValue !== null ? Math.round((bankValue - account.balance) * 100) / 100 : null;

  function markReconciled() {
    if (!account) return;
    writeMine(reconciledKey(account.id), new Date().toISOString().slice(0, 10));
  }

  async function record() {
    if (!account || bankValue === null) return;
    setBusy(true);
    try {
      await apiClient.post("/accounts", {
        action: "reconcile",
        id: account.id,
        balance: String(bankValue)
      });
      markReconciled();
      toast.success(t("recon.recorded"));
      onDone();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    } finally {
      setBusy(false);
    }
  }

  function confirmMatch() {
    markReconciled();
    toast.success(t("recon.matched"));
    onOpenChange(false);
  }

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="reconcile-dialog">
        <DialogHeader>
          <DialogTitle>{t("recon.title", { name: account?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("recon.desc")}</DialogDescription>
        </DialogHeader>
        {account ? (
          <div className="grid gap-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("recon.inApp")}</span>
              <span className="font-semibold tabular-nums">{money(account.balance)}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reconcile-bank">{t("recon.inBank")}</Label>
              <AmountInput
                id="reconcile-bank"
                value={bank}
                onValueChange={setBank}
                autoFocus
                data-testid="reconcile-bank"
              />
            </div>
            {difference !== null ? (
              difference === 0 ? (
                <p
                  className="pop-in rounded-lg bg-success/10 p-3 text-sm"
                  data-testid="reconcile-match"
                >
                  {t("recon.match")}
                </p>
              ) : (
                <div
                  className="space-y-2 rounded-lg border p-3 text-sm"
                  data-testid="reconcile-diff"
                >
                  <p>
                    {t(difference > 0 ? "recon.more" : "recon.less", {
                      amount: money(Math.abs(difference))
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("recon.lookFirst")}</p>
                  {recent && recent.length > 0 ? (
                    <ul className="max-h-44 divide-y overflow-y-auto rounded border text-xs">
                      {recent.map((row) => (
                        <li key={row.id} className="flex items-center gap-2 px-2 py-1.5">
                          <span className="tabular-nums text-muted-foreground">
                            {formatDate(row.date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {row.description || row.category.label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {row.type === "INCOME" ? "+" : "−"}
                            {money(row.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {difference === 0 ? (
                <Button type="button" onClick={confirmMatch} data-testid="reconcile-ok">
                  <Scale className="size-4" />
                  {t("recon.done")}
                </Button>
              ) : difference !== null ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void record()}
                  data-testid="reconcile-record"
                >
                  {t("recon.record", { amount: money(Math.abs(difference)) })}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
