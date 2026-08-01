// Purchase lots of a single security ("докупки") and the average buy price they
// add up to.
//
// A position is normally built over several purchases at different prices, and
// working out the weighted average by hand is exactly the arithmetic the app
// should be doing. Keeping the lots lets the average be RECOMPUTED whenever a
// purchase is added, edited or removed — a stored average alone can never be
// corrected after the fact.
//
// The stored position keeps `quantity`/`averageBuyPrice` as the derived truth,
// so every other calculation (P&L, tax, rebalancing) is untouched by this file.

export type PurchaseLot = {
  /** Trade date, YYYY-MM-DD. Kept for the user's own bookkeeping. */
  date: string;
  quantity: number;
  /** Price per share paid in this purchase. */
  price: number;
};

export type LotSummary = {
  quantity: number;
  averageBuyPrice: number;
  /** Everything paid for the position: Σ quantity × price. */
  totalCost: number;
};

const EMPTY: LotSummary = { quantity: 0, averageBuyPrice: 0, totalCost: 0 };

// A lot only counts when both numbers are real and positive — a half-filled row
// in the form must not drag the average down to zero.
export function isUsableLot(lot: Partial<PurchaseLot> | null | undefined): boolean {
  if (!lot) return false;
  const { quantity, price } = lot;
  return (
    typeof quantity === "number" &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  );
}

// Weighted average across all purchases: Σ(qᵢ × pᵢ) / Σqᵢ. The price keeps four
// decimals (MOEX quotes bonds and cheap shares in fractions of a rouble); the
// total cost is rounded to kopecks like every other money figure in the app.
export function summarizeLots(lots: readonly Partial<PurchaseLot>[]): LotSummary {
  const usable = lots.filter(isUsableLot) as PurchaseLot[];
  if (usable.length === 0) return EMPTY;

  const quantity = usable.reduce((sum, lot) => sum + lot.quantity, 0);
  const cost = usable.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
  if (quantity <= 0) return EMPTY;

  return {
    quantity: Number(quantity.toFixed(6)),
    averageBuyPrice: Number((cost / quantity).toFixed(4)),
    totalCost: Math.round((cost + Number.EPSILON) * 100) / 100
  };
}

// Reads the lots a form sends as a JSON string. Anything unparseable or
// half-filled is dropped rather than rejected: the caller falls back to the
// manually typed average, so a broken field can never lose the position.
export function parsePurchaseLots(raw: unknown): PurchaseLot[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const { date, quantity, price } = item as Record<string, unknown>;
      const lot = {
        date: typeof date === "string" && date.trim() !== "" ? date : "",
        quantity: Number(quantity),
        price: Number(price)
      };
      return lot.date !== "" && isUsableLot(lot) ? lot : null;
    })
    .filter((lot): lot is PurchaseLot => lot !== null);
}

// Sorted oldest-first, which is how a broker statement reads and the order the
// FIFO tax report would need.
export function sortLots<T extends { date: string }>(lots: readonly T[]): T[] {
  return [...lots].sort((left, right) => left.date.localeCompare(right.date));
}
