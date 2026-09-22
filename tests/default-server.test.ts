import { describe, expect, it } from "vitest";

import { DEFAULT_SERVER, hasDefaultServer, isDefaultServer } from "@/lib/sync/default-server";

// Адрес службы по умолчанию — это обещание «скачал и работает», выполненное
// буквально. Без него первый вопрос человеку, собравшемуся связать телефон с
// компьютером, — «адрес вашей службы», а слова этого он не знает.

describe("служба по умолчанию", () => {
  it("есть, и это адрес, а не заглушка", () => {
    expect(hasDefaultServer()).toBe(true);
    expect(DEFAULT_SERVER).toMatch(/^https:\/\/[^/]+$/);
  });

  it("без косой черты на конце", () => {
    // Иначе `${base}/health` превратится в `//health`, и служба ответит 404 —
    // а выглядеть это будет как «службы нет», то есть чинить пойдут не там.
    expect(DEFAULT_SERVER.endsWith("/")).toBe(false);
  });

  it("узнаётся, как его ни напиши", () => {
    expect(isDefaultServer(DEFAULT_SERVER)).toBe(true);
    expect(isDefaultServer(`${DEFAULT_SERVER}/`)).toBe(true);
    expect(isDefaultServer(`  ${DEFAULT_SERVER}  `)).toBe(true);
  });

  it("чужой адрес своим не считается", () => {
    expect(isDefaultServer("https://finance.example.org")).toBe(false);
  });

  it("пустой адрес не «совпадает» с пустым умолчанием", () => {
    // Западня та же, что у пустой приставки первого человека: сравнение двух
    // пустот вернуло бы true, и приложение назвало бы своей службой ничто.
    // Ловится она тем же — отдельной проверкой на пустоту.
    expect(isDefaultServer("")).toBe(false);
    expect(isDefaultServer("   ")).toBe(false);
  });
});
