"use client";

import { X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { CategoryOptionLabel } from "@/components/category-option";
import { keepChoice } from "@/components/transactions/quick-create";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

import {
  splitRemainder,
  type CategoryOption,
  type SplitPart
} from "@/components/quick-add-fab/helpers";

/**
 * Разделить покупку по категориям: основная категория получает остаток,
 * здесь — остальные части и кнопка, которая добавляет ещё одну.
 */
export function SplitPartsEditor({
  amount,
  splitParts,
  setSplitParts,
  categories
}: {
  amount: string;
  splitParts: SplitPart[];
  setSplitParts: Dispatch<SetStateAction<SplitPart[]>>;
  categories: CategoryOption[];
}) {
  const { t } = useI18n();
  return (
    <>
      {splitParts.length > 0 ? (
        <div className="space-y-2 rounded-lg border p-2" data-testid="split-parts">
          <p className="px-1 text-xs text-muted-foreground">
            {t("qa.split.rest", {
              amount: formatCurrency(Math.max(splitRemainder(amount, splitParts), 0))
            })}
          </p>
          {splitParts.map((part, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_auto] gap-2">
              <Select
                value={part.categoryId || undefined}
                onValueChange={keepChoice((value: string) =>
                  setSplitParts((was) =>
                    was.map((row, at) => (at === index ? { ...row, categoryId: value } : row))
                  )
                )}
              >
                <SelectTrigger aria-label={t("qa.split.partCategory", { n: index + 2 })}>
                  <SelectValue placeholder={t("ai.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <CategoryOptionLabel label={c.label} color={c.color} icon={c.icon} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AmountInput
                aria-label={t("qa.split.partAmount", { n: index + 2 })}
                placeholder="0"
                value={part.amount}
                onValueChange={(value) =>
                  setSplitParts((was) =>
                    was.map((row, at) => (at === index ? { ...row, amount: value } : row))
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("qa.split.remove")}
                onClick={() => setSplitParts((was) => was.filter((_, at) => at !== index))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => setSplitParts((was) => [...was, { categoryId: "", amount: "" }])}
      >
        {splitParts.length > 0 ? t("qa.split.more") : t("qa.split.start")}
      </button>
    </>
  );
}
