import { describe, expect, it } from "vitest";

import { findLeaks, unusualFor, type WatchRow } from "@/lib/analytics/watchdog";
import { buildWeekRecap, mondayOf } from "@/lib/analytics/week-recap";
import { favoriteKey, suggestFavorites, type FavoriteSource } from "@/lib/transactions/favorites";

const coffee = (date: string, amount = 250): FavoriteSource => ({
  type: "EXPENSE",
  date,
  amount,
  description: "Кофе",
  categoryId: "cafe",
  categoryLabel: "Кафе",
  accountId: "card"
});

describe("избранные траты", () => {
  const today = new Date(2026, 8, 28);

  it("повторённое трижды за два месяца — в избранное", () => {
    const rows = [coffee("2026-09-01"), coffee("2026-09-10"), coffee("2026-09-20")];
    const favorites = suggestFavorites(rows, { pinned: [], hidden: [] }, today);
    expect(favorites).toHaveLength(1);
    expect(favorites[0]).toMatchObject({ description: "Кофе", amount: 250, count: 3 });
  });

  it("один и тот же кофе с разных счетов — одна кнопка, счёт — последний", () => {
    const rows = [
      coffee("2026-09-01"),
      { ...coffee("2026-09-10"), accountId: "cash" },
      coffee("2026-09-20"),
      { ...coffee("2026-09-25"), accountId: "cash" }
    ];
    const favorites = suggestFavorites(rows, { pinned: [], hidden: [] }, today);
    expect(favorites).toHaveLength(1);
    expect(favorites[0]).toMatchObject({ count: 4, accountId: "cash" });
  });

  it("закреплённое и убранное по старому ключу (со счётом) — работает", () => {
    const rows = [coffee("2026-09-01"), coffee("2026-09-10"), coffee("2026-09-20")];
    const legacy = JSON.stringify(["EXPENSE", "кофе", 25000, "cafe", "card"]);
    expect(suggestFavorites(rows, { pinned: [], hidden: [legacy] }, today)).toEqual([]);
    const pinned = suggestFavorites(
      rows,
      {
        pinned: [
          {
            key: legacy,
            type: "EXPENSE",
            description: "Кофе",
            amount: 250,
            categoryId: "cafe",
            categoryLabel: "Кафе",
            accountId: "card"
          }
        ],
        hidden: []
      },
      today
    );
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatchObject({ pinned: true, count: 3 });
  });

  it("дважды — ещё не привычка; старше двух месяцев — уже нет", () => {
    expect(
      suggestFavorites(
        [coffee("2026-09-01"), coffee("2026-09-10")],
        { pinned: [], hidden: [] },
        today
      )
    ).toEqual([]);
    expect(
      suggestFavorites(
        [coffee("2026-06-01"), coffee("2026-06-10"), coffee("2026-06-20")],
        { pinned: [], hidden: [] },
        today
      )
    ).toEqual([]);
  });

  it("убранное не всплывает, закреплённое — всегда первым", () => {
    const rows = [coffee("2026-09-01"), coffee("2026-09-10"), coffee("2026-09-20")];
    const key = favoriteKey(rows[0]);
    expect(suggestFavorites(rows, { pinned: [], hidden: [key] }, today)).toEqual([]);
    const taxi = { ...coffee("2026-09-01", 700), description: "Такси", categoryId: "taxi" };
    const pinned = suggestFavorites(
      rows,
      {
        pinned: [
          {
            key: favoriteKey(taxi),
            type: "EXPENSE",
            description: "Такси",
            amount: 700,
            categoryId: "taxi",
            categoryLabel: "Такси",
            accountId: "card"
          }
        ],
        hidden: []
      },
      today
    );
    expect(pinned.map((item) => item.description)).toEqual(["Такси", "Кофе"]);
  });
});

