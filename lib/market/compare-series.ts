// Сравнение с индексом: две кривые, приведённые к «% от начала периода».
//
// Сравнивать рубли портфеля с пунктами индекса бессмысленно — разные шкалы.
// Проценты от первого общего дня отвечают на вопрос, который и задают:
// «мои бумаги за это время выросли больше или меньше, чем рынок».

export type Point = { date: string; price: number };

const day = (iso: string) => iso.slice(0, 10);

/**
 * Соединить по дням и привести к процентам от первого дня, где есть обе
 * кривые. Дни, где одной из кривых нет (выходные у индекса, пропуски),
 * берут последнее известное значение.
 */
export function compareToIndex(
  mine: readonly Point[],
  index: readonly Point[]
): Array<{ date: string; a: number | null; b: number | null }> {
  const a = new Map(mine.map((p) => [day(p.date), p.price]));
  const b = new Map(index.map((p) => [day(p.date), p.price]));
  const days = [...new Set([...a.keys(), ...b.keys()])].sort();
  const start = days.find((d) => (a.get(d) ?? 0) > 0 && (b.get(d) ?? 0) > 0);
  if (!start) return [];
  const baseA = a.get(start)!;
  const baseB = b.get(start)!;
  let lastA = baseA;
  let lastB = baseB;
  const pct = (value: number, base: number) => Math.round((value / base - 1) * 10_000) / 100;
  return days
    .filter((d) => d >= start)
    .map((d) => {
      lastA = a.get(d) ?? lastA;
      lastB = b.get(d) ?? lastB;
      return { date: d, a: pct(lastA, baseA), b: pct(lastB, baseB) };
    });
}
