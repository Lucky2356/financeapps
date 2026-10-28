import { describe, expect, it } from "vitest";

import { buildNotifications } from "@/lib/notifications";
import { detectSubscriptions } from "@/lib/subscriptions/detect";

// Мелкие ошибки из повторного разбора перед 2.8.0.

describe("найденная подписка помнит свой счёт", () => {
  it("шаблон ставится на счёт последнего платежа, а не на первый в списке", () => {
    const rows = ["2026-07-05", "2026-08-05", "2026-09-05"].map((date, index) => ({
      id: `t${index}`,
      amount: 9.99,
      type: "EXPENSE",
      date,
      description: "Spotify",
      account: { id: index < 2 ? "cash" : "usd-card" }
    }));
    expect(detectSubscriptions(rows)[0].accountId).toBe("usd-card");
  });
});

describe("уведомление о платеже", () => {
  it("сегодняшний платёж — «сегодня» и к востоку от Гринвича (UTC+12)", () => {
    const zone = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expectToday();
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

function expectToday() {
  {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const items = buildNotifications({
      upcomingEvents: [
        {
          id: "e1",
          date: day,
          title: "Аренда",
          amount: 1000,
          type: "EXPENSE",
          category: "ЖКХ",
          account: "Карта"
        }
      ],
      currency: "RUB",
      locale: "ru"
    });
    expect(items.find((item) => item.id === "due-e1")?.title).toMatch(/сегодня/i);
  }
}
