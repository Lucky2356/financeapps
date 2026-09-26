import { describe, expect, it } from "vitest";

import { makePairingLink, readPairing, tidyCode } from "@/lib/sync/pairing-link";

// Разборщик здесь ОДИН на оба пути — камеру и клавиатуру. Заведи мы два, они
// однажды разойдутся молча: набранное руками работает, снятое камерой нет, а
// выглядит это как «камера не читает».

describe("что лежит в картинке связки", () => {
  it("ссылка складывается и разбирается обратно", () => {
    const link = makePairingLink("https://finance.example.org", "ABCD2345");
    expect(readPairing(link)).toEqual({
      base: "https://finance.example.org",
      code: "ABCD2345",
      key: null
    });
  });

  it("косая черта на конце адреса не создаёт второй службы", () => {
    const link = makePairingLink("https://finance.example.org/", "ABCD2345");
    expect(readPairing(link)?.base).toBe("https://finance.example.org");
  });

  it("восемь знаков с клавиатуры понимаются так же, как картинка", () => {
    // Тот же разборщик: человек либо наводит камеру, либо набирает.
    expect(readPairing("abcd-2345")).toEqual({ base: null, code: "ABCD2345", key: null });
    expect(readPairing("  ABCD2345  ")).toEqual({ base: null, code: "ABCD2345", key: null });
  });

  it("пароля в ссылке нет — и положить его туда нечем", () => {
    // Сторож на решение владельца. Картинку снимают из-за плеча и пересылают;
    // пароль — единственное, чем завёрнут ключ от данных. Ключ от пакета
    // связки — не пароль: он открывает один пакет, один раз и пять минут.
    const link = makePairingLink("https://finance.example.org", "ABCD2345");
    expect(link).not.toMatch(/pass|pwd|secret|пароль/i);
    expect(Object.keys(readPairing(link) ?? {}).sort()).toEqual(["base", "code", "key"]);
  });

  it("ключ пакета едет в ссылке и читается обратно, чужой вид — отвергается", () => {
    const key = "A".repeat(43);
    const link = makePairingLink("https://finance.example.org", "ABCD2345", key);
    expect(readPairing(link)?.key).toBe(key);
    expect(readPairing(link.replace(key, "короткий"))).toBeNull();
  });

  it("адрес по http отвергается целиком", () => {
    // Подсунутая картинка с http увела бы и код, и выведенный из пароля
    // секрет входа открытым текстом.
    const evil = "financeapps://pair?s=http%3A%2F%2Fзлодей.example&c=ABCD2345";
    expect(readPairing(evil)).toBeNull();
  });

  it("чужой QR не принимается за свой", () => {
    expect(readPairing("https://example.com/реклама")).toBeNull();
    expect(readPairing("просто текст")).toBeNull();
    expect(readPairing("")).toBeNull();
    expect(readPairing("financeapps://что-то-другое?c=ABCD2345")).toBeNull();
  });

  it("испорченный код не проходит, даже если ссылка своя", () => {
    // Ноль и буква О в алфавит не входят нарочно: их путает глаз. Пропусти мы
    // их здесь, человек получил бы «код не найден» вместо «это не тот код».
    expect(readPairing("financeapps://pair?s=https%3A%2F%2Fa.org&c=ABCD234")).toBeNull();
    expect(readPairing("financeapps://pair?s=https%3A%2F%2Fa.org&c=ABCD01IL")).toBeNull();
  });

  it("код без адреса — законный случай", () => {
    // Так выглядит набранное руками: адрес приложение возьмёт тот, что знает.
    expect(readPairing("financeapps://pair?c=ABCD2345")).toEqual({
      base: null,
      code: "ABCD2345",
      key: null
    });
  });

  it("приведение кода повторяет то, что делает служба", () => {
    expect(tidyCode("abcd-2345 ")).toBe("ABCD2345");
  });
});
