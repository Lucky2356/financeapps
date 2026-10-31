// Чтение `/investments`: страница портфеля по свежим котировкам — и попутно
// запись того, что узнали (последние цены, снимок дня). Биржа спрашивается до
// очереди записей, страница считается и сохраняется уже в ней.
// Вынесено из LocalApiClient; зовётся через StoreContext.

import { buildInvestmentsPage, investmentMarketFor } from "@/lib/api/local/investments";
import type { LocalState } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { recordPortfolioSnapshot } from "@/lib/investments/snapshots";
import { isoDay } from "@/lib/net-worth-snapshots";

export async function refreshInvestments(ctx: StoreContext, state: LocalState) {
  // Биржа — по сети, до очереди: котировки идут секундами.
  const market = await investmentMarketFor(state);
  // Persist last-known prices so they survive app restart.
  //
  // Страница считается уже в очереди — по документу, прочитанному там же, и
  // на него ложатся только цены с биржи. Прежде в документ писались строки,
  // посчитанные по документу ДО ожидания биржи, и продажа, записанная за
  // эти секунды, отменялась: проданные бумаги возвращались в портфель.
  return ctx.serialize(async () => {
    const fresh = await ctx.state();
    const invData = buildInvestmentsPage(fresh, market);
    // В книгу — имена на языке биржи, а не экрана (см. storedName): иначе
    // русское и английское устройства переписывали бы их друг у друга.
    const forBook = <Row extends { ticker: string; name: string }>(row: Row): Row => {
      const { storedName, ...rest } = row as Row & { storedName?: string };
      const neutral = storedName ?? market.byTicker.get(row.ticker)?.storedName;
      return neutral ? ({ ...rest, name: neutral } as Row) : (rest as Row);
    };
    fresh.investments = {
      ...fresh.investments,
      securities: invData.securities.map(forBook),
      watchlist: invData.watchlist.map(forBook),
      portfolio: invData.portfolio.map(forBook),
      structure: invData.structure,
      sectorStructure: invData.sectorStructure,
      assetStructure: invData.assetStructure
    };
    // Снимок дня: портфель пуст — снимать нечего (иначе история
    // начиналась бы с нулей до первой покупки). Биржа не дала ни одной
    // цены бумагам портфеля — тоже: снимок из одних сохранённых цен ничего
    // не говорит о сегодняшнем дне.
    const pricedLive = invData.portfolio.some(
      (row) => (market.byTicker.get(row.ticker)?.price ?? 0) > 0
    );
    if (pricedLive) {
      fresh.portfolioSnapshots = recordPortfolioSnapshot(
        fresh.portfolioSnapshots ?? [],
        isoDay(new Date()),
        invData.portfolio.reduce((sum, row) => sum + row.currentValue, 0),
        invData.portfolio.reduce((sum, row) => sum + row.quantity * row.averageBuyPrice, 0)
      );
      invData.history = fresh.portfolioSnapshots;
    }
    await ctx.save(fresh);
    return invData;
  });
}
