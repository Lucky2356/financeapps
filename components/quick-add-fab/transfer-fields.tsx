"use client";

import { keepChoice } from "@/components/transactions/quick-create";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";

import type { AccountOption } from "@/components/quick-add-fab/helpers";

/** Перевод: счёт, куда уходят деньги, — любой, кроме того, откуда. */
export function TransferToAccountField({
  accounts,
  fromAccountId,
  toAccountId,
  onChange
}: {
  accounts: AccountOption[];
  fromAccountId: string;
  toAccountId: string;
  onChange: (accountId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label htmlFor="fab-to-account">{t("tx.transfer.to")}</Label>
      <Select value={toAccountId || undefined} onValueChange={keepChoice(onChange)}>
        <SelectTrigger id="fab-to-account">
          <SelectValue placeholder={t("ai.selectAccount")} />
        </SelectTrigger>
        <SelectContent>
          {accounts
            .filter((a) => a.id !== fromAccountId)
            .map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
