import { describe, expect, it } from "vitest";

import { parseFnsReceipt } from "@/lib/receipts/fns-qr";

// QR с кассового чека: сумма и дата — без набора руками.

describe("QR с кассового чека", () => {
  it("покупка: сумма с копейками, дата и время", () => {
    expect(
      parseFnsReceipt("t=20260927T1530&s=1234.50&fn=7380440700123456&i=12345&fp=1234567890&n=1")
    ).toEqual({ amount: 1234.5, date: "2026-09-27", time: "15:30", type: "EXPENSE" });
  });

  it("время с секундами и сумма без копеек", () => {
    expect(parseFnsReceipt("t=20260105T090807&s=300&fn=1&i=2&fp=3&n=1")).toMatchObject({
      amount: 300,
      date: "2026-01-05",
      time: "09:08"
    });
  });

  it("возврат покупки — это доход", () => {
    expect(parseFnsReceipt("t=20260927T1530&s=99.90&fn=1&i=2&fp=3&n=2")?.type).toBe("INCOME");
  });

  it("порядок полей не важен, n может не быть", () => {
    expect(parseFnsReceipt("fn=1&s=10.00&t=20260927T1200&i=1&fp=1")).toMatchObject({
      amount: 10,
      type: "EXPENSE"
    });
  });

  it.each([
    ["пусто", ""],
    ["ссылка связки устройств", "financeapps://pair?s=https%3A%2F%2Fx&c=abcd&k=zz"],
    ["сайт", "https://example.com/?t=20260927T1530&s=10&fn=1"],
    ["нет накопителя", "t=20260927T1530&s=10.00&i=1&fp=1&n=1"],
    ["нет даты", "s=10.00&fn=1&i=1&fp=1&n=1"],
    ["31 февраля", "t=20260231T1200&s=10.00&fn=1&i=1&fp=1&n=1"],
    ["сумма словами", "t=20260927T1530&s=десять&fn=1&i=1&fp=1&n=1"],
    ["нулевая сумма", "t=20260927T1530&s=0.00&fn=1&i=1&fp=1&n=1"],
    ["штрихкод с пачки", "4607001234567"]
  ])("не чек: %s", (_, text) => {
    expect(parseFnsReceipt(text)).toBeNull();
  });
});
