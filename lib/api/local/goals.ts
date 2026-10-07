// Цели: запись, пополнение и снятие со счёта цели, страница «Цели».

import type { GoalsPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import { storedTransactionDate } from "@/lib/transactions/date";
import { convert } from "@/lib/currency";
import { isUsableMoney, MONEY_RANGE_ERROR, roundMoney } from "@/lib/utils";
import { goalFamily } from "@/lib/family/goal-shares";
import { type LocalState, recomputeGoal, goalSharesFrom } from "@/lib/api/local/state";
import { applyBalance, ratesOf } from "@/lib/api/local/money";

export function upsertGoal(state: LocalState, body: unknown, method: "POST" | "PUT") {
  const input = toFormObject(body);
  const previous =
    method === "PUT" && input.id ? state.goals.find((item) => item.id === input.id) : undefined;
  const linkedAccountId = input.linkedAccountId?.trim() || undefined;
  // What is in a goal is money that left an account, so the "saved" figure is
  // not a field to be typed over: a number written straight into it made
  // capital grow out of nothing. The form still shows it, and a change to it
  // is carried out as a top-up or a withdrawal — through the account the goal
  // is tied to, or one named in the payload.
  const requested = Number(input.currentAmount ?? previous?.currentAmount ?? 0);
  const wanted = Number.isFinite(requested) ? Math.max(requested, 0) : 0;
  const held = previous?.currentAmount ?? 0;
  const difference = roundMoney(wanted - held);

  const row = recomputeGoal({
    id: previous?.id ?? id("goal"),
    title: input.title?.trim() || "Новая цель",
    targetAmount: Number(input.targetAmount),
    // The money side is settled below, never here.
    currentAmount: held,
    deadline: new Date(input.deadline).toISOString(),
    linkedAccountId,
    plannedContribution: Math.max(Number(input.plannedContribution ?? 0), 0),
    ...goalSharesFrom(input.shares, previous?.shares)
  });
  state.goals = previous
    ? state.goals.map((item) => (item.id === row.id ? row : item))
    : [...state.goals, row];
  if (difference === 0) return row;

  const account = goalAccount(state, input.accountId || linkedAccountId);
  const accountDelta = roundMoney(
    convert(difference, state.currency, account.currency, ratesOf(state))
  );
  if (difference > 0 && accountDelta > account.balance)
    throw new Error("Недостаточно средств на счёте.");
  return applyGoalMovement(state, row, account, {
    accountDelta: -accountDelta,
    goalDelta: difference
  });
}

// Top up a goal by moving money from a chosen account into the goal — a
// transfer to savings, NOT a consumption expense. No income/expense
// transaction is recorded, so savings rate / monthly expense / budgets are
// not distorted; the account balance drops and the goal grows, leaving net
// worth (which counts goal savings) conserved.
export function depositToGoal(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const goal = goalById(state, input.goalId);
  const account = goalAccount(state, input.accountId || goal.linkedAccountId);
  const amount = Number(input.amount);
  if (!isUsableMoney(amount)) throw new Error(MONEY_RANGE_ERROR);
  if (amount > account.balance) throw new Error("Недостаточно средств на счёте.");

  // The amount is typed in the account's own currency — that is the money the
  // owner is looking at — and a goal is kept in the app's, like every total.
  return applyGoalMovement(
    state,
    goal,
    account,
    {
      accountDelta: -amount,
      goalDelta: roundMoney(convert(amount, account.currency, state.currency, ratesOf(state)))
    },
    input.memberId
  );
}

/** The other direction: money comes back out of a goal onto an account. */
export function withdrawFromGoal(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const goal = goalById(state, input.goalId);
  const account = goalAccount(state, input.accountId || goal.linkedAccountId);
  // Typed on the goal's side here: it is the jar being emptied, and the jar is
  // counted in the app's currency.
  const amount = Number(input.amount);
  if (!isUsableMoney(amount)) throw new Error(MONEY_RANGE_ERROR);
  if (amount > goal.currentAmount) throw new Error("В цели меньше денег, чем вы снимаете.");

  return applyGoalMovement(
    state,
    goal,
    account,
    {
      accountDelta: roundMoney(convert(amount, state.currency, account.currency, ratesOf(state))),
      goalDelta: -amount
    },
    input.memberId
  );
}

export function goalById(state: LocalState, goalId: string | undefined) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) throw new Error("Цель не найдена.");
  return goal;
}

export function goalAccount(state: LocalState, accountId: string | undefined) {
  if (!accountId) throw new Error("Выберите счёт.");
  const account = state.accounts.find((item) => item.id === accountId && !item.isArchived);
  if (!account) throw new Error("Выберите существующий активный счёт.");
  return account;
}

/**
 * One move of money between an account and a goal, both sides at once.
 *
 * A goal is an envelope: what is in it got there from a balance, and every
 * figure in the app is built on that. So the two sides are always applied
 * together and written down — plan/fact winds today's balances back through
 * the record, and without it a top-up made every earlier month read short by
 * its amount.
 *
 * `accountDelta` is in the account's currency (negative = money leaves it);
 * `goalDelta` is in the app's (positive = the goal grows). Both are given by
 * the caller rather than derived from one another, so the side the owner
 * typed is stored to the kopeck they typed.
 */
export function applyGoalMovement(
  state: LocalState,
  goal: GoalsPageData["goals"][number],
  account: { id: string; currency: string },
  sides: { accountDelta: number; goalDelta: number },
  memberId?: unknown
) {
  applyBalance(state, account.id, sides.accountDelta);
  // Кто из семьи пополнил или снял — для совместных целей (lib/family/goal-shares).
  const member =
    typeof memberId === "string" && (state.members ?? []).some((item) => item.id === memberId)
      ? memberId
      : undefined;
  state.goalMovements = [
    {
      id: id("goalmove"),
      goalId: goal.id,
      accountId: account.id,
      amount: sides.goalDelta,
      date: storedTransactionDate(new Date()),
      ...(member ? { memberId: member } : {})
    },
    ...(state.goalMovements ?? [])
  ].slice(0, 2000);
  // Spread the goal rather than rebuilding it from five fields: the funding
  // account and the planned contribution live on it too, and listing the
  // fields by hand erased both on every top-up.
  const updated = recomputeGoal({
    ...goal,
    currentAmount: roundMoney(goal.currentAmount + sides.goalDelta)
  });
  state.goals = state.goals.map((item) => (item.id === goal.id ? updated : item));
  return updated;
}

export function goalsPage(state: LocalState): GoalsPageData {
  const members = (state.members ?? []).map(({ id: memberId, name, color }) => ({
    id: memberId,
    name,
    color
  }));
  return {
    source: "database",
    goals: state.goals.map((goal) => ({
      ...recomputeGoal(goal),
      family: goalFamily({
        goalId: goal.id,
        members,
        shares: goal.shares,
        movements: state.goalMovements ?? []
      })
    })),
    currency: state.currency
  };
}
