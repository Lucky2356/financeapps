import { describe, expect, it } from "vitest";

import { parseEntry, type ParseEntryContext } from "@/lib/transactions/parse-entry";

// Разбор строки в черновик операции. Проверяется не устройство разбора, а его
// обещание: что человек набрал одной фразой — то и оказалось в полях.
const TODAY = new Date(2026, 8, 15); // 15 сентября 2026

const accounts = [
  { id: "acc-card", label: "Дебетовая карта" },
  { id: "acc-cash", label: "Наличные" }
];

const history = [
  { description: "Продукты в пятёрочке", type: "EXPENSE" as const, category: { id: "cat-food" } },
  { description: "Кофе на вынос", type: "EXPENSE" as const, category: { id: "cat-cafe" } },
  { description: "Зарплата за месяц", type: "INCOME" as const, category: { id: "cat-salary" } }
];

const context = (over: Partial<ParseEntryContext> = {}): ParseEntryContext => ({
  accounts,
  history,
  type: "EXPENSE",
  today: TODAY,
  ...over
});

describe("разбор строки: сумма, категория, счёт", () => {
  it("разбирает «1200 продукты картой»", () => {
    const parsed = parseEntry("1200 продукты картой", context());
    expect(parsed.amount).toBe(1200);
    expect(parsed.accountId).toBe("acc-card");
    expect(parsed.categoryId).toBe("cat-food");
    expect(parsed.description).toBe("продукты");
  });

  it("понимает пробел как разделитель тысяч", () => {
    expect(parseEntry("1 200 продукты", context()).amount).toBe(1200);
  });

  it("понимает запятую и выражение — это уже умеет калькулятор", () => {
    expect(parseEntry("1 234,56 кофе", context()).amount).toBeCloseTo(1234.56, 2);
    expect(parseEntry("3*400 продукты", context()).amount).toBe(1200);
  });

  it("не выбирает счёт, когда подходит больше одного", () => {
    const twoCards = [
      { id: "acc-1", label: "Карта Сбербанка" },
      { id: "acc-2", label: "Карта Тинькофф" }
    ];
    // Молча подставленный чужой счёт хуже, чем невыбранный: деньги списались бы
    // не оттуда, и заметить это можно было бы через месяц.
    expect(
      parseEntry("1200 продукты картой", context({ accounts: twoCards })).accountId
    ).toBeNull();
  });

  it("не путает похожие слова со счётом", () => {
    const sales = [{ id: "acc-sales", label: "Продажи" }];
    expect(parseEntry("1200 продукты", context({ accounts: sales })).accountId).toBeNull();
  });

  it("оставляет всё как есть, когда разбирать нечего", () => {
    const parsed = parseEntry("просто заметка", context());
    expect(parsed.amount).toBeNull();
    expect(parsed.accountId).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.description).toBe("просто заметка");
  });

  it("на пустой строке молчит", () => {
    const parsed = parseEntry("   ", context());
    expect(parsed).toEqual({
      amount: null,
      type: null,
      accountId: null,
      categoryId: null,
      date: null,
      tags: [],
      description: ""
    });
  });
});

describe("разбор строки: знак задаёт тип", () => {
  it("плюс делает операцию доходом", () => {
    const parsed = parseEntry("+5000 зарплата", context());
    expect(parsed.type).toBe("INCOME");
    expect(parsed.amount).toBe(5000);
    // Категория ищется по истории того же типа — расходные строки не мешают.
    expect(parsed.categoryId).toBe("cat-salary");
  });

  it("минус делает операцию расходом", () => {
    expect(parseEntry("-5000 продукты", context({ type: "INCOME" })).type).toBe("EXPENSE");
  });

  it("без знака тип не трогает — его выбирают в форме", () => {
    expect(parseEntry("1200 продукты", context()).type).toBeNull();
  });
});

describe("разбор строки: дата", () => {
  it("понимает «вчера» и «позавчера»", () => {
    expect(parseEntry("300 кофе вчера", context()).date).toBe("2026-09-14");
    expect(parseEntry("300 кофе позавчера", context()).date).toBe("2026-09-13");
  });

  it("понимает «5 сентября» и берёт ближайший прошедший год", () => {
    expect(parseEntry("300 кофе 5 сентября", context()).date).toBe("2026-09-05");
    // 31 декабря ещё не наступало в этом году — значит речь о прошлом.
    expect(parseEntry("300 кофе 31 декабря", context()).date).toBe("2025-12-31");
  });

  it("понимает дату с явным годом", () => {
    expect(parseEntry("300 кофе 05.09.2025", context()).date).toBe("2025-09-05");
  });

  it("не считает датой то, чего в календаре нет", () => {
    expect(parseEntry("300 кофе 31.02.2026", context()).date).toBeNull();
  });

  it("не считает датой то, у чего нет такого месяца", () => {
    // «12.50» — двенадцать рублей пятьдесят копеек: пятидесятого месяца нет.
    const parsed = parseEntry("12.50 кофе", context());
    expect(parsed.amount).toBeCloseTo(12.5, 2);
    expect(parsed.date).toBeNull();
  });

  it("единственное число строки — это сумма, даже если похоже на дату", () => {
    // «5.09» — настоящая дата по виду, и только очередь разбора решает спор:
    // сумма берёт своё первой, голая дата — из того, что осталось. Иначе
    // операция сохранилась бы без суммы, и человек заметил бы это не сразу.
    const parsed = parseEntry("5.09 кофе", context());
    expect(parsed.amount).toBeCloseTo(5.09, 2);
    expect(parsed.date).toBeNull();
  });

  it("разбирает голое «5.09» только как вторую цифру строки", () => {
    const parsed = parseEntry("300 кофе 5.09", context());
    expect(parsed.amount).toBe(300);
    expect(parsed.date).toBe("2026-09-05");
  });
});

describe("разбор строки: теги", () => {
  it("забирает слова с решёткой и убирает их из описания", () => {
    const parsed = parseEntry("1200 продукты #отпуск #еда", context());
    expect(parsed.tags).toEqual(["отпуск", "еда"]);
    expect(parsed.description).toBe("продукты");
    expect(parsed.amount).toBe(1200);
  });
});
