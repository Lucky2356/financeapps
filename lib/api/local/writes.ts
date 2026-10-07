// Таблицы записей и удалений: путь → обработчик. Здесь те, что меняют только
// документ: обработчик правит переданный ему `state` и возвращает ответ, а
// сохраняет документ LocalApiClient — один раз, после обработчика, и только
// если тот не бросил ошибку. Записи, которые трогают хранилище (пример,
// профили, копии, корзина, фото), живут в самом клиенте.
//
// Один путь может делать несколько разных дел — что именно, говорит поле
// `action` в теле запроса. Такие дела перечислены таблицей (byAction), а не
// ветками внутри обработчика: по таблице же выводится ответ каждого дела
// (lib/api/routes.ts).

import { id, routeOf } from "@/lib/api/local/helpers";
import {
  CASHBACK_ACTIONS,
  deductionKindOf,
  saveCashbackRule,
  saveTrip,
  TRIP_ACTIONS,
  writeDeductionYear
} from "@/lib/api/local/extras";
import {
  importIntoSheet,
  importWorkbook,
  MAIN_SHEET,
  SHEETS_ACTIONS,
  unknownSheetsAction,
  unknownWorkbookAction,
  WORKBOOK_ACTIONS,
  type WorkbookImportSheet
} from "@/lib/api/local/sheets";
import { convert } from "@/lib/currency";
import { roundMoney } from "@/lib/utils";
import { transferKeyOf } from "@/lib/transactions/transfers";
import { unusualFor } from "@/lib/analytics/watchdog";
import { STANDARD_CATEGORY_IDS, type LocalState } from "@/lib/api/local/state";
import { applyBalance, ratesOf } from "@/lib/api/local/money";
import {
  createSplit,
  createTransfer,
  deleteTransaction,
  importCsvRows,
  linkTransfer,
  reconcileAccount,
  restoreTransaction,
  undoLastImport,
  upsertAccount,
  upsertTransaction,
  watchRows
} from "@/lib/api/local/ledger";
import { budgetWarningFor, upsertBudget } from "@/lib/api/local/budgets";
import { depositToGoal, goalAccount, upsertGoal, withdrawFromGoal } from "@/lib/api/local/goals";
import { autoPayDebts, payDebt, upsertLiability } from "@/lib/api/local/debts";
import {
  materializeAllDue,
  materializeRecurring,
  upsertRecurring
} from "@/lib/api/local/recurring";
import {
  addExpectedDividend,
  addMarketAlert,
  addRealizedEvent,
  setTargetAllocations,
  INVESTMENT_ACTIONS,
  savePosition,
  undoSale,
  type MarketPrices
} from "@/lib/api/local/investments";
import { addRule, upsertCategory, withSheetCategories } from "@/lib/api/local/categories";
import { savePlan } from "@/lib/api/local/plan";
import { recordNetWorthSnapshot } from "@/lib/api/local/overview";
import { updateFxRates, updateSettings } from "@/lib/api/local/settings";
import { FAMILY_ACTIONS, unknownFamilyAction } from "@/lib/api/local/family";

/** Что получает обработчик записи. */
export type WriteRequest = {
  state: LocalState;
  body: unknown;
  method: "POST" | "PUT";
  /** Цены с биржи, если путь их просит (PRICED_WRITES) — получены до очереди. */
  prices?: MarketPrices;
};

/**
 * Записи, которым нужны цены с биржи. Клиент запрашивает их ДО очереди
 * записей и передаёт обработчику: ждать сеть внутри очереди — значит держать
 * за собой все остальные записи (см. marketPricesFor).
 */
export const PRICED_WRITES: ReadonlySet<string> = new Set(["/networth/snapshot"]);

/** Что получает обработчик удаления. */
export type DeleteRequest = {
  state: LocalState;
  searchParams: URLSearchParams;
  /** `?id=` из пути; путь, которому он нужен, без него не находится. */
  itemId: string | null;
};

function actionOf(body: unknown): unknown {
  return (body as { action?: unknown } | null | undefined)?.action;
}

type WriteHandler = (request: WriteRequest) => unknown;

/**
 * Путь, который делает разные дела по полю `action` в теле.
 *
 * `action`, которого нет в таблице (или нет вовсе), — дело по умолчанию.
 * Таблица остаётся на обработчике: по ней тип ответа выводится из того, какое
 * `action` вызывающий положил в тело.
 */
