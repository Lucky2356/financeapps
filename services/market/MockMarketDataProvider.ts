import { addDays, startOfDay, subDays } from "date-fns";

import type { HistoricalPrice, MarketDataService, MarketSecurity } from "./MarketDataService";

const securities: Array<Omit<MarketSecurity, "price" | "changeDay" | "change30d"> & { basePrice: number; volatility: number }> = [
  {
    ticker: "SBER",
    name: "Сбербанк",
    sector: "Финансы",
    risk: "MEDIUM",
    basePrice: 315,
    volatility: 2.2,
    comment: "Крупная ликвидная бумага, чувствительна к ставкам и качеству кредитного портфеля."
  },
  {
    ticker: "GAZP",
    name: "Газпром",
    sector: "Энергетика",
    risk: "HIGH",
    basePrice: 138,
    volatility: 3.6,
    comment: "Высокая зависимость от экспортной конъюнктуры, налоговой нагрузки и капитальных затрат."
  },
  {
    ticker: "LKOH",
    name: "Лукойл",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 7420,
    volatility: 2.4,
    comment: "Нефтегазовый сектор, чувствителен к ценам на сырье и валютному курсу."
  },
  {
    ticker: "YDEX",
    name: "Яндекс",
    sector: "Технологии",
    risk: "HIGH",
    basePrice: 4060,
    volatility: 4.2,
    comment: "Технологическая компания с повышенной волатильностью и регуляторными факторами."
  },
  {
    ticker: "T",
    name: "Т-Технологии",
    sector: "Финтех",
    risk: "HIGH",
    basePrice: 3160,
    volatility: 4.6,
    comment: "Финтех-эмитент с быстрым ростом и заметной чувствительностью к ожиданиям рынка."
  },
  {
    ticker: "VTBR",
    name: "ВТБ",
    sector: "Финансы",
    risk: "HIGH",
    basePrice: 0.021,
    volatility: 5.4,
    comment: "Банковская бумага с высокой волатильностью и зависимостью от макрофакторов."
  },
  {
    ticker: "MGNT",
    name: "Магнит",
    sector: "Ритейл",
    risk: "MEDIUM",
    basePrice: 5980,
    volatility: 2.5,
    comment: "Защитный сектор, но маржинальность зависит от потребительского спроса и логистики."
  },
  {
    ticker: "NVTK",
    name: "Новатэк",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 1125,
    volatility: 2.9,
    comment: "Газовый сектор, важны санкционные ограничения и инвестиционные проекты."
  },
  {
    ticker: "ROSN",
    name: "Роснефть",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 575,
    volatility: 2.8,
    comment: "Зависимость от нефтяных цен, налоговой политики и курса рубля."
  },
  {
    ticker: "MOEX",
    name: "Московская биржа",
    sector: "Финансовая инфраструктура",
    risk: "LOW",
    basePrice: 228,
    volatility: 1.8,
    comment: "Инфраструктурная компания, динамика зависит от оборотов торгов и ставок."
  }
];

function priceForSecurity(basePrice: number, volatility: number, dayIndex: number, securityIndex: number) {
  const wave =
    Math.sin((dayIndex + securityIndex) * 0.42) * volatility +
    Math.cos(dayIndex * 0.19 + securityIndex) * (volatility / 2);
  const trend = dayIndex * 0.04;
  return Number((basePrice * (1 + (trend + wave) / 100)).toFixed(4));
}

export class MockMarketDataProvider implements MarketDataService {
  async getSecurities(): Promise<MarketSecurity[]> {
    // Drift the "latest" day forward through the current day so each manual
    // refresh shows slightly different prices instead of frozen values.
    const minutesIntoDay = (Date.now() % 86_400_000) / 60_000; // 0..1440
    const drift = minutesIntoDay / 1440; // 0..1 across the day
    const latestDay = 44 + drift;

    return securities.map((security, securityIndex) => {
      const latest = priceForSecurity(security.basePrice, security.volatility, latestDay, securityIndex);
      const previous = priceForSecurity(security.basePrice, security.volatility, latestDay - 1, securityIndex);
      const thirtyAgo = priceForSecurity(security.basePrice, security.volatility, latestDay - 30, securityIndex);

      return {
        ticker: security.ticker,
        name: security.name,
        sector: security.sector,
        risk: security.risk,
        comment: security.comment,
        price: latest,
        changeDay: Number((((latest - previous) / previous) * 100).toFixed(2)),
        change30d: Number((((latest - thirtyAgo) / thirtyAgo) * 100).toFixed(2))
      };
    });
  }

  async getSecurityByTicker(ticker: string): Promise<MarketSecurity | null> {
    const normalizedTicker = ticker.toUpperCase();
    const all = await this.getSecurities();
    return all.find((security) => security.ticker === normalizedTicker) ?? null;
  }

  async getHistoricalPrices(ticker: string, from: Date, to: Date): Promise<HistoricalPrice[]> {
    const securityIndex = securities.findIndex((security) => security.ticker === ticker.toUpperCase());
    if (securityIndex === -1) return [];

    const security = securities[securityIndex];
    const fromDay = startOfDay(from);
    const toDay = startOfDay(to);
    const dates: HistoricalPrice[] = [];
    let cursor = fromDay;
    let index = 0;

    while (cursor <= toDay) {
      dates.push({
        ticker: security.ticker,
        date: cursor,
        price: priceForSecurity(security.basePrice, security.volatility, index, securityIndex)
      });
      cursor = addDays(cursor, 1);
      index += 1;
    }

    return dates;
  }

  async updateMarketPrices(): Promise<void> {
    await this.getHistoricalPrices("SBER", subDays(new Date(), 1), new Date());
  }
}
