import { describe, expect, it } from "vitest";

import { parseBankNotification, type BankNotification } from "@/lib/bank/notification-parse";
import { alreadyRecorded, mergeSuggestions, resolveTarget } from "@/lib/bank/suggestions";

// Уведомления банков: как они приходят на самом деле — пуши и SMS.

const at = new Date(2026, 9, 3, 12, 34).getTime();
const note = (title: string, text: string, app = "Банк"): BankNotification => ({
  package: "ru.bank",
  app,
  title,
  text,
  at
});

describe("уведомления банка", () => {
  it("SMS Сбера: карта, время, покупка, место, баланс", () => {
    const parsed = parseBankNotification(
      note("900", "ECMC1234 12:34 Покупка 1 250р KOFEMANIYA Баланс: 9 876.54р")
    );
    expect(parsed).toMatchObject({
      type: "EXPENSE",
      amount: 1250,
      merchant: "KOFEMANIYA",
      card: "1234",
      date: "2026-10-03"
    });
  });

  it("пуш Т-Банка: сумма в заголовке, место в тексте, «Доступно» не сумма", () => {
    const parsed = parseBankNotification(
      note("Покупка 450 ₽", "Пятёрочка. Карта *5678. Доступно 12 345,67 ₽")
    );
    expect(parsed).toMatchObject({
      type: "EXPENSE",
      amount: 450,
      merchant: "Пятёрочка",
      card: "5678"
    });
  });

  it("копейки и RUR (Альфа)", () => {
    const parsed = parseBankNotification(
      note("Альфа-Банк", "Покупка 199,90 RUR. Карта **4321. YANDEX*GO. Баланс 5 000,00 RUR")
    );
    expect(parsed).toMatchObject({ type: "EXPENSE", amount: 199.9, card: "4321" });
    expect(parsed?.merchant).toMatch(/YANDEX/);
  });

  it("оплата с запятой после суммы", () => {
    const parsed = parseBankNotification(note("ВТБ", "Оплата 320р, Вкусно и точка. Остаток 1000р"));
    expect(parsed).toMatchObject({ type: "EXPENSE", amount: 320, merchant: "Вкусно и точка" });
  });

  it("зачисление и перевод от — доход; возврат покупки — тоже доход", () => {
    expect(parseBankNotification(note("Сбер", "Зачисление 50 000р Баланс: 60 000р"))).toMatchObject(
      {
        type: "INCOME",
        amount: 50000
      }
    );
    expect(parseBankNotification(note("Т-Банк", "Перевод от Ивана И. 1 500 ₽"))).toMatchObject({
      type: "INCOME",
      amount: 1500
    });
    expect(parseBankNotification(note("Банк", "Возврат покупки 700 ₽ OZON"))).toMatchObject({
      type: "INCOME",
      amount: 700
    });
  });

  it("отказ, коды, «недостаточно средств» и просто сообщения — мимо", () => {
    expect(
      parseBankNotification(note("900", "Отказ: покупка 5000р, недостаточно средств"))
    ).toBeNull();
    expect(
      parseBankNotification(note("900", "Код 1234 для оплаты 500р в OZON. Никому не сообщайте"))
    ).toBeNull();
    expect(parseBankNotification(note("Мама", "Купи хлеба, 100 рублей оставила"))).toBeNull();
    expect(parseBankNotification(note("Банк", "Покупка в магазине"))).toBeNull();
  });

  it("одно и то же уведомление — один ключ, другое — другой", () => {
    const a = parseBankNotification(note("Покупка 450 ₽", "Пятёрочка"));
    const b = parseBankNotification(note("Покупка 450 ₽", "Пятёрочка"));
    const c = parseBankNotification({ ...note("Покупка 450 ₽", "Пятёрочка"), at: at + 60_000 });
    expect(a?.id).toBe(b?.id);
    expect(a?.id).not.toBe(c?.id);
  });
});

describe("предложения из уведомлений", () => {
  const base = parseBankNotification(note("Покупка 450 ₽", "Пятёрочка. Карта *5678"))!;

  it("сливаются по ключу, новые сверху, старше двух недель — забыты", () => {
    const old = { ...base, id: "old", at: at - 20 * 86_400_000 };
    const newer = { ...base, id: "new", at: at + 1000 };
    const merged = mergeSuggestions([base, old], [base, newer], at + 2000);
    expect(merged.map((item) => item.id)).toEqual(["new", base.id]);
  });

  it("уже записанное руками — та же сумма и тип в соседний день", () => {
    expect(alreadyRecorded(base, [{ amount: 450, date: "2026-10-04", type: "EXPENSE" }])).toBe(
      true
    );
    expect(alreadyRecorded(base, [{ amount: 450, date: "2026-10-06", type: "EXPENSE" }])).toBe(
      false
    );
    expect(alreadyRecorded(base, [{ amount: 450, date: "2026-10-03", type: "INCOME" }])).toBe(
      false
    );
  });

  it("счёт — по цифрам карты, категория — по прошлым операциям; не нашли — null", () => {
    const refs = {
      accounts: [
        { id: "a1", name: "Наличные" },
        { id: "a2", name: "Т-Банк 5678" }
      ],
      categories: [
        { id: "food", kind: "EXPENSE" },
        { id: "salary", kind: "INCOME" }
      ],
      rules: [],
      history: [
        { description: "Пятёрочка", type: "EXPENSE" as const, category: { id: "food" } },
        { description: "Пятёрочка у дома", type: "EXPENSE" as const, category: { id: "food" } }
      ],
      lastAccount: "a1"
    };
    expect(resolveTarget(base, refs)).toEqual({ accountId: "a2", categoryId: "food" });
    const unknown = { ...base, merchant: "Совсем новое место", card: null };
    expect(resolveTarget(unknown, refs)).toEqual({ accountId: "a1", categoryId: null });
  });
});
