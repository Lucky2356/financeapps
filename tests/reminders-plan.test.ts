import { describe, expect, it } from "vitest";

import { planReminders, reminderId, type ReminderInput } from "@/lib/reminders/plan";

const base = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  // понедельник, 28 сентября 2026, 15:00
  now: new Date(2026, 8, 28, 15, 0),
  payments: [],
  budgets: [],
  deposits: [],
  evening: false,
  loggedToday: false,
  weekly: false,
  once: {},
  money: (value) => `${value} ₽`,
  t: (key, values) => `${key}${values ? JSON.stringify(values) : ""}`,
  ...over
});

describe("напоминания на телефоне", () => {
  it("платёж — накануне в 10:00; прошедшее время не назначается", () => {
    const items = planReminders(
      base({
        payments: [
          { id: "rent", date: "2026-10-01", title: "Аренда", amount: 30000 },
          { id: "late", date: "2026-09-28", title: "Сегодня", amount: 1 }
        ]
      })
    );
    expect(items).toHaveLength(1);
    expect(new Date(items[0].at)).toEqual(new Date(2026, 8, 30, 10, 0));
    expect(items[0].link).toBe("financeapps://open?path=/recurring");
  });

  it("вечер: сегодня — только если пусто, дальше — каждый день недели", () => {
    const empty = planReminders(base({ evening: true }));
    expect(new Date(empty[0].at)).toEqual(new Date(2026, 8, 28, 21, 0));
    expect(empty).toHaveLength(8);
    const logged = planReminders(base({ evening: true, loggedToday: true }));
    expect(new Date(logged[0].at)).toEqual(new Date(2026, 8, 29, 21, 0));
    expect(logged[0].link).toBe("financeapps://add?type=EXPENSE");
  });

  it("лимит — один раз: назначенное держится, наступившее не повторяется", () => {
    const budgets = [{ categoryId: "food", category: "Продукты", spent: 9500, limit: 10000 }];
    const first = planReminders(base({ budgets }));
    expect(first).toHaveLength(1);
    expect(new Date(first[0].at)).toEqual(new Date(2026, 8, 28, 19, 0));
    const again = planReminders(base({ budgets, once: { [first[0].key]: first[0].at } }));
    expect(again.map((item) => item.at)).toEqual([first[0].at]);
    const fired = planReminders(
      base({ budgets, now: new Date(2026, 8, 28, 20, 0), once: { [first[0].key]: first[0].at } })
    );
    expect(fired).toEqual([]);
  });

  it("вклад — за неделю и накануне; неделя — следующий понедельник", () => {
    const items = planReminders(
      base({ deposits: [{ id: "d", name: "Вклад", endsOn: "2026-10-05" }], weekly: true })
    );
    expect(items.map((item) => new Date(item.at).getDate())).toEqual([4, 5]);
    expect(items.map((item) => item.key)).toEqual(["deposit:d:2026-10-05:1", "week:2026-10-05"]);
  });

  it("номер стабилен и положителен", () => {
    expect(reminderId("evening:2026-09-28")).toBe(reminderId("evening:2026-09-28"));
    expect(reminderId("x")).toBeGreaterThan(0);
  });
});

describe("ссылка из напоминания", () => {
  it("открывает только путь внутри приложения", async () => {
    const { readOpenLink } = await import("@/lib/transactions/quick-add-request");
    expect(readOpenLink("financeapps://open?path=/budgets")).toBe("/budgets");
    expect(readOpenLink("financeapps://open?path=%2Frecurring")).toBe("/recurring");
    expect(readOpenLink("financeapps://open?path=//evil.example")).toBeNull();
    expect(readOpenLink("financeapps://open?path=https://evil.example")).toBeNull();
    expect(readOpenLink("financeapps://add?type=EXPENSE")).toBeNull();
  });
});
