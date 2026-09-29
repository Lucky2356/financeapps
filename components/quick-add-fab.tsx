"use client";

import { Plus, ScanLine, X } from "lucide-react";

import { FavoriteChips } from "@/components/transactions/favorite-chips";
import { FAB_RING } from "@/components/ui/fab";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import { parseEntry, type ParsedEntry } from "@/lib/transactions/parse-entry";
import type { TransactionsPageData } from "@/lib/data";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { ImportPageData, SettingsPageData } from "@/lib/data";
import { formatCurrency, formatInputDate } from "@/lib/format";
import { parseFnsReceipt } from "@/lib/receipts/fns-qr";
import { ReceiptPhotoDialog } from "@/components/transactions/receipt-photo-dialog";
import { bestCard, rateFor, type CashbackRule } from "@/lib/cashback/cashback";
import type { CashbackPageData, TripsPageData } from "@/lib/api/local/extras";
import type { TripView } from "@/lib/trips/trips";
import { cameraPossible, scanQr, waitForNoModal } from "@/lib/sync/scan-qr";
import {
  QUICK_ADD_OPEN,
  takeQuickAddRequest,
  type QuickAddRequest
} from "@/lib/transactions/quick-add-request";
import { useConfirmFutureDate } from "@/hooks/use-confirm-future-date";
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
import {
  keepChoice,
  NewAccountDialog,
  NewCategoryDialog
} from "@/components/transactions/quick-create";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";
import { Label } from "@/components/ui/label";
import { DEFAULT_ACCOUNT_KEY, LAST_ACCOUNT_KEY, readMine, writeMine } from "@/lib/storage/mine";

type AccountOption = ImportPageData["accounts"][number];
type CategoryOption = ImportPageData["categories"][number];

type QuickAddType = "INCOME" | "EXPENSE" | "TRANSFER";

/**
 * Последняя операция этого типа — верхняя строка журнала, отсортированного по
 * дате. Переводы в счёт не идут: у них нет категории.
 */
function lastOfType(ledger: TransactionsPageData | null, type: QuickAddType) {
  if (type === "TRANSFER") return undefined;
  return ledger?.transactions.find(
    (transaction) => !transaction.transferId && transaction.type === type
  );
}