export function byAction<
  Actions extends Record<string, WriteHandler>,
  Fallback extends WriteHandler
>(actions: Actions, fallback: Fallback) {
  const run = (request: WriteRequest) => {
    const action = actionOf(request.body);
    const handler = (typeof action === "string" && routeOf(actions, action)) || fallback;
    return handler(request) as ReturnType<Actions[keyof Actions]> | ReturnType<Fallback>;
  };
  return Object.assign(run, { actions, fallback });
}

/**
 * Таблица дел модуля — обработчиками запроса. Модуль про запросы не знает:
 * его дела берут книгу, тело и что ещё нужно, а `args` достаёт это из запроса.
 */
function fromTable<
  const Args extends unknown[],
  Table extends Record<string, (...args: Args) => unknown>
>(table: Table, args: (request: WriteRequest) => Args) {
  const handlers: Record<string, WriteHandler> = {};
  for (const [name, run] of Object.entries(table))
    handlers[name] = (request) => run(...args(request));
  // Каждое дело зовётся как есть, ответ его не меняется — меняется только вход.
  return handlers as { [Name in keyof Table]: (request: WriteRequest) => ReturnType<Table[Name]> };
}

function saveTransaction({ state, body, method }: WriteRequest) {
  const tx = upsertTransaction(state, body, method);
  const budgetWarning = budgetWarningFor(state, tx);
  // Сторож: трата втрое больше обычной для категории — «это верно?».
  const usual =
    tx.type === "EXPENSE" && method === "POST"
      ? unusualFor(
          { amount: tx.amount, categoryId: tx.category.id, date: tx.date },
          watchRows(state).filter((row) => row.id !== tx.id)
        )
      : null;
  return { ...tx, budgetWarning, ...(usual !== null ? { unusual: { usual } } : {}) };
}

