// «Объединить»: записи из копии — добавкой к здешним, ничего не заменяя.
// Чистые функции над книгой: читает и пишет хранилище backup-restore.ts
// (mergeBackup, mergeProfiles), здесь только сличение и склейка строк.
// Вынесено из LocalApiClient.

import { id } from "@/lib/api/local/helpers";
import { applyDebtPayment } from "@/lib/api/local/ledger";
import { applyBalance, ratesOf } from "@/lib/api/local/money";
import { createSheet, listSheets, MAIN_SHEET, putScope, sheetScope } from "@/lib/api/local/sheets";
import { type LocalState, recomputeGoal } from "@/lib/api/local/state";
import { convert } from "@/lib/currency";
import { dataKeyOf } from "@/lib/i18n/data-text";
import { roundMoney } from "@/lib/utils";

// ——— «Объединить»: свои записи к пришедшим ————————————————————————————

/** Одно и то же имя — без оглядки на регистр и пробелы по краям. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Два имени одной категории приложения на разных языках («Продукты» и «Groceries»). */
function sameAppCategory(a: string, b: string): boolean {
  const key = dataKeyOf(a, "data.cat.");
  return key !== null && key === dataKeyOf(b, "data.cat.");
}

type Tally = { added: number };

/**
 * Добавить к `target` строки из `rows`, которых в нём ещё нет, — новым
 * массивом: разделы книги из кэша заморожены (freeze-state.ts), и правка на
 * месте упала бы.
 *
 * `key` — как узнать ту же строку: у большинства id, у плана — месяц и статья.
 * Считается ПОСЛЕ `shape`, перевода ссылок на здешние категории: план на
 * «Продукты» телефона и план на «Продукты» ноутбука — один план.
 *
 * При совпадении остаётся здешняя строка: это данные, к которым подключились,
 * и правили их, может быть, позже. Кроме одного случая — здешняя пуста
 * (`empty`: план на ноль, заметка без текста), а пришедшая нет: тогда пустоту
 * заменяет то, что человек вписал.
 */
function addRows<T>(
  tally: Tally,
  target: readonly T[],
  rows: readonly T[],
  key: (row: T) => string,
  options: { shape?: (row: T) => T; empty?: (row: T) => boolean } = {}
): T[] {
  const result = [...target];
  const at = new Map<string, number>();
  result.forEach((row, index) => at.set(key(row), index));
  for (const raw of rows) {
    const row = options.shape ? options.shape(raw) : raw;
    const index = at.get(key(row));
    if (index === undefined) {
      at.set(key(row), result.length);
      result.push(row);
      tally.added += 1;
    } else if (options.empty && options.empty(result[index]) && !options.empty(row)) {
      result[index] = row;
      tally.added += 1;
    }
  }
  return result;
}

/**
 * Влить записи `incoming` в `state` — добавкой, ничего здешнего не заменяя.
 * Возвращает, сколько строк добавилось.
 *
 * Одноимённые категории склеиваются: «Продукты» с двух устройств — это одни
 * «Продукты», и всё, что на них ссылается, переводится на ту, что уже есть, —
 * операции, шаблоны, лимиты, планы, ПРАВИЛА, столбцы таблицы, кэшбэк, платёж
 * по долгу. Правила раньше добавлялись как есть: правило на «Кофе», склеенное
 * со здешним «Кофе», показывало на категорию, которой здесь нет.
 *
 * Счета — нет: «Карта» на телефоне и «Карта» на ноутбуке могут быть разными
 * картами, и сложить их остатки значило бы соврать. Одинаковое имя получает
 * «(2)», чтобы было видно, что их два, — объединить или убрать лишний человек
 * решит сам. Id счёта при этом сохраняется, и ссылки на него остаются верными.
 *
 * Участники семьи склеиваются по имени, как категории: «Маша» на двух
 * устройствах — один человек.
 *
 * Раньше сливались только категории, счета, операции, шаблоны, цели, долги,
 * правила и лимиты. Остальное — планы и заметки к ним, таблицы, портфель,
 * сделки, семья, кэшбэк, поездки, снимки капитала — молча пропадало.
 *
 * Настройки (валюта, тема, ключ помощника) остаются здешними: это настройки
 * тех данных, к которым подключились.
 */
