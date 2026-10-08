"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { FamilyFields } from "@/components/family/family-fields";
import {
  keepChoice,
  NewAccountDialog,
  NewCategoryDialog
} from "@/components/transactions/quick-create";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
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
import { Textarea } from "@/components/ui/textarea";
import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import type { TransactionsPageData } from "@/lib/data";
import { formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

export function TransactionDialog({
  title,
  description,
  data,
  transaction,
  pending,
  onSubmit,
  onRefsReload
}: {
  title: string;
  description: string;
  data: TransactionsPageData;
  transaction?: TransactionsPageData["transactions"][number];
  pending?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefsReload?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const type = transaction?.type ?? "EXPENSE";
  const [selectedType, setSelectedType] = useState(type);
  const matchingCategories = useMemo(
    () => data.categories.filter((category) => category.kind === selectedType),
    [data.categories, selectedType]
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.category.id ?? matchingCategories[0]?.id ?? ""
  );
  const effectiveCategoryId = matchingCategories.some((category) => category.id === categoryId)
    ? categoryId
    : (matchingCategories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(transaction?.account.id ?? data.accounts[0]?.id ?? "");
  // Auto-categorization: while the user has not manually chosen a category,
  // suggest one from past transactions as they type the description.
  const [manualCategory, setManualCategory] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);

  // «+ Новая» / «+ Новый» open their own small dialogs over this form
  // (components/transactions/quick-create.tsx).
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);

  function changeType(value: "INCOME" | "EXPENSE") {
    const nextCategories = data.categories.filter((category) => category.kind === value);
    setSelectedType(value);
    setCategoryId(nextCategories[0]?.id ?? "");
    setManualCategory(false);
    setAutoSuggested(false);
    setShowNewCategory(false);
  }

  function pickCategory(value: string) {
    setCategoryId(value);
    setManualCategory(true);
    setAutoSuggested(false);
  }

  function onDescriptionChange(value: string) {
    // A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
    // wins even after the user manually picked a (wrong) category.
    const ruled = data.rules.length > 0 ? matchRule(value, data.rules) : null;
    if (ruled && matchingCategories.some((category) => category.id === ruled)) {
      setCategoryId(ruled);
      setAutoSuggested(true);
      return;
    }
    // History heuristic is a softer guess — it only fills in while the user has
    // not chosen a category by hand.
    if (manualCategory) return;
    const suggestion = suggestCategoryId(value, data.transactions, {
      type: selectedType,
      rules: data.rules
    });
    if (suggestion && matchingCategories.some((category) => category.id === suggestion)) {
      setCategoryId(suggestion);
      setAutoSuggested(true);
    } else {
      setAutoSuggested(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}
        {/* Submitted values — kept in hidden inputs so they persist even while an
            inline "create new" form is shown in place of the select. */}
        <input type="hidden" name="categoryId" value={effectiveCategoryId} />
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="type" value={selectedType} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${transaction?.id ?? "new"}-amount`}>{t("common.amount")}</Label>
            <AmountInput
              id={`${transaction?.id ?? "new"}-amount`}
              name="amount"
              min="0"
              step="0.01"
              defaultValue={transaction?.amount ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tx.type")}</Label>
            <Select
              value={selectedType}
              onValueChange={(value) => changeType(value as "INCOME" | "EXPENSE")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{t("tx.type.expense")}</SelectItem>
                <SelectItem value="INCOME">{t("tx.type.income")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("common.category")}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowNewCategory(true)}
              >
                {t("tx.dialog.newCategory")}
              </button>
            </div>
            <>
              <Select
                value={effectiveCategoryId || undefined}
                onValueChange={keepChoice(pickCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("tx.dialog.createCategoryFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {matchingCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoSuggested ? (
                <p className="text-xs text-primary">{t("tx.dialog.autoSuggested")}</p>
              ) : null}
            </>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("tx.account")}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowNewAccount(true)}
              >
                {t("tx.dialog.newAccount")}
              </button>
            </div>
            <Select value={accountId || undefined} onValueChange={keepChoice(setAccountId)}>
              <SelectTrigger>
                <SelectValue placeholder={t("tx.dialog.createAccountFirst")} />
              </SelectTrigger>
              <SelectContent>
                {data.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("common.date")}</Label>
            <Input
              name="date"
              type="date"
              defaultValue={
                transaction ? formatInputDate(transaction.date) : formatInputDate(new Date())
              }
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("tx.col.description")}</Label>
            <Textarea
              name="description"
              defaultValue={transaction?.description ?? ""}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={t("tx.dialog.descPlaceholder")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${transaction?.id ?? "new"}-tags`}>{t("tx.dialog.tags")}</Label>
            <Input
              id={`${transaction?.id ?? "new"}-tags`}
              name="tags"
              defaultValue={transaction?.tags?.join(", ") ?? ""}
              placeholder={t("tx.dialog.tagsPlaceholder")}
            />
          </div>
          {selectedType === "EXPENSE" ? (
            <div className="sm:col-span-2">
              <FamilyFields
                isNew={!transaction}
                initialMemberId={transaction?.memberId}
                initialShared={transaction?.shared}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? t("tx.dialog.saving") : transaction ? t("common.save") : t("common.add")}
          </Button>
        </DialogFooter>
      </form>
      <NewCategoryDialog
        open={showNewCategory}
        onOpenChange={setShowNewCategory}
        kind={selectedType}
        onCreated={async (id) => {
          await onRefsReload?.();
          setCategoryId(id);
          setManualCategory(true);
          setAutoSuggested(false);
        }}
      />
      <NewAccountDialog
        open={showNewAccount}
        onOpenChange={setShowNewAccount}
        onCreated={async (id) => {
          await onRefsReload?.();
          setAccountId(id);
        }}
      />
    </DialogContent>
  );
}