describe("недельная сводка", () => {
  const row = (date: string, amount: number, categoryId = "food", category = "Продукты") => ({
    type: "EXPENSE" as const,
    date,
    amount,
    categoryId,
    category
  });

  it("неделя — с понедельника", () => {
    expect(mondayOf(new Date(2026, 8, 28)).getDate()).toBe(28); // понедельник
    expect(mondayOf(new Date(2026, 9, 4)).getDate()).toBe(28); // воскресенье
  });

  it("прошлая неделя против обычной и что выросло", () => {
    const recap = buildWeekRecap({
      today: new Date(2026, 8, 28),
      perDay: 1000,
      rows: [
        // прошлая неделя 21–27 сентября
        row("2026-09-22", 3000),
        row("2026-09-25", 4000, "cafe", "Кафе"),
        // четыре недели до неё — по 2000 на продукты и 500 на кафе
        ...["2026-09-15", "2026-09-08", "2026-09-01", "2026-08-25"].flatMap((date) => [
          row(date, 2000),
          row(date, 500, "cafe", "Кафе")
        ])
      ]
    });
    expect(recap.weekStart).toBe("2026-09-21");
    expect(recap.spent).toBe(7000);
    expect(recap.usual).toBe(2500);
    expect(recap.change).toBe(180);
    expect(recap.grew).toMatchObject({ category: "Кафе", amount: 4000, usual: 500 });
    expect(recap.allowance).toBe(7000);
  });
});

describe("сторож лишних трат", () => {
  const base: Omit<WatchRow, "id" | "date" | "amount"> = {
    type: "EXPENSE",
    description: "Пятёрочка",
    categoryId: "food",
    category: "Продукты",
    accountId: "card"
  };
  const at = (
    id: string,
    date: string,
    amount: number,
    extra: Partial<WatchRow> = {}
  ): WatchRow => ({
    ...base,
    id,
    date,
    amount,
    ...extra
  });

  it("двойное списание: та же сумма и место за двое суток", () => {
    const findings = findLeaks({
      today: "2026-09-28",
      rows: [at("a", "2026-09-26", 1250), at("b", "2026-09-27", 1250), at("c", "2026-09-27", 800)]
    });
    expect(findings).toEqual([
      expect.objectContaining({ kind: "duplicate", amount: 1250, transactionIds: ["a", "b"] })
    ]);
  });

  it("два кофе за утро — не двойное списание", () => {
    expect(
      findLeaks({
        today: "2026-09-28",
        rows: [at("a", "2026-09-27", 250), at("b", "2026-09-27", 250)]
      })
    ).toEqual([]);
  });

  it("подписка подорожала", () => {
    const sub = {
      description: "Яндекс Плюс",
      categoryId: "subs",
      category: "Подписки",
      recurringId: "r1"
    };
    const findings = findLeaks({
      today: "2026-09-28",
      rows: [at("a", "2026-08-10", 299, sub), at("b", "2026-09-10", 399, sub)]
    });
    expect(findings).toEqual([expect.objectContaining({ kind: "priceUp", before: 299, now: 399 })]);
  });

  it("две разные подписки без описания — не «подорожала»", () => {
    const sub = {
      description: null,
      categoryId: "subs",
      category: "Подписки",
      isSubscription: true
    };
    expect(
      findLeaks({
        today: "2026-09-28",
        rows: [at("a", "2026-09-05", 299, sub), at("b", "2026-09-10", 399, sub)]
      })
    ).toEqual([]);
  });

  it("пробный период кончается через два дня", () => {
    const findings = findLeaks({
      today: "2026-09-28",
      rows: [],
      trials: [{ id: "t", name: "Кинопоиск", trialEndsOn: "2026-09-30", amount: 299 }]
    });
    expect(findings).toEqual([expect.objectContaining({ kind: "trial", ends: "2026-09-30" })]);
  });

  it("трата втрое больше обычной; скрытая находка не возвращается", () => {
    const usual = ["2026-07-01", "2026-07-10", "2026-08-01", "2026-08-10", "2026-09-01"].map(
      (date, i) => at(`u${i}`, date, 1500)
    );
    const rows = [...usual, at("big", "2026-09-27", 9000)];
    const findings = findLeaks({ today: "2026-09-28", rows });
    expect(findings).toEqual([
      expect.objectContaining({ kind: "unusual", amount: 9000, usual: 1500 })
    ]);
    expect(findLeaks({ today: "2026-09-28", rows, dismissed: [findings[0].key] })).toEqual([]);
    expect(unusualFor({ amount: 9000, categoryId: "food", date: "2026-09-28" }, usual)).toBe(1500);
    expect(unusualFor({ amount: 2000, categoryId: "food", date: "2026-09-28" }, usual)).toBeNull();
  });
});
