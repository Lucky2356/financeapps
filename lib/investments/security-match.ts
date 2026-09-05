// Как приложение решает, что человек ищет, набирая в поле поиска бумаг.
//
// Отдельно от провайдера намеренно: провайдер ходит в сеть, а это — чистые
// функции, у которых можно проверить каждое правило. Именно здесь жили две
// ошибки, из-за которых бумага могла не найтись вовсе (см. ниже).

/**
 * Русская раскладка поверх латинской.
 *
 * Тикеры на бирже латиницей, а человек, ищущий SBER, чаще всего сидит в русской
 * раскладке — и получает «ыиук». Раньше это давало пустую выдачу: искали как
 * набрано, а набрано было не то, что человек видел на клавишах. Здесь запрос
 * прогоняется в обе стороны, и обе версии участвуют в поиске.
 */
const RU_TO_EN: Record<string, string> = {
  й: "q",
  ц: "w",
  у: "e",
  к: "r",
  е: "t",
  н: "y",
  г: "u",
  ш: "i",
  щ: "o",
  з: "p",
  х: "[",
  ъ: "]",
  ф: "a",
  ы: "s",
  в: "d",
  а: "f",
  п: "g",
  р: "h",
  о: "j",
  л: "k",
  д: "l",
  ж: ";",
  э: "'",
  я: "z",
  ч: "x",
  с: "c",
  м: "v",
  и: "b",
  т: "n",
  ь: "m",
  б: ",",
  ю: "."
};

const EN_TO_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_TO_EN).map(([ru, en]) => [en, ru])
);

function switchLayout(value: string, table: Record<string, string>): string {
  let out = "";
  for (const char of value.toLowerCase()) out += table[char] ?? char;
  return out;
}

/**
 * Все написания запроса, которые стоит искать: как набрано и как это выглядело
 * бы в другой раскладке. Пустые и не изменившиеся варианты отбрасываются, чтобы
 * не делать одну и ту же работу дважды.
 */
export function queryVariants(query: string): string[] {
  const base = query.trim();
  if (!base) return [];
  const variants = [base, switchLayout(base, RU_TO_EN), switchLayout(base, EN_TO_RU)];
  return [...new Set(variants.map((v) => v.toUpperCase()).filter(Boolean))];
}

/** То, что нужно знать о бумаге, чтобы решить, подходит ли она под запрос. */
export type Searchable = { ticker: string; name: string };

/**
 * Насколько бумага отвечает запросу. Меньше — ближе к началу выдачи.
 *
 * Порядок тот же, что в банковских приложениях, и он не случаен: человек,
 * набравший тикер целиком, ищет ровно эту бумагу, а не всё, в чьём названии
 * встретились те же буквы. `null` — не подходит вовсе.
 */
export function relevance(security: Searchable, variants: string[]): number | null {
  const ticker = security.ticker.toUpperCase();
  const name = security.name.toUpperCase();
  let best: number | null = null;
  const better = (rank: number) => {
    if (best === null || rank < best) best = rank;
  };

  for (const q of variants) {
    if (ticker === q) better(0);
    else if (ticker.startsWith(q)) better(1);
    else if (name.startsWith(q)) better(2);
    else if (ticker.includes(q)) better(3);
    else if (name.includes(q)) better(4);
  }
  return best;
}

/**
 * Отобрать и упорядочить бумаги под запрос.
 *
 * Здесь чинятся две настоящие ошибки прежнего поиска:
 *
 * 1. **Обрезка шла до сортировки.** Прежний код набирал первые 25 совпадений и
 *    выходил из цикла, и только потом ставил точное совпадение тикера вперёд.
 *    Если 25 других бумаг совпали раньше, точного совпадения в выдаче не
 *    оказывалось вовсе: запрос «SBER» мог не показать SBER. Поэтому сначала
 *    оцениваются ВСЕ, и только упорядоченный список обрезается.
 * 2. **Бумаги без сегодняшней цены выбрасывались.** Облигация, по которой не
 *    было сделок, не находилась совсем — при том что искали её как раз чтобы
 *    добавить в портфель. Цена здесь ни на что не влияет: искать и оценивать —
 *    разные вещи.
 */
export function rankSecurities<T extends Searchable>(
  securities: Iterable<T>,
  query: string,
  limit: number
): T[] {
  const variants = queryVariants(query);
  if (variants.length === 0) return [];

  const scored: Array<{ item: T; rank: number }> = [];
  for (const item of securities) {
    const rank = relevance(item, variants);
    if (rank !== null) scored.push({ item, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.item.ticker.localeCompare(b.item.ticker));
  return scored.slice(0, limit).map((entry) => entry.item);
}
