import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { familyPicture, settleUp, type FamilyPicture, type Member } from "@/lib/family/family";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { TransactionsPageData } from "@/lib/data";

// Семейный бюджет: кто сколько потратил, общие траты поровну, кто кому должен.

const sasha: Member = { id: "a", name: "Саша", color: "#0ea5e9" };
const masha: Member = { id: "b", name: "Маша", color: "#f97316" };
const petya: Member = { id: "c", name: "Петя", color: "#22c55e" };

const spend = (amount: number, memberId?: string, shared = false, date = "2026-10-05") => ({
  amount,
  type: "EXPENSE",
  date,
  memberId,
  shared
});

describe("семья — расчёт", () => {
  it("личные траты — свои, общие — поровну; без участника — отдельно", () => {
    const picture = familyPicture(
      [sasha, masha],
      [
        spend(1000, "a"),
        spend(3000, "a", true),
        spend(500, "b"),
        spend(700),
        spend(9999, "a", true, "2026-09-30"),
        { ...spend(400, "a"), type: "INCOME" },
        { ...spend(800, "b", true), transferId: "t" }
      ],
      [],
      "2026-10"
    );
    expect(picture.perMember).toEqual([
      expect.objectContaining({
        id: "a",
        personal: 1000,
        sharedPaid: 3000,
        sharedShare: 1500,
        total: 2500
      }),
      expect.objectContaining({
        id: "b",
        personal: 500,
        sharedPaid: 0,
        sharedShare: 1500,
        total: 2000
      })
    ]);
    expect(picture.unassigned).toBe(700);
    expect(picture.sharedTotal).toBe(3000);
  });

  it("долги — за всё время, а не за месяц; «Рассчитались» гасит долг", () => {
    const rows = [spend(3000, "a", true, "2026-09-10"), spend(1000, "b", true)];
    const before = familyPicture([sasha, masha], rows, [], "2026-10");
    // Саша заплатил 3000 общего, Маша 1000: каждому положено по 2000.
    expect(before.balances).toEqual([
      { id: "a", balance: 1000 },
      { id: "b", balance: -1000 }
    ]);
    expect(before.debts).toEqual([{ from: "b", to: "a", amount: 1000 }]);

    const after = familyPicture(
      [sasha, masha],
      rows,
      [{ id: "s", from: "b", to: "a", amount: 1000, date: "2026-10-06" }],
      "2026-10"
    );
    expect(after.debts).toEqual([]);
  });

  it("трое: наименьшее число переводов", () => {
    const picture = familyPicture([sasha, masha, petya], [spend(9000, "a", true)], [], "2026-10");
    expect(picture.debts).toEqual([
      { from: "b", to: "a", amount: 3000 },
      { from: "c", to: "a", amount: 3000 }
    ]);
  });

  it("новый участник не должен за то, что купили до него", () => {
    const late = { ...petya, since: "2026-10-01" };
    const rows = [spend(6000, "a", true, "2026-09-20"), spend(9000, "a", true, "2026-10-05")];
    const picture = familyPicture([sasha, masha, late], rows, [], "2026-10");
    // Сентябрь — на двоих (по 3000), октябрь — на троих (по 3000).
    expect(picture.balances).toEqual([
      { id: "a", balance: 9000 },
      { id: "b", balance: -6000 },
      { id: "c", balance: -3000 }
    ]);
    expect(picture.perMember.map((row) => row.sharedShare)).toEqual([3000, 3000, 3000]);
    // Кто платил — делит свою трату, даже если «вступил» позже её дня.
    const payer = familyPicture(
      [sasha, late],
      [spend(1000, "c", true, "2026-09-20")],
      [],
      "2026-09"
    );
    expect(payer.debts).toEqual([{ from: "a", to: "c", amount: 500 }]);
  });

  it("один участник — долгов нет; копейки не плодят переводов", () => {
    expect(familyPicture([sasha], [spend(500, "a", true)], [], "2026-10").debts).toEqual([]);
    expect(
      settleUp([
        { id: "a", balance: 0.003 },
        { id: "b", balance: -0.003 }
      ])
    ).toEqual([]);
  });
});

