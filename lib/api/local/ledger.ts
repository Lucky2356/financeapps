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
import { isUsableMoney, MONEY_RANGE_ERROR, roundMoney } from "@/lib/utils";
import { baseAmountContext, baseAmountOf } from "@/lib/transactions/base-amount";
import { TRANSFER_CATEGORY_LABEL, transferKeyOf } from "@/lib/transactions/transfers";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";
import { suggestCategoryId } from "@/lib/category-suggest";
import { isoDay } from "@/lib/net-worth-snapshots";
import type { WatchRow } from "@/lib/analytics/watchdog";
import type { AccountRow, TransactionRow } from "@/types/finance";
import { balanceHistory } from "@/lib/accounts/balance-history";
import {
  type LocalState,
  withCurrentNames,
  isBackupReminderDue,
  SAVINGS_ACCOUNT_TYPES,
  DEFAULT_IMPORT_ACCOUNT,
  RECONCILE_CATEGORY_LABEL,
  familyFields
} from "@/lib/api/local/state";
import {
  applyBalance,
  findOrCreateAccount,
  findOrCreateCategory,
  ratesOf,
  sumInBase
} from "@/lib/api/local/money";

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
    name: input.name?.trim() || "Новый счет",
    type: input.type || "DEBIT_CARD",
    balance: Number(input.balance ?? 0),
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
      return { interestRate: rate, interestCompounding: compounding };
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
  const account = state.accounts.find((item) => item.id === input.accountId && !item.isArchived);
  const category = state.categories.find((item) => item.id === input.categoryId);
  if (!account || !category) throw new Error("Выберите существующий счет и категорию.");

  const previous =
    method === "PUT" && input.id
      ? state.transactions.find((item) => item.id === input.id)
      : undefined;
  if (method === "PUT" && input.id) deleteTransaction(state, input.id);

  const amount = Number(input.amount);
  // Checked here because the stored schema demands a positive number: a zero
  // or a stray letter used to be written happily and made the whole document
  // unreadable on the next start.
  if (!isUsableMoney(amount)) throw new Error(MONEY_RANGE_ERROR);
  const type = input.type === "INCOME" ? "INCOME" : "EXPENSE";
  const linkedRecurringId = recurringId ?? previous?.recurringId;
  const linkedLiabilityId =
    (typeof input.liabilityId === "string" && input.liabilityId) || previous?.liabilityId;
  const tags = String(input.tags ?? "")
    .split(",")
    .map((value) => value.trim())
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
  return transaction;
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
  if (!Array.isArray(parts) || parts.length < 2)
    throw new Error("Разделить можно минимум на две части.");
  const cleaned = parts.map((part) => ({
    categoryId: String(part?.categoryId ?? ""),
    amount: Number(String(part?.amount ?? "").replace(",", "."))
  }));
  if (cleaned.some((part) => !part.categoryId || !(part.amount > 0)))
    throw new Error("У каждой части нужны категория и сумма больше нуля.");

  // Проверить всё до первой записи: upsertTransaction меняет состояние сразу,
  // и отказ на третьей части оставил бы две первые в памяти.
  if (!state.accounts.some((item) => item.id === input.accountId && !item.isArchived))
    throw new Error("Выберите существующий счет и категорию.");
  if (cleaned.some((part) => !state.categories.some((item) => item.id === part.categoryId)))
    throw new Error("Выберите существующий счет и категорию.");
  if (cleaned.some((part) => !isUsableMoney(part.amount))) throw new Error(MONEY_RANGE_ERROR);

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
  for (const movement of state.goalMovements ?? []) {
    const account = history.accounts.find((item) => item.id === movement.accountId);
    if (!account) continue;
    account.values = account.values.map((value, index) =>
      movement.date.slice(0, 7) > months[index] ? roundMoney(value + movement.amount) : value
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
  if (!account) throw new Error("Такого счёта нет.");
  const bank = Number(
    String(input.balance ?? "")
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".")
  );
  if (!Number.isFinite(bank)) throw new Error("Остаток в банке — число.");
  const difference = roundMoney(bank - account.balance);
  if (difference === 0) return { recorded: false };
  const kind = difference > 0 ? "INCOME" : "EXPENSE";
  const category = findOrCreateCategory(state, RECONCILE_CATEGORY_LABEL, kind);
  const tx = upsertTransaction(
    state,
    {
      type: kind,
      amount: String(Math.abs(difference)),
      accountId: account.id,
      categoryId: category.id,
      date: isoDay(new Date()),
      description: "Сверка с банком",
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
  if (!expense || !income) throw new Error("Одной из операций уже нет.");
  if (expense.type !== "EXPENSE" || income.type !== "INCOME")
    throw new Error("Перевод — это списание с одного счёта и поступление на другой.");
  if (transferKeyOf(expense) || transferKeyOf(income))
    throw new Error("Эта операция уже часть перевода.");
  if (expense.account.id === income.account.id)
    throw new Error("Перевод — между двумя разными счетами.");
  if (Math.abs(expense.amount - income.amount) >= 0.005)
    throw new Error("Суммы списания и поступления не совпадают.");
  const transferId = id("transfer");
  const out = findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "EXPENSE");
  const into = findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "INCOME");
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
  const amount = Number(input.amount);

  if (!fromAccount || !toAccount)
    throw new Error("Выберите существующие активные счета для перевода.");
  if (fromAccount.id === toAccount.id)
    throw new Error("Счета списания и зачисления должны отличаться.");
  if (!isUsableMoney(amount)) throw new Error(MONEY_RANGE_ERROR);

  // Money moving between currencies is still the same money: 100 $ leaving a
  // dollar card arrives as roubles, not as 100 ₽. Both halves used to carry
  // the typed amount, so a transfer either invented or destroyed the
  // difference — and the capital line moved on an operation that must leave
  // it exactly where it was.
  const credited = roundMoney(
    convert(amount, fromAccount.currency, toAccount.currency, ratesOf(state))
  );

  const transferId = id("transfer");
  const expenseCategory = findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "EXPENSE");
  const incomeCategory = findOrCreateCategory(state, TRANSFER_CATEGORY_LABEL, "INCOME");
  const description =
    input.description?.trim() || `Перевод ${fromAccount.name} -> ${toAccount.name}`;
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
  if (!parsed.success) throw new Error("Не получилось вернуть операцию.");
  const { photo: _photo, ...row } = parsed.data as TransactionRow;
  void _photo;
  const account = state.accounts.find((item) => item.id === row.account.id && !item.isArchived);
  const category = state.categories.find((item) => item.id === row.category.id);
  if (!account || !category)
    throw new Error("Счёт или категория этой операции уже удалены — вернуть её нельзя.");
  if (state.transactions.some((item) => item.id === row.id)) return row;
  state.transactions = [row, ...state.transactions];
  applyBalance(state, account.id, row.type === "INCOME" ? row.amount : -row.amount);
  applyDebtPayment(state, row, -1);
  return row;
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
 */
