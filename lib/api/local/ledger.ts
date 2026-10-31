// Учёт: счета, операции, переводы, разбивка чека, сверка остатка и импорт
// выписки. Чтение страниц «Счета» и «Учёт» и все записи, которые двигают баланс.

import type { AccountsPageData, ImportPageData, TransactionsPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import { tripTagFor } from "@/lib/api/local/extras";
import { transactionRowSchema } from "@/lib/api/local/schemas";
import { criteriaFromParams, matchesCriteria } from "@/lib/transactions/filter";
import { parseSort, sortTransactions } from "@/lib/transactions/sort";
import { futureDated, storedTransactionDate } from "@/lib/transactions/date";
import { convert, isSupportedCurrency } from "@/lib/currency";
import { isUsableMoney, MAX_MONEY, roundMoney } from "@/lib/utils";
import { apiCount, apiText, moneyRangeText } from "@/lib/i18n/api-text";
import { baseAmountContext, baseAmountOf } from "@/lib/transactions/base-amount";
import {
  isTransfer,
  isTransferCategoryLabel,
  TRANSFER_CATEGORY_KEY,
  transferKeyOf
} from "@/lib/transactions/transfers";
import { dataText } from "@/lib/i18n/data-text";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";
import { createCategorySuggester, type CategorySuggester } from "@/lib/category-suggest";
import { findTransferPairs } from "@/lib/transactions/transfer-pairs";
import { matchRule } from "@/lib/categorization-rules";
import { isoDay } from "@/lib/net-worth-snapshots";
import type { WatchRow } from "@/lib/analytics/watchdog";
import type { AccountRow, TransactionRow } from "@/types/finance";
import { balanceHistory } from "@/lib/accounts/balance-history";
import {
  type LocalState,
  withCurrentNames,
  isBackupReminderDue,
  SAVINGS_ACCOUNT_TYPES,
  DEFAULT_IMPORT_ACCOUNT_KEY,
  RECONCILE_CATEGORY_KEY,
  familyFields
} from "@/lib/api/local/state";
import {
  applyBalance,
  archivedAccountNamed,
  findOrCreateAccount,
  findOrCreateAppAccount,
  findOrCreateAppCategory,
  findOrCreateCategory,
  ratesOf,
  sumInBase
} from "@/lib/api/local/money";

/**
 * Остаток из формы счёта: «1 000,50» с пробелами и запятой, пусто — ноль,
 * минус допустим (кредитка). Не число — понятный отказ: NaN доходил до проверки
 * книги, и человек видел «значение не подходит — поле accounts.0.balance».
 */
function accountBalance(raw: string | undefined): number {
  const value = Number(
    String(raw ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".") || 0
  );
  if (!Number.isFinite(value)) throw new Error(apiText("api.account.balanceNumber"));
  // «1e308» — тоже число, но сумма таких остатков даёт бесконечный капитал, и
  // после него не сохранялась ни одна запись. Предел тот же, что у операций.
  if (Math.abs(value) > MAX_MONEY)
    throw new Error(apiText("api.account.balanceRange", { max: MAX_MONEY / 1e9 }));
  return value;
}

export function upsertAccount(state: LocalState, body: unknown, method: "POST" | "PUT") {
  const input = toFormObject(body);
  const requestedCurrency = String(input.currency ?? "").toUpperCase();
  // What is already stored and not in the form stays: the archive flag lives
  // only on the record, and rebuilding the account from the fields shown
  // quietly brought an archived account back.
  const previous =
    method === "PUT" && input.id ? state.accounts.find((item) => item.id === input.id) : undefined;
  const account = {
    ...previous,
    id: method === "PUT" && input.id ? input.id : id("account"),
    // Длиннее 100 знаков схема книги не примет — счёт с остатком пропал бы
    // при следующем запуске. Обрезаем.
    name: (input.name?.trim() || dataText("data.account.new")).slice(0, 100),
    type: input.type || "DEBIT_CARD",
    balance: accountBalance(input.balance),
    // Honour an explicitly chosen supported currency; fall back to the base.
    currency: isSupportedCurrency(requestedCurrency) ? requestedCurrency : state.currency,
    // Savings terms. A blank rate means "no interest", so the fields are
    // dropped rather than stored as zero.
    ...(() => {
      const rate = Number(input.interestRate);
      // Clearing the rate has to clear the terms too, now that the stored
      // record is the starting point.
      if (!Number.isFinite(rate) || rate <= 0)
        return { interestRate: undefined, interestCompounding: undefined };
      const period = input.interestCompounding;
      const compounding: AccountRow["interestCompounding"] =
        period === "QUARTERLY" || period === "YEARLY" ? period : "MONTHLY";
      // Больше 1000 % схема не примет; такую ставку вводят только по ошибке.
      return { interestRate: Math.min(rate, 1000), interestCompounding: compounding };
    })(),
    // Срок вклада — только у сберегательного счёта; пусто — накопительный.
    depositEndsOn:
      (input.type || "DEBIT_CARD") === "SAVINGS" &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(input.depositEndsOn ?? ""))
        ? String(input.depositEndsOn)
        : undefined
  };

  state.accounts =
    method === "PUT"
      ? state.accounts.map((item) => (item.id === account.id ? account : item))
      : [...state.accounts, account];
  state.transactions = state.transactions.map((transaction) =>
    transaction.account.id === account.id
      ? { ...transaction, account: { id: account.id, label: account.name } }
      : transaction
  );
  state.recurringTransactions = state.recurringTransactions.map((item) =>
    item.account.id === account.id ? withCurrentNames(state, item) : item
  );
  return account;
}

