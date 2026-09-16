import { describe, expect, it } from "vitest";

import { mergeBooks } from "@/lib/sync/merge";

const EARLY = "2026-01-01T00:00:00.000Z";
const LATE = "2026-06-01T00:00:00.000Z";

type Book = Record<string, unknown>;

const tx = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  amount: 100,
  description: "обед",
  ...extra
});

const grave = (key: string, deletedAt = LATE, collection = "transactions") => ({
  collection,
  key,
  deletedAt
});

const rows = (book: Book, collection = "transactions") =>
  (book[collection] as Array<Record<string, unknown>>).map((row) => row.id).sort();

describe("слияние книг", () => {
  describe("то, ради чего всё: добавленное с двух сторон сходится само", () => {
    it("своя новая строка и чужая новая строка живут обе", () => {
      const base: Book = { transactions: [tx("общая")] };
      const mine: Book = { transactions: [tx("общая"), tx("с телефона")] };
      const theirs: Book = { transactions: [tx("общая"), tx("с компьютера")] };

      const { state, conflicts } = mergeBooks(base, mine, theirs);

      expect(rows(state)).toEqual(["общая", "с компьютера", "с телефона"]);
      expect(conflicts).toEqual([]);
    });

    it("правка с одной стороны берётся молча", () => {
      const base: Book = { transactions: [tx("t1", { amount: 100, updatedAt: EARLY })] };
      const mine: Book = { transactions: [tx("t1", { amount: 250, updatedAt: LATE })] };
      const theirs: Book = { transactions: [tx("t1", { amount: 100, updatedAt: EARLY })] };

      const { state, conflicts } = mergeBooks(base, mine, theirs);

      expect((state.transactions as Array<{ amount: number }>)[0].amount).toBe(250);
      expect(conflicts).toEqual([]);
    });

    it("одинаковая правка с двух сторон — не спор", () => {
      const base: Book = { transactions: [tx("t1", { amount: 100 })] };
      const same = { transactions: [tx("t1", { amount: 250, updatedAt: LATE })] };

      const { conflicts } = mergeBooks(base, same, same);
      expect(conflicts).toEqual([]);
    });
  });

  describe("удаления", () => {
    it("удалённое здесь не возвращается с сервера", () => {
      const base: Book = { transactions: [tx("t1"), tx("t2")] };
      const mine: Book = { transactions: [tx("t1")], deletions: [grave("t2")] };
      const theirs: Book = { transactions: [tx("t1"), tx("t2")] };

      expect(rows(mergeBooks(base, mine, theirs).state)).toEqual(["t1"]);
    });

    it("удалённое там убирается и здесь", () => {
      const base: Book = { transactions: [tx("t1"), tx("t2")] };
      const mine: Book = { transactions: [tx("t1"), tx("t2")] };
      const theirs: Book = { transactions: [tx("t1")], deletions: [grave("t2")] };

      expect(rows(mergeBooks(base, mine, theirs).state)).toEqual(["t1"]);
    });

    it("без основы чужой след отличает удаление от «у меня ещё нет»", () => {
      // Первая встреча с сервером: основы нет. Без следа эту строку пришлось бы
      // счесть своей новинкой и вернуть обратно тому, кто её убрал.
      const mine: Book = { transactions: [tx("t1"), tx("t2")] };
      const theirs: Book = { transactions: [tx("t1")], deletions: [grave("t2")] };

      expect(rows(mergeBooks(null, mine, theirs).state)).toEqual(["t1"]);
    });

    it("без основы и без следа чужая книга не съедает мои новые строки", () => {
      const mine: Book = { transactions: [tx("t1"), tx("новая")] };
      const theirs: Book = { transactions: [tx("t1")] };

      expect(rows(mergeBooks(null, mine, theirs).state)).toEqual(["novaya".replace("novaya", "новая"), "t1"].sort());
    });

    it("следы объединяются, иначе удалённое воскреснет на следующем круге", () => {
      const base: Book = { transactions: [tx("t1"), tx("t2")] };
      const mine: Book = { transactions: [tx("t2")], deletions: [grave("t1")] };
      const theirs: Book = { transactions: [tx("t1")], deletions: [grave("t2")] };

      const { state } = mergeBooks(base, mine, theirs);
      const marks = (state.deletions as Array<{ key: string }>).map((mark) => mark.key).sort();
      expect(marks).toEqual(["t1", "t2"]);
    });
  });

  describe("спор", () => {
    it("одну строку правили в двух местах — это спор, а не тихий выбор", () => {
      const base: Book = { transactions: [tx("t1", { amount: 100 })] };
      const mine: Book = { transactions: [tx("t1", { amount: 250, updatedAt: EARLY })] };
      const theirs: Book = { transactions: [tx("t1", { amount: 900, updatedAt: LATE })] };

      const { conflicts } = mergeBooks(base, mine, theirs);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ collection: "transactions", key: "t1", chosen: "theirs" });
      expect(conflicts[0].mine).toMatchObject({ amount: 250 });
      expect(conflicts[0].theirs).toMatchObject({ amount: 900 });
    });

    it("правка против удаления оставляет строку, а не выбрасывает правку", () => {
      // Лишняя строка видна и убирается второй раз за секунду. Пропавшая
      // правка не видна никак — и обнаружится, когда сверять будет уже поздно.
      const base: Book = { transactions: [tx("t1", { amount: 100 })] };
      const mine: Book = { transactions: [tx("t1", { amount: 250, updatedAt: LATE })] };
      const theirs: Book = { transactions: [], deletions: [grave("t1")] };

      const { state, conflicts } = mergeBooks(base, mine, theirs);

      expect(rows(state)).toEqual(["t1"]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ chosen: "mine", theirs: null });
    });

    it("при равных отметках побеждает чужое — иначе книга не сойдётся никогда", () => {
      // Реши каждое устройство в свою пользу, они переубеждали бы друг друга
      // бесконечно: один и тот же спор возвращался бы на каждом круге.
      const base: Book = { transactions: [tx("t1", { amount: 100 })] };
      const mine: Book = { transactions: [tx("t1", { amount: 250, updatedAt: LATE })] };
      const theirs: Book = { transactions: [tx("t1", { amount: 900, updatedAt: LATE })] };

      expect(mergeBooks(base, mine, theirs).conflicts[0].chosen).toBe("theirs");
    });
  });

  describe("отправлять ли обратно", () => {
    it("своих правок нет — слитое совпало с чужим", () => {
      const base: Book = { transactions: [tx("t1")] };
      const mine: Book = { transactions: [tx("t1")] };
      const theirs: Book = { transactions: [tx("t1"), tx("t2")] };

      expect(mergeBooks(base, mine, theirs).differs).toBe(false);
    });

    it("свои правки есть — слитое отличается от чужого", () => {
      const base: Book = { transactions: [tx("t1")] };
      const mine: Book = { transactions: [tx("t1"), tx("моя")] };
      const theirs: Book = { transactions: [tx("t1"), tx("их")] };

      expect(mergeBooks(base, mine, theirs).differs).toBe(true);
    });
  });

  describe("не строки", () => {
    it("портфель сливается по бумагам, а не берётся целиком", () => {
      const investments = (portfolio: Array<Record<string, unknown>>) => ({
        source: "MOEX",
        portfolio,
        watchlist: [],
        structure: []
      });
      const base: Book = { investments: investments([{ ticker: "SBER", quantity: 10 }]) };
      const mine: Book = {
        investments: investments([
          { ticker: "SBER", quantity: 10 },
          { ticker: "GAZP", quantity: 5 }
        ])
      };
      const theirs: Book = {
        investments: investments([
          { ticker: "SBER", quantity: 10 },
          { ticker: "LKOH", quantity: 2 }
        ])
      };

      const { state } = mergeBooks(base, mine, theirs);
      const tickers = (
        (state.investments as { portfolio: Array<{ ticker: string }> }).portfolio
      )
        .map((row) => row.ticker)
        .sort();
      expect(tickers).toEqual(["GAZP", "LKOH", "SBER"]);
    });

    it("настройку берёт тот, кто её менял", () => {
      const base: Book = { theme: "system", currency: "RUB", transactions: [] };
      const mine: Book = { theme: "dark", currency: "RUB", transactions: [] };
      const theirs: Book = { theme: "system", currency: "USD", transactions: [] };

      const { state } = mergeBooks(base, mine, theirs);
      expect(state.theme).toBe("dark");
      expect(state.currency).toBe("USD");
    });

    it("обе стороны меняли одну настройку — берётся чужая, и обе сойдутся", () => {
      const base: Book = { theme: "system", transactions: [] };
      const mine: Book = { theme: "dark", transactions: [] };
      const theirs: Book = { theme: "light", transactions: [] };

      expect(mergeBooks(base, mine, theirs).state.theme).toBe("light");
    });

    it("список закреплённых месяцев объединяется", () => {
      const base: Book = { planMonths: ["2026-01"], transactions: [] };
      const mine: Book = { planMonths: ["2026-01", "2026-02"], transactions: [] };
      const theirs: Book = { planMonths: ["2026-01", "2026-03"], transactions: [] };

      expect(mergeBooks(base, mine, theirs).state.planMonths).toEqual([
        "2026-01",
        "2026-02",
        "2026-03"
      ]);
    });
  });

  describe("план опознаётся месяцем и статьёй", () => {
    it("планы на разные месяцы не путаются между собой", () => {
      const plan = (month: string, categoryId: string, amount: number) => ({
        month,
        categoryId,
        amount
      });
      const base: Book = { plans: [plan("2026-01", "cat-food", 100)] };
      const mine: Book = {
        plans: [plan("2026-01", "cat-food", 100), plan("2026-02", "cat-food", 200)]
      };
      const theirs: Book = {
        plans: [plan("2026-01", "cat-food", 150), plan("2026-03", "cat-food", 300)]
      };

      const { state } = mergeBooks(base, mine, theirs);
      const months = (state.plans as Array<{ month: string }>).map((row) => row.month).sort();
      expect(months).toEqual(["2026-01", "2026-02", "2026-03"]);
    });
  });
});
