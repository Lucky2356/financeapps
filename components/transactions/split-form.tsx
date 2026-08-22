"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export type SplitRow = { categoryId: string; amount: string };
export type SplitPayload = {
  date: string;
  accountId: string;
  description: string;
  rows: SplitRow[];
};

/**
 * One receipt split across several categories.
 *
 * It used to be a button of its own on the operations screen, which the owner
 * asked to clear away; splitting is a way of adding an operation, so it lives
 * with the other ways of adding one — in the round "+" — instead of being lost.
 */
export function SplitForm({
  accounts,
  categories,
  pending,
  onSubmit,
  onCancel
}: {
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; label: string; kind: string }>;
  pending: boolean;
  onSubmit: (payload: SplitPayload) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.kind === "EXPENSE"),
    [categories]
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(formatInputDate(new Date()));
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<SplitRow[]>([
    { categoryId: expenseCategories[0]?.id ?? "", amount: "" },
    { categoryId: expenseCategories[1]?.id ?? expenseCategories[0]?.id ?? "", amount: "" }
  ]);

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const valid =
    Boolean(accountId) &&
    rows.length >= 2 &&
    rows.every((row) => row.categoryId && Number(row.amount) > 0);

  function updateRow(index: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit({ date, accountId, description, rows });
      }}
      className="grid gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="split-date">{t("common.date")}</Label>
          <Input
            id="split-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="split-account">{t("tx.account")}</Label>
          <Select value={accountId || undefined} onValueChange={setAccountId}>
            <SelectTrigger id="split-account">
              <SelectValue />
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
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="split-description">{t("tx.col.description")}</Label>
          <Input
            id="split-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("tx.split.descPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2">
            <Select
              value={row.categoryId || undefined}
              onValueChange={(value) => updateRow(index, { categoryId: value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t("common.category")} />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={row.amount}
              onChange={(event) => updateRow(index, { amount: event.target.value })}
              placeholder={t("common.amount")}
              aria-label={t("common.amount")}
              className="w-32"
            />
            {rows.length > 2 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                aria-label={t("common.delete")}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [...prev, { categoryId: expenseCategories[0]?.id ?? "", amount: "" }])
          }
        >
          <Plus className="size-4" />
          {t("tx.split.addRow")}
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("tx.split.total")}</span>
        <span className="num font-semibold">{formatCurrency(total)}</span>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("tx.dialog.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? t("tx.dialog.saving") : t("tx.split.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
