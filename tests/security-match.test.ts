import { describe, expect, it } from "vitest";

import { queryVariants, rankSecurities, relevance } from "@/lib/investments/security-match";

const sec = (ticker: string, name: string) => ({ ticker, name });

describe("поиск бумаг: раскладка", () => {
  it("находит тикер, набранный в русской раскладке", () => {
    // «ыиук» — это SBER, набранный не глядя на раскладку. Прежний поиск искал
    // ровно «ЫИУК» и не находил ничего.
    expect(queryVariants("ыиук")).toContain("SBER");
  });

  it("находит и обратное — латиница вместо русского названия", () => {
    expect(queryVariants("cnth")).toContain("СТЕР");
  });

  it("оставляет и то, как набрано: раскладка добавляет вариант, а не заменяет", () => {
    expect(queryVariants("SBER")).toContain("SBER");
  });

  it("на пустом запросе не ищет ничего", () => {
    expect(queryVariants("   ")).toEqual([]);
  });
});

describe("поиск бумаг: релевантность", () => {
  const variants = queryVariants("SBER");

  it("точный тикер важнее всего", () => {
    expect(relevance(sec("SBER", "Сбербанк"), variants)).toBe(0);
  });

  it("начало тикера важнее начала названия", () => {
    const byTicker = relevance(sec("SBERP", "Сбербанк прив"), variants)!;
    const byName = relevance(sec("XXXX", "SBER что-то"), variants)!;
    expect(byTicker).toBeLessThan(byName);
  });

  it("вхождение в середину — последнее, но не отброшено", () => {
    expect(relevance(sec("XXXX", "Фонд на SBER и другие"), variants)).not.toBeNull();
  });

  it("не подходящее не подходит", () => {
    expect(relevance(sec("GAZP", "Газпром"), variants)).toBeNull();
  });
});

describe("поиск бумаг: порядок и обрезка", () => {
  // ГЛАВНЫЙ ТЕСТ ФАЙЛА. Прежний код набирал первые N совпадений и выходил из
  // цикла, и лишь потом ставил точное совпадение вперёд. Здесь точная бумага
  // стоит последней среди сорока совпадающих — и обязана оказаться первой.
  it("точный тикер находится, даже когда совпадений больше лимита", () => {
    const noise = Array.from({ length: 40 }, (_, i) => sec(`ASBER${i}`, `Шум ${i}`));
    const result = rankSecurities([...noise, sec("SBER", "Сбербанк")], "SBER", 25);

    expect(result[0].ticker).toBe("SBER");
    expect(result).toHaveLength(25);
  });

  it("порядок внутри одной ступени — алфавитный", () => {
    const result = rankSecurities([sec("SBERZ", "Я"), sec("SBERA", "А")], "SBER", 10);
    expect(result.map((r) => r.ticker)).toEqual(["SBER" + "A", "SBERZ"]);
  });

  it("отдаёт не больше запрошенного", () => {
    const many = Array.from({ length: 100 }, (_, i) => sec(`SBER${i}`, `Бумага ${i}`));
    expect(rankSecurities(many, "SBER", 7)).toHaveLength(7);
  });

  it("пустой запрос не выдаёт всё подряд", () => {
    expect(rankSecurities([sec("SBER", "Сбербанк")], "", 25)).toEqual([]);
  });

  // Цена к поиску отношения не имеет: облигацию, по которой сегодня не было
  // сделок, ищут как раз чтобы добавить в портфель.
  it("не знает про цену и потому не может отбросить бумагу без неё", () => {
    const bond = { ticker: "SU26238RMFS4", name: "ОФЗ 26238", price: 0 };
    expect(rankSecurities([bond], "26238", 25)).toHaveLength(1);
  });
});
