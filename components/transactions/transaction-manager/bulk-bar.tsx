"use client";

import { Sparkles, Trash2 } from "lucide-react";

import { CategoryOptionLabel } from "@/components/category-option";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { TransactionsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";

/** Полоса действий над отмеченными строками; видна, пока отмечена хоть одна. */
export function BulkActionsBar({
  selectedCount,
  categories,
  bulkCategory,
  onBulkCategoryChange,
  bulkPending,
  aiEnabled,
  onCategorize,
  onApplyRules,
  onAiCategorize,
  onDelete,
  onClear
}: {
  selectedCount: number;
  categories: TransactionsPageData["categories"];
  bulkCategory: string;
  onBulkCategoryChange: (value: string) => void;
  bulkPending: boolean;
  aiEnabled: boolean | undefined;
  onCategorize: () => Promise<void>;
  onApplyRules: () => Promise<void>;
  onAiCategorize: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <span className="text-sm font-medium">{t("tx.bulk.selected", { count: selectedCount })}</span>
      <Select value={bulkCategory || undefined} onValueChange={onBulkCategoryChange}>
        <SelectTrigger className="h-9 w-52">
          <SelectValue placeholder={t("tx.bulk.pickCategory")} />
        </SelectTrigger>
        <SelectContent>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              <CategoryOptionLabel
                label={category.label}
                color={category.color}
                icon={category.icon}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!bulkCategory || bulkPending}
        onClick={() => void onCategorize()}
      >
        {t("tx.bulk.setCategory")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={bulkPending}
        onClick={() => void onApplyRules()}
      >
        {t("tx.bulk.applyRules")}
      </Button>
      {aiEnabled ? (
        <Button
          size="sm"
          variant="outline"
          disabled={bulkPending}
          onClick={() => void onAiCategorize()}
        >
          <Sparkles className="size-4 text-primary" />
          {t("tx.bulk.aiCategorize")}
        </Button>
      ) : null}
      <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => void onDelete()}>
        <Trash2 className="size-4 text-destructive" />
        {t("common.delete")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t("tx.bulk.clear")}
      </Button>
    </div>
  );
}
