"use client";

import { Plus } from "lucide-react";

import { FAB_RING } from "@/components/ui/fab";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import type { TransactionsPageData } from "@/lib/data";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { ImportPageData, SettingsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";

type BudgetWarning = { category: string; spent: number; limit: number };
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountOption = ImportPageData["accounts"][number];
type CategoryOption = ImportPageData["categories"][number];

const LAST_ACCOUNT_KEY = "quick-add-last-account";

type QuickAddType = "INCOME" | "EXPENSE" | "TRANSFER";

const ACCOUNT_TYPES = [
  { value: "DEBIT_CARD", labelKey: "tx.acctType.DEBIT_CARD" },
  { value: "CASH", labelKey: "tx.acctType.CASH" },
  { value: "SAVINGS", labelKey: "tx.acctType.SAVINGS" },
  { value: "BROKERAGE", labelKey: "tx.acctType.BROKERAGE" }
];

export function QuickAddFab({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // A transfer is the third thing people actually record here: money moving
  // between their own accounts. It is not income and not spending, and having
  // to open the operations screen for it made the quick form only two-thirds
  // useful.
  const [type, setType] = useState<QuickAddType>("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Inline creation state
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("DEBIT_CARD");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  // This is now the only way an operation is created, so it carries what the
  // operations screen's own form used to: the category guessed from the
  // description, and tags.
  const [manualCategory, setManualCategory] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const [ledger, setLedger] = useState<TransactionsPageData | null>(null);

  // The server props are empty on the desktop static build — the real accounts
  // and categories live in the client API (LocalApiClient/IndexedDB).
  const initialRefs = { source: "database", accounts, categories } as ImportPageData;
  const {
    data: refs,
    reload: reloadRefs,
    setData: setRefs
  } = useApiPageData<ImportPageData>(initialRefs, "/import");

  async function openDialog() {
    // Rules and recent operations feed the category guess. Fetched when the
    // dialog opens rather than kept live: it is a hint, not a total.
    void apiClient
      .get<TransactionsPageData>("/transactions?limit=100")
      .then(setLedger)
      .catch(() => setLedger(null));
    // Pre-select the last account the operation was added to. On a device that
    // has never added one there is nothing to remember, and the field stayed
    // empty — the form then refused to save with only a toast to explain
    // itself. Falling back to the first account is what the operations screen's
    // own form used to do.
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_ACCOUNT_KEY);
    } catch {
      /* storage unavailable */
    }
    // Read the accounts here rather than waiting for the shared state to
    // update: the default has to be decided before the dialog is on screen.
    const fresh = await apiClient.get<ImportPageData>("/import").catch(() => null);
    if (fresh) setRefs(fresh);
    const available = (fresh ?? refs).accounts.filter(
      (account) => !(account as AccountOption & { isArchived?: boolean }).isArchived
    );
    const known = last && available.some((account) => account.id === last) ? last : null;
    setAccountId(known ?? available[0]?.id ?? "");
    // Honour the default transaction type from settings.
    try {
      const settings = await apiClient.get<SettingsPageData>("/settings");
      if (settings.defaultTransactionType) setType(settings.defaultTransactionType);
    } catch {
      /* settings unavailable — keep current type */
    }
    setShowNewAccount(false);
    setShowNewCategory(false);
    setOpen(true);
  }

  useEffect(() => {
    const handler = () => {
      void openDialog();
    };
    window.addEventListener("quick-add-open", handler);
    return () => window.removeEventListener("quick-add-open", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = refs.accounts.filter(
    (a) => !(a as AccountOption & { isArchived?: boolean }).isArchived
  );
  const filteredCategories = refs.categories.filter((c) => c.kind === type);
  const today = formatInputDate(new Date());

  async function createAccount() {
    if (!newAccountName.trim()) return;
    try {
      const created = await apiClient.post<{ id: string }>("/accounts", {
        name: newAccountName.trim(),
        type: newAccountType,
        balance: "0"
      });
      await reloadRefs();
      setAccountId(created.id);
      setNewAccountName("");
      setShowNewAccount(false);
      toast.success(t("tx.toast.accountCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.accountCreateError"));
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const created = await apiClient.post<{ id: string }>("/categories", {
        name: newCategoryName.trim(),
        kind: type,
        color: type === "INCOME" ? "#16a34a" : "#64748b",
        isEssential: false,
        isSubscription: false
      });
      await reloadRefs();
      setCategoryId(created.id);
      setNewCategoryName("");
      setShowNewCategory(false);
      toast.success(t("tx.toast.categoryCreated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.categoryCreateError"));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    if (type === "TRANSFER") return submitTransfer(payload);
    if (!accountId) return toast.error(t("qa.err.account"));
    if (!categoryId) return toast.error(t("qa.err.category"));

    try {
      const result = await apiClient.post<{ budgetWarning?: BudgetWarning }>("/transactions", {
        ...payload,
        type,
        accountId,
        categoryId
      });
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      toast.success(t("tx.toast.added"));
      if (result?.budgetWarning) {
        toast.warning(
          t("tx.toast.budgetWarning", {
            category: result.budgetWarning.category,
            spent: formatCurrency(result.budgetWarning.spent),
            limit: formatCurrency(result.budgetWarning.limit)
          })
        );
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    }
  }

  // Same endpoint and payload the operations screen uses for a transfer, so
  // both entry points create exactly the same pair of records.
  async function submitTransfer(payload: Record<string, FormDataEntryValue>) {
    if (!accountId || !toAccountId) return toast.error(t("qa.err.account"));
    if (accountId === toAccountId) return toast.error(t("qa.err.sameAccount"));

    try {
      await apiClient.post("/transactions", {
        action: "transfer",
        amount: payload.amount,
        date: payload.date,
        description: payload.description,
        fromAccountId: accountId,
        toAccountId
      });
      toast.success(t("tx.toast.transferCreated"));
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.transferError"));
    }
  }

  function changeType(next: QuickAddType) {
    setType(next);
    setCategoryId(""); // categories are type-specific
    setToAccountId("");
    setShowNewCategory(false);
    setManualCategory(false);
    setAutoSuggested(false);
  }

  function pickCategory(value: string) {
    setCategoryId(value);
    setManualCategory(true);
    setAutoSuggested(false);
  }

  // A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
  // wins even after a category was picked by hand. The history heuristic is a
  // softer guess and only fills in while nothing has been chosen.
  function onDescriptionChange(value: string) {
    if (type === "TRANSFER" || !ledger) return;
    const known = (id: string) => filteredCategories.some((category) => category.id === id);

    const ruled = ledger.rules.length > 0 ? matchRule(value, ledger.rules) : null;
    if (ruled && known(ruled)) {
      setCategoryId(ruled);
      setAutoSuggested(true);
      return;
    }
    if (manualCategory) return;
    const suggestion = suggestCategoryId(value, ledger.transactions, {
      type: type === "INCOME" ? "INCOME" : "EXPENSE",
      rules: ledger.rules
    });
    if (suggestion && known(suggestion)) {
      setCategoryId(suggestion);
      setAutoSuggested(true);
    } else {
      setAutoSuggested(false);
    }
  }

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
        className={cn(FAB_RING, "fixed bottom-6 right-6 z-40 hidden size-[52px] !px-0 md:flex")}
        onClick={() => void openDialog()}
        aria-label={t("qa.fabAria")}
      >
        <Plus className="size-6 shrink-0" strokeWidth={2.2} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("qa.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("tx.type")}</Label>
              {/* Three ways to record something, one row. */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={type === "EXPENSE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeType("EXPENSE")}
                >
                  {t("tx.type.expense")}
                </Button>
                <Button
                  type="button"
                  variant={type === "INCOME" ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeType("INCOME")}
                >
                  {t("tx.type.income")}
                </Button>
                <Button
                  type="button"
                  variant={type === "TRANSFER" ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeType("TRANSFER")}
                  disabled={activeAccounts.length < 2}
                  title={activeAccounts.length < 2 ? t("qa.transfer.needTwo") : undefined}
                >
                  {t("tx.transfer")}
                </Button>
              </div>
            </div>

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
                />
              </div>

              {/* Category with inline creation — a transfer has none: the money
                does not leave the household, it changes pocket. */}
              <div className={type === "TRANSFER" ? "hidden" : "space-y-2"}>
                <div className="flex items-center justify-between">
                  <Label htmlFor="fab-category">{t("common.category")}</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowNewCategory((v) => !v)}
                  >
                    {showNewCategory ? t("tx.dialog.cancel") : t("tx.dialog.newCategory")}
                  </button>
                </div>
                {showNewCategory ? (
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder={
                        type === "INCOME"
                          ? t("tx.dialog.catPlaceholderIncome")
                          : t("tx.dialog.catPlaceholderExpense")
                      }
                    />
                    <Button type="button" variant="outline" onClick={() => void createCategory()}>
                      {t("tx.dialog.create")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select value={categoryId || undefined} onValueChange={pickCategory}>
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
                  </>
                )}
              </div>

              {/* Account with inline creation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fab-account">
                    {type === "TRANSFER" ? t("tx.transfer.from") : t("common.account")}
                  </Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowNewAccount((v) => !v)}
                  >
                    {showNewAccount ? t("tx.dialog.cancel") : t("tx.dialog.newAccount")}
                  </button>
                </div>
                {showNewAccount ? (
                  <div className="flex gap-2">
                    <Input
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder={t("tx.dialog.accountPlaceholder")}
                    />
                    <Select value={newAccountType} onValueChange={setNewAccountType}>
                      <SelectTrigger className="w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {t(opt.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={() => void createAccount()}>
                      {t("tx.dialog.create")}
                    </Button>
                  </div>
                ) : (
                  <Select value={accountId || undefined} onValueChange={setAccountId}>
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
                )}
              </div>

              {type === "TRANSFER" ? (
                <div className="space-y-2">
                  <Label htmlFor="fab-to-account">{t("tx.transfer.to")}</Label>
                  <Select value={toAccountId || undefined} onValueChange={setToAccountId}>
                    <SelectTrigger id="fab-to-account">
                      <SelectValue placeholder={t("ai.selectAccount")} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAccounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="fab-date">{t("common.date")}</Label>
                <Input id="fab-date" name="date" type="date" defaultValue={today} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fab-description">{t("qa.descLabel")}</Label>
                <Input
                  id="fab-description"
                  name="description"
                  maxLength={180}
                  placeholder={t("qa.descPlaceholder")}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                />
              </div>

              {type !== "TRANSFER" ? (
                <div className="space-y-2">
                  <Label htmlFor="fab-tags">{t("tx.dialog.tags")}</Label>
                  <Input id="fab-tags" name="tags" placeholder={t("tx.dialog.tagsPlaceholder")} />
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
    </>
  );
}