export function mergeRecords(state: LocalState, incoming: LocalState): number {
  const tally: Tally = { added: 0 };
  const here = whatIsHere(state);

  const categoryOf = new Map<string, LocalState["categories"][number]>();
  const categories = [...state.categories];
  for (const category of incoming.categories) {
    const same =
      categories.find((existing) => existing.id === category.id) ??
      categories.find(
        (existing) => existing.kind === category.kind && sameName(existing.label, category.label)
      ) ??
      // Своя категория приложения под именем на другом языке: «Переводы» с
      // русского устройства и «Transfers» с английского — одна категория.
      categories.find(
        (existing) =>
          existing.kind === category.kind && sameAppCategory(existing.label, category.label)
      );
    if (same) {
      categoryOf.set(category.id, same);
      continue;
    }
    categories.push(category);
    categoryOf.set(category.id, category);
  }
  state.categories = categories;
  // OPENING_BALANCE_ID у плана и «*» у кэшбэка — не категории: их нет в
  // копии, и они проходят как есть.
  const categoryId = (from: string) => categoryOf.get(from)?.id ?? from;
  const recategorize = <T extends { category: { id: string; label: string } }>(row: T): T => {
    const target = categoryOf.get(row.category.id);
    return target
      ? { ...row, category: { ...row.category, id: target.id, label: target.label } }
      : row;
  };

  const memberOf = new Map<string, string>();
  const members = [...(state.members ?? [])];
  for (const member of incoming.members ?? []) {
    const same =
      members.find((existing) => existing.id === member.id) ??
      members.find((existing) => sameName(existing.name, member.name));
    if (same) {
      memberOf.set(member.id, same.id);
      continue;
    }
    members.push(member);
    tally.added += 1;
  }
  state.members = members;
  const memberId = (from: string) => memberOf.get(from) ?? from;

  const accounts = [...state.accounts];
  const names = new Set(accounts.map((account) => account.name.trim().toLowerCase()));
  const accountIds = new Set(accounts.map((account) => account.id));
  for (const account of incoming.accounts) {
    if (accountIds.has(account.id)) continue;
    let name = account.name;
    for (let n = 2; names.has(name.trim().toLowerCase()); n += 1) name = `${account.name} (${n})`;
    names.add(name.trim().toLowerCase());
    accounts.push({ ...account, name });
    tally.added += 1;
  }
  state.accounts = accounts;
  // Подпись счёта в операции и шаблоне — под новое имя. Раньше сюда писалось
  // поле `name`, которого у подписи нет (у неё `label`): разбор схемой его
  // срезал, и операции «Карты (2)» оставались подписаны просто «Карта».
  const renamed = <T extends { account: { id: string; label: string } }>(row: T): T => {
    const account = accounts.find((item) => item.id === row.account.id);
    return account && account.name !== row.account.label
      ? { ...row, account: { ...row.account, label: account.name } }
      : row;
  };

  const byId = (row: { id: string }) => row.id;
  const notHere = <T extends { id: string }>(target: readonly T[], rows: readonly T[]) => {
    const have = new Set(target.map((row) => row.id));
    return rows.filter((row) => !have.has(row.id));
  };

  state.transactions = addRows(tally, state.transactions, incoming.transactions, byId, {
    shape: (row) => {
      const moved = renamed(recategorize(row));
      return moved.memberId ? { ...moved, memberId: memberId(moved.memberId) } : moved;
    }
  });
  state.recurringTransactions = addRows(
    tally,
    state.recurringTransactions,
    incoming.recurringTransactions,
    byId,
    { shape: (row) => renamed(recategorize(row)) }
  );
  state.goals = addRows(tally, state.goals, incoming.goals, byId, {
    shape: (goal) =>
      goal.shares
        ? {
            ...goal,
            shares: Object.fromEntries(
              Object.entries(goal.shares).map(([member, share]) => [memberId(member), share])
            )
          }
        : goal
  });
  state.goalMovements = addRows(
    tally,
    state.goalMovements ?? [],
    incoming.goalMovements ?? [],
    byId,
    {
      shape: (row) => {
        const by = (row as { memberId?: string }).memberId;
        return by ? { ...row, memberId: memberId(by) } : row;
      }
    }
  );
  state.liabilities = addRows(tally, state.liabilities, incoming.liabilities, byId, {
    shape: (row) =>
      row.paymentCategoryId ? { ...row, paymentCategoryId: categoryId(row.paymentCategoryId) } : row
  });
  // Правило на то же слово уже есть — здешнее главнее: два правила на одно
  // слово спорили бы, куда относить операцию.
  state.rules = addRows(
    tally,
    state.rules,
    notHere(state.rules, incoming.rules),
    (rule) => rule.match.trim().toLowerCase(),
    { shape: (rule) => ({ ...rule, categoryId: categoryId(rule.categoryId) }) }
  );
  // Лимит на ту же категорию в тот же месяц уже есть — здешний главнее.
  state.budgets = addRows(
    tally,
    state.budgets,
    notHere(state.budgets, incoming.budgets),
    (budget) => JSON.stringify([budget.categoryId, (budget as { month?: string }).month ?? ""]),
    {
      shape: (budget) => {
        const target = categoryOf.get(budget.categoryId);
        return target ? { ...budget, categoryId: target.id, category: target.label } : budget;
      }
    }
  );

  // План/факт: план узнаётся месяцем и статьёй, заметка — месяцем.
  state.plans = addRows(
    tally,
    state.plans,
    incoming.plans,
    (plan) => JSON.stringify([plan.month, plan.categoryId]),
    {
      shape: (plan) => ({ ...plan, categoryId: categoryId(plan.categoryId) }),
      empty: (plan) => plan.amount === 0
    }
  );
  state.planNotes = addRows(tally, state.planNotes, incoming.planNotes, (note) => note.month, {
    empty: (note) => !note.note.trim() && !note.factNote.trim()
  });
  state.planMonths = [
    ...new Set([...(state.planMonths ?? []), ...(incoming.planMonths ?? [])])
  ].sort();

  // Инвестиции. Бумага узнаётся тикером. Одна и та же бумага на обоих
  // устройствах остаётся здешней, а не складывается: чаще всего это одна и та
  // же позиция, записанная дважды, и сумма удвоила бы портфель. Цены и доли
  // (structure и прочее) пересчитает первое же открытие «Инвестиций».
  state.investments = {
    ...state.investments,
    portfolio: addRows(tally, state.investments.portfolio, incoming.investments.portfolio, (row) =>
      row.ticker.toUpperCase()
    ),
    watchlist: addRows(tally, state.investments.watchlist, incoming.investments.watchlist, (row) =>
      row.ticker.toUpperCase()
    )
  };
  state.realizedInvestmentEvents = addRows(
    tally,
    state.realizedInvestmentEvents,
    incoming.realizedInvestmentEvents,
    byId
  );
  state.expectedDividends = addRows(
    tally,
    state.expectedDividends,
    incoming.expectedDividends,
    byId
  );
  // Целевая доля отрасли одна: две «Финансы» с разными процентами спорили бы.
  state.targetAllocations = addRows(
    tally,
    state.targetAllocations,
    notHere(state.targetAllocations, incoming.targetAllocations),
    (row) => row.sector.trim().toLowerCase()
  );
  state.marketAlerts = addRows(
    tally,
    state.marketAlerts,
    notHere(state.marketAlerts, incoming.marketAlerts),
    (row) => JSON.stringify([row.ticker.toUpperCase(), row.metric, row.op, row.value])
  );

  state.familySettlements = addRows(
    tally,
    state.familySettlements ?? [],
    incoming.familySettlements ?? [],
    byId,
    { shape: (row) => ({ ...row, from: memberId(row.from), to: memberId(row.to) }) }
  );
  state.cashbackRules = addRows(tally, state.cashbackRules, incoming.cashbackRules, byId, {
    shape: (rule) => ({ ...rule, categoryId: categoryId(rule.categoryId) })
  });
  state.trips = addRows(tally, state.trips, incoming.trips, byId);
  // Год вычета — id сам год: здешний главнее, если в нём хоть что-то вписано.
  state.deductionYears = addRows(tally, state.deductionYears, incoming.deductionYears, byId, {
    empty: (row) => row.taxPaid === undefined && row.children === undefined
  });
  state.importBatches = addRows(
    tally,
    state.importBatches ?? [],
    incoming.importBatches ?? [],
    byId
  );

  // Снимки капитала и портфеля — по дням. За день, который здесь уже снят,
  // остаётся здешний: складывать нельзя — повторное объединение удвоило бы.
  // Дни, которых здесь нет (до подключения), приезжают — история не
  // начинается заново с сегодняшнего дня.
  const byDate = (row: { date: string }) => row.date;
  const dated = <T extends { date: string }>(rows: T[]) =>
    rows.sort((a, b) => a.date.localeCompare(b.date));
  state.netWorthSnapshots = dated(
    addRows(tally, state.netWorthSnapshots, incoming.netWorthSnapshots, byDate)
  );
  state.portfolioSnapshots = dated(
    addRows(tally, state.portfolioSnapshots ?? [], incoming.portfolioSnapshots ?? [], byDate)
  );

  mergeSheets(tally, state, incoming, categoryId);
  postOntoHere(state, incoming, here);

  return tally.added;
}