export function upsertTransaction(
  state: LocalState,
  body: unknown,
  method: "POST" | "PUT",
  recurringId?: string
) {
  const input = toFormObject(body);
  const previous =
    method === "PUT" && input.id
      ? state.transactions.find((item) => item.id === input.id)
      : undefined;
  // Правка половины перевода проверяется до всего остального — отказ должен
  // объяснять, что не так с переводом, а не просить выбрать счёт.
  if (previous) checkTransferEdit(state, previous, input);
  const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
  const category = state.categories.find((item) => item.id === input.categoryId);
  if (!account || !category) throw new Error(apiText("api.ledger.pickAccountCategory"));

  if (method === "PUT" && input.id) deleteTransaction(state, input.id);

  const amount = Number(input.amount);
  // Checked here because the stored schema demands a positive number: a zero
  // or a stray letter used to be written happily and made the whole document
  // unreadable on the next start.
  if (!isUsableMoney(amount)) throw new Error(moneyRangeText());
  const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
  const linkedRecurringId = recurringId ?? previous?.recurringId;
  const linkedLiabilityId =
    (typeof input.liabilityId === "string" && input.liabilityId) || previous?.liabilityId;
  // Метка длиннее 40 знаков записывалась, а схема книги её не принимает: при
  // следующем запуске пропадала вся операция, а остаток счёта — с ней.
  //
  // Правка без поля `tags` (массовая смена категории, правила, ИИ) метки не
  // трогает — берутся прежние, как фото и номер перевода. Пустая строка —
  // это «снять все метки», её форма правки и присылает.
  const tags =
    method === "PUT" && input.tags === undefined
      ? [...(previous?.tags ?? [])]
      : String(input.tags ?? "")
          .split(",")
          .map((value) => value.trim().slice(0, 40).trim())
          .filter(Boolean)
          .slice(0, 12);
  // Идёт поездка — новая трата получает её метку сама (lib/trips). Плановые
  // платежи (аренда, подписки), платёж по долгу и перевод между своими
  // счетами — не поездка: ипотека, внесённая из отпуска, в его бюджет не
  // входит. «Не отмечать» тоже уважается.
  if (
    method === "POST" &&
    !recurringId &&
    !input.liabilityId &&
    !input.transferId &&
    input.noTrip !== "1" &&
    type === "EXPENSE"
  ) {
    const tripTag = tripTagFor(state, storedTransactionDate(input.date).slice(0, 10));
    if (tripTag && !tags.includes(tripTag)) tags.push(tripTag);
  }
  const transaction: TransactionRow & { recurringId?: string } = {
    id: method === "PUT" && input.id ? input.id : id("tx"),
    amount,
    type,
    // The calendar day, always stored the same way — see storedTransactionDate.
    date: storedTransactionDate(input.date),
    description: input.description?.trim() || null,
    account: { id: account.id, label: account.name },
    category: {
      id: category.id,
      label: category.label,
      color: category.color,
      ...(category.icon ? { icon: category.icon } : {})
    },
    ...(linkedRecurringId ? { recurringId: linkedRecurringId } : {}),
    ...(linkedLiabilityId ? { liabilityId: linkedLiabilityId } : {}),
    ...(tags.length ? { tags } : {}),
    // Правка одной части разделённой покупки оставляет её частью покупки:
    // форма правки группу не присылает, и без этого часть отрывалась —
    // пропадал значок «разбивка», а удаление покупки её не задевало.
    ...(input.splitGroupId || previous?.splitGroupId
      ? { splitGroupId: String(input.splitGroupId || previous?.splitGroupId) }
      : {}),
    // То же для перевода: форма правки его номер не присылает, и половина
    // перевода после правки даты становилась обычным доходом или тратой.
    ...(input.transferId || previous?.transferId
      ? { transferId: String(input.transferId || previous?.transferId) }
      : {}),
    // Семья: кто платил и общая ли трата. Форма, которая этих полей не знает
    // (быстрая смена категории, правило), их не теряет — берутся прежние.
    ...familyFields(state, input, previous),
    // Фото чека живёт отдельно (lib/photos) — правка операции его не теряет.
    ...(previous?.photo ? { photo: previous.photo } : {}),
    // Когда операцию записали. Операций одного дня бывает много, и порядок
    // между ними держался только на месте строки в массиве — а синхронизация
    // кладёт пришедшую строку туда, где она оказалась при слиянии. Только
    // что добавленная на телефоне операция вставала на ПК третьей.
    // Правка момента записи не меняет.
    ...(previous?.createdAt
      ? { createdAt: previous.createdAt }
      : method === "POST"
        ? { createdAt: new Date().toISOString() }
        : {})
  };

  state.transactions = [
    transaction,
    ...state.transactions.filter((item) => item.id !== transaction.id)
  ];
  applyBalance(state, account.id, type === "INCOME" ? amount : -amount);
  // Правка платежа по долгу: прежняя сумма уже вернулась долгу при снятии
  // старой строки (deleteTransaction), новая — уменьшает его. Новый платёж
  // (POST) долг уменьшает сам вызвавший — payDebt и автоплатёж.
  if (method === "PUT" && previous?.liabilityId) applyDebtPayment(state, transaction, -1);
  if (method === "PUT" && previous) keepTransferInStep(state, previous, transaction);
  return transaction;
}

/** Счёт убран в архив. Счёта, которого нет вовсе, это не касается. */
export function isArchivedAccount(state: LocalState, accountId: string): boolean {
  return state.accounts.some((item) => item.id === accountId && item.isArchived);
}

/**
 * Что нельзя сделать с половиной перевода правкой.
 *
 * — Сменить тип. Номер перевода строка сохраняет (см. upsertTransaction), и
 *   поступление, ставшее тратой, оставалось «переводом»: итоги его не видят,
 *   а капитал сдвигался на двойную сумму из ниоткуда.
 * — Поставить её на счёт второй половины: перевод со счёта на него же.
 * — Править перевод, вторая половина которого на счёте в архиве: сумма второй
 *   половины поменялась бы на архивном счёте, а он в капитал не входит.
 */
function checkTransferEdit(
  state: LocalState,
  previous: TransactionRow,
  input: ReturnType<typeof toFormObject>
) {
  const key = transferKeyOf(previous);
  if (!key) return;
  const halves = state.transactions.filter((row) => transferKeyOf(row) === key);
  if (halves.some((row) => isArchivedAccount(state, row.account.id)))
    throw new Error(apiText("api.transfer.archived"));
  const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
  if (type !== previous.type) throw new Error(apiText("api.transfer.typeLocked"));
  const partner = halves.find((row) => row.id !== previous.id);
  if (partner && partner.account.id === input.accountId)
    throw new Error(apiText("api.transfer.sameAccount"));
}