export function QuickAddFab({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const confirmFutureDate = useConfirmFutureDate();
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
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  // This is now the only way an operation is created, so it carries what the
  // operations screen's own form used to: the category guessed from the
  // description, and tags.
  const [manualCategory, setManualCategory] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const [ledger, setLedger] = useState<TransactionsPageData | null>(null);
  // Поля стали управляемыми: разбор строки пишет в них, а не только читает при
  // отправке. Тело запроса от этого не изменилось — форма по-прежнему уходит
  // через FormData.
  const [amount, setAmount] = useState("");
  // Разделить покупку по категориям: основная категория получает остаток,
  // здесь — остальные части.
  const [splitParts, setSplitParts] = useState<Array<{ categoryId: string; amount: string }>>([]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [tags, setTags] = useState("");
  // То, что в поля вписал разбор. Поле остаётся «нашим», пока в нём стоит ровно
  // это: тогда следующая набранная цифра его обновит. Стоит человеку поправить
  // поле руками — значение перестаёт совпадать, и разбор туда больше не лезет.
  const [filledIn, setFilledIn] = useState<{
    amount: string;
    accountId: string;
    date: string;
    tags: string;
  }>({ amount: "", accountId: "", date: "", tags: "" });
  // Описание, очищенное от суммы, даты, тегов и слова счёта, — то, что уйдёт в
  // журнал. Показывается человеку, потому что расходится с набранным.
  const [cleanedDescription, setCleanedDescription] = useState<string | null>(null);
  // Сумма пришла с QR чека — после записи предложим сфотографировать сам чек.
  const [fromReceipt, setFromReceipt] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  // Условия кэшбэка этого месяца и идущая поездка — подсказки под полями.
  const [cashback, setCashback] = useState<CashbackRule[]>([]);
  const [trip, setTrip] = useState<TripView | null>(null);
  const [skipTrip, setSkipTrip] = useState(false);

  // The server props are empty on the desktop static build — the real accounts
  // and categories live in the client API (LocalApiClient/IndexedDB).
  const initialRefs = { source: "database", accounts, categories } as ImportPageData;
  const {
    data: refs,
    reload: reloadRefs,
    setData: setRefs
  } = useApiPageData<ImportPageData>(initialRefs, "/import");

  async function openDialog(request: QuickAddRequest = {}) {
    // Rules and recent operations feed the category guess. Fetched when the
    // dialog opens rather than kept live: it is a hint, not a total.
    //
    // Ждём его здесь же: из него берутся категория и счёт последней операции,
    // и они должны стоять в полях, когда диалог появится.
    const recent = await apiClient
      .get<TransactionsPageData>("/transactions?limit=100")
      .catch(() => null);
    setLedger(recent);
    void apiClient
      .get<CashbackPageData>("/cashback")
      .then((result) => setCashback(result?.rules ?? []))
      .catch(() => setCashback([]));
    void apiClient
      .get<TripsPageData>("/trips")
      .then((result) => setTrip(result?.active ?? null))
      .catch(() => setTrip(null));
    setSkipTrip(false);
    // Pre-select the last account the operation was added to. On a device that
    // has never added one there is nothing to remember, and the field stayed
    // empty — the form then refused to save with only a toast to explain
    // itself. Falling back to the first account is what the operations screen's
    // own form used to do.
    // Счёт из настроек, если человек его выбрал, иначе — последний.
    const chosen = readMine(DEFAULT_ACCOUNT_KEY);
    const last = readMine(LAST_ACCOUNT_KEY);
    // Read the accounts here rather than waiting for the shared state to
    // update: the default has to be decided before the dialog is on screen.
    const fresh = await apiClient.get<ImportPageData>("/import").catch(() => null);
    if (fresh) setRefs(fresh);
    const available = (fresh ?? refs).accounts.filter(
      (account) => !(account as AccountOption & { isArchived?: boolean }).isArchived
    );
    const usable = (id: string | null) =>
      id && available.some((account) => account.id === id) ? id : null;
    // Honour the default transaction type from settings.
    let openedType = type;
    try {
      const settings = await apiClient.get<SettingsPageData>("/settings");
      if (settings.defaultTransactionType) openedType = settings.defaultTransactionType;
    } catch {
      /* settings unavailable — keep current type */
    }
    // Ярлык «Доход» на значке важнее типа по умолчанию из настроек.
    if (request.type) openedType = request.type;
    setType(openedType);
    // Категория и счёт — как у последней операции того же типа: чаще всего
    // следующая такая же. Счёт, выбранный в настройках, главнее.
    const previous = lastOfType(recent, openedType);
    const known = usable(chosen) ?? usable(previous?.account.id ?? null) ?? usable(last);
    const preselectedAccount = known ?? available[0]?.id ?? "";
    setAccountId(preselectedAccount);
    setShowNewAccount(false);
    setShowNewCategory(false);
    // Диалог открывается чистым. Раньше это держалось на том, что Radix
    // размонтирует содержимое, и поля в разметке возникали заново; теперь поля
    // управляемые, и обнулять их нужно явно — иначе прошлая сумма встретила бы
    // человека при следующем открытии.
    const openedOn = formatInputDate(new Date());
    setAmount("");
    setDescription("");
    setDate(openedOn);
    setTags("");
    // Счёт и дата открываются не пустыми: счёт — последний использованный, дата
    // — сегодняшняя. Записываем их сюда же, иначе разбор счёл бы их чужими и
    // «1200 продукты картой» не переставило бы счёт с подставленного.
    setFilledIn({ amount: "", accountId: preselectedAccount, date: openedOn, tags: "" });
    setFromReceipt(false);
    setCleanedDescription(null);
    setCategoryId(previous?.category.id ?? "");
    setSplitParts([]);
    setManualCategory(false);
    setAutoSuggested(false);
    // Ярлык «Сканировать чек»: сначала камера, окно — уже с суммой. Не
    // наоборот: поверх открытого окна камера вешает телефон (см. scanReceipt).
    if (request.scanReceipt && cameraPossible()) {
      void scanReceipt(openedType);
      return;
    }
    setOpen(true);
  }

  useEffect(() => {
    // Открыть по просьбе снаружи: ярлык на значке, кнопка «Операция» и т. п.
    // Просьба могла прийти раньше, чем эта кнопка появилась, — тогда она ждёт.
    const handler = () => {
      const request = takeQuickAddRequest();
      void openDialog(request ?? {});
    };
    window.addEventListener(QUICK_ADD_OPEN, handler);
    const early = takeQuickAddRequest();
    // На микрозадачу, а не прямо в эффекте: окно открывается состоянием.
    if (early) void Promise.resolve().then(() => openDialog(early));
    return () => window.removeEventListener(QUICK_ADD_OPEN, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccounts = refs.accounts.filter(
    (a) => !(a as AccountOption & { isArchived?: boolean }).isArchived
  );
  const filteredCategories = refs.categories.filter((c) => c.kind === type);

  // Какой картой выгоднее — по условиям кэшбэка месяца операции.
  const operationMonth = (date || formatInputDate(new Date())).slice(0, 7);
  const best =
    type === "EXPENSE" && categoryId ? bestCard(cashback, categoryId, operationMonth) : null;
  const currentRate =
    accountId && categoryId
      ? (rateFor(cashback, accountId, categoryId, operationMonth)?.percent ?? 0)
      : 0;
  const bestAccount = best ? activeAccounts.find((a) => a.id === best.accountId) : undefined;
  const betterCard =
    best && bestAccount && best.accountId !== accountId && best.percent > currentRate
      ? { id: bestAccount.id, name: bestAccount.name, percent: best.percent }
      : null;
  const operationDay = date || formatInputDate(new Date());
  const tripHere =
    type === "EXPENSE" && trip && trip.from <= operationDay && operationDay <= trip.to
      ? trip
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    // В журнал уходит описание без того, что разбор уже разложил по полям:
    // «1200 продукты картой» сохраняется как «продукты». В поле осталось
    // набранное целиком — намеренно, и под полем написано, что сохранится.
    if (cleanedDescription !== null) payload.description = cleanedDescription;

    if (!(await confirmFutureDate(payload.date))) return;
    if (type === "TRANSFER") return submitTransfer(payload);
    if (!accountId) return toast.error(t("qa.err.account"));
    if (!categoryId) return toast.error(t("qa.err.category"));

    if (splitParts.length > 0) return submitSplit(payload);

    try {
      const result = await apiClient.post<{
        id?: string;
        budgetWarning?: BudgetWarning;
        unusual?: { usual: number };
      }>("/transactions", {
        ...payload,
        type,
        accountId,
        categoryId
      });
      try {
        writeMine(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      const savedId = result?.id;
      if (fromReceipt && savedId) {
        toast.success(t("tx.toast.added"), {
          description: t("photo.offer"),
          duration: 10_000,
          action: { label: t("photo.offerAction"), onClick: () => setPhotoFor(savedId) }
        });
      } else {
        toast.success(t("tx.toast.added"));
      }
      if (result?.budgetWarning) {
        toast.warning(
          t("tx.toast.budgetWarning", {
            category: result.budgetWarning.category,
            spent: formatCurrency(result.budgetWarning.spent),
            limit: formatCurrency(result.budgetWarning.limit)
          })
        );
      }
      // Сторож: втрое больше обычного — не лишний ли ноль?
      if (result?.unusual) {
        toast.warning(
          t("watch.unusualNow", {
            amount: formatCurrency(toNumber(amount)),
            usual: formatCurrency(result.unusual.usual)
          }),
          { duration: 10_000 }
        );
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    }
  }

  // Покупка по нескольким категориям: основная получает остаток.
  async function submitSplit(payload: Record<string, FormDataEntryValue>) {
    const extras = splitParts.filter((part) => part.categoryId && toNumber(part.amount) > 0);
    const rest = splitRemainder(amount, splitParts);
    if (extras.length !== splitParts.length) return toast.error(t("qa.split.errPart"));
    if (!(rest > 0)) return toast.error(t("qa.split.errRest"));
    try {
      await apiClient.post("/transactions", {
        ...payload,
        action: "split",
        type,
        accountId,
        parts: JSON.stringify([
          { categoryId, amount: String(rest) },
          ...extras.map((part) => ({ categoryId: part.categoryId, amount: part.amount }))
        ])
      });
      try {
        writeMine(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      toast.success(t("qa.split.added", { count: extras.length + 1 }));
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
    // Категории у каждого типа свои — берём ту, что была у последней
    // операции этого типа.
    setCategoryId(lastOfType(ledger, next)?.category.id ?? "");
    setToAccountId("");
    setShowNewCategory(false);
    setManualCategory(false);
    setAutoSuggested(false);
    setSplitParts([]);
  }

  // QR с кассового чека: сумма, дата и расход/возврат — без набора руками.
  // Категорию подставляет то же, что и всегда: прошлые операции и правила.
  //
  // ОКНО НА ВРЕМЯ СЪЁМКИ ЗАКРЫВАЕТСЯ. Открытое модальное окно держит страницу
  // (гасит касания, ловит фокус), и камера поверх него вешала телефон намертво.
  // Поля живут здесь, а не в окне, — после съёмки оно открывается с тем же,
  // что было, плюс сумма и дата с чека.
  async function scanReceipt(current: QuickAddType = type) {
    setOpen(false);
    await waitForNoModal();
    const shot = await scanQr({ hint: t("qa.receipt.hint") });
    setOpen(true);
    if (!shot.ok) {
      if (shot.why === "denied") toast.error(t("qa.receipt.denied"));
      else if (shot.why === "broken") toast.error(t("qa.receipt.broken"));
      return;
    }
    const receipt = parseFnsReceipt(shot.text);
    if (!receipt) {
      toast.error(t("qa.receipt.notReceipt"));
      return;
    }
    if (receipt.type !== current) changeType(receipt.type);
    const written = String(receipt.amount);
    setAmount(written);
    setDate(receipt.date);
    setFilledIn((was) => ({ ...was, amount: written, date: receipt.date }));
    setFromReceipt(true);
    toast.success(
      t("qa.receipt.done", {
        amount: formatCurrency(receipt.amount, "RUB"),
        time: receipt.time
      })
    );
  }

  function pickCategory(value: string) {
    // Пустое значение — не выбор человека: пустого пункта в списке нет.
    // Так Radix сообщает, что прежнее значение пропало из списка, а список
    // меняется при смене типа операции, и без этой проверки пересобранный
    // список стирал только что подставленную категорию.
    if (!value) return;
    setCategoryId(value);
    setManualCategory(true);
    setAutoSuggested(false);
  }

  /** Поле «наше», пока в нём стоит ровно то, что вписал разбор, или пусто. */
  function ours(current: string, written: string): boolean {
    return current === "" || current === written;
  }

  // Одна строка вместо формы. Человек пишет «1200 продукты картой» в описание —
  // сумма, счёт, дата и теги расходятся по своим полям на глазах, и любое из
  // них можно тут же поправить: с этого момента разбор в него не пишет.
  //
  // Само описание остаётся ровно таким, каким его набрали: подменять текст под
  // курсором — верный способ испортить набор на середине слова. В журнал уйдёт
  // очищенное, и об этом сказано строкой ниже поля.
  //
  // A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
  // wins even after a category was picked by hand. The history heuristic is a
  // softer guess and only fills in while nothing has been chosen.
  /** Раскладывает разобранное по полям, не трогая поправленное руками. */
  function fillFromParsed(parsed: ParsedEntry) {
    const written = { ...filledIn };
    if (parsed.amount !== null && ours(amount, filledIn.amount)) {
      written.amount = String(parsed.amount);
      setAmount(written.amount);
    }
    if (parsed.accountId && ours(accountId, filledIn.accountId)) {
      written.accountId = parsed.accountId;
      setAccountId(parsed.accountId);
    }
    if (parsed.date && ours(date, filledIn.date)) {
      written.date = parsed.date;
      setDate(parsed.date);
    }
    if (parsed.tags.length > 0 && ours(tags, filledIn.tags)) {
      written.tags = parsed.tags.join(", ");
      setTags(written.tags);
    }
    setFilledIn(written);
    // Знак перед суммой — единственное, что меняет тип: «+5000» это доход.
    if (parsed.type && parsed.type !== type) setType(parsed.type);
  }

  /**
   * Категория по тексту.
   *
   * A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
   * wins even after a category was picked by hand. The history heuristic is a
   * softer guess and only fills in while nothing has been chosen.
   */
  function suggestCategoryFor(
    text: string,
    rules: TransactionsPageData["rules"],
    history: TransactionsPageData["transactions"]
  ) {
    const known = (id: string) => filteredCategories.some((category) => category.id === id);

    const ruled = rules.length > 0 ? matchRule(text, rules) : null;
    if (ruled && known(ruled)) {
      setCategoryId(ruled);
      setAutoSuggested(true);
      return;
    }
    if (manualCategory) return;
    const suggestion = suggestCategoryId(text, history, {
      type: type === "INCOME" ? "INCOME" : "EXPENSE",
      rules
    });
    if (suggestion && known(suggestion)) {
      setCategoryId(suggestion);
      setAutoSuggested(true);
    } else {
      setAutoSuggested(false);
    }
  }

  function onDescriptionChange(value: string) {
    setDescription(value);
    if (type === "TRANSFER" || !ledger) return;

    const parsed = parseEntry(value, {
      accounts: activeAccounts.map((account) => ({ id: account.id, label: account.name })),
      history: ledger.transactions,
      rules: ledger.rules,
      type: type === "INCOME" ? "INCOME" : "EXPENSE",
      today: new Date()
    });

    fillFromParsed(parsed);
    setCleanedDescription(parsed.description === value.trim() ? null : parsed.description);
    suggestCategoryFor(parsed.description || value, ledger.rules, ledger.transactions);
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
                setOpen(false);
                router.refresh();
              }}
            />
          ) : null}
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
                              was.map((row, at) =>
                                at === index ? { ...row, categoryId: value } : row
                              )
                            )
                          )}
                        >
                          <SelectTrigger aria-label={t("qa.split.partCategory", { n: index + 2 })}>
                            <SelectValue placeholder={t("ai.selectCategory")} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                <CategoryOptionLabel
                                  label={c.label}
                                  color={c.color}
                                  icon={c.icon}
                                />
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
                          onClick={() =>
                            setSplitParts((was) => was.filter((_, at) => at !== index))
                          }
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
                {betterCard ? (
                  <p
                    className="flex flex-wrap items-center gap-x-2 text-xs text-success"
                    data-testid="cashback-hint"
                  >
                    {t("cashback.better", {
                      card: betterCard.name,
                      percent: betterCard.percent
                    })}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={() => setAccountId(betterCard.id)}
                    >
                      {t("cashback.switch")}
                    </button>
                  </p>
                ) : null}
              </div>

              {tripHere ? (
                <label
                  className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs"
                  data-testid="trip-hint"
                >
                  <span>{t("trip.on", { name: tripHere.name, tag: tripHere.tag })}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={skipTrip}
                      onChange={(event) => setSkipTrip(event.target.checked)}
                    />
                    {t("trip.skip")}
                  </span>
                  {skipTrip ? <input type="hidden" name="noTrip" value="1" /> : null}
                </label>
              ) : null}

              {type === "TRANSFER" ? (
                <div className="space-y-2">
                  <Label htmlFor="fab-to-account">{t("tx.transfer.to")}</Label>
                  <Select
                    value={toAccountId || undefined}
                    onValueChange={keepChoice(setToAccountId)}
                  >
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
                {/* Дата — десять знаков; на всю ширину диалога поле было
                    почти пустым. */}
                <Input
                  id="fab-date"
                  name="date"
                  type="date"
                  className="w-44"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>

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
                {/* Набранное и сохранённое здесь расходятся: сумма, дата, теги
                    и слово счёта разошлись по своим полям. Сказать об этом
                    прямо честнее, чем тихо сохранить не то, что видно. */}
                {cleanedDescription !== null ? (
                  <p className="text-xs text-muted-foreground" data-testid="qa-cleaned">
                    {cleanedDescription
                      ? t("qa.parsed.willSave", { text: cleanedDescription })
                      : t("qa.parsed.willSaveEmpty")}
                  </p>
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

function toNumber(value: string): number {
  const parsed = Number(String(value).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Сколько остаётся основной категории, когда остальные части вписаны. */
export function splitRemainder(total: string, parts: ReadonlyArray<{ amount: string }>): number {
  const rest = parts.reduce((sum, part) => sum - toNumber(part.amount), toNumber(total));
  return Math.round(rest * 100) / 100;
}