describe("семья — в книге", () => {
  async function setup() {
    const api = new LocalApiClient(new MemoryStorageAdapter());
    await api.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "50000" });
    const page = await api.get<TransactionsPageData>("/transactions");
    const accountId = page.accounts[0].id;
    const categoryId = page.categories.find((item) => item.kind === "EXPENSE")!.id;
    const a = await api.post<Member>("/family", { action: "addMember", name: "Саша" });
    const b = await api.post<Member>("/family", { action: "addMember", name: "Маша" });
    return { api, accountId, categoryId, a, b };
  }

  it("участники, операция с участником и общей тратой, долг и расчёт", async () => {
    const { api, accountId, categoryId, a, b } = await setup();
    expect(a.color).not.toBe(b.color);
    await expect(api.post("/family", { action: "addMember", name: "саша" })).rejects.toThrow(
      /уже есть/
    );

    const tx = await api.post<{ id: string }>("/transactions", {
      type: "EXPENSE",
      amount: "4000",
      accountId,
      categoryId,
      description: "Продукты",
      date: "2026-10-02",
      memberId: a.id,
      shared: "true"
    });
    const family = await api.get<{ members: Member[]; picture: FamilyPicture }>(
      "/family?month=2026-10"
    );
    expect(family.members.map((member) => member.name)).toEqual(["Саша", "Маша"]);
    expect(family.picture.debts).toEqual([{ from: b.id, to: a.id, amount: 2000 }]);

    // Правка без полей семьи (быстрая смена категории) их не теряет.
    await api.put("/transactions", {
      id: tx.id,
      type: "EXPENSE",
      amount: "4000",
      accountId,
      categoryId,
      description: "Продукты и хлеб",
      date: "2026-10-02"
    });
    const kept = await api.get<{ picture: FamilyPicture }>("/family?month=2026-10");
    expect(kept.picture.sharedTotal).toBe(4000);

    await api.post("/family", { action: "settle", from: b.id, to: a.id, amount: "2 000" });
    const settled = await api.get<{ picture: FamilyPicture }>("/family?month=2026-10");
    expect(settled.picture.debts).toEqual([]);
  });

  it("чужой участник не прилипает; пустой выбор снимает участника", async () => {
    const { api, accountId, categoryId, a } = await setup();
    const base = { type: "EXPENSE", amount: "300", accountId, categoryId, date: "2026-10-03" };
    const tx = await api.post<{ id: string }>("/transactions", { ...base, memberId: "nobody" });
    let family = await api.get<{ picture: FamilyPicture }>("/family?month=2026-10");
    expect(family.picture.unassigned).toBe(300);

    await api.put("/transactions", { ...base, id: tx.id, memberId: a.id });
    family = await api.get<{ picture: FamilyPicture }>("/family?month=2026-10");
    expect(family.picture.perMember[0].personal).toBe(300);

    await api.put("/transactions", { ...base, id: tx.id, memberId: "" });
    family = await api.get<{ picture: FamilyPicture }>("/family?month=2026-10");
    expect(family.picture.unassigned).toBe(300);
  });

  it("семья уже делит траты — новый участник в ней с сегодня; дату можно поправить", async () => {
    const { api, accountId, categoryId, a, b } = await setup();
    // Пока общих трат нет — участники «были всегда».
    expect(a.since).toBeUndefined();
    expect(b.since).toBeUndefined();
    await api.post("/transactions", {
      type: "EXPENSE",
      amount: "6000",
      accountId,
      categoryId,
      date: "2026-09-20",
      memberId: a.id,
      shared: "true"
    });
    const c = await api.post<Member>("/family", { action: "addMember", name: "Петя" });
    expect(c.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    let family = await api.get<{ picture: FamilyPicture }>("/family?month=2026-09");
    expect(family.picture.debts).toEqual([{ from: b.id, to: a.id, amount: 3000 }]);

    // «В семье с самого начала» — и сентябрьская трата делится на троих.
    await api.post("/family", { action: "renameMember", id: c.id, name: "Петя", since: "" });
    family = await api.get<{ picture: FamilyPicture }>("/family?month=2026-09");
    expect(family.picture.debts).toEqual([
      { from: b.id, to: a.id, amount: 2000 },
      { from: c.id, to: a.id, amount: 2000 }
    ]);
    await expect(
      api.post("/family", { action: "renameMember", id: c.id, name: "Петя", since: "вчера" })
    ).rejects.toThrow(/ГГГГ/);
  });

  it("удалённый участник — в корзине, и возвращается", async () => {
    const { api, b } = await setup();
    await api.post("/family", { action: "removeMember", id: b.id });
    let family = await api.get<{ members: Member[] }>("/family");
    expect(family.members).toHaveLength(1);
    const trash = await api.get<{ entries: Array<{ id: string; collection: string }> }>("/trash");
    const entry = trash.entries.find((item) => item.collection === "members")!;
    expect(entry).toBeTruthy();
    await api.post("/trash", { action: "restore", ids: [entry.id] });
    family = await api.get<{ members: Member[] }>("/family");
    expect(family.members.map((member) => member.name)).toEqual(["Саша", "Маша"]);
  });
});