/**
 * Правка одной половины перевода двигает и вторую.
 *
 * Форма правки открывается на любой строке, в том числе на половине перевода.
 * Раньше переписывалась только она: списание 1 000 → 1 500, а поступление
 * оставалось 1 000. Пятьсот рублей исчезали из капитала и не попадали ни в
 * одну трату — перевод в итоги не входит. Теперь вторая половина получает ту
 * же сумму (между валютами — по тому же курсу, что был у пары) и ту же дату.
 */
function keepTransferInStep(state: LocalState, previous: TransactionRow, edited: TransactionRow) {
  const key = transferKeyOf(previous);
  if (!key) return;
  const partner = state.transactions.find(
    (row) => row.id !== edited.id && transferKeyOf(row) === key
  );
  if (!partner) return;
  const editedAccount = state.accounts.find((item) => item.id === edited.account.id);
  const partnerAccount = state.accounts.find((item) => item.id === partner.account.id);
  const sameCurrency = editedAccount?.currency === partnerAccount?.currency;
  const amount =
    edited.amount === previous.amount
      ? partner.amount
      : sameCurrency
        ? edited.amount
        : roundMoney((partner.amount * edited.amount) / previous.amount);
  if (amount === partner.amount && edited.date === partner.date) return;
  const delta = amount - partner.amount;
  if (delta !== 0)
    applyBalance(state, partner.account.id, partner.type === "INCOME" ? delta : -delta);
  state.transactions = state.transactions.map((row) =>
    row.id === partner.id ? { ...row, amount, date: edited.date } : row
  );
}

/**
 * Одна покупка — несколько категорий: «Пятёрочка 2 340 ₽» — это продукты 1 900
 * и бытовая химия 440. Записывается как несколько операций с общим
 * `splitGroupId`: итоги по категориям считают каждую часть там, где она есть,
 * а список показывает их как одну покупку. Все части пишутся разом — или ни
 * одной: половина чека хуже, чем никакого.
 */
export function createSplit(state: LocalState, body: unknown): TransactionRow[] {
  const input = toFormObject(body);
  let parts: Array<{ categoryId?: unknown; amount?: unknown }>;
  try {
    parts = JSON.parse(String(input.parts ?? "[]"));
  } catch {
    parts = [];
  }
  if (!Array.isArray(parts) || parts.length < 2) throw new Error(apiText("api.split.minParts"));
  const cleaned = parts.map((part) => ({
    categoryId: String(part?.categoryId ?? ""),
    amount: Number(String(part?.amount ?? "").replace(",", "."))
  }));
  if (cleaned.some((part) => !part.categoryId || !(part.amount > 0)))
    throw new Error(apiText("api.split.partInvalid"));

  // Проверить всё до первой записи: upsertTransaction меняет состояние сразу,
  // и отказ на третьей части оставил бы две первые в памяти.
  if (!state.accounts.some((item) => item.id === input.accountId && !item.isArchived))
    throw new Error(apiText("api.ledger.pickAccountCategory"));
  if (cleaned.some((part) => !state.categories.some((item) => item.id === part.categoryId)))
    throw new Error(apiText("api.ledger.pickAccountCategory"));
  if (cleaned.some((part) => !isUsableMoney(part.amount))) throw new Error(moneyRangeText());

  const group = id("split");
  const { parts: _parts, action: _action, ...common } = input;
  void _parts;
  void _action;
  return cleaned.map((part) =>
    upsertTransaction(
      state,
      {
        ...common,
        categoryId: part.categoryId,
        amount: String(part.amount),
        splitGroupId: group
      },
      "POST"
    )
  );
}

/**
 * История остатка (lib/accounts/balance-history.ts) — по счетам в их валюте
 * и итогом в основной: все деньги и подушка (сбережения и цели).
 */
export function balanceHistoryPage(state: LocalState, months: string[]) {
  const rates = ratesOf(state);
  const live = state.accounts.filter((account) => !account.isArchived);
  const history = balanceHistory({
    accounts: live.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance
    })),
    flows: state.transactions.map((row) => ({
      accountId: row.account.id,
      date: row.date,
      signed: row.type === "INCOME" ? row.amount : -row.amount
    })),
    goalsNow: state.goals.reduce((sum, goal) => sum + goal.currentAmount, 0),
    // Пополнение цели снимает деньги со счёта — в истории счёта это видно,
    // а в целях деньги прибывают.
    goalMovements: (state.goalMovements ?? []).map((item) => ({
      date: item.date,
      amount: item.amount
    })),
    months
  });
  // Пополнение цели — минус на счёте без операции: учесть его в счёте.
  // Движение цели записано в основной валюте, а счёт ведётся в своей: 100 $,
  // отложенные с долларовой карты, прибавлялись к её прошлому как 9 000 $.
  for (const movement of state.goalMovements ?? []) {
    const account = history.accounts.find((item) => item.id === movement.accountId);
    if (!account) continue;
    const amount = convert(movement.amount, state.currency, account.currency, rates);
    account.values = account.values.map((value, index) =>
      movement.date.slice(0, 7) > months[index] ? roundMoney(value + amount) : value
    );
  }
  const inBase = (amount: number, currency: string) =>
    convert(amount, currency, state.currency, rates);
  const total = months.map((_, index) =>
    roundMoney(
      history.accounts.reduce((sum, item) => sum + inBase(item.values[index], item.currency), 0) +
        history.goals[index]
    )
  );
  const cushion = months.map((_, index) =>
    roundMoney(
      history.accounts
        .filter((item) => SAVINGS_ACCOUNT_TYPES.includes(item.type))
        .reduce((sum, item) => sum + inBase(item.values[index], item.currency), 0) +
        history.goals[index]
    )
  );
  return { currency: state.currency, ...history, total, cushion };
}

/**
 * Сверка с банком: остаток в банке другой — разница записывается одной
 * операцией «Сверка с банком», и остаток счёта становится банковским. Не
 * правкой остатка втихую: тогда деньги взялись бы ниоткуда, и ни итоги, ни
 * история не знали бы, куда они делись.
 */
