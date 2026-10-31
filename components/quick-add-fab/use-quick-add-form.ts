"use client";

import { useState } from "react";

import { useApiPageData } from "@/hooks/use-api-page-data";
import type { CashbackRule } from "@/lib/cashback/cashback";
import type { ImportPageData, TransactionsPageData } from "@/lib/data";
import type { TripView } from "@/lib/trips/trips";

import {
  lastOfType,
  type AccountOption,
  type CategoryOption,
  type QuickAddType,
  type SplitPart
} from "@/components/quick-add-fab/helpers";

/**
 * Поля окна быстрой записи и всё, что под ними подсказывается.
 *
 * Живут здесь, а не в самом окне: на время съёмки чека окно закрывается, и
 * после съёмки оно открывается с тем же, что было (см. scanReceipt).
 */
export function useQuickAddForm({
  accounts,
  categories
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
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
  const [splitParts, setSplitParts] = useState<SplitPart[]>([]);
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
  // Форму заполнил черновик: недописанное с прошлого раза.
  const [restored, setRestored] = useState(false);

  // The server props are empty on the desktop static build — the real accounts
  // and categories live in the client API (LocalApiClient/IndexedDB).
  const initialRefs = { source: "database", accounts, categories } as ImportPageData;
  const {
    data: refs,
    reload: reloadRefs,
    setData: setRefs
  } = useApiPageData(initialRefs, "/import");

  const activeAccounts = refs.accounts.filter(
    (a) => !(a as AccountOption & { isArchived?: boolean }).isArchived
  );
  const filteredCategories = refs.categories.filter((c) => c.kind === type);

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

  return {
    open,
    setOpen,
    type,
    setType,
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
    manualCategory,
    setManualCategory,
    autoSuggested,
    setAutoSuggested,
    ledger,
    setLedger,
    amount,
    setAmount,
    splitParts,
    setSplitParts,
    description,
    setDescription,
    date,
    setDate,
    tags,
    setTags,
    filledIn,
    setFilledIn,
    cleanedDescription,
    setCleanedDescription,
    fromReceipt,
    setFromReceipt,
    photoFor,
    setPhotoFor,
    cashback,
    setCashback,
    trip,
    setTrip,
    skipTrip,
    setSkipTrip,
    restored,
    setRestored,
    refs,
    reloadRefs,
    setRefs,
    activeAccounts,
    filteredCategories,
    changeType,
    pickCategory
  };
}

export type QuickAddForm = ReturnType<typeof useQuickAddForm>;
