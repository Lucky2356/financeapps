// План/факт: сетка «категории × месяцы», входящие остатки и запись плана.
// План — не учёт: плановые суммы никогда не смешиваются с операциями.

import { monthKeyOf, toFormObject } from "@/lib/api/local/helpers";
import { convert } from "@/lib/currency";
import { roundMoney } from "@/lib/utils";
import {
  countableRows,
  isTransfer,
  TRANSFER_CATEGORY_LABEL,
  transferKeyOf
} from "@/lib/transactions/transfers";
import { budgetInForce } from "@/lib/budget-rollover";
import type {
  PlanFactCell,
  PlanFactColumn,
  PlanFactMonth,
  PlanFactPageData,
  PlanFactSplit
} from "@/types/finance";
import {
  type LocalState,
  spendingPlan,
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID,
  SAVINGS_ACCOUNT_TYPES,
  MONTH_KEY,
  cellOf,
  shiftMonth
} from "@/lib/api/local/state";
import { ratesOf } from "@/lib/api/local/money";
import { upsertBudget, buildBudgetRow } from "@/lib/api/local/budgets";

// Plan versus fact, laid out the way the owner's own spreadsheet is: every
// category is a column, every month a row, in three bands — what was
// intended, what the ledger holds, and the gap between them. Only the plan is
// typed in; the other two bands are read off the operations, so the grid can
// never disagree with the ledger.
export function planFactPage(
  state: LocalState,
  ahead = 0,
  includeTransfers = false
): PlanFactPageData {
  // Both sides collected as month → category → amount, so a month row is one
  // lookup rather than another pass over every operation.
  const fact = new Map<string, Map<string, number>>();
  // The same money again, split by which pool of accounts it passed through.
  const savingsAccounts = new Set(
    state.accounts
      .filter((account) => !account.isArchived && SAVINGS_ACCOUNT_TYPES.includes(account.type))
      .map((account) => account.id)
  );
  const pools = new Map<string, { income: PlanFactSplit; expense: PlanFactSplit }>();
  // Куда деньги каждой статьи ходят на самом деле, за всю историю. По этому
  // и делится её план: у плановой цифры счёта нет, а у статьи есть привычка.
  const categoryPools = new Map<string, PlanFactSplit>();
  // Перевод между основными счетами и сбережениями — не доход и не расход ни
  // для одной из групп, даже когда переводы велено считать: снять со вклада
  // на отпуск и потратить на отпуск — одна трата, а не доход плюс две траты.
  // Он и так виден в столбце «В сбережения» (с минусом — «из сбережений»).
  const legPools = new Map<string, Set<boolean>>();
  for (const transaction of state.transactions) {
    const key = transferKeyOf(transaction);
    if (!key) continue;
    const seen = legPools.get(key) ?? new Set<boolean>();
    seen.add(savingsAccounts.has(transaction.account.id));
    legPools.set(key, seen);
  }
  const crossPool = new Set([...legPools].filter(([, seen]) => seen.size > 1).map(([key]) => key));
  const counted = countableRows(state.transactions, includeTransfers).filter((transaction) => {
    const key = transferKeyOf(transaction);
    return !key || !crossPool.has(key);
  });
  for (const transaction of counted) {
    const month = transaction.date.slice(0, 7);
    const byCategory = fact.get(month) ?? new Map<string, number>();
    byCategory.set(
      transaction.category.id,
      (byCategory.get(transaction.category.id) ?? 0) + transaction.amount
    );
    fact.set(month, byCategory);

    const pool = pools.get(month) ?? {
      income: { main: 0, savings: 0 },
      expense: { main: 0, savings: 0 }
    };
    const side = transaction.type === "INCOME" ? pool.income : pool.expense;
    const habit = categoryPools.get(transaction.category.id) ?? { main: 0, savings: 0 };
    if (savingsAccounts.has(transaction.account.id)) {
      side.savings += transaction.amount;
      habit.savings += transaction.amount;
    } else {
      side.main += transaction.amount;
      habit.main += transaction.amount;
    }
    categoryPools.set(transaction.category.id, habit);
    pools.set(month, pool);
  }
  const plannedOnSavings = (categoryId: string) => {
    const habit = categoryPools.get(categoryId);
    return !!habit && habit.savings > habit.main;
  };

  // План расходов — те же числа, что в «Лимитах» (spendingPlan): их
  // проставим ниже, когда станет известен список месяцев. Отсюда — доходы и
  // служебные строки, а расходные клетки дают только свои месяцы.
  const expenseIds = new Set(
    state.categories.filter((category) => category.kind === "EXPENSE").map((c) => c.id)
  );
  const plan = new Map<string, Map<string, number>>();
  for (const entry of state.plans) {
    const byCategory = plan.get(entry.month) ?? new Map<string, number>();
    if (!expenseIds.has(entry.categoryId)) byCategory.set(entry.categoryId, entry.amount);
    plan.set(entry.month, byCategory);
  }

  const current = monthKeyOf(new Date());
  const keys = new Set(
    [
      current,
      ...plan.keys(),
      ...fact.keys(),
      ...(state.planMonths ?? []),
      // Месяц, в котором задан лимит, — это месяц с планом: число одно.
      ...state.budgets.flatMap((budget) =>
        budget.month && budget.limitAmount > 0 && expenseIds.has(budget.categoryId)
          ? [budget.month]
          : []
      )
    ].filter((key) => MONTH_KEY.test(key))
  );
  // A month still to come has no operations of its own; it is here only
  // because the owner asked for a row to plan that far ahead.
  for (let step = 1; step <= Math.min(Math.max(Math.trunc(ahead) || 0, 0), 24); step += 1)
    keys.add(shiftMonth(current, step));
  const monthKeys = [...keys].sort((left, right) => right.localeCompare(left));
  for (const month of monthKeys) {
    const byCategory = plan.get(month) ?? new Map<string, number>();
    for (const categoryId of expenseIds) {
      const amount = spendingPlan(state, categoryId, month);
      if (amount && amount > 0) byCategory.set(categoryId, amount);
    }
    if (byCategory.size > 0) plan.set(month, byCategory);
  }

  // One column order for every band and every month, or the eye loses the
  // column it was following: income first, then spending, each sorted by how
  // much money actually passes through it. Summed once here rather than
  // inside the comparator, which asked the same question of every month again
  // on every comparison.
  const weights = new Map<string, number>();
  for (const source of [fact, plan])
    for (const byCategory of source.values())
      for (const [categoryId, amount] of byCategory)
        weights.set(categoryId, (weights.get(categoryId) ?? 0) + amount);
  const weight = (categoryId: string) => weights.get(categoryId) ?? 0;
  // A transfer is not income and not spending, so when the reader has said so,
  // its category has no business taking two columns of the grid either. Only
  // a category that holds nothing BUT transfers goes: someone who files real
  // spending under a category of their own called "Переводы" — money sent to
  // relatives, say — must keep both the column and the money in the totals.
  const transferOnly = new Set<string>();
  if (!includeTransfers) {
    const withTransfers = new Set<string>();
    const withOwnRows = new Set<string>();
    for (const transaction of state.transactions)
      (isTransfer(transaction) ? withTransfers : withOwnRows).add(transaction.category.id);
    for (const category of state.categories) {
      const isTransferCategory =
        withTransfers.has(category.id) ||
        category.label.toLowerCase() === TRANSFER_CATEGORY_LABEL.toLowerCase();
      if (isTransferCategory && !withOwnRows.has(category.id)) transferOnly.add(category.id);
    }
  }

  const columns: PlanFactColumn[] = state.categories
    .filter((category) => !transferOnly.has(category.id))
    .map((category) => ({
      categoryId: category.id,
      label: category.label,
      color: category.color,
      ...(category.icon ? { icon: category.icon } : {}),
      kind: category.kind
    }))
    .sort(
      (left, right) =>
        (left.kind === right.kind ? 0 : left.kind === "INCOME" ? -1 : 1) ||
        weight(right.categoryId) - weight(left.categoryId) ||
        left.label.localeCompare(right.label)
    );

  const notes = new Map(state.planNotes.map((entry) => [entry.month, entry] as const));
  const openingOf = openingBalances(state);
  const months: PlanFactMonth[] = monthKeys.map((month) => {
    const factOf = fact.get(month);
    const planOf = plan.get(month);
    const cells: Record<string, PlanFactCell> = {};
    let incomePlan = 0;
    let incomeFact = 0;
    let expensePlan = 0;
    let expenseFact = 0;
    let incomePlanSavings = 0;
    let expensePlanSavings = 0;

    for (const column of columns) {
      const cell = cellOf(planOf?.get(column.categoryId) ?? 0, factOf?.get(column.categoryId) ?? 0);
      cells[column.categoryId] = cell;
      const onSavings = plannedOnSavings(column.categoryId);
      if (column.kind === "INCOME") {
        incomePlan += cell.plan;
        incomeFact += cell.fact;
        if (onSavings) incomePlanSavings += cell.plan;
      } else {
        expensePlan += cell.plan;
        expenseFact += cell.fact;
        if (onSavings) expensePlanSavings += cell.plan;
      }
    }

    // What the month started with, in two parts. The plan side is the owner's
    // own figure; the fact side is derived — today's balances wound back
    // through everything recorded since the month began.
    const opening = cellOf(planOf?.get(OPENING_BALANCE_ID) ?? 0, openingOf(month, false));
    const savings = cellOf(planOf?.get(SAVINGS_BALANCE_ID) ?? 0, openingOf(month, true));
    const income = cellOf(incomePlan, incomeFact);
    const expense = cellOf(expensePlan, expenseFact);
    const pool = pools.get(month);

    // What each pool was left holding when the month ended — which is the
    // same figure as what it starts the next one with. Taken from the wound
    // back balances rather than from opening + income − expense, because a
    // transfer between the two pools moves both halves without being income
    // or spending on either: derive it and the two numbers disagree with
    // next month's opening row directly above them.
    const next = shiftMonth(month, 1);
    const endMain = openingOf(next, false);
    const endSavings = openingOf(next, true);

    // Сколько переехало в сбережения на самом деле. Выводится из остатков:
    // конец − начало, минус пришедшее на сбережения доходом, плюс потраченное
    // с них. Что осталось — и есть переводы, включая пополнения целей.
    const movedToSavings =
      endSavings - savings.fact - (pool?.income.savings ?? 0) + (pool?.expense.savings ?? 0);
    const toSavings = cellOf(planOf?.get(SAVINGS_TRANSFER_ID) ?? 0, roundMoney(movedToSavings));

    // План раскладывается на две группы так, как ходят деньги: статья идёт
    // туда, куда её деньги оседают по истории (проценты по вкладу — на
    // сбережения), статья без истории — через основные счета, а на вклад
    // сверх того попадает то, что владелец собрался отложить. Факт по-прежнему берётся
    // из остатков — складывать его заново значило бы разойтись со строкой
    // «остаток на начало» следующего месяца, стоящей прямо над ним.
    const incomeBy = pool?.income ?? { main: 0, savings: 0 };
    const expenseBy = pool?.expense ?? { main: 0, savings: 0 };
    const incomePools = {
      main: cellOf(income.plan - incomePlanSavings, incomeBy.main),
      savings: cellOf(incomePlanSavings, incomeBy.savings)
    };
    const expensePools = {
      main: cellOf(expense.plan - expensePlanSavings, expenseBy.main),
      savings: cellOf(expensePlanSavings, expenseBy.savings)
    };
    const resultBy = {
      main: cellOf(
        opening.plan + incomePools.main.plan - expensePools.main.plan - toSavings.plan,
        endMain
      ),
      savings: cellOf(
        savings.plan + toSavings.plan + incomePools.savings.plan - expensePools.savings.plan,
        endSavings
      )
    };

    // The fact bottom line is the two pools added up — the very numbers the
    // row above shows — and not the same sum worked out a second way from
    // opening + income − expense. The second way quietly disagrees with the
    // first: an operation on an account that has since been archived is still
    // in the category totals (the money was spent, and the history says so)
    // but is gone from the balances those pools are wound back from. The
    // difference band is built on this figure, so the disagreement showed up
    // where it hurts — as a "разница" measured against a total nobody could
    // see. One number, one source.
    return {
      month,
      opening,
      savings,
      cells,
      income,
      expense,
      incomeBy,
      expenseBy,
      incomePools,
      expensePools,
      toSavings,
      resultBy,
      // Итог — те же две половины, сложенные. Одно число из одного источника:
      // считать его вторым способом значит однажды разойтись с первым.
      result: cellOf(
        resultBy.main.plan + resultBy.savings.plan,
        resultBy.main.fact + resultBy.savings.fact
      ),
      note: notes.get(month)?.note ?? "",
      factNote: notes.get(month)?.factNote ?? ""
    };
  });

  return {
    source: "database",
    currency: state.currency,
    columns,
    months,
    savingsAccountIds: [...savingsAccounts],
    crossPoolTransfers: [...crossPool]
  };
}