/** Что было в книге до объединения — чьи остатки ещё не знают о пришедшем. */
function whatIsHere(state: LocalState) {
  const ids = (rows: ReadonlyArray<{ id: string }>) => new Set(rows.map((row) => row.id));
  return {
    accounts: ids(state.accounts),
    goals: ids(state.goals),
    liabilities: ids(state.liabilities),
    transactions: ids(state.transactions),
    goalMovements: ids(state.goalMovements ?? [])
  };
}

/**
 * Провести добавленное по здешним остаткам.
 *
 * Счёт, которого здесь не было, приезжает со своим остатком — в нём его
 * операции уже сидят. А счёт с тем же id, что и здешний (второе устройство
 * когда-то восстановилось из копии первого), остаётся здешним, и его остаток
 * о пришедших операциях не знает. Раньше они просто добавлялись: на первом
 * устройстве расход 300 — после «Объединить» на втором операция есть, а
 * «Карта» всё ещё 1000 вместо 700. Так же — цель (пополнение, движение
 * цели) и долг (платёж по нему).
 */
function postOntoHere(
  state: LocalState,
  incoming: LocalState,
  here: ReturnType<typeof whatIsHere>
): void {
  for (const row of state.transactions) {
    if (here.transactions.has(row.id)) continue;
    if (here.accounts.has(row.account.id))
      applyBalance(state, row.account.id, row.type === "INCOME" ? row.amount : -row.amount);
    if (row.liabilityId && here.liabilities.has(row.liabilityId)) applyDebtPayment(state, row, -1);
  }
  const rates = ratesOf(state);
  for (const move of state.goalMovements ?? []) {
    if (here.goalMovements.has(move.id)) continue;
    // Сумма движения — в валюте приложения той книги, откуда оно приехало.
    const goal = here.goals.has(move.goalId)
      ? state.goals.find((item) => item.id === move.goalId)
      : undefined;
    if (goal) {
      const delta = roundMoney(convert(move.amount, incoming.currency, state.currency, rates));
      const updated = recomputeGoal({
        ...goal,
        currentAmount: roundMoney(goal.currentAmount + delta)
      });
      state.goals = state.goals.map((item) => (item.id === goal.id ? updated : item));
    }
    const account = here.accounts.has(move.accountId)
      ? state.accounts.find((item) => item.id === move.accountId)
      : undefined;
    if (account) {
      applyBalance(
        state,
        account.id,
        -roundMoney(convert(move.amount, incoming.currency, account.currency, rates))
      );
    }
  }
}

