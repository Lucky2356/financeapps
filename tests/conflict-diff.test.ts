import { describe, expect, it } from "vitest";

import { describeValue, diffConflict, fieldLabel } from "@/lib/sync/conflict-diff";
import { translate } from "@/lib/i18n/catalog";

const t = (key: string) => translate("ru", key);
const money = (amount: number) => `${amount} ₽`;

const base = {
  id: "t1",
  updatedAt: "2026-10-01T10:00:00.000Z",
  amount: 500,
  type: "EXPENSE",
  date: "2026-10-01",
  description: "Кофе",
  account: { id: "a1", label: "Карта" },
  category: { id: "c1", label: "Кафе", color: "#f00" },
  tags: []
};

describe("в чём не сходится", () => {
  it("отличающиеся поля — первыми, служебные не показываются", () => {
    const diff = diffConflict(base, {
      ...base,
      amount: 650,
      updatedAt: "2026-10-01T11:00:00.000Z"
    });
    expect(diff[0]).toMatchObject({ field: "amount", here: 500, there: 650, differs: true });
    expect(diff.filter((item) => item.differs)).toHaveLength(1);
    expect(diff.map((item) => item.field)).not.toContain("updatedAt");
    expect(diff.map((item) => item.field)).not.toContain("id");
  });

  it("категория сравнивается целиком, а показывается названием", () => {
    const theirs = { ...base, category: { id: "c2", label: "Продукты", color: "#0f0" } };
    const diff = diffConflict(base, theirs);
    const category = diff.find((item) => item.field === "category")!;
    expect(category.differs).toBe(true);
    expect(describeValue("category", category.there, t, money)).toBe("Продукты");
  });

  it("пустое и отсутствующее — одно и то же, спора нет", () => {
    const diff = diffConflict({ ...base, description: "" }, { ...base, description: null });
    expect(diff.find((item) => item.field === "description")).toBeUndefined();
  });

  it("удалённая версия: всё у другой стороны — отличие", () => {
    const diff = diffConflict(null, base);
    expect(diff.every((item) => item.differs)).toBe(true);
  });

  it("значения словами: сумма, тип, дата, да/нет; поле по-русски", () => {
    expect(describeValue("amount", 500, t, money)).toBe("500 ₽");
    expect(describeValue("type", "EXPENSE", t, money)).toBe("Расход");
    expect(describeValue("date", "2026-10-01", t, money)).toBe("01.10.2026");
    expect(describeValue("isActive", true, t, money)).toBe("Да");
    expect(fieldLabel("amount", t)).toBe("Сумма");
    expect(fieldLabel("somethingNew", t)).toBe("somethingNew");
  });
});