/**
 * What each group of accounts held when a month started: today's balances,
 * wound back through everything recorded on those accounts since.
 *
 * Returns a lookup rather than a number because the grid asks for every month
 * twice; walking the whole ledger each time turned a page of a few hundred
 * rows into tens of passes over it. One pass here, then arithmetic over the
 * handful of months that exist.
 *
 * A transfer is an ordinary row on each side of this figure whatever the
 * reader chose about totals — it has to be, or moving money into savings
 * would leave both halves wrong.
 */
export function openingBalances(state: LocalState): (month: string, savings: boolean) => number {
  const rates = ratesOf(state);
  // Archived accounts are outside every other total on this screen, so their
  // rows must not be wound back out of a balance that never held them.
  const live = state.accounts.filter((account) => !account.isArchived);
  const group = new Map(
    live.map((account) => [account.id, SAVINGS_ACCOUNT_TYPES.includes(account.type)] as const)
  );

  const now = { main: 0, savings: 0 };
  for (const account of live) {
    const base = convert(account.balance, account.currency, state.currency, rates);
    if (group.get(account.id)) now.savings += base;
    else now.main += base;
  }
  // Money put into a goal is still savings — it left a balance and went into a
  // jar, and counting only the balances made the row drop by the size of every
  // top-up with nothing on the income or spending side to explain it.
  //
  // What the goal holds, not the movements behind it: a top-up made before the
  // app started writing them down has no record, and counting only records
  // would have gone on hiding exactly the money this is here to show. Capital
  // counts goals the same way, so the two screens agree.
  for (const goal of state.goals) now.savings += goal.currentAmount;

  // Everything recorded since, per month and per group — in base currency, or
  // a foreign-currency account would be wound back by raw units of its own.
  const flow = new Map<string, { main: number; savings: number }>();
  for (const transaction of state.transactions) {
    const savings = group.get(transaction.account.id);
    if (savings === undefined) continue; // archived, or an account since gone
    const month = transaction.date.slice(0, 7);
    const bucket = flow.get(month) ?? { main: 0, savings: 0 };
    // Amounts arrive in the base currency already (see `inBase`), so only
    // the balances above still need converting.
    const signed = transaction.type === "INCOME" ? transaction.amount : -transaction.amount;
    if (savings) bucket.savings += signed;
    else bucket.main += signed;
    flow.set(month, bucket);
  }

  // A goal top-up is a move between the two halves of this row: it leaves the
  // account it came from and joins the goals counted above.
  for (const movement of state.goalMovements ?? []) {
    const savings = group.get(movement.accountId);
    const month = movement.date.slice(0, 7);
    const bucket = flow.get(month) ?? { main: 0, savings: 0 };
    if (savings === false) bucket.main -= movement.amount;
    else if (savings === true) bucket.savings -= movement.amount;
    bucket.savings += movement.amount;
    flow.set(month, bucket);
  }

  return (month, savings) => {
    let since = 0;
    for (const [key, bucket] of flow)
      if (key >= month) since += savings ? bucket.savings : bucket.main;
    return roundMoney((savings ? now.savings : now.main) - since);
  };
}

