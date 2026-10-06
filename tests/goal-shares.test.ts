import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { Member } from "@/lib/family/family";
import { goalFamily, goalShares } from "@/lib/family/goal-shares";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";

const sasha: Member = { id: "a", name: "Саша", color: "#0ea5e9" };
const masha: Member = { id: "b", name: "Маша", color: "#f97316" };

describe("совместная цель — расчёт", () => {
  it("поровну: кто внёс меньше своей доли от общего — отстаёт", () => {
    const family = goalFamily({
      goalId: "g",
      members: [sasha, masha],
      shares: undefined,
      movements: [
        { goalId: "g", amount: 70000, memberId: "a" },
        { goalId: "g", amount: 30000, memberId: "b" },
        { goalId: "g", amount: 5000 },
        { goalId: "other", amount: 999, memberId: "b" }
      ]
    })!;
    expect(family.custom).toBe(false);
    expect(family.unassigned).toBe(5000);
    expect(family.members).toEqual([
      expect.objectContaining({ id: "a", contributed: 70000, share: 50, behind: 0 }),
      expect.objectContaining({ id: "b", contributed: 30000, share: 50, behind: 20000 })
    ]);
  });

  it("свои доли нормируются к 100; один участник — разбивки нет", () => {
    expect([...goalShares([sasha, masha], { a: 3, b: 2 }).shares.values()]).toEqual([60, 40]);
    const family = goalFamily({
      goalId: "g",
      members: [sasha, masha],
      shares: { a: 60, b: 40 },
      movements: [
        { goalId: "g", amount: 50000, memberId: "a" },
        { goalId: "g", amount: 50000, memberId: "b" }
      ]
    })!;
    expect(family.members.map((member) => member.behind)).toEqual([10000, 0]);
    expect(
      goalFamily({ goalId: "g", members: [sasha], shares: undefined, movements: [] })
    ).toBeNull();
  });
});

describe("совместная цель — в книге", () => {
  it("пополнение помнит участника, доли сохраняются и не теряются при правке", async () => {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const card = await api.post<{ id: string }>("/accounts", {
      name: "Карта",
      type: "DEBIT_CARD",
      balance: "100000"
    });
    const a = await api.post<Member>("/family", { action: "addMember", name: "Саша" });
    const b = await api.post<Member>("/family", { action: "addMember", name: "Маша" });
    const goal = await api.post<{ id: string }>("/goals", {
      title: "Отпуск",
      targetAmount: "200000",
      currentAmount: "0",
      deadline: "2027-06-01",
      shares: JSON.stringify({ [a.id]: 60, [b.id]: 40 })
    });
    await api.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "30000",
      accountId: card.id,
      memberId: a.id
    });
    await api.post("/goals", {
      action: "deposit",
      goalId: goal.id,
      amount: "10000",
      accountId: card.id,
      memberId: b.id
    });
    let page = await api.get("/goals");
    let family = page.goals[0].family!;
    expect(family.custom).toBe(true);
    expect(family.members.map((member) => [member.contributed, member.behind])).toEqual([
      [30000, 0],
      [10000, 6000]
    ]);

    // Правка цели без поля долей их не трогает.
    await api.put("/goals", {
      id: goal.id,
      title: "Отпуск в горах",
      targetAmount: "200000",
      currentAmount: "40000",
      deadline: "2027-06-01"
    });
    page = await api.get("/goals");
    expect(page.goals[0].shares).toEqual({ [a.id]: 60, [b.id]: 40 });
    // «Поровну» — пустые доли.
    await api.put("/goals", {
      id: goal.id,
      title: "Отпуск в горах",
      targetAmount: "200000",
      currentAmount: "40000",
      deadline: "2027-06-01",
      shares: "{}"
    });
    page = await api.get("/goals");
    family = page.goals[0].family!;
    expect(page.goals[0].shares).toBeUndefined();
    expect(family.members.map((member) => member.behind)).toEqual([0, 10000]);
  });
});