/**
 * Таблицы — по листам.
 *
 * Id столбцов и листов случайные (кроме главной таблицы «main»), поэтому
 * совпавший id значит «тот же лист», уже приезжавший сюда, — к нему просто
 * добавляется недостающее. С главной таблицей так нельзя: «main» есть на
 * каждом устройстве, и две разные таблицы, слитые в одну, дали бы два
 * «Остатка» и два «Итога» с бессмысленным счётом. Поэтому своя главная
 * таблица, если здешняя уже заполнена, ложится отдельным листом «Бюджет (2)».
 */
function mergeSheets(
  tally: Tally,
  state: LocalState,
  incoming: LocalState,
  categoryId: (from: string) => string
): void {
  const sheetOf = new Map<string, string>();
  for (const column of state.sheetColumns ?? []) {
    sheetOf.set(column.id, (column as { sheetId?: string }).sheetId ?? MAIN_SHEET);
  }
  const hasRow = (sheetId: string) => (state.sheets ?? []).some((row) => row.id === sheetId);

  for (const tab of listSheets(incoming)) {
    const row = (incoming.sheets ?? []).find((item) => item.id === tab.id);

    if (tab.kind === "free") {
      if (row && !hasRow(tab.id)) {
        state.sheets = [...(state.sheets ?? []), row];
        tally.added += 1;
      }
      state.freeCells = addRows(
        tally,
        state.freeCells ?? [],
        (incoming.freeCells ?? []).filter((cell) => cell.sheetId === tab.id),
        (cell) => cell.id
      );
      continue;
    }

    const scope = sheetScope(incoming, tab.id);
    const columns = scope.sheetColumns ?? [];
    // Пустая главная таблица — это просто «таблицу не заводили».
    if (tab.id === MAIN_SHEET && columns.length === 0 && !scope.sheetTargets?.length) continue;

    let target = columns.map((column) => sheetOf.get(column.id)).find(Boolean);
    if (!target) {
      if (tab.id !== MAIN_SHEET) target = tab.id;
      else if ((sheetScope(state, MAIN_SHEET).sheetColumns ?? []).length === 0) target = MAIN_SHEET;
      else {
        target = createSheet(state, { name: freeSheetName(state, tab.name), kind: "budget" }, () =>
          id("sheet")
        ).id;
        tally.added += 1;
      }
    }
    if (target === tab.id && row && !hasRow(tab.id)) {
      state.sheets = [...(state.sheets ?? []), row];
      tally.added += 1;
    }

    const here = sheetScope(state, target);
    const merged = {
      sheetColumns: addRows(tally, here.sheetColumns ?? [], columns, (column) => column.id, {
        shape: (column) =>
          column.categoryId ? { ...column, categoryId: categoryId(column.categoryId) } : column
      }),
      sheetCells: addRows(tally, here.sheetCells ?? [], scope.sheetCells ?? [], (cell) => cell.id),
      sheetMonths: addRows(tally, here.sheetMonths ?? [], scope.sheetMonths ?? [], (m) => m.id),
      sheetTargets: addRows(
        tally,
        here.sheetTargets ?? [],
        scope.sheetTargets ?? [],
        (item) => item.id
      ),
      // «Отменить перенос из Excel» — здешний: это память этого устройства.
      sheetBackup: here.sheetBackup ?? null
    };
    putScope(state, target, merged);
    for (const column of merged.sheetColumns) sheetOf.set(column.id, target);
  }
}

/** «Бюджет» → «Бюджет (2)», если такое имя у листа уже есть. */
function freeSheetName(state: LocalState, name: string): string {
  const taken = new Set(listSheets(state).map((tab) => tab.name.trim().toLowerCase()));
  let candidate = name;
  for (let n = 2; taken.has(candidate.trim().toLowerCase()); n += 1) {
    candidate = `${name.slice(0, 54)} (${n})`;
  }
  return candidate;
}
