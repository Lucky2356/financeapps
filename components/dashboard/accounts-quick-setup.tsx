"use client";

// Счета одним экраном — для того, кто только поставил приложение.
//
// Раньше шаг «Добавьте счёт» вёл в раздел «Счета», а там — форма на один
// счёт: название, тип, валюта, остаток, и так на каждый. Новичку нужно другое:
// отметить, что у него есть (карта, наличные, накопительный), вписать, сколько
// там сейчас, — и готово. Двадцать секунд вместо трёх форм.

import { useState } from "react";
import { toast } from "sonner";

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
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";

type Row = { type: string; nameKey: string; picked: boolean; name: string; balance: string };

const START: ReadonlyArray<Omit<Row, "name" | "balance">> = [
  { type: "DEBIT_CARD", nameKey: "aqs.card", picked: true },
  { type: "CASH", nameKey: "aqs.cash", picked: true },
  { type: "SAVINGS", nameKey: "aqs.savings", picked: false }
];

export function AccountsQuickSetup({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>(() =>
    START.map((row) => ({ ...row, name: t(row.nameKey), balance: "" }))
  );
  const [busy, setBusy] = useState(false);

  function change(index: number, patch: Partial<Row>) {
    setRows((was) => was.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  const picked = rows.filter((row) => row.picked && row.name.trim());

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (picked.length === 0) return;
    setBusy(true);
    try {
      // По одному, а не разом: порядок в списке счетов — тот, что на экране.
      for (const row of picked) {
        await apiClient.post("/accounts", {
          name: row.name.trim(),
          type: row.type,
          balance: row.balance.replace(",", ".").replace(/\s/g, "") || "0"
        });
      }
      toast.success(t("aqs.done", { count: picked.length }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.accountCreateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="accounts-quick-setup">
        <DialogHeader>
          <DialogTitle>{t("aqs.title")}</DialogTitle>
          <DialogDescription>{t("aqs.lead")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => void create(event)}>
          {rows.map((row, index) => (
            <div
              key={row.type}
              className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-lg border p-3"
            >
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={row.picked}
                onChange={(event) => change(index, { picked: event.target.checked })}
                aria-label={t(row.nameKey)}
              />
              <Input
                value={row.name}
                onChange={(event) => change(index, { name: event.target.value })}
                aria-label={t("qc.name")}
                disabled={!row.picked}
              />
              <span />
              <Input
                inputMode="decimal"
                placeholder={t("aqs.balance")}
                value={row.balance}
                onChange={(event) => change(index, { balance: event.target.value })}
                aria-label={t("aqs.balanceOf", { name: row.name || t(row.nameKey) })}
                disabled={!row.picked}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("aqs.hint")}</p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || picked.length === 0}>
              {t("aqs.create", { count: picked.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
