import { describe, expect, it } from "vitest";

import { detectPayday, forecastToPayday, nextPayday } from "@/lib/analytics/payday";

describe("хватит ли до зарплаты", () => {
  it("день зарплаты — по самому крупному поступлению каждого месяца, «зарплатные» статьи важнее", () => {
    expect(
      detectPayday([
        { date: "2026-07-10", amount: 90000, category: "Зарплата" },
        { date: "2026-07-25", amount: 40000, category: "Зарплата" },
        { date: "2026-08-11", amount: 90000, category: "Зарплата" },
        { date: "2026-08-03", amount: 150000, category: "Продажа машины" },
        { date: "2026-09-10", amount: 90000, category: "Зарплата" }
      ])
    ).toBe(10);
    expect(detectPayday([{ date: "2026-09-10", amount: 90000, category: "Зарплата" }])).toBeNull();
  });

  it("ближайшая зарплата: в этом месяце, если ещё впереди, иначе в следующем; 31-е в феврале — последний день", () => {
    expect(nextPayday("2026-10-03", 10)).toBe("2026-10-10");
    expect(nextPayday("2026-10-10", 10)).toBe("2026-11-10");
    expect(nextPayday("2026-12-20", 5)).toBe("2027-01-05");
    expect(nextPayday("2027-02-01", 31)).toBe("2027-02-28");
  });

  it("свободно = на картах − платежи до зарплаты; не хватает — «short», меньше обычного — «tight»", () => {
    const base = {
      today: "2026-10-01",
      payday: 10,
      source: "history" as const,
      payments: [
        { date: "2026-10-05", amount: 6000, title: "Интернет" },
        { date: "2026-10-10", amount: 30000, title: "Аренда" },
        { date: "2026-11-01", amount: 999, title: "Позже" }
      ]
    };
    const ok = forecastToPayday({ ...base, liquid: 24000, usualPerDay: 1000 });
    expect(ok).toMatchObject({
      daysLeft: 9,
      upcoming: 6000,
      free: 18000,
      perDay: 2000,
      status: "ok"
    });
    expect(ok.payments.map((item) => item.title)).toEqual(["Интернет"]);
    expect(forecastToPayday({ ...base, liquid: 10000, usualPerDay: 1000 }).status).toBe("tight");
    expect(forecastToPayday({ ...base, liquid: 5000, usualPerDay: 1000 })).toMatchObject({
      status: "short",
      free: -1000
    });
  });
});
