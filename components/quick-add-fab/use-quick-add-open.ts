"use client";

import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatInputDate } from "@/lib/format";
import type { useI18n } from "@/lib/i18n/context";
import { parseFnsReceipt } from "@/lib/receipts/fns-qr";
import { DEFAULT_ACCOUNT_KEY, LAST_ACCOUNT_KEY, readMine } from "@/lib/storage/mine";
import { cameraPossible, scanQr, waitForNoModal } from "@/lib/sync/scan-qr";
import {
  QUICK_ADD_OPEN,
  takeQuickAddRequest,
  type QuickAddRequest
} from "@/lib/transactions/quick-add-request";
import { draftDate, DRAFT_KEY, readDraft } from "@/lib/transactions/quick-draft";

import {
  lastOfType,
  type AccountOption,
  type QuickAddType
} from "@/components/quick-add-fab/helpers";
import type { QuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";

/** Открытие окна: с подставленным счётом, черновиком, готовым снаружи или с чеком. */
export function useQuickAddOpen({
  form,
  t
}: {
  form: QuickAddForm;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const {
    type,
    refs,
    setRefs,
    setOpen,
    setLedger,
    setCashback,
    setTrip,
    setSkipTrip,
    setType,
    setAccountId,
    setShowNewAccount,
    setShowNewCategory,
    setAmount,
    setDescription,
    setDate,
    setTags,
    setFilledIn,
    setFromReceipt,
    setCleanedDescription,
    setCategoryId,
    setSplitParts,
    setManualCategory,
    setAutoSuggested,
    setRestored,
    changeType
  } = form;

  async function openDialog(request: QuickAddRequest = {}) {
    // Rules and recent operations feed the category guess. Fetched when the
    // dialog opens rather than kept live: it is a hint, not a total.
    //
    // Ждём его здесь же: из него берутся категория и счёт последней операции,
    // и они должны стоять в полях, когда диалог появится.
    const recent = await apiClient.get("/transactions?limit=100").catch(() => null);
    setLedger(recent);
    void apiClient
      .get("/cashback")
      .then((result) => setCashback(result?.rules ?? []))
      .catch(() => setCashback([]));
    void apiClient
      .get("/trips")
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
    const fresh = await apiClient.get("/import").catch(() => null);
    if (fresh) setRefs(fresh);
    const available = (fresh ?? refs).accounts.filter(
      (account) => !(account as AccountOption & { isArchived?: boolean }).isArchived
    );
    const usable = (id: string | null) =>
      id && available.some((account) => account.id === id) ? id : null;
    // Honour the default transaction type from settings.
    let openedType = type;
    try {
      const settings = await apiClient.get("/settings");
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
    setRestored(false);
    // Недописанное с прошлого раза: закрыли окно случайно — набранное на месте.
    // Ярлык другого типа («Доход») и съёмка чека начинают с чистого.
    const draft =
      request.scanReceipt || request.prefill ? null : readDraft(readMine(DRAFT_KEY), Date.now());
    if (draft && (!request.type || request.type === draft.type)) {
      setType(draft.type);
      setAmount(draft.amount);
      setDescription(draft.description);
      setTags(draft.tags);
      const known = (fresh ?? refs).categories.some(
        (category) => category.id === draft.categoryId && category.kind === draft.type
      );
      if (known) {
        setCategoryId(draft.categoryId);
        setManualCategory(true);
      } else if (draft.type !== openedType) {
        setCategoryId(lastOfType(recent, draft.type)?.category.id ?? "");
      }
      if (usable(draft.accountId)) setAccountId(draft.accountId);
      const keptDate = draftDate(draft, Date.now());
      if (keptDate) setDate(keptDate);
      setRestored(true);
    }
    // Готовое снаружи (трата из уведомления банка): сумма, место, день — на
    // месте, человеку остаётся проверить категорию и нажать «Добавить».
    const prefill = request.prefill;
    if (prefill) {
      const written = String(prefill.amount);
      setAmount(written);
      setDescription(prefill.description);
      setDate(prefill.date);
      setFilledIn((was) => ({ ...was, amount: written, date: prefill.date }));
      if (prefill.accountId && usable(prefill.accountId)) setAccountId(prefill.accountId);
      const kindOk = (fresh ?? refs).categories.some(
        (category) => category.id === prefill.categoryId && category.kind === openedType
      );
      if (prefill.categoryId && kindOk) {
        setCategoryId(prefill.categoryId);
        setAutoSuggested(true);
      }
    }
    // Ярлык «Сканировать чек»: сначала камера, окно — уже с суммой. Не
    // наоборот: поверх открытого окна камера вешает телефон (см. scanReceipt).
    if (request.scanReceipt && cameraPossible()) {
      void scanReceipt(openedType);
      return;
    }
    setOpen(true);
  }

  const openOnRequest = useEffectEvent((request: QuickAddRequest) => openDialog(request));
  useEffect(() => {
    // Открыть по просьбе снаружи: ярлык на значке, кнопка «Операция» и т. п.
    // Просьба могла прийти раньше, чем эта кнопка появилась, — тогда она ждёт.
    const handler = () => {
      const request = takeQuickAddRequest();
      void openOnRequest(request ?? {});
    };
    window.addEventListener(QUICK_ADD_OPEN, handler);
    const early = takeQuickAddRequest();
    // На микрозадачу, а не прямо в эффекте: окно открывается состоянием.
    if (early) void Promise.resolve().then(() => openOnRequest(early));
    return () => window.removeEventListener(QUICK_ADD_OPEN, handler);
  }, []);

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

  return { openDialog, scanReceipt };
}