export function reconcileAccount(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const account = state.accounts.find((item) => item.id === input.id && !item.isArchived);
  if (!account) throw new Error(apiText("api.account.notFound"));
  const bank = Number(
    String(input.balance ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".")
  );
  if (!Number.isFinite(bank)) throw new Error(apiText("api.reconcile.bankNumber"));
  const difference = roundMoney(bank - account.balance);
  if (difference === 0) return { recorded: false };
  const kind = difference > 0 ? "INCOME" : "EXPENSE";
  const category = findOrCreateAppCategory(state, RECONCILE_CATEGORY_KEY, kind);
  const tx = upsertTransaction(
    state,
    {
      type: kind,
      amount: String(Math.abs(difference)),
      accountId: account.id,
      categoryId: category.id,
      date: isoDay(new Date()),
      description: dataText("data.tx.reconcile"),
      noTrip: "1"
    },
    "POST"
  );
  return { recorded: true, id: tx.id, difference };
}

/**
 * «Это перевод»: две готовые операции — трата с одного своего счёта и доход
 * на другой — становятся одним переводом. Деньги на счетах не двигаются:
 * обе строки уже провели их. Меняется только то, как их считают итоги.
 */
export function linkTransfer(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const expense = state.transactions.find((item) => item.id === input.expenseId);
  const income = state.transactions.find((item) => item.id === input.incomeId);
  if (!expense || !income) throw new Error(apiText("api.transfer.oneGone"));
  if (expense.type !== "EXPENSE" || income.type !== "INCOME")
    throw new Error(apiText("api.transfer.shape"));
  if (transferKeyOf(expense) || transferKeyOf(income))
    throw new Error(apiText("api.transfer.alreadyLinked"));
  if (expense.account.id === income.account.id)
    throw new Error(apiText("api.transfer.sameAccount"));
  if (Math.abs(expense.amount - income.amount) >= 0.005)
    throw new Error(apiText("api.transfer.amountMismatch"));
  const transferId = id("transfer");
  const out = findOrCreateAppCategory(state, TRANSFER_CATEGORY_KEY, "EXPENSE");
  const into = findOrCreateAppCategory(state, TRANSFER_CATEGORY_KEY, "INCOME");
  const asTransfer = (
    row: TransactionRow,
    category: { id: string; label: string; color: string; icon?: string }
  ): TransactionRow => {
    // Кто платил и «общая трата» — про траты; у перевода их нет.
    const { memberId: _member, shared: _shared, ...rest } = row;
    void _member;
    void _shared;
    return {
      ...rest,
      transferId,
      category: {
        id: category.id,
        label: category.label,
        color: category.color,
        ...(category.icon ? { icon: category.icon } : {})
      }
    };
  };
  state.transactions = state.transactions.map((row) =>
    row.id === expense.id
      ? asTransfer(row, out)
      : row.id === income.id
        ? asTransfer(row, into)
        : row
  );
  return { transferId };
}

export function createTransfer(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const fromAccount = state.accounts.find(
    (item) => item.id === input.fromAccountId && !item.isArchived
  );
  const toAccount = state.accounts.find(
    (item) => item.id === input.toAccountId && !item.isArchived
  );
  if (!fromAccount || !toAccount) throw new Error(apiText("api.transfer.pickAccounts"));
  if (fromAccount.id === toAccount.id) throw new Error(apiText("api.transfer.distinct"));

  // Money moving between currencies is still the same money: 100 $ leaving a
  // dollar card arrives as roubles, not as 100 ₽. Both halves used to carry
  // the typed amount, so a transfer either invented or destroyed the
  // difference — and the capital line moved on an operation that must leave
  // it exactly where it was.
  //
  // `toAmount` — сколько должно ПРИЙТИ, в валюте счёта зачисления: так
  // закрывается минус перед архивом. Карта −100 $ гасилась «переводом 100» с
  // рублёвого счёта — списывалось 100 ₽, приходило 1,11 $, и карта уходила в
  // архив с долгом почти в 99 $, выпав из капитала.
  const rates = ratesOf(state);
  const wanted =
    input.toAmount !== undefined && input.toAmount !== "" ? Number(input.toAmount) : null;
  const amount =
    wanted === null
      ? Number(input.amount)
      : Math.ceil(convert(wanted, toAccount.currency, fromAccount.currency, rates) * 100 - 1e-6) /
        100;
  if (!isUsableMoney(amount) || (wanted !== null && !isUsableMoney(wanted)))
    throw new Error(moneyRangeText());
  const credited =
    wanted ?? roundMoney(convert(amount, fromAccount.currency, toAccount.currency, rates));

  const transferId = id("transfer");
  const expenseCategory = findOrCreateAppCategory(state, TRANSFER_CATEGORY_KEY, "EXPENSE");
  const incomeCategory = findOrCreateAppCategory(state, TRANSFER_CATEGORY_KEY, "INCOME");
  const description =
    input.description?.trim() ||
    dataText("data.tx.transfer", undefined, { from: fromAccount.name, to: toAccount.name });
  const date = input.date || new Date().toISOString();
  const expense = upsertTransaction(
    state,
    {
      amount: String(amount),
      type: "EXPENSE",
      accountId: fromAccount.id,
      categoryId: expenseCategory.id,
      date,
      transferId,
      description: `${description} [transfer:${transferId}]`
    },
    "POST"
  );
  const income = upsertTransaction(
    state,
    {
      amount: String(credited),
      type: "INCOME",
      accountId: toAccount.id,
      categoryId: incomeCategory.id,
      date,
      transferId,
      description: `${description} [transfer:${transferId}]`
    },
    "POST"
  );

  return { transferId, transactions: [expense, income] };
}

/**
 * Вернуть только что удалённую операцию — той же строкой, с тем же номером,
 * временем записи и метками, — и вернуть её деньги на счёт. Это «Отменить»
 * после удаления: раньше удаление спрашивало подтверждение, а теперь просто
 * удаляет, и отменить его должно быть можно.
 *
 * Фото чека здесь не возвращается: оно удаляется отдельно, и экран кладёт его
 * обратно своим запросом. Повторный возврат ничего не делает — второе нажатие
 * не удвоит деньги.
 */
