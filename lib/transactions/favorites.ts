// Избранные траты — «Кофе 250», «Проезд 70» одним касанием.
//
// Мелкие ежедневные траты бросают записывать первыми: открыть форму,
// набрать сумму, выбрать категорию — ради 70 рублей. Здесь приложение само
// замечает, что человек повторяет одно и то же, и выносит это в кнопку.
// Повтором считается одинаковое описание, сумма и категория — три раза за два
// месяца. Закрепить можно и то, что повторялось реже; убрать — любое.
//
// СЧЁТ В ПОВТОР НЕ ВХОДИТ. Кофе с карты и кофе наличными — одна привычка, а
// не две кнопки; а записывается кнопка на тот счёт, что выбран в форме сейчас
// (accountId здесь — лишь последний использованный, на случай, если в форме
// счёта нет). Прежде счёт входил в повтор, и кнопка упрямо писала на «свой»
// счёт, даже когда в форме стоял другой.

export type FavoriteSource = {
  type: "INCOME" | "EXPENSE";
  date: string;
  amount: number;
  description: string | null;
  categoryId: string;
  categoryLabel: string;
  color?: string;
  accountId: string;
  /** Переводы и части разбивки избранным не бывают. */
  transferId?: string | null;
  splitGroupId?: string | null;
};

export type Favorite = {
  key: string;
  type: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  categoryId: string;
  categoryLabel: string;
  color?: string;
  accountId: string;
  count: number;
  pinned: boolean;
};

export type FavoritePrefs = {
  /** Закреплённые — показываются всегда, даже без повторов. */
  pinned: Array<Omit<Favorite, "count" | "pinned">>;
  /** Убранные — по ключу, чтобы не всплывали снова. */
  hidden: string[];
};

const WINDOW_DAYS = 60;
const MIN_REPEATS = 3;
export const MAX_FAVORITES = 6;

const clean = (text: string | null) => (text ?? "").trim().replace(/\s+/g, " ");

export function favoriteKey(item: {
  type: string;
  description: string | null;
  amount: number;
  categoryId: string;
}): string {
  return JSON.stringify([
    item.type,
    clean(item.description).toLowerCase(),
    Math.round(item.amount * 100),
    item.categoryId
  ]);
}

/**
 * Ключ, сохранённый до 2.3.2, нёс ещё и счёт пятым элементом. Закреплённое и
 * убранное тогда живёт по-прежнему: иначе закреплённая кнопка задвоилась бы, а
 * убранная — вернулась.
 */
export function sameKey(stored: string): string {
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) && parsed.length > 4 ? JSON.stringify(parsed.slice(0, 4)) : stored;
  } catch {
    return stored;
  }
}

export function suggestFavorites(
  rows: readonly FavoriteSource[],
  prefs: FavoritePrefs,
  today: Date = new Date()
): Favorite[] {
  const since = new Date(today.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const hidden = new Set(prefs.hidden.map(sameKey));
  const groups = new Map<string, { item: FavoriteSource; count: number; last: string }>();
  for (const row of rows) {
    if (row.transferId || row.splitGroupId) continue;
    if (row.date.slice(0, 10) < since) continue;
    const key = favoriteKey(row);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      // Запасной счёт — последний, с которого так платили.
      if (row.date >= group.last) {
        group.last = row.date;
        group.item = row;
      }
    } else {
      groups.set(key, { item: row, count: 1, last: row.date });
    }
  }

  const seen = new Set<string>();
  const pinned: Favorite[] = prefs.pinned.flatMap((item) => {
    const key = sameKey(item.key);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, key, count: groups.get(key)?.count ?? 0, pinned: true }];
  });
  const pinnedKeys = new Set(pinned.map((item) => item.key));

  const frequent = [...groups.entries()]
    .filter(
      ([key, group]) => group.count >= MIN_REPEATS && !hidden.has(key) && !pinnedKeys.has(key)
    )
    .sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))
    .map(([key, { item, count }]) => ({
      key,
      type: item.type,
      description: clean(item.description) || item.categoryLabel,
      amount: item.amount,
      categoryId: item.categoryId,
      categoryLabel: item.categoryLabel,
      color: item.color,
      accountId: item.accountId,
      count,
      pinned: false
    }));

  return [...pinned, ...frequent].slice(0, Math.max(MAX_FAVORITES, pinned.length));
}