export function applyDebtPayment(
  state: LocalState,
  row: Pick<TransactionRow, "amount" | "type" | "account" | "liabilityId">,
  sign: 1 | -1
) {
  if (!row.liabilityId || row.type !== "EXPENSE") return;
  const liability = state.liabilities.find((item) => item.id === row.liabilityId);
  if (!liability) return;
  const currency =
    state.accounts.find((item) => item.id === row.account.id)?.currency ?? liability.currency;
  const amount = convert(row.amount, currency, liability.currency, ratesOf(state));
  state.liabilities = state.liabilities.map((item) =>
    item.id === liability.id
      ? { ...item, balance: Math.max(0, roundMoney(item.balance + sign * amount)) }
      : item
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
      transaction.category.id,
      transaction.type,
      transaction.amount,
      transaction.date.slice(0, 10),
      transaction.description ?? ""
    ]);
    before.set(key, (before.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const row of rows) {
    const rawAmount = parseImportedAmount(row[input.amountColumn]);
    const date = parseImportedDate(row[input.dateColumn]);
    if (rawAmount === null || rawAmount === 0 || !date) {
      skipped += 1;
      continue;
    }
    const type = rawAmount >= 0 ? "INCOME" : "EXPENSE";
    const accountName = String(row[input.accountColumn ?? ""] ?? "").trim();
    const account = accountName
      ? findOrCreateAccount(state, accountName)
      : (fallbackAccount ?? findOrCreateAccount(state, DEFAULT_IMPORT_ACCOUNT));
    // Rows without an account of their own follow the first one there is —
    // including one this import has just made.
    fallbackAccount = fallbackAccount ?? account;
    const rawCategoryName = String(row[input.categoryColumn ?? ""] ?? "").trim();
    const description = String(row[input.descriptionColumn ?? ""] ?? "").trim();
    // When the CSV row carries no category, try to auto-categorize it from
    // the description against existing transactions before falling back to a
    // generic import bucket.
    let category;
    if (rawCategoryName) {
      category = findOrCreateCategory(state, rawCategoryName, type);
    } else {
      const suggestedId = suggestCategoryId(description, state.transactions, {
        type,
        rules: [...state.rules]
      });
      category =
        (suggestedId
          ? state.categories.find((item) => item.id === suggestedId && item.kind === type)
          : undefined) ??
        findOrCreateCategory(state, type === "INCOME" ? "Импорт доходов" : "Импорт расходов", type);
    }
    // День строки файла — тот, что будет записан, а не UTC-день местной
    // полуночи: к востоку от Гринвича это вчера, и повторный импорт того же
    // файла не узнавал ни одной строки и задваивал всё.
    const day = storedTransactionDate(date).slice(0, 10);
    const key = keyOf([account.id, category.id, type, Math.abs(rawAmount), day, description]);
    const already = before.get(key) ?? 0;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count < already) {
      skipped += 1;
      continue;
    }
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
    transactionIds.push(created.id);
    imported += 1;
  }
  if (transactionIds.length > 0) {
    state.importBatches = [
      { id: id("import"), importedAt: new Date().toISOString(), transactionIds },
      ...(state.importBatches ?? []).slice(0, 9)
    ];
  }
  return { imported, skipped };
}