export function restoreTransaction(state: LocalState, body: unknown): TransactionRow {
  const raw = (body as { transaction?: unknown })?.transaction;
  const parsed = transactionRowSchema
    .omit({ updatedAt: true })
    .safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
  if (!parsed.success) throw new Error(apiText("api.tx.restoreFailed"));
  const { photo: _photo, ...row } = parsed.data as TransactionRow;
  void _photo;
  const account = state.accounts.find((item) => item.id === row.account.id && !item.isArchived);
  const category = state.categories.find((item) => item.id === row.category.id);
  if (!account || !category) throw new Error(apiText("api.tx.restoreOrphan"));
  if (state.transactions.some((item) => item.id === row.id)) return row;
  state.transactions = [row, ...state.transactions];
  applyBalance(state, account.id, row.type === "INCOME" ? row.amount : -row.amount);
  applyDebtPayment(state, row, -1);
  return row;
}

/**
 * Вернуть из корзины операцию, чей счёт возвращается тем же возвратом.
 *
 * Счёт приезжает из корзины с остатком, в котором эта операция уже сидит, —
 * проводить её по счёту второй раз значило бы удвоить деньги. А вот долг она
 * уменьшает как обычно: платёж из корзины снимается с долга при любом порядке
 * возврата, и без этого «вернул счёт и платёж разом» оставлял долг таким,
 * будто платежа нет, а «сначала счёт, потом платёж» — уменьшенным.
 */
export function restoreTransactionOnReturnedAccount(state: LocalState, raw: unknown): void {
  const row = transactionRowSchema.omit({ updatedAt: true }).parse(raw) as TransactionRow;
  if (state.transactions.some((item) => item.id === row.id)) return;
  state.transactions = [row, ...state.transactions];
  applyDebtPayment(state, row, -1);
}

/**
 * Долг вернули из корзины — снять с него платежи, которые лежат в корзине, но
 * сидят в его остатке.
 *
 * Остаток долга в корзине — такой, каким он был в миг удаления, вместе со
 * всеми платежами, жившими в тот миг. Платёж, удалённый ПОСЛЕ долга (или
 * вместе с ним, одной сверкой), из долга не вычитался: долга уже не было, и
 * вернуть ему было нечего (см. applyDebtPayment). Возвращённый как есть, такой
 * долг считал бы платёж, которого в книге нет, а возврат самого платежа снял
 * бы его второй раз.
 *
 * Поэтому долг после возврата не держит ни одного платежа из корзины, а каждый
 * возвращённый платёж снимается с него обычным порядком — сразу же этим
 * возвратом или любым следующим. Платёж, удалённый, пока долг жил, уже вернул
 * долгу свою долю при удалении — его не трогаем.
 */
export function releaseTrashedPayments(
  state: LocalState,
  liability: { key: string; deletedAt: string },
  trashed: ReadonlyArray<{ collection: string; row: Record<string, unknown>; deletedAt: string }>
): void {
  for (const entry of trashed) {
    if (entry.collection !== "transactions") continue;
    if (entry.deletedAt < liability.deletedAt) continue;
    const parsed = transactionRowSchema.omit({ updatedAt: true }).safeParse(entry.row);
    if (!parsed.success) continue;
    const row = parsed.data as TransactionRow;
    if (row.liabilityId !== liability.key || row.type !== "EXPENSE") continue;
    // Живой платёж в книге — это не платёж из корзины, он посчитан честно.
    if (state.transactions.some((item) => item.id === row.id)) continue;
    applyDebtPayment(state, row, 1);
  }
}

export function deleteTransaction(state: LocalState, transactionId: string) {
  const existing = state.transactions.find((item) => item.id === transactionId);
  if (!existing) return;
  applyBalance(
    state,
    existing.account.id,
    existing.type === "INCOME" ? -existing.amount : existing.amount
  );
  applyDebtPayment(state, existing, 1);
  state.transactions = state.transactions.filter((item) => item.id !== transactionId);
}

/**
 * Платёж по долгу держит долг в согласии с собой: удалили платёж — долг снова
 * больше (sign = 1), вернули из корзины или поправили сумму — меньше (−1).
 * Раньше удаление возвращало деньги на счёт, а долг оставался уменьшенным.
 * Сумма операции — в валюте счёта, долг — в своей: пересчёт по курсу.
 *
 * Долг не уходит ниже нуля, поэтому платёж уменьшает его не всегда на всю
 * свою сумму: долг 100, заплатили 150 — долг 0, а уменьшился он на 100.
 * Сколько платёж снял на самом деле, операция помнит (`debtApplied`, в
 * валюте долга), и при удалении долгу возвращается ровно это. Возврат всей
 * суммы делал из долга 100 после удаления переплаты долг 150.
 */
export function applyDebtPayment(
  state: LocalState,
  row: Pick<TransactionRow, "id" | "amount" | "type" | "account" | "liabilityId" | "debtApplied">,
  sign: 1 | -1
) {
  if (!row.liabilityId || row.type !== "EXPENSE") return;
  const liability = state.liabilities.find((item) => item.id === row.liabilityId);
  if (!liability) return;
  const setBalance = (balance: number) => {
    state.liabilities = state.liabilities.map((item) =>
      item.id === liability.id ? { ...item, balance: Math.max(0, roundMoney(balance)) } : item
    );
  };

  if (sign === 1) {
    if (row.debtApplied !== undefined) {
      setBalance(liability.balance + row.debtApplied);
      return;
    }
    // Операция записана до того, как платежи стали помнить свою долю, —
    // сколько она сняла, не узнать. Возвращается вся сумма, как раньше, но не
    // выше исходной суммы долга: переплата 150 по долгу в 100 не превратит
    // его в 150. Исходная сумма неизвестна (0) — без потолка, как было.
    const back = liability.balance + debtCurrencyAmount(state, row, liability.currency);
    setBalance(liability.originalAmount > 0 ? Math.min(back, liability.originalAmount) : back);
    return;
  }

  const applied = roundMoney(
    Math.min(debtCurrencyAmount(state, row, liability.currency), Math.max(liability.balance, 0))
  );
  setBalance(liability.balance - applied);
  recordDebtApplied(state, row.id, applied);
}

