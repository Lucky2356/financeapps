"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { useConfirm } from "@/components/ui/confirm-dialog";
import type { useAiSettings } from "@/hooks/use-ai-settings";
import type { AiProvider } from "@/lib/ai/models";
import { apiClient } from "@/lib/api/client";
import { matchRule } from "@/lib/categorization-rules";
import type { TransactionsPageData } from "@/lib/data";
import type { useI18n } from "@/lib/i18n/context";

import {
  type TransactionRow,
  updatePayload
} from "@/components/transactions/transaction-manager/helpers";

/** Действия над отмеченными строками: категория, правила, ИИ, удаление. */
export function useBulkActions({
  pageData,
  visibleTransactions,
  selectedIds,
  clearSelection,
  confirm,
  aiSettings,
  t,
  locale,
  refresh
}: {
  pageData: TransactionsPageData;
  visibleTransactions: TransactionRow[];
  selectedIds: Set<string>;
  clearSelection: () => void;
  confirm: ReturnType<typeof useConfirm>;
  aiSettings: ReturnType<typeof useAiSettings>;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
  refresh: () => Promise<void>;
}) {
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkPending, setBulkPending] = useState(false);

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: t("tx.bulk.deleteTitle"),
      description: t("tx.bulk.deleteDesc", { count: ids.length }),
      destructive: true,
      confirmLabel: t("common.delete")
    });
    if (!ok) return;
    setBulkPending(true);
    let done = 0;
    for (const id of ids) {
      try {
        await apiClient.delete(`/transactions?id=${encodeURIComponent(id)}`);
        done += 1;
      } catch {
        /* keep going; summary reports how many succeeded */
      }
    }
    setBulkPending(false);
    clearSelection();
    toast.success(t("tx.bulk.deleted", { count: done }));
    await refresh();
  }

  async function bulkCategorize() {
    const category = pageData.categories.find((item) => item.id === bulkCategory);
    if (!category) return;
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    setBulkPending(true);
    let applied = 0;
    let skipped = 0;
    for (const transaction of targets) {
      // A category is income- or expense-typed; skip mismatches rather than fail.
      if (transaction.type !== category.kind) {
        skipped += 1;
        continue;
      }
      try {
        await apiClient.put("/transactions", updatePayload(transaction, category.id));
        applied += 1;
      } catch {
        skipped += 1;
      }
    }
    setBulkPending(false);
    clearSelection();
    setBulkCategory("");
    toast.success(t("tx.bulk.categorized", { applied, skipped }));
    await refresh();
  }

  async function bulkApplyRules() {
    if (pageData.rules.length === 0) {
      toast.info(t("tx.bulk.noRules"));
      return;
    }
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    setBulkPending(true);
    let applied = 0;
    for (const transaction of targets) {
      const ruled = transaction.description
        ? matchRule(transaction.description, pageData.rules)
        : null;
      if (!ruled || ruled === transaction.category.id) continue;
      const category = pageData.categories.find((item) => item.id === ruled);
      if (!category || category.kind !== transaction.type) continue;
      try {
        await apiClient.put("/transactions", updatePayload(transaction, ruled));
        applied += 1;
      } catch {
        /* continue */
      }
    }
    setBulkPending(false);
    clearSelection();
    toast.success(t("tx.bulk.rulesApplied", { count: applied }));
    await refresh();
  }

  // AI batch categorization over the selected rows: asks the model for a category
  // per selected transaction and applies only the confident, valid suggestions.
  async function bulkAiCategorize() {
    const targets = visibleTransactions.filter((tx) => selectedIds.has(tx.id));
    if (targets.length === 0) return;

    // Descriptions leave the device verbatim, and a description is where the
    // counterparty's name lives — "5к, Ларисе" goes as it is written. The
    // insight features send an aggregate instead (averages, savings rate, top
    // categories) and need no such warning; this one does, and it names the
    // provider rather than saying "the AI".
    const confirmed = await confirm({
      title: t("tx.bulk.aiConfirm.title"),
      description: t("tx.bulk.aiConfirm.desc", {
        count: targets.length,
        provider: aiSettings?.aiProvider || "anthropic"
      }),
      confirmLabel: t("tx.bulk.aiConfirm.ok")
    });
    if (!confirmed) return;

    const items = targets.map((tx) => ({
      id: tx.id,
      description: tx.description ?? "",
      type: tx.type
    }));
    const categories = pageData.categories.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind
    }));

    setBulkPending(true);
    try {
      const apiKey = aiSettings?.aiApiKey ?? "";
      if (!apiKey) {
        toast.error(t("ai.err.noKey"));
        return;
      }
      const { requestBatchCategorization } = await import("@/services/ai/AiAssistantService");
      const suggestions = await requestBatchCategorization({
        items,
        categories,
        locale: locale === "en" ? "en" : "ru",
        apiKey,
        model: aiSettings?.aiModel || undefined,
        provider: (aiSettings?.aiProvider as AiProvider) || undefined,
        effort: aiSettings?.aiEffort || undefined
      });

      const byId = new Map(targets.map((tx) => [tx.id, tx]));
      let applied = 0;
      for (const s of suggestions) {
        const tx = byId.get(s.id);
        if (!tx || tx.category.id === s.categoryId) continue;
        try {
          await apiClient.put("/transactions", updatePayload(tx, s.categoryId));
          applied += 1;
        } catch {
          /* skip */
        }
      }
      clearSelection();
      toast.success(t("tx.bulk.aiCategorized", { applied }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiq.err.failed"));
    } finally {
      setBulkPending(false);
    }
  }

  return {
    bulkCategory,
    setBulkCategory,
    bulkPending,
    bulkDelete,
    bulkCategorize,
    bulkApplyRules,
    bulkAiCategorize
  };
}
