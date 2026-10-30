// Lightweight, transparent auto-categorization: matches a new transaction's
// description against the descriptions of past transactions by keyword overlap
// and returns the category most strongly associated with those matches.
//
// It learns purely from the user's own history (no external lists), so the
// suggestion improves as more transactions are entered. Returns null when
// there is nothing confident to suggest.

import { matchRule, type CategorizationRule } from "@/lib/categorization-rules";
import { normalizeForMatch } from "@/lib/text/normalize";

export type SuggestHistoryItem = {
  description?: string | null;
  type?: "INCOME" | "EXPENSE";
  category: { id: string };
};

function tokenize(text: string): string[] {
  // Normalize first (case, ё/е, punctuation, digits) so history matching is as
  // forgiving as the rules — then keep word-ish tokens of length >= 3.
  return normalizeForMatch(text)
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

export type SuggestOptions = { type?: "INCOME" | "EXPENSE"; rules?: CategorizationRule[] };

/** Подборщик категории по заранее разобранной истории — см. createCategorySuggester. */
export type CategorySuggester = {
  suggest(description: string, options?: SuggestOptions): string | null;
  /**
   * Добавить операцию в НАЧАЛО истории — туда, куда новая строка встаёт в
   * списке операций. Импорт так учитывает уже разнесённые строки того же файла.
   */
  prepend(item: SuggestHistoryItem): void;
};

type Posting = {
  /** Место операции в истории: меньше — раньше в списке. */
  order: number;
  type?: "INCOME" | "EXPENSE";
  categoryId: string;
  /** Сколько раз слово встречается в описании операции. */
  count: number;
};

/**
 * Разобрать историю один раз и подбирать по ней сколько угодно раз.
 *
 * suggestCategoryId разбирает на слова ВСЮ историю на каждый вызов. Для одной
 * операции это незаметно, а импорт выписки звал его на каждую строку: тысяча
 * строк при десяти тысячах операций в учёте — десять миллионов разборов, и
 * импорт шёл минутами. Здесь история разбирается однажды в указатель «слово →
 * операции», и подбор смотрит только операции со словами из описания.
 *
 * Ответ тот же, что у прежнего перебора, вплоть до ничьей: при равном счёте
 * побеждает категория, чья совпавшая операция стоит в истории раньше.
 */
export function createCategorySuggester(history: readonly SuggestHistoryItem[]): CategorySuggester {
  const index = new Map<string, Posting[]>();
  let front = 0;

  const add = (item: SuggestHistoryItem, order: number) => {
    const counts = new Map<string, number>();
    for (const token of tokenize(item.description ?? "")) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    if (counts.size === 0) return;
    const categoryId = item.category.id;
    for (const [token, count] of counts) {
      const posting: Posting = { order, type: item.type, categoryId, count };
      const list = index.get(token);
      if (list) list.push(posting);
      else index.set(token, [posting]);
    }
  };

  history.forEach((item, position) => add(item, position));

  return {
    prepend(item) {
      front -= 1;
      add(item, front);
    },
    suggest(description, options) {
      // User rules win over the history heuristic.
      if (options?.rules && options.rules.length > 0) {
        const ruled = matchRule(description, options.rules);
        if (ruled) return ruled;
      }

      const tokens = new Set(tokenize(description));
      if (tokens.size === 0) return null;

      const scores = new Map<string, { score: number; first: number }>();
      for (const token of tokens) {
        for (const posting of index.get(token) ?? []) {
          if (options?.type && posting.type && posting.type !== options.type) continue;
          const entry = scores.get(posting.categoryId);
          if (entry) {
            entry.score += posting.count;
            if (posting.order < entry.first) entry.first = posting.order;
          } else {
            scores.set(posting.categoryId, { score: posting.count, first: posting.order });
          }
        }
      }

      let best: string | null = null;
      let bestScore = 0;
      let bestFirst = Infinity;
      for (const [categoryId, { score, first }] of scores) {
        if (score > bestScore || (score === bestScore && first < bestFirst)) {
          best = categoryId;
          bestScore = score;
          bestFirst = first;
        }
      }
      return best;
    }
  };
}

export function suggestCategoryId(
  description: string,
  history: SuggestHistoryItem[],
  options?: SuggestOptions
): string | null {
  // Операции другого вида не участвуют — их и не разбираем. Порядок
  // оставшихся тот же, так что и ничьи решаются так же.
  const type = options?.type;
  const relevant = type ? history.filter((item) => !item.type || item.type === type) : history;
  return createCategorySuggester(relevant).suggest(description, options);
}
