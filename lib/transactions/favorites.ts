// Избранные траты — «Кофе 250», «Проезд 70» одним касанием.
//
// Мелкие ежедневные траты бросают записывать первыми: открыть форму,
// набрать сумму, выбрать категорию — ради 70 рублей. Здесь приложение само
// замечает, что человек повторяет одно и то же, и выносит это в кнопку.
// Повтором считается одинаковое описание, сумма, категория и счёт — три раза
// за два месяца. Закрепить можно и то, что повторялось реже; убрать — любое.

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
  accountId: string;
}): string {
  return JSON.stringify([
    item.type,
    clean(item.description).toLowerCase(),
    Math.round(item.amount * 100),
    item.categoryId,
    item.accountId
  ]);
}

export function suggestFavorites(
  rows: readonly FavoriteSource[],
  prefs: FavoritePrefs,
  today: Date = new Date()
): Favorite[] {
  const since = new Date(today.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const hidden = new Set(prefs.hidden);
  const groups = new Map<string, { item: FavoriteSource; count: number; last: string }>();
  for (const row of rows) {
    if (row.transferId || row.splitGroupId) continue;
    if (row.date.slice(0, 10) < since) continue;
    const key = favoriteKey(row);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (row.date > group.last) group.last = row.date;
    } else {
      groups.set(key, { item: row, count: 1, last: row.date });
    }
  }

  const pinned: Favorite[] = prefs.pinned.map((item) => ({
    ...item,
    count: groups.get(item.key)?.count ?? 0,
    pinned: true
  }));
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