// One cell of the plan, or the month's note. An amount of zero clears the
// cell rather than storing a zero, so an untouched category stays untouched.
export function savePlan(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const month = String(input.month ?? "");
  if (!MONTH_KEY.test(month)) throw new Error("Укажите месяц в виде ГГГГ-ММ.");

  // A month the owner wants a row for. Before this, the grid could only be
  // asked for months AHEAD of the current one, so an earlier month with
  // nothing recorded in it could not be planned at all.
  const action = String(input.action ?? "");
  if (action === "addMonth") {
    const pinned = state.planMonths ?? [];
    state.planMonths = [...new Set([...pinned, month])].sort().slice(-48);
    return { month };
  }
  // Removing a month takes away what this screen owns — the plan and the
  // comments. Operations are not the grid's to delete, so a month that has
  // any stays in the table with its fact row; the period filter is what hides
  // it from view.
  if (action === "removeMonth") {
    state.planMonths = (state.planMonths ?? []).filter((entry) => entry !== month);
    state.plans = state.plans.filter((entry) => entry.month !== month);
    state.planNotes = state.planNotes.filter((entry) => entry.month !== month);
    // План расходов этого месяца — это его лимиты. Уходят и они, но лимит,
    // который отсюда действовал дальше, остаётся следующему месяцу: удалить
    // строку июля не значит снять лимит, по которому живёт сентябрь.
    const next = shiftMonth(month, 1);
    for (const own of state.budgets.filter((budget) => budget.month === month)) {
      const category = state.categories.find((item) => item.id === own.categoryId);
      const rest = state.budgets.filter((budget) => budget !== own);
      const nextOwn = rest.some(
        (budget) => budget.categoryId === own.categoryId && budget.month === next
      );
      const nextAfter = budgetInForce(rest, own.categoryId, next)?.limitAmount ?? 0;
      state.budgets =
        category && !nextOwn && nextAfter !== own.limitAmount
          ? [buildBudgetRow(state, category, own.limitAmount, next, own.rollover ?? false), ...rest]
          : rest;
    }
    const hasFacts = state.transactions.some((row) => row.date.slice(0, 7) === month);
    return { month, hasFacts };
  }

  if (input.note !== undefined || input.factNote !== undefined) {
    // Either comment can be written on its own, so the one not being edited
    // is carried over rather than wiped.
    const clean = (value: unknown) => String(value).trim().slice(0, 500);
    const current = state.planNotes.find((entry) => entry.month === month);
    const note = input.note !== undefined ? clean(input.note) : (current?.note ?? "");
    const factNote =
      input.factNote !== undefined ? clean(input.factNote) : (current?.factNote ?? "");
    state.planNotes = [
      ...state.planNotes.filter((entry) => entry.month !== month),
      ...(note || factNote ? [{ month, note, factNote }] : [])
    ];
    return { month, note, factNote };
  }

  const categoryId = String(input.categoryId ?? "");
  if (!categoryId) throw new Error("Выберите категорию.");
  if (
    categoryId !== OPENING_BALANCE_ID &&
    categoryId !== SAVINGS_BALANCE_ID &&
    categoryId !== SAVINGS_TRANSFER_ID &&
    !state.categories.some((category) => category.id === categoryId)
  )
    throw new Error("Категория не найдена.");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Введите сумму от нуля.");

  // План расхода и лимит — одно число (spendingPlan): клетка расходной
  // категории пишется туда же, куда и лимит, и появляется в «Лимитах» сама.
  if (
    state.categories.some((category) => category.id === categoryId && category.kind === "EXPENSE")
  ) {
    upsertBudget(state, { categoryId, month, limitAmount: String(roundMoney(amount)) });
    return { month, categoryId, amount: roundMoney(amount) };
  }

  const rest = state.plans.filter(
    (entry) => !(entry.month === month && entry.categoryId === categoryId)
  );
  state.plans = amount > 0 ? [...rest, { month, categoryId, amount: roundMoney(amount) }] : rest;
  return { month, categoryId, amount: roundMoney(amount) };
}
