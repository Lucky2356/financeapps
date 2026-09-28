// Кэшбэк: какой картой платить, сколько пришло и сколько упущено.
//
// Банки каждый месяц дают выбрать категории повышенного кэшбэка, и через
// неделю уже никто не помнит, у какой карты что. Здесь человек записывает
// условия месяца — карта, категория, процент, лимит в рублях, — а приложение
// подсказывает при записи траты, какой картой выгоднее, и считает итог:
// сколько кэшбэка пришло и сколько потеряно, когда платили не той картой.
//
// Категория «*» — «на всё остальное» (базовый процент карты).

export const ANY_CATEGORY = "*";

export type CashbackRule = {
  id: string;
  accountId: string;
  /** YYYY-MM */
  month: string;
  categoryId: string;
  percent: number;
  /** Сколько кэшбэка максимум в месяц по этому правилу, ₽. Нет — без предела. */
  limit?: number;
};

export type CashbackSpend = {
  id: string;
  date: string;
  amount: number;
  accountId: string;
  categoryId: string;
  category: string;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Процент карты для категории в месяце: своё правило, иначе базовый «*». */
export function rateFor(
  rules: readonly CashbackRule[],
  accountId: string,
  categoryId: string,
  month: string
): CashbackRule | null {
  const mine = rules.filter((rule) => rule.month === month && rule.accountId === accountId);
  return (
    mine.find((rule) => rule.categoryId === categoryId) ??
    mine.find((rule) => rule.categoryId === ANY_CATEGORY) ??
    null
  );
}

/** Лучшая карта для категории в месяце. null — условий никто не записал. */
export function bestCard(
  rules: readonly CashbackRule[],
  categoryId: string,
  month: string
): { accountId: string; percent: number } | null {
  const accounts = [
    ...new Set(rules.filter((rule) => rule.month === month).map((r) => r.accountId))
  ];
  let best: { accountId: string; percent: number } | null = null;
  for (const accountId of accounts) {
    const rule = rateFor(rules, accountId, categoryId, month);
    if (rule && rule.percent > (best?.percent ?? 0)) best = { accountId, percent: rule.percent };
  }
  return best;
}

export type CashbackSummary = {
  earned: number;
  missed: number;
  byAccount: Array<{ accountId: string; earned: number }>;
  /** Где упущено больше всего — «платили бы картой X». */
  missedTop: Array<{ categoryId: string; category: string; amount: number; bestAccountId: string }>;
};

/**
 * Итог месяца. Лимит правила съедается по порядку трат — как у банка: сверх
 * лимита кэшбэк не начисляется. Упущенное — разница с лучшей картой по той же
 * категории, тоже с учётом лимита лучшей карты.
 */
export function monthCashback(
  rules: readonly CashbackRule[],
  spends: readonly CashbackSpend[],
  month: string
): CashbackSummary {
  const used = new Map<string, number>();
  const take = (rule: CashbackRule, amount: number, dry = false) => {
    const raw = (amount * rule.percent) / 100;
    const left =
      rule.limit !== undefined ? Math.max(rule.limit - (used.get(rule.id) ?? 0), 0) : raw;
    const got = Math.min(raw, left);
    if (!dry) used.set(rule.id, (used.get(rule.id) ?? 0) + got);
    return got;
  };

  const earnedBy = new Map<string, number>();
  const missedBy = new Map<string, { category: string; amount: number; bestAccountId: string }>();
  let earned = 0;
  let missed = 0;
  const inMonth = spends
    .filter((spend) => spend.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const spend of inMonth) {
    const rule = rateFor(rules, spend.accountId, spend.categoryId, month);
    const got = rule ? take(rule, spend.amount) : 0;
    earned += got;
    earnedBy.set(spend.accountId, (earnedBy.get(spend.accountId) ?? 0) + got);

    const best = bestCard(rules, spend.categoryId, month);
    if (best && best.accountId !== spend.accountId) {
      const bestRule = rateFor(rules, best.accountId, spend.categoryId, month);
      const could = bestRule ? take(bestRule, spend.amount, true) : 0;
      const lost = could - got;
      if (lost > 0.005) {
        missed += lost;
        const entry = missedBy.get(spend.categoryId) ?? {
          category: spend.category,
          amount: 0,
          bestAccountId: best.accountId
        };
        entry.amount += lost;
        missedBy.set(spend.categoryId, entry);
      }
    }
  }

  return {
    earned: round(earned),
    missed: round(missed),
    byAccount: [...earnedBy.entries()]
      .map(([accountId, value]) => ({ accountId, earned: round(value) }))
      .filter((row) => row.earned > 0)
      .sort((a, b) => b.earned - a.earned),
    missedTop: [...missedBy.entries()]
      .map(([categoryId, entry]) => ({ categoryId, ...entry, amount: round(entry.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  };
}

/** Правила прошлого месяца — в этот, с новыми id. Уже заведённое не трогается. */
export function copyRules(
  rules: readonly CashbackRule[],
  from: string,
  to: string,
  makeId: () => string
): CashbackRule[] {
  const taken = new Set(
    rules.filter((rule) => rule.month === to).map((rule) => `${rule.accountId}|${rule.categoryId}`)
  );
  return rules
    .filter((rule) => rule.month === from && !taken.has(`${rule.accountId}|${rule.categoryId}`))
    .map((rule) => ({ ...rule, id: makeId(), month: to }));
}