export function undoLastImport(state: LocalState) {
  const [batch, ...rest] = state.importBatches ?? [];
  if (!batch) return { removed: 0 };
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
  return {
    source: "database",
    accounts,
    totalBalance: sumInBase(state, accounts),
    currency: state.currency
  };
}

export function transactionsPage(
  state: LocalState,
  searchParams: URLSearchParams
): TransactionsPageData {
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  // `limit=all` hands back the whole filtered ledger. Exporting and looking
  // for duplicates need every row, and asking for a page of twenty and
  // treating it as the ledger is how a CSV export came out twenty rows long.
  const wantsEverything = searchParams.get("limit") === "all";
  const limit = wantsEverything
    ? Number.MAX_SAFE_INTEGER
    : Math.min(100, Math.max(10, Number(searchParams.get("limit") || 20)));
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
    page,
    limit
  };
  // The rows keep the amount as it was recorded — a dollar operation reads
  // as dollars — and carry what it is worth in the base currency beside it,
  // so the totals above the list add up like every other total in the app.
  const context = baseAmountContext(state.accounts, ratesOf(state), state.currency);
  // Порядок — по выбору (`sort`), а «крупные сверху» сравнивают в основной
  // валюте: доллары нельзя ставить рядом с рублями «как есть».
  const filtered = sortTransactions(
    state.transactions.filter((transaction) => matchesCriteria(transaction, criteria)),
    parseSort(searchParams.get("sort")),
    (row) => baseAmountOf(row, context)
  );
  const start = (page - 1) * limit;

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
