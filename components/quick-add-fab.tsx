"use client";

import { Plus, ScanLine } from "lucide-react";

import { FavoriteChips } from "@/components/transactions/favorite-chips";
import { FAB_RING } from "@/components/ui/fab";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";

import { quickDates } from "@/lib/transactions/quick-dates";
import { ReceiptPhotoDialog } from "@/components/transactions/receipt-photo-dialog";
import { cameraPossible } from "@/lib/sync/scan-qr";
import { useConfirmFutureDate } from "@/hooks/use-confirm-future-date";
import { useI18n } from "@/lib/i18n/context";

import { FamilyFields } from "@/components/family/family-fields";
import { AmountInput } from "@/components/ui/amount-input";
import { CategoryOptionLabel } from "@/components/category-option";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  keepChoice,
  NewAccountDialog,
  NewCategoryDialog
} from "@/components/transactions/quick-create";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";
import { Label } from "@/components/ui/label";

import type { AccountOption, CategoryOption } from "@/components/quick-add-fab/helpers";
import {
  CashbackHint,
  CleanedDescriptionNote,
  DraftBanner,
  LimitHint,
  TripHint
} from "@/components/quick-add-fab/hints";
import { SplitPartsEditor } from "@/components/quick-add-fab/split-parts-editor";
import { TransferToAccountField } from "@/components/quick-add-fab/transfer-fields";
import { QuickAddTypeSwitch } from "@/components/quick-add-fab/type-switch";
import { useQuickAddDraft } from "@/components/quick-add-fab/use-quick-add-draft";
import { useQuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";
import { useQuickAddHints } from "@/components/quick-add-fab/use-quick-add-hints";
import { useQuickAddOpen } from "@/components/quick-add-fab/use-quick-add-open";
import { useQuickAddSubmit } from "@/components/quick-add-fab/use-quick-add-submit";
import { useQuickAddSuggestions } from "@/components/quick-add-fab/use-quick-add-suggestions";

export { splitRemainder } from "@/components/quick-add-fab/helpers";

// Части окна лежат в ./quick-add-fab/: поля и их состояние, открытие, черновик,
// подсказки, разбор описания и запись. Здесь — сборка и разметка окна.
export function QuickAddFab({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  // На «Таблице» плавающей кнопки нет: она садилась ровно на прибитый к правому
  // краю столбец «Итог» и закрывала его нижние клетки. Запись операции там
  // остаётся — клавишами Alt+N и через поиск (Ctrl+K).
  const onSheet = usePathname()?.startsWith("/sheet") ?? false;
  const confirmFutureDate = useConfirmFutureDate();
  const { t } = useI18n();
  const form = useQuickAddForm({ accounts, categories });
  const {
    open,
    setOpen,
    type,
    accountId,
    setAccountId,
    toAccountId,
    setToAccountId,
    categoryId,
    setCategoryId,
    showNewAccount,
    setShowNewAccount,
    showNewCategory,
    setShowNewCategory,
    setManualCategory,
    autoSuggested,
    setAutoSuggested,
    amount,
    setAmount,
    splitParts,
    setSplitParts,
    description,
    date,
    setDate,
    tags,
    setTags,
    cleanedDescription,
    photoFor,
    setPhotoFor,
    skipTrip,
    setSkipTrip,
    restored,
    reloadRefs,
    activeAccounts,
    filteredCategories,
    changeType,
    pickCategory
  } = form;
  const { openDialog, scanReceipt } = useQuickAddOpen({ form, t });
  const { betterCard, tripHere, limitNote } = useQuickAddHints(form);
  const { markRecorded, startOver } = useQuickAddDraft(form);
  const { handleSubmit } = useQuickAddSubmit({
    form,
    confirmFutureDate,
    t,
    markRecorded,
    router
  });
  const { onDescriptionChange } = useQuickAddSuggestions(form);

  return (
    <>
      <button
        type="button"
        // Hidden on a phone: the bottom bar carries the round add button there,
        // and two of them would compete. Desktop has no bottom bar, so it stays.
        //
        // The ring is the whole trick. A plain circle sitting on top of a table
        // dissolved into whatever was under it; a ring in the page colour cuts
        // a clean hole around the button, so it reads as floating above the
        // screen on any background and in either theme.
        className={cn(
          FAB_RING,
          "fixed bottom-6 right-6 z-40 hidden size-[52px] !px-0",
          !onSheet && "md:flex"
        )}
        onClick={() => void openDialog()}
        aria-label={t("qa.fabAria")}
      >
        <Plus className="size-6 shrink-0" strokeWidth={2.2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("qa.title")}</DialogTitle>
          </DialogHeader>
          {cameraPossible() ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void scanReceipt()}
            >
              <ScanLine className="size-4" />
              {t("qa.receipt.scan")}
            </Button>
          ) : null}
          {type !== "TRANSFER" ? (
            <FavoriteChips
              key={type}
              type={type}
              accountId={accountId}
              onRecorded={() => {
                markRecorded();
                setOpen(false);
                router.refresh();
              }}
            />
          ) : null}
          <div className="grid gap-4">
            {restored ? <DraftBanner onDiscard={startOver} /> : null}
            <QuickAddTypeSwitch
              type={type}
              onChange={changeType}
              canTransfer={activeAccounts.length >= 2}
            />

            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="fab-amount">{t("common.amount")}</Label>
                <AmountInput
                  id="fab-amount"
                  name="amount"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  autoFocus
                  required
                  value={amount}
                  onValueChange={setAmount}
                />
              </div>

              {/* Category — a transfer has none: the money does not leave the
                household, it changes pocket. «+ Новая» opens its own small
                dialog (NewCategoryDialog) over this one. */}
              <div className={type === "TRANSFER" ? "hidden" : "space-y-2"}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="fab-category">{t("common.category")}</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowNewCategory(true)}
                  >
                    {t("tx.dialog.newCategory")}
                  </button>
                </div>
                <Select value={categoryId || undefined} onValueChange={keepChoice(pickCategory)}>
                  <SelectTrigger id="fab-category">
                    <SelectValue placeholder={t("ai.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <CategoryOptionLabel label={c.label} color={c.color} icon={c.icon} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autoSuggested ? (
                  <p className="text-xs text-primary">{t("tx.dialog.autoSuggested")}</p>
                ) : null}
                {limitNote ? <LimitHint note={limitNote} /> : null}
                <SplitPartsEditor
                  amount={amount}
                  splitParts={splitParts}
                  setSplitParts={setSplitParts}
                  categories={filteredCategories}
                />
              </div>

              {/* Account — «+ Новый» opens NewAccountDialog over this one. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fab-account">
                    {type === "TRANSFER" ? t("tx.transfer.from") : t("common.account")}
                  </Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowNewAccount(true)}
                  >
                    {t("tx.dialog.newAccount")}
                  </button>
                </div>
                <Select value={accountId || undefined} onValueChange={keepChoice(setAccountId)}>
                  <SelectTrigger id="fab-account">
                    <SelectValue placeholder={t("ai.selectAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {betterCard ? <CashbackHint card={betterCard} onSwitch={setAccountId} /> : null}
              </div>

              {tripHere ? (
                <TripHint trip={tripHere} skipTrip={skipTrip} onSkipTripChange={setSkipTrip} />
              ) : null}

              {type === "TRANSFER" ? (
                <TransferToAccountField
                  accounts={activeAccounts}
                  fromAccountId={accountId}
                  toAccountId={toAccountId}
                  onChange={setToAccountId}
                />
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="fab-date">{t("common.date")}</Label>
                {/* Дата — десять знаков; на всю ширину диалога поле было
                    почти пустым. Рядом — три даты, нужные почти всегда: вчерашнюю
                    трату через календарь телефона записывали пятью касаниями. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="fab-date"
                    name="date"
                    type="date"
                    className="w-44"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                  {quickDates().map((quick) => (
                    <Button
                      key={quick.id}
                      type="button"
                      size="sm"
                      variant={date === quick.iso ? "secondary" : "outline"}
                      data-testid={`qa-date-${quick.id}`}
                      onClick={() => setDate(quick.iso)}
                    >
                      {t(`qa.date.${quick.id}`)}
                    </Button>
                  ))}
                </div>
              </div>

              {type === "EXPENSE" ? <FamilyFields isNew /> : null}

              <div className="space-y-2">
                <Label htmlFor="fab-description">{t("qa.descLabel")}</Label>
                <Input
                  id="fab-description"
                  name="description"
                  maxLength={180}
                  placeholder={t("qa.descPlaceholder")}
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                />
                {/* Набранное и сохранённое расходятся — см. CleanedDescriptionNote. */}
                {cleanedDescription !== null ? (
                  <CleanedDescriptionNote text={cleanedDescription} />
                ) : null}
              </div>

              {type !== "TRANSFER" ? (
                <div className="space-y-2">
                  <FieldLabel htmlFor="fab-tags" help={t("help.tx.tags")}>
                    {t("tx.dialog.tags")}
                  </FieldLabel>
                  <Input
                    id="fab-tags"
                    name="tags"
                    placeholder={t("tx.dialog.tagsPlaceholder")}
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                  />
                </div>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("tx.dialog.cancel")}
                </Button>
                <Button type="submit">{t("common.add")}</Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <NewAccountDialog
        open={showNewAccount}
        onOpenChange={setShowNewAccount}
        onCreated={async (id) => {
          await reloadRefs();
          setAccountId(id);
        }}
      />
      <ReceiptPhotoDialog transactionId={photoFor} onClose={() => setPhotoFor(null)} />
      <NewCategoryDialog
        open={showNewCategory}
        onOpenChange={setShowNewCategory}
        kind={type === "INCOME" ? "INCOME" : "EXPENSE"}
        onCreated={async (id) => {
          await reloadRefs();
          setCategoryId(id);
          setManualCategory(true);
          setAutoSuggested(false);
        }}
      />
    </>
  );
}