function inputOf(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

function markDeduction({ state, body }: WriteRequest) {
  const input = inputOf(body);
  const kind = deductionKindOf(input.kind);
  state.categories = state.categories.map((category) => {
    if (category.id !== input.categoryId) return category;
    const { deduction: _was, ...rest } = category;
    void _was;
    return kind ? { ...rest, deduction: kind } : rest;
  });
  return { categoryId: input.categoryId, kind };
}

function importSheet({ state, body }: WriteRequest) {
  const input = inputOf(body);
  const sheetId = input.sheetId ? String(input.sheetId) : MAIN_SHEET;
  return importIntoSheet(
    state,
    sheetId,
    withSheetCategories(state, input.payload),
    () => id("col"),
    new Date().toISOString()
  );
}

function importSheets({ state, body }: WriteRequest) {
  const input = inputOf(body);
  const sheets = (Array.isArray(input.sheets) ? input.sheets : []) as WorkbookImportSheet[];
  for (const item of sheets)
    if (item.kind === "budget") item.payload = withSheetCategories(state, item.payload);
  return importWorkbook(state, sheets, () => id("sh"), new Date().toISOString());
}

/** Записи, которые меняют только документ; сохраняет его клиент. */
export const STATE_WRITES = {
  "/accounts": byAction(
    { reconcile: ({ state, body }: WriteRequest) => reconcileAccount(state, body) },
    ({ state, body, method }: WriteRequest) => upsertAccount(state, body, method)
  ),
  "/transactions": byAction(
    {
      transfer: ({ state, body }: WriteRequest) => createTransfer(state, body),
      restore: ({ state, body }: WriteRequest) => restoreTransaction(state, body),
      split: ({ state, body }: WriteRequest) => createSplit(state, body),
      linkTransfer: ({ state, body }: WriteRequest) => linkTransfer(state, body)
    },
    saveTransaction
  ),
  "/transactions/transfer": ({ state, body }: WriteRequest) => createTransfer(state, body),
  "/budgets": ({ state, body }: WriteRequest) => upsertBudget(state, body),
  "/goals": byAction(
    {
      deposit: ({ state, body }: WriteRequest) => depositToGoal(state, body),
      withdraw: ({ state, body }: WriteRequest) => withdrawFromGoal(state, body)
    },
    ({ state, body, method }: WriteRequest) => upsertGoal(state, body, method)
  ),
  "/debts": ({ state, body, method }: WriteRequest) => upsertLiability(state, body, method),
  "/rules": ({ state, body }: WriteRequest) => addRule(state, body),
  "/recurring": ({ state, body, method }: WriteRequest) => upsertRecurring(state, body, method),
  "/recurring/materialize": ({ state, body }: WriteRequest) => materializeRecurring(state, body),
  "/recurring/materialize-all": ({ state }: WriteRequest) => materializeAllDue(state),
  "/debts/pay": ({ state, body }: WriteRequest) => payDebt(state, body),
  "/debts/auto-pay": ({ state }: WriteRequest) => autoPayDebts(state),
  "/networth/snapshot": ({ state, prices }: WriteRequest) =>
    recordNetWorthSnapshot(state, prices ?? new Map()),
  "/import": ({ state, body }: WriteRequest) => importCsvRows(state, body),
  "/import/undo": ({ state }: WriteRequest) => undoLastImport(state),
  "/settings": ({ state, body }: WriteRequest) => updateSettings(state, body),
  "/fx": ({ state, body }: WriteRequest) => updateFxRates(state, body),
  "/investments/events": ({ state, body }: WriteRequest) => addRealizedEvent(state, body),
  "/investments/dividends": ({ state, body }: WriteRequest) => addExpectedDividend(state, body),
  "/investments/targets": ({ state, body }: WriteRequest) => setTargetAllocations(state, body),
  "/market/alerts": ({ state, body }: WriteRequest) => addMarketAlert(state, body),
  "/investments": byAction(
    fromTable(INVESTMENT_ACTIONS, ({ state, body }: WriteRequest) => [state, body]),
    ({ state, body }: WriteRequest) => savePosition(state, body)
  ),
  "/categories": ({ state, body, method }: WriteRequest) => upsertCategory(state, body, method),
  "/plan": ({ state, body }: WriteRequest) => savePlan(state, body),
  "/cashback": byAction(
    fromTable(CASHBACK_ACTIONS, ({ state, body }: WriteRequest) => [
      state,
      inputOf(body),
      () => id("cb")
    ]),
    ({ state, body }: WriteRequest) =>
      saveCashbackRule(state, inputOf(body), () => id("cb"), {
        account: (accountId) =>
          state.accounts.some((item) => item.id === accountId && !item.isArchived),
        category: (categoryId) => state.categories.some((item) => item.id === categoryId)
      })
  ),
  "/trips": byAction(
    fromTable(TRIP_ACTIONS, ({ state, body }: WriteRequest) => [state, inputOf(body)]),
    ({ state, body }: WriteRequest) => saveTrip(state, inputOf(body), () => id("trip"))
  ),
  "/deductions": byAction({ mark: markDeduction }, ({ state, body }: WriteRequest) =>
    writeDeductionYear(state, inputOf(body))
  ),
  "/sheet": byAction(
    {
      import: importSheet,
      ...fromTable(WORKBOOK_ACTIONS, ({ state, body }: WriteRequest) => [
        state,
        inputOf(body),
        () => id("col")
      ])
    },
    ({ state, body }: WriteRequest) => unknownWorkbookAction(state, inputOf(body))
  ),
  "/family": byAction(
    fromTable(FAMILY_ACTIONS, ({ state, body }: WriteRequest) => [state, inputOf(body)]),
    unknownFamilyAction
  ),
  "/sheets": byAction(
    {
      importWorkbook: importSheets,
      ...fromTable(SHEETS_ACTIONS, ({ state, body }: WriteRequest) => [
        state,
        inputOf(body),
        () => id("sh")
      ])
    },
    ({ body }: WriteRequest) => unknownSheetsAction(inputOf(body))
  )
};

/** Обработчик удаления, которому нужен `?id=`. */
function byId(remove: (state: LocalState, itemId: string, request: DeleteRequest) => void) {
  return (request: DeleteRequest): boolean => {
    if (!request.itemId) return false;
    remove(request.state, request.itemId, request);
    return true;
  };
}

/**
 * Удаления, которые меняют только документ; сохраняет его клиент.
 *
 * Обработчик отвечает `false`, если путь без нужного ему параметра — тогда
 * такого удаления нет, как нет и неизвестного пути.
 */
export const STATE_DELETES = {
  "/accounts": byId((state, itemId) => {
    state.accounts = state.accounts.map((account) =>
      account.id === itemId ? { ...account, isArchived: true } : account
    );
  }),
  "/transactions": ({ state, searchParams, itemId }) => {
    const group = searchParams.get("splitGroupId");
    if (group) {
      // Чек, разложенный по категориям, удаляется целиком — его части по
      // отдельности ничего не значат.
      for (const part of state.transactions.filter((item) => item.splitGroupId === group)) {
        deleteTransaction(state, part.id);
      }
      return true;
    }
    if (!itemId) return false;
    // Перевод — две строки: списание и зачисление. Удалить одну значило бы
    // заставить деньги исчезнуть — со счёта ушли, никуда не пришли (или
    // наоборот). Удаляется весь перевод.
    // Перевод узнаётся и по старой метке в описании (записанные до 1.10).
    const row = state.transactions.find((item) => item.id === itemId);
    const transfer = row ? transferKeyOf(row) : null;
    const ids = transfer
      ? state.transactions.filter((item) => transferKeyOf(item) === transfer).map((item) => item.id)
      : [itemId];
    for (const one of ids) deleteTransaction(state, one);
    return true;
  },
  "/goals": byId((state, itemId, { searchParams }) => {
    // Deleting a goal that still holds money used to make that money vanish:
    // capital fell by the amount, no account got it back, and the record of
    // how it got there stayed behind and kept being counted. The money goes
    // somewhere first — onto a chosen account, or written off deliberately.
    const goal = state.goals.find((item) => item.id === itemId);
    if (goal && goal.currentAmount > 0) {
      const writeOff = searchParams.get("writeOff") === "1";
      const accountId = searchParams.get("accountId") || goal.linkedAccountId;
      if (!writeOff) {
        const account = goalAccount(state, accountId);
        applyBalance(
          state,
          account.id,
          roundMoney(convert(goal.currentAmount, state.currency, account.currency, ratesOf(state)))
        );
      }
    }
    state.goals = state.goals.filter((item) => item.id !== itemId);
    state.goalMovements = (state.goalMovements ?? []).filter(
      (movement) => movement.goalId !== itemId
    );
  }),
  "/debts": byId((state, itemId) => {
    state.liabilities = state.liabilities.filter((liability) => liability.id !== itemId);
  }),
  "/investments/events": byId((state, itemId) => {
    // Recording a sale takes the shares out of the portfolio and puts the
    // money on an account, so deleting the record has to undo both — see
    // undoSale.
    const event = (state.realizedInvestmentEvents ?? []).find((item) => item.id === itemId);
    if (event?.type === "SELL") undoSale(state, event);
    state.realizedInvestmentEvents = (state.realizedInvestmentEvents ?? []).filter(
      (item) => item.id !== itemId
    );
  }),
  "/market/alerts": byId((state, itemId) => {
    state.marketAlerts = (state.marketAlerts ?? []).filter((alert) => alert.id !== itemId);
  }),
  "/investments/dividends": byId((state, itemId) => {
    state.expectedDividends = (state.expectedDividends ?? []).filter(
      (dividend) => dividend.id !== itemId
    );
  }),
  "/investments/targets": byId((state, itemId) => {
    state.targetAllocations = (state.targetAllocations ?? []).filter(
      (target) => target.id !== itemId
    );
  }),
  "/rules": byId((state, itemId) => {
    state.rules = state.rules.filter((rule) => rule.id !== itemId);
  }),
  "/recurring": byId((state, itemId) => {
    // Deleting a plan only removes the plan — operations already posted from it
    // stay in the ledger (they describe money that actually moved).
    state.recurringTransactions = state.recurringTransactions.filter((item) => item.id !== itemId);
  }),
  "/categories": byId((state, itemId) => {
    if (STANDARD_CATEGORY_IDS.has(itemId)) {
      throw new Error(
        "Стандартную категорию удалить нельзя — её можно переименовать, перекрасить или сменить значок."
      );
    }
    const txCount = state.transactions.filter((t) => t.category.id === itemId).length;
    if (txCount > 0) {
      throw new Error(`Нельзя удалить категорию: к ней привязано ${txCount} операций.`);
    }
    state.categories = state.categories.filter((c) => c.id !== itemId);
  })
} satisfies Record<string, (request: DeleteRequest) => boolean>;
