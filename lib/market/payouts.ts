// Выплаты по бумагам с Мосбиржи: дивиденды акций и купоны облигаций.
//
// Биржа отвечает таблицами «columns + data». Столбцы ищутся по имени, а не по
// месту: порядок у биржи меняется, имена — нет. Всё, что не разобралось,
// просто пропускается — лучше не показать выплату, чем показать чужую сумму.

export type Payout = {
  ticker: string;
  kind: "DIVIDEND" | "COUPON";
  /** День, на который нужно держать бумагу (дивиденд) или день выплаты (купон). */
  date: string;
  /** На одну бумагу, в валюте выплаты. */
  perShare: number;
  currency: string;
};

type Table = { columns?: string[]; data?: (string | number | null)[][] };

function column(table: Table, ...names: string[]): number {
  const columns = (table.columns ?? []).map((name) => name.toLowerCase());
  for (const name of names) {
    const at = columns.indexOf(name.toLowerCase());
    if (at !== -1) return at;
  }
  return -1;
}

const day = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/** /iss/securities/{secid}/dividends.json → дивиденды. */
export function parseDividends(ticker: string, json: { dividends?: Table }): Payout[] {
  const table = json.dividends ?? {};
  const date = column(table, "registryclosedate");
  const value = column(table, "value");
  const currency = column(table, "currencyid");
  if (date === -1 || value === -1) return [];
  return (table.data ?? []).flatMap((row) => {
    const when = day(row[date]);
    const amount = Number(row[value]);
    if (!when || !(amount > 0)) return [];
    return [
      {
        ticker,
        kind: "DIVIDEND" as const,
        date: when,
        perShare: amount,
        currency: String((currency !== -1 && row[currency]) || "RUB").replace("SUR", "RUB")
      }
    ];
  });
}

/** /iss/securities/{secid}/bondization.json → купоны. */
export function parseCoupons(ticker: string, json: { coupons?: Table }): Payout[] {
  const table = json.coupons ?? {};
  const date = column(table, "coupondate");
  // value_rub — уже в рублях; value — в валюте номинала.
  const rub = column(table, "value_rub");
  const value = column(table, "value");
  if (date === -1 || (rub === -1 && value === -1)) return [];
  return (table.data ?? []).flatMap((row) => {
    const when = day(row[date]);
    const amount = Number(rub !== -1 ? row[rub] : row[value]);
    if (!when || !(amount > 0)) return [];
    return [{ ticker, kind: "COUPON" as const, date: when, perShare: amount, currency: "RUB" }];
  });
}
