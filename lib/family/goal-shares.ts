// Совместная цель семьи: кто сколько внёс и кто отстаёт от своей доли.
//
// Цель общая — «Отпуск 200 000». Каждое пополнение помнит, кто его сделал
// (goalMovements[].memberId). Доли — как договорились: поровну или свои
// проценты (goals[].shares). Отстающий — тот, кто внёс меньше своей доли от
// того, что вся семья уже внесла: если вместе отложили 100 000 поровну на
// двоих, а Маша внесла 30 000, она отстаёт на 20 000.
//
// Чистая функция: экран и проверки зовут одно и то же.

import type { Member } from "@/lib/family/family";

export type GoalMovementRow = { goalId: string; amount: number; memberId?: string };

export type GoalFamily = {
  members: Array<{
    id: string;
    name: string;
    color: string;
    /** Внесено за вычетом снятого. */
    contributed: number;
    /** Доля, %. */
    share: number;
    /** Сколько недовнесено до своей доли; 0 — не отстаёт. */
    behind: number;
  }>;
  /** Пополнения без отметки, кто внёс (сделанные до v19 или вне семьи). */
  unassigned: number;
  /** Доли заданы вручную, а не поровну. */
  custom: boolean;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Доли в процентах: свои — нормированные к 100, иначе поровну. */
export function goalShares(
  members: readonly Member[],
  shares: Record<string, number> | undefined
): { shares: Map<string, number>; custom: boolean } {
  const given = members.map((member) => Math.max(0, shares?.[member.id] ?? 0));
  const sum = given.reduce((total, value) => total + value, 0);
  if (!shares || sum <= 0) {
    const equal = members.length > 0 ? 100 / members.length : 0;
    return { shares: new Map(members.map((member) => [member.id, equal])), custom: false };
  }
  return {
    shares: new Map(members.map((member, index) => [member.id, (given[index] / sum) * 100])),
    custom: true
  };
}

export function goalFamily(input: {
  goalId: string;
  members: readonly Member[];
  shares: Record<string, number> | undefined;
  movements: readonly GoalMovementRow[];
}): GoalFamily | null {
  if (input.members.length < 2) return null;
  const known = new Set(input.members.map((member) => member.id));
  const contributed = new Map<string, number>();
  let unassigned = 0;
  for (const movement of input.movements) {
    if (movement.goalId !== input.goalId) continue;
    if (movement.memberId && known.has(movement.memberId))
      contributed.set(
        movement.memberId,
        (contributed.get(movement.memberId) ?? 0) + movement.amount
      );
    else unassigned += movement.amount;
  }
  const { shares, custom } = goalShares(input.members, input.shares);
  const together = [...contributed.values()].reduce((total, value) => total + value, 0);
  return {
    members: input.members.map((member) => {
      const mine = contributed.get(member.id) ?? 0;
      const share = shares.get(member.id) ?? 0;
      return {
        id: member.id,
        name: member.name,
        color: member.color,
        contributed: round(mine),
        share: Math.round(share * 10) / 10,
        behind: round(Math.max(0, (together * share) / 100 - mine))
      };
    }),
    unassigned: round(unassigned),
    custom
  };
}
