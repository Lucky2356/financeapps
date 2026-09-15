import { describe, expect, it } from "vitest";

import { pickTwo, randomBelow } from "@/lib/vault/pick-two";

// Два слова, которые спрашивают обратно при первом запуске. Расчёт крошечный, и
// именно поэтому первая его версия была неверной: она жила внутри разметки, и
// проверить её было нечем.
describe("какие два слова спросить обратно", () => {
  const TOTAL = 12;
  const draws = Array.from({ length: 4000 }, () => pickTwo(TOTAL));

  it("всегда два разных номера в пределах списка", () => {
    for (const [a, b] of draws) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(TOTAL);
      expect(a).not.toBe(b);
    }
  });

  it("всегда по возрастанию — вопросы идут в том же порядке, что и запись", () => {
    for (const [a, b] of draws) expect(a).toBeLessThan(b);
  });

  it("спросить могут про любое слово — дыр в списке нет", () => {
    const asked = new Set(draws.flat());
    for (let index = 0; index < TOTAL; index++) {
      expect(asked, `слово ${index + 1} не спрашивают никогда`).toContain(index);
    }
  });

  it("слова достаются примерно поровну", () => {
    // Прежний расчёт давал одному 4,5 %, другому 13,7 % при ровной доле 8,3 %.
    // Допуск широкий: проверяется отсутствие перекоса втрое, а не ровность
    // до третьего знака — иначе проверка сама стала бы мигать.
    const hits = new Array<number>(TOTAL).fill(0);
    for (const [a, b] of draws) {
      hits[a]++;
      hits[b]++;
    }
    const share = hits.map((count) => count / (draws.length * 2));
    const even = 1 / TOTAL;
    for (const value of share) {
      expect(value).toBeGreaterThan(even * 0.7);
      expect(value).toBeLessThan(even * 1.3);
    }
  });

  it("randomBelow держится в границах и добирается до краёв", () => {
    const seen = new Set(Array.from({ length: 3000 }, () => randomBelow(5)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
