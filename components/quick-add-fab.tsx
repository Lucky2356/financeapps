"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { ImportPageData, SettingsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";

type BudgetWarning = { category: string; spent: number; limit: number };
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountOption = ImportPageData["accounts"][number];
type CategoryOption = ImportPageData["categories"][number];

const ACCOUNT_TYPES = [
  { value: "DEBIT_CARD", label: "Дебетовая карта" },
  { value: "CASH", label: "Наличные" },
  { value: "SAVINGS", label: "Накопительный" },
  { value: "BROKERAGE", label: "Брокерский" }
];

export function QuickAddFab({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Inline creation state
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("DEBIT_CARD");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);

  // The server props are empty on the desktop static build — the real accounts
  // and categories live in the client API (LocalApiClient/IndexedDB).
  const initialRefs = { source: "database", accounts, categories } as ImportPageData;
  const { data: refs, reload: reloadRefs } = useApiPageData<ImportPageData>(initialRefs, "/import");

  async function openDialog() {
    void reloadRefs();
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
    const handler = () => { void openDialog(); };
    window.addEventListener("quick-add-open", handler);
    return () => window.removeEventListener("quick-add-open", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = refs.accounts.filter((a) => !(a as AccountOption & { isArchived?: boolean }).isArchived);
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
      toast.success("Счёт создан");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать счёт");
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
      toast.success("Категория создана");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать категорию");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId) return toast.error("Выберите или создайте счёт");
    if (!categoryId) return toast.error("Выберите или создайте категорию");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await apiClient.post<{ budgetWarning?: BudgetWarning }>("/transactions", {
        ...payload,
        type,
        accountId,
        categoryId
      });
      toast.success("Операция добавлена");
      if (result?.budgetWarning) {
        toast.warning(
          `Превышен лимит «${result.budgetWarning.category}»: потрачено ${formatCurrency(result.budgetWarning.spent)} из ${formatCurrency(result.budgetWarning.limit)}`
        );
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить операцию");
    }
  }

  function changeType(next: "INCOME" | "EXPENSE") {
    setType(next);
    setCategoryId(""); // categories are type-specific
    setShowNewCategory(false);
  }

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-20 right-4 z-40 size-14 rounded-full shadow-lg md:bottom-6 md:right-6"
        onClick={() => void openDialog()}
        aria-label="Быстрое добавление операции"
      >
        <Plus className="size-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Быстрое добавление</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="space-y-2">
              <Label>Тип</Label>
              <div className="flex gap-2">
                <Button type="button" variant={type === "EXPENSE" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => changeType("EXPENSE")}>
                  Расход
                </Button>
                <Button type="button" variant={type === "INCOME" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => changeType("INCOME")}>
                  Доход
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-amount">Сумма</Label>
              <Input id="fab-amount" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
            </div>

            {/* Category with inline creation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fab-category">Категория</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewCategory((v) => !v)}>
                  {showNewCategory ? "Отмена" : "+ Новая"}
                </button>
              </div>
              {showNewCategory ? (
                <div className="flex gap-2">
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={type === "INCOME" ? "Напр.: Премия" : "Напр.: Аптека"} />
                  <Button type="button" variant="outline" onClick={() => void createCategory()}>Создать</Button>
                </div>
              ) : (
                <select id="fab-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Выберите категорию</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Account with inline creation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fab-account">Счёт</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewAccount((v) => !v)}>
                  {showNewAccount ? "Отмена" : "+ Новый"}
                </button>
              </div>
              {showNewAccount ? (
                <div className="flex gap-2">
                  <Input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Напр.: Тинькофф" />
                  <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => void createAccount()}>Создать</Button>
                </div>
              ) : (
                <select id="fab-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Выберите счёт</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-date">Дата</Label>
              <Input id="fab-date" name="date" type="date" defaultValue={today} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fab-description">Описание (необязательно)</Label>
              <Input id="fab-description" name="description" maxLength={180} placeholder="Например: продукты" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
              <Button type="submit">Добавить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
