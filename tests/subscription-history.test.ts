import { describe, expect, it } from "vitest";

import { subscriptionHistory } from "@/lib/subscriptions/history";

describe("история подписки", () => {
  it("заплачено за год по номеру платежа и по названию; последнее дороже — подорожала", () => {
    const history = subscriptionHistory(
      { id: "rec-1", description: "Яндекс Плюс" },
      [
        {
          type: "EXPENSE",
          amount: 299,
          date: "2025-08-05",
          description: "Яндекс Плюс",
          recurringId: "rec-1"
        },
        {
          type: "EXPENSE",
          amount: 299,
          date: "2026-08-05",
          description: "Яндекс Плюс",
          recurringId: "rec-1"
        },
        { type: "EXPENSE", amount: 349, date: "2026-09-05", description: "ЯНДЕКС ПЛЮС 12345" },
        { type: "EXPENSE", amount: 999, date: "2026-09-06", description: "Кино" },
        { type: "INCOME", amount: 299, date: "2026-09-07", description: "Яндекс Плюс" }
      ],
      "2026-10-03"
    );
    expect(history).toEqual({ paidYear: 648, charges: 2, increase: { from: 299, to: 349 } });
  });

  it("цена не менялась — без «подорожала»", () => {
    expect(
      subscriptionHistory(
        { id: "r", description: "Музыка" },
        [
          { type: "EXPENSE", amount: 199, date: "2026-08-01", description: null, recurringId: "r" },
          { type: "EXPENSE", amount: 199, date: "2026-09-01", description: null, recurringId: "r" }
        ],
        "2026-10-03"
      ).increase
    ).toBeNull();
  });
});
