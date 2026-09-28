// История портфеля: раз в день — сколько стоит и сколько в него вложено.
//
// График по котировкам умножает СЕГОДНЯШНЕЕ количество на прошлые цены: он
// отвечает на «как менялись мои бумаги», но не на «сколько у меня было».
// Докупки и продажи в нём не видны. Снимок — то, что было на самом деле, и
// вложенное рядом показывает, где рост цены, а где просто новые деньги.

export type PortfolioSnapshot = { date: string; value: number; invested: number };

export function recordPortfolioSnapshot(
  snapshots: readonly PortfolioSnapshot[],
  date: string,
  value: number,
  invested: number,
  maxEntries = 1000
): PortfolioSnapshot[] {
  const next = snapshots.filter((item) => item.date !== date);
  next.push({ date, value: round(value), invested: round(invested) });
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.slice(-maxEntries);
}

const round = (value: number) => Math.round(value * 100) / 100;
