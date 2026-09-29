// Режим поездки.
//
// В отпуске траты разбегаются: кафе, такси, сувениры — в чужой валюте и по
// разным категориям. Поездка — это даты, бюджет и метка: пока она идёт, каждая
// новая операция получает метку поездки сама, и на экране поездки видно,
// сколько ушло из бюджета, на что и сколько можно в день до конца.

export type Trip = {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  from: string;
  to: string;
  /** Бюджет в валюте поездки; 0 — без бюджета. */
  budget: number;
  currency: string;
  /** Метка, которую получают операции поездки (без #). */
  tag: string;
};

export type TripSpend = {
  date: string;
  /** Уже в валюте приложения. */
  amount: number;
  categoryId: string;
  category: string;
  color?: string;
  tags?: string[];
};

export type TripView = Trip & {
  active: boolean;
  finished: boolean;
  /** В валюте поездки. */
  spent: number;
  left: number | null;
  days: number;
  daysLeft: number;
  /** Сколько можно в день до конца, в валюте поездки. */
  perDayLeft: number | null;
  byCategory: Array<{ categoryId: string; category: string; color?: string; amount: number }>;
  operations: number;
};

const DAY = 86_400_000;
const round = (value: number) => Math.round(value * 100) / 100;
const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / DAY;

/** Метка из названия: «Турция 2026» → «турция-2026». */
export function tripTag(name: string): string {
  const tag = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return tag || "поездка";
}

/** Поездка, идущая в этот день. Несколько — берётся начавшаяся позже. */
export function activeTrip<T extends Pick<Trip, "from" | "to">>(
  trips: readonly T[],
  day: string
): T | null {
  const today = day.slice(0, 10);
  return (
    [...trips]
      .filter((trip) => trip.from <= today && today <= trip.to)
      .sort((a, b) => b.from.localeCompare(a.from))[0] ?? null
  );
}

/**
 * Сводка поездки. `rate` — сколько валюты поездки в одной единице валюты
 * приложения (для рублёвой поездки 1).
 */
export function tripView(
  trip: Trip,
  spends: readonly TripSpend[],
  today: string,
  rate = 1
): TripView {
  const mine = spends.filter((spend) => spend.tags?.includes(trip.tag));
  const spent = round(mine.reduce((sum, spend) => sum + spend.amount, 0) * rate);
  const byCategory = new Map<string, { category: string; color?: string; amount: number }>();
  for (const spend of mine) {
    const entry = byCategory.get(spend.categoryId) ?? {
      category: spend.category,
      color: spend.color,
      amount: 0
    };
    entry.amount += spend.amount * rate;
    byCategory.set(spend.categoryId, entry);
  }
  const days = Math.max(1, Math.round(dayNumber(trip.to) - dayNumber(trip.from)) + 1);
  const day = today.slice(0, 10);
  const active = trip.from <= day && day <= trip.to;
  const daysLeft = active ? Math.round(dayNumber(trip.to) - dayNumber(day)) + 1 : 0;
  const left = trip.budget > 0 ? round(trip.budget - spent) : null;
  return {
    ...trip,
    active,
    finished: day > trip.to,
    spent,
    left,
    days,
    daysLeft,
    perDayLeft: left !== null && active ? round(Math.max(left, 0) / daysLeft) : null,
    byCategory: [...byCategory.entries()]
      .map(([categoryId, entry]) => ({ categoryId, ...entry, amount: round(entry.amount) }))
      .sort((a, b) => b.amount - a.amount),
    operations: mine.length
  };
}
