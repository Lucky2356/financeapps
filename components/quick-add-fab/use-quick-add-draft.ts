"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { removeMine, writeMine } from "@/lib/storage/mine";
import { DRAFT_KEY, encodeDraft, hasContent } from "@/lib/transactions/quick-draft";

import { lastOfType } from "@/components/quick-add-fab/helpers";
import type { QuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";

/** Черновик: недописанное откладывается при закрытии и возвращается при открытии. */
export function useQuickAddDraft(form: QuickAddForm) {
  const { open, type, amount, categoryId, accountId, description, tags, date, ledger } = form;
  // Окно закрыто записью, а не «передумал» — черновика не остаётся.
  const recorded = useRef(false);
  const wasOpen = useRef(false);

  /** Окно закрывается записью: черновик стирается, а не откладывается. */
  function markRecorded() {
    recorded.current = true;
  }

  // Окно закрыли не записью — набранное откладывается. Записью — стирается.
  // Набранное читается из того же рендера, в котором окно закрылось.
  const keepDraft = useEffectEvent(() => {
    if (recorded.current) {
      recorded.current = false;
      removeMine(DRAFT_KEY);
      return;
    }
    const draft = {
      v: 1 as const,
      savedAt: Date.now(),
      type,
      amount,
      categoryId,
      accountId,
      description,
      tags,
      date
    };
    try {
      if (hasContent(draft)) writeMine(DRAFT_KEY, encodeDraft(draft));
    } catch {
      /* черновик — удобство, а не данные */
    }
  });
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    keepDraft();
  }, [open]);

  /** «Начать заново»: убрать восстановленное и вернуться к пустой форме. */
  function startOver() {
    form.setAmount("");
    form.setDescription("");
    form.setTags("");
    form.setSplitParts([]);
    form.setCleanedDescription(null);
    form.setManualCategory(false);
    form.setAutoSuggested(false);
    form.setCategoryId(lastOfType(ledger, type)?.category.id ?? "");
    form.setRestored(false);
    removeMine(DRAFT_KEY);
  }

  return { markRecorded, startOver };
}