/** Сумма платежа в валюте долга: операция записана в валюте своего счёта. */
function debtCurrencyAmount(
  state: LocalState,
  row: Pick<TransactionRow, "amount" | "account">,
  debtCurrency: string
) {
  const currency =
    state.accounts.find((item) => item.id === row.account.id)?.currency ?? debtCurrency;
  return convert(row.amount, currency, debtCurrency, ratesOf(state));
}

/** Запомнить у операции, на сколько она уменьшила долг (см. applyDebtPayment). */
export function recordDebtApplied(state: LocalState, transactionId: string, applied: number) {
  state.transactions = state.transactions.map((item) =>
    item.id === transactionId ? { ...item, debtApplied: roundMoney(applied) } : item
  );
}

export function importCsvRows(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const rows = JSON.parse(input.rows || "[]") as Array<Record<string, unknown>>;
  // A fresh profile has no accounts, and the import used to stop there — with
  // an English sentence, on a screen that had already read the file and shown
  // which account every row belongs to. The names in the file are enough to
  // make the accounts, the same way the categories in it are made.
  let fallbackAccount = state.accounts.find((account) => !account.isArchived);

  let imported = 0;
  let skipped = 0;
  const transactionIds: string[] = [];
  // Повтор — это строка, которая уже была в учёте ДО этого импорта, и ровно
  // столько раз, сколько она там была. Сличать с учётом, в который файл уже
  // пишется, значило бы отбросить второй кофе за 200 ₽ того же дня: две
  // одинаковые покупки в выписке — обычное дело.
  const keyOf = (parts: Array<string | number>) => parts.join("|");
  const before = new Map<string, number>();
  for (const transaction of state.transactions) {
    const key = keyOf([
      transaction.account.id,
      transaction.type,
      transaction.amount,
      transaction.date.slice(0, 10),
      transaction.description ?? ""
    ]);
    before.set(key, (before.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  // Столбец валюты: выбранный, а нет — узнанный по имени. Своя выгрузка пишет
  // «currency» в каждой строке; по нему новый счёт заводится в своей валюте.
  const currencyColumn =
    input.currencyColumn ||
    Object.keys(rows[0] ?? {}).find((name) => /^(currency|валюта)$/i.test(name.trim())) ||
    "";
  // Подбор категории по истории — по указателю, разобранному один раз, а не
  // разбором всей истории заново на каждую строку (lib/category-suggest).
  // Строки этого же файла в нём учитываются, как и прежде: каждая записанная
  // добавляется в его начало — туда же, где она встаёт в списке операций.
  //
  // И список операций не копируется целиком на каждую строку: на время
  // импорта новые строки собираются отдельно, а встают поверх прежних один
  // раз, в конце — в том же порядке (последняя строка файла сверху). Внутри
  // цикла прежний список никто не читает: повторы сличаются с `before`,
  // подсказка — с указателем. `finally` возвращает список и при ошибке —
  // с теми строками, что успели записаться, как было и раньше.
  const existing = state.transactions;
  const added: TransactionRow[] = [];
  let suggester: CategorySuggester | undefined;
  const suggesterNow = () => {
    if (!suggester) {
      suggester = createCategorySuggester(existing);
      for (const row of added) suggester.prepend(row);
    }
    return suggester;
  };
  try {
    for (const row of rows) {
      const rawAmount = parseImportedAmount(row[input.amountColumn]);
      const date = parseImportedDate(row[input.dateColumn]);
      if (rawAmount === null || rawAmount === 0 || !date) {
        skipped += 1;
        continue;
      }
      // Сумма вне разумного («5 000 000 000 000» — опечатка или склеенные
      // столбцы) — пропуск этой строки, как и нечитаемой. Раньше её отвергал
      // upsertTransaction посреди цикла, и одна такая строка отменяла весь файл.
      if (!isUsableMoney(Math.abs(rawAmount))) {
        skipped += 1;
        continue;
      }
      const type = rawAmount >= 0 ? "INCOME" : "EXPENSE";
      const accountName = String(row[input.accountColumn ?? ""] ?? "").trim();
      const description = String(row[input.descriptionColumn ?? ""] ?? "").trim();
      // День строки файла — тот, что будет записан, а не UTC-день местной
      // полуночи: к востоку от Гринвича это вчера, и повторный импорт того же
      // файла не узнавал ни одной строки и задваивал всё.
      const day = storedTransactionDate(date).slice(0, 10);
      // Счёт с этим именем в архиве (а открытого нет): строки, что на нём уже
      // есть, — повторы. Иначе выписка убранной в архив карты, загруженная
      // снова, ложилась целиком на новый счёт с тем же именем. Новые строки
      // идут, как и прежде, на новый открытый счёт: в архивный не пишут.
      const archived = accountName ? archivedAccountNamed(state, accountName) : undefined;
      if (archived) {
        const archivedKey = keyOf([archived.id, type, Math.abs(rawAmount), day, description]);
        const count = seen.get(archivedKey) ?? 0;
        seen.set(archivedKey, count + 1);
        if (count < (before.get(archivedKey) ?? 0)) {
          skipped += 1;
          continue;
        }
      }
      const account = accountName
        ? findOrCreateAccount(state, accountName, [], String(row[currencyColumn] ?? ""))
        : (fallbackAccount ?? findOrCreateAppAccount(state, DEFAULT_IMPORT_ACCOUNT_KEY));
      // Rows without an account of their own follow the first one there is —
      // including one this import has just made.
      fallbackAccount = fallbackAccount ?? account;
      // Категория в ключ повтора не входит: она зависит от правил на момент
      // импорта, и повторно загруженная выписка, разнесённая уже по новому
      // правилу, задвоилась бы целиком.
      const key = keyOf([account.id, type, Math.abs(rawAmount), day, description]);
      const already = before.get(key) ?? 0;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count < already) {
        skipped += 1;
        continue;
      }
      const rawCategoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
      // When the CSV row carries no category, try to auto-categorize it from
      // the description against existing transactions before falling back to a
      // generic import bucket.
      //
      // Правило человека важнее категории банка: колонку категории заполняют
      // все выписки, и правило «Пятёрочка → Продукты» при импорте не работало
      // ни разу — строка шла в «Супермаркеты» банка, заведённые заново.
      const ruledId = rawCategoryName ? matchRule(description, state.rules) : null;
      const ruled = ruledId
        ? state.categories.find((item) => item.id === ruledId && item.kind === type)
        : undefined;
      let category;
      if (ruled) {
        category = ruled;
      } else if (rawCategoryName) {
        category = findOrCreateCategory(state, rawCategoryName, type);
      } else {
        const suggestedId = suggesterNow().suggest(description, {
          type,
          rules: [...state.rules]
        });
        category =
          (suggestedId
            ? state.categories.find((item) => item.id === suggestedId && item.kind === type)
            : undefined) ??
          findOrCreateAppCategory(
            state,
            type === "INCOME" ? "data.cat.importIncome" : "data.cat.importExpense",
            type
          );
      }
      // Пустой список — чтобы upsertTransaction не копировал всю историю ради
      // одной новой строки (см. выше; на место всё встаёт в `finally`).
      state.transactions = [];
      const created = upsertTransaction(
        state,
        {
          amount: String(Math.abs(rawAmount)),
          type,
          accountId: account.id,
          categoryId: category.id,
          date: date.toISOString(),
          description
        },
        "POST"
      );
      added.push(created);
      suggester?.prepend(created);
      transactionIds.push(created.id);
      imported += 1;
    }
  } finally {
    state.transactions = [...added.reverse(), ...existing];
  }
  if (transactionIds.length > 0) {
    state.importBatches = [
      { id: id("import"), importedAt: new Date().toISOString(), transactionIds },
      ...(state.importBatches ?? []).slice(0, 9)
    ];
  }
  const linkedTransfers = linkImportedTransfers(state, new Set(transactionIds));
  return { imported, skipped, linkedTransfers };
}

/** Перевод по словам банка: категория «Переводы» или «между своими счетами». */
const OWN_TRANSFER_TEXT = /между\s+(своими\s+)?сч[её]тами|сво(й|им|ими)\s+сч[её]т|own\s+accounts?/i;

function looksLikeTransfer(row: TransactionRow): boolean {
  return (
    isTransferCategoryLabel(row.category.label) || OWN_TRANSFER_TEXT.test(row.description ?? "")
  );
}

/**
 * Перевод между своими счетами, пришедший выписками, — две строки: списание с
 * одной карты и поступление на другую. Связанными в перевод они не приходят, и
 * итоги считали их доходом и тратой: план/факт показывал «Переводы» в расходах
 * и доходах, а в «В сбережения» — ноль, хотя деньги ушли на вклад. Пока
 * проверка повторов ошибочно выбрасывала вторую половину (до 2.8.3), это было
 * незаметно; теперь приходят обе.
 *
 * Связываются только уверенные пары: та же сумма и валюта, разные свои счета,
 * не дальше суток друг от друга (findTransferPairs, как в «Это перевод?»), хотя
 * бы одна строка — из этой загрузки, и ОБЕ банк сам назвал переводом.
 * Остальные похожие пары предлагает карточка «Это перевод?» — решает человек.
 */
function linkImportedTransfers(state: LocalState, fresh: ReadonlySet<string>): number {
  if (fresh.size === 0) return 0;
  const currencyOf = new Map(state.accounts.map((account) => [account.id, account.currency]));
  const pairs = findTransferPairs(
    state.transactions.filter((row) => looksLikeTransfer(row)),
    (accountId) => currencyOf.get(accountId) ?? state.currency
  ).filter((pair) => fresh.has(pair.expense.id) || fresh.has(pair.income.id));
  let linked = 0;
  for (const pair of pairs) {
    try {
      linkTransfer(state, { expenseId: pair.expense.id, incomeId: pair.income.id });
      linked += 1;
    } catch {
      /* пара уже не годится (связали раньше в этом же проходе) — дальше */
    }
  }
  return linked;
}

export function undoLastImport(state: LocalState) {
  const [batch, ...rest] = state.importBatches ?? [];
  if (!batch) return { removed: 0 };
  // Строку импорта могли связать в перевод с операцией, записанной руками
  // («Это перевод»). Удалить одну её половину значило бы оставить вторую с
  // номером перевода и категорией «Переводы» — итоги её не считают, и деньги
  // молча выпадали бы из расходов. Разъединять вторую половину самим —
  // значит менять чужую, ручную запись и гадать, какая категория у неё была.
  // Поэтому отказ с объяснением, и импорт остаётся целым: человек удалит
  // такой перевод сам (или оставит импорт). Перевод, обе половины которого
  // из этого же импорта, уходит целиком и отмене не мешает.
  const inBatch = new Set(batch.transactionIds);
  const transferKeys = new Set(
    state.transactions
      .filter((item) => inBatch.has(item.id))
      .map((item) => transferKeyOf(item))
      .filter((key): key is string => Boolean(key))
  );
  const linked = state.transactions.filter((item) => {
    const key = transferKeyOf(item);
    return key !== null && !inBatch.has(item.id) && transferKeys.has(key);
  }).length;
  if (linked > 0)
    throw new Error(apiText("api.import.undoTransfer", { n: linked, count: apiCount(linked) }));
  let removed = 0;
  for (const transactionId of batch.transactionIds) {
    const before = state.transactions.length;
    deleteTransaction(state, transactionId);
    if (state.transactions.length < before) removed += 1;
  }
  state.importBatches = rest;
  return { removed, importBatchId: batch.id };
}

export function accountsPage(state: LocalState): AccountsPageData {
  const accounts = state.accounts.filter((account) => !account.isArchived);
  const rates = ratesOf(state);
  return {
    source: "database",
    // Счёт в другой валюте несёт ещё и остаток в основной: плитки «Карты»,
    // «Наличные», «Накопления» складывали 100 $ с рублями как 100 ₽. Копия, а
    // не правка: строки книги этого поля не хранят.
    accounts: accounts.map((account) =>
      account.currency === state.currency
        ? account
        : {
            ...account,
            baseBalance: roundMoney(
              convert(account.balance, account.currency, state.currency, rates)
            )
          }
    ),
    totalBalance: sumInBase(state, accounts),
    currency: state.currency
  };
}

export function transactionsPage(
  state: LocalState,
  searchParams: URLSearchParams
): TransactionsPageData {
  // Номер страницы и её размер — из адреса, а адрес пишет кто угодно: на
  // `page=abc` или `limit=xyz` получался NaN, и список выходил пустым.
  const askedPage = Math.floor(Number(searchParams.get("page") || 1));
  const askedLimit = Math.floor(Number(searchParams.get("limit") || 20));
  // `limit=all` hands back the whole filtered ledger. Exporting and looking
  // for duplicates need every row, and asking for a page of twenty and
  // treating it as the ledger is how a CSV export came out twenty rows long.
  const wantsEverything = searchParams.get("limit") === "all";
  const limit = wantsEverything
    ? Number.MAX_SAFE_INTEGER
    : Math.min(100, Math.max(10, Number.isFinite(askedLimit) ? askedLimit : 20));
  const criteria = criteriaFromParams(searchParams);
  const filters = {
    from: criteria.from,
    to: criteria.to,
    type: criteria.type ?? "ALL",
    categoryId: searchParams.get("categoryId") || undefined,
    accountId: criteria.accountId,
    q: criteria.q,
    minAmount: criteria.minAmount,
    maxAmount: criteria.maxAmount,
    page: 1,
    limit
  };
  // The rows keep the amount as it was recorded — a dollar operation reads
  // as dollars — and carry what it is worth in the base currency beside it,
  // so the totals above the list add up like every other total in the app.
  const context = baseAmountContext(state.accounts, ratesOf(state), state.currency);
  const amountOf = (row: TransactionRow) => baseAmountOf(row, context);
  // Порядок — по выбору (`sort`), а «крупные сверху» сравнивают в основной
  // валюте: доллары нельзя ставить рядом с рублями «как есть». Фильтр «от/до»
  // и поиск суммой — тоже: иначе 100 $ (9 000 ₽) не находились по «от 5 000».
  const filtered = sortTransactions(
    state.transactions.filter((transaction) => matchesCriteria(transaction, criteria, amountOf)),
    parseSort(searchParams.get("sort")),
    amountOf
  );
  // Страница за концом списка (удалили операции, сузили фильтр, старая
  // ссылка) показывала пустой список без кнопок — вернуться было нечем.
  // Номер прижимается к последней странице, и в ответе — уже он.
  const lastPage = Math.max(1, Math.ceil(filtered.length / limit));
  const page = Math.min(lastPage, Math.max(1, Number.isFinite(askedPage) ? askedPage : 1));
  filters.page = page;
  const start = (page - 1) * limit;

  // Итоги — по всему отфильтрованному, а не по странице (см. TransactionsPageData).
  //
  // И без переводов между своими счетами — как в аналитике: перевод не доход
  // и не трата, а пара строк «ушло — пришло». Прежде месяц с переводом на
  // вклад показывал над списком «расход» больше, чем аналитика за тот же
  // месяц. Строки переводов в списке остаются; в итог они входят, когда о них
  // и спрашивают: фильтр «переводы», категория переводов — или фильтр по
  // счёту, для которого перевод с него — настоящий уход денег.
  // Категорий переводов две — расходная и доходная, — и выбрана может быть любая.
  const transferCategoryIds = state.categories
    .filter((category) => isTransferCategoryLabel(category.label))
    .map((category) => category.id);
  const countTransfers =
    criteria.type === "TRANSFER" ||
    Boolean(criteria.accountId) ||
    transferCategoryIds.some((id) => criteria.categoryIds?.includes(id));
  const totals = { income: 0, expense: 0 };
  for (const row of filtered) {
    if (!countTransfers && isTransfer(row)) continue;
    if (row.type === "INCOME") totals.income += baseAmountOf(row, context);
    if (row.type === "EXPENSE") totals.expense += baseAmountOf(row, context);
  }
  totals.income = roundMoney(totals.income);
  totals.expense = roundMoney(totals.expense);

  const rows = filtered.slice(start, start + limit).map((row) => {
    const base = baseAmountOf(row, context);
    return base === row.amount ? row : { ...row, baseAmount: base };
  });

  return {
    source: "database",
    transactions: rows,
    accounts: accountsPage(state).accounts,
    categories: [...state.categories],
    rules: [...state.rules],
    filters,
    // Counted over the WHOLE ledger, not the filtered page: the screen opens
    // on the current month, so an operation dated a year out is not merely
    // easy to miss — it is not on the page at all, while its money has
    // already left the balance.
    futureDated: futureDated(state.transactions),
    totals,
    pagination: {
      page,
      limit: wantsEverything ? filtered.length : limit,
      total: filtered.length,
      hasPreviousPage: page > 1,
      hasNextPage: !wantsEverything && start + limit < filtered.length
    }
  };
}

export function importReferences(state: LocalState): ImportPageData {
  return {
    source: "database",
    accounts: accountsPage(state).accounts,
    categories: [...state.categories],
    lastBackupAt: state.lastBackupAt,
    backupReminderDue: isBackupReminderDue(state.lastBackupAt)
  };
}

/** Операции для сторожа: подписка ли категория — из справочника. */
export function watchRows(state: LocalState): WatchRow[] {
  const subscription = new Set(
    state.categories.filter((category) => category.isSubscription).map((category) => category.id)
  );
  return state.transactions.map((row) => ({
    id: row.id,
    type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
    date: row.date,
    amount: row.amount,
    description: row.description,
    categoryId: row.category.id,
    category: row.category.label,
    accountId: row.account.id,
    isSubscription: subscription.has(row.category.id),
    recurringId: row.recurringId ?? null,
    transferId: row.transferId ?? null,
    splitGroupId: row.splitGroupId ?? null
  }));
}
