import type { InvestmentData } from "@/types/finance";

/**
 * Бумаги, которые у человека уже есть, — портфель и список наблюдения.
 *
 * Ими открывается поиск, пока не набрано ни буквы: чаще всего ищут то, что уже
 * держат, и заставлять набирать тикер целиком ради этого незачем.
 */
export function ownedSecurities(data: InvestmentData): Array<{ ticker: string; name: string }> {
  // Одна бумага может быть и в портфеле, и в списке наблюдения — в подсказках
  // она нужна один раз. Обычным циклом, а не отбором с побочным действием
  // внутри: `filter`, который заодно пополняет множество, читается как загадка.
  const byTicker = new Map<string, { ticker: string; name: string }>();
  for (const row of [...data.portfolio, ...data.watchlist]) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, { ticker: row.ticker, name: row.name });
  }
  return [...byTicker.values()];
}
