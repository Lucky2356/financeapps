"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";

import type { QuickAddType } from "@/components/quick-add-fab/helpers";

/** Расход, доход или перевод — переключатель над формой. */
export function QuickAddTypeSwitch({
  type,
  onChange,
  canTransfer
}: {
  type: QuickAddType;
  onChange: (next: QuickAddType) => void;
  canTransfer: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label>{t("tx.type")}</Label>
      {/* Three ways to record something, one row. */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={type === "EXPENSE" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("EXPENSE")}
        >
          {t("tx.type.expense")}
        </Button>
        <Button
          type="button"
          variant={type === "INCOME" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("INCOME")}
        >
          {t("tx.type.income")}
        </Button>
        <Button
          type="button"
          variant={type === "TRANSFER" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("TRANSFER")}
          disabled={!canTransfer}
          title={!canTransfer ? t("qa.transfer.needTwo") : undefined}
        >
          {t("tx.transfer")}
        </Button>
      </div>
    </div>
  );
}
