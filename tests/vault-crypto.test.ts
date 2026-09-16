import { describe, expect, it } from "vitest";

import { fromBase64, toBase64 } from "@/lib/sync/bytes";
import { RECOVERY_WORDS } from "@/lib/sync/recovery-words";
import {
  authSecret,
  changePassword,
  createVault,
  generateRecoveryCode,
  normalizeRecoveryCode,
  openBook,
  resetPasswordWithRecoveryCode,
  sealBook,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type Vault
} from "@/lib/sync/vault-crypto";

// PBKDF2 нарочно медленный — в бою 600 000 прогонов. Гонять это по тридцать раз
// в проверках незачем: проверяется устройство замков, а не цена подбора, и
// число прогонов шкатулка носит в себе (что само по себе проверено ниже).
const FAST = { iterations: 1 };

describe("словарь кода восстановления", () => {
  it("ровно 1024 слова — десять бит на слово, без приведения по модулю", () => {
    expect(RECOVERY_WORDS).toHaveLength(1024);
  });

  it("все слова разные", () => {
    expect(new Set(RECOVERY_WORDS).size).toBe(RECOVERY_WORDS.length);
  });

  it("слова различимы по первым четырём буквам", () => {
    // На этом держится приём кода по началу слова: недописанное слово обязано
    // узнаваться однозначно.
    expect(new Set(RECOVERY_WORDS.map((word) => word.slice(0, 4))).size).toBe(
      RECOVERY_WORDS.length
    );
  });

  it("ни одного слова с «ё» и ничего, кроме строчной кириллицы", () => {
    // «ё» пишут то с точками, то без — один код превратился бы в два разных.
    const wrong = RECOVERY_WORDS.filter((word) => !/^[а-я]+$/.test(word) || word.includes("ё"));
    expect(wrong).toEqual([]);
  });

  it("длина слов от четырёх до восьми букв", () => {
    const wrong = RECOVERY_WORDS.filter((word) => word.length < 4 || word.length > 8);
    expect(wrong).toEqual([]);
  });
});

describe("код восстановления", () => {
  it("двенадцать слов, и все — из словаря", () => {
    const words = generateRecoveryCode().split(" ");
    expect(words).toHaveLength(12);
    for (const word of words) expect(RECOVERY_WORDS).toContain(word);
  });

  it("два подряд не совпадают", () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });

  it("прощает регистр, лишние пробелы и знаки между словами", () => {
    const code = generateRecoveryCode();
    const mangled = code.toUpperCase().split(" ").join(",  \n ");
    expect(normalizeRecoveryCode(mangled)).toBe(code);
  });

  it("узнаёт слово по первым четырём буквам", () => {
    const code = generateRecoveryCode();
    const shortened = code
      .split(" ")
      .map((word) => word.slice(0, 4))
      .join(" ");
    expect(normalizeRecoveryCode(shortened)).toBe(code);
  });

  it("называет слово, которого нет в словаре, а не ругается на весь код", () => {
    const code = generateRecoveryCode().split(" ");
    code[5] = "квазар";
    expect(() => normalizeRecoveryCode(code.join(" "))).toThrow(/квазар/);
  });

  it("считает слова: одиннадцать — это не код", () => {
    const eleven = generateRecoveryCode().split(" ").slice(0, 11).join(" ");
    expect(() => normalizeRecoveryCode(eleven)).toThrow(/12 слов/);
  });
});

describe("два замка на ключе книги", () => {
  it("книга открывается паролем", async () => {
    const { vault } = await createVault("моя книга", FAST);
    const key = await unlockWithPassword(vault, "моя книга");
    expect(await openBook(await sealBook("привет", key), key)).toBe("привет");
  });

  it("та же книга открывается кодом восстановления — ключ один на оба замка", async () => {
    const { vault, recoveryCode } = await createVault("пароль", FAST);
    const byPassword = await unlockWithPassword(vault, "пароль");
    const sealed = await sealBook("итог месяца", byPassword);

    const byCode = await unlockWithRecoveryCode(vault, recoveryCode);
    expect(await openBook(sealed, byCode)).toBe("итог месяца");
  });

  it("неверный пароль не открывает", async () => {
    const { vault } = await createVault("пароль", FAST);
    await expect(unlockWithPassword(vault, "не пароль")).rejects.toThrow(/Не подходит/);
  });

  it("чужой код восстановления не открывает", async () => {
    const { vault } = await createVault("пароль", FAST);
    const stranger = generateRecoveryCode();
    await expect(unlockWithRecoveryCode(vault, stranger)).rejects.toThrow(/Не подходит/);
  });

  it("в шкатулке нет ни пароля, ни кода, ни ключа книги", async () => {
    const { vault, recoveryCode } = await createVault("очень секретный пароль", FAST);
    const text = JSON.stringify(vault);
    expect(text).not.toContain("очень секретный пароль");
    for (const word of recoveryCode.split(" ")) expect(text).not.toContain(word);
  });

  it("две книги с одним паролем получают разные ключи", async () => {
    // Ключ книги — случайный и свой у каждой книги, а не выведенный из пароля.
    // Иначе двое, выбравшие один пароль, читали бы книги друг друга.
    const a = await createVault("одинаковый", FAST);
    const b = await createVault("одинаковый", FAST);
    expect(a.vault.password.wrapped).not.toBe(b.vault.password.wrapped);

    const sealed = await sealBook("тайна", await unlockWithPassword(a.vault, "одинаковый"));
    const otherKey = await unlockWithPassword(b.vault, "одинаковый");
    await expect(openBook(sealed, otherKey)).rejects.toThrow();
  });
});

// Честно о границах этого блока: «из секрета входа не вывести ключ книги» —
// утверждение криптографическое, и проверкой его не доказать. Опереться оно
// может только на то, что ветви разведены HKDF с разными метками. Проверить
// здесь можно другое, и это не мелочь: что на сервер не уезжает сам пароль,
// что секрет одинаков на всех устройствах и что у двух людей с одинаковым
// паролем он всё-таки разный.
describe("секрет входа", () => {
  it("на любом устройстве выходит одинаковым — иначе войти со второго нельзя", async () => {
    const { vault } = await createVault("пароль", FAST);
    expect(await authSecret(vault, "пароль")).toBe(await authSecret(vault, "пароль"));
  });

  it("от другого пароля — другой", async () => {
    const { vault } = await createVault("пароль", FAST);
    expect(await authSecret(vault, "пароль")).not.toBe(await authSecret(vault, "не пароль"));
  });

  it("это не пароль — ни целиком, ни куском", async () => {
    // Ошибка, ради которой всё и разводилось: отправить на сервер сам пароль.
    const password = "очень секретный пароль";
    const { vault } = await createVault(password, FAST);
    const secret = await authSecret(vault, password);
    expect(secret).not.toContain(password);
    expect(Buffer.from(secret, "base64").toString("utf8")).not.toContain(password);
  });

  it("у двух книг с одним паролем секреты входа разные", async () => {
    // Соли разные — значит, по базе сервера нельзя увидеть, что двое выбрали
    // один и тот же пароль, и подобрать его сразу обоим.
    const a = await createVault("одинаковый", FAST);
    const b = await createVault("одинаковый", FAST);
    expect(await authSecret(a.vault, "одинаковый")).not.toBe(
      await authSecret(b.vault, "одинаковый")
    );
  });

  it("сам по себе шкатулку не открывает", async () => {
    const { vault } = await createVault("пароль", FAST);
    const secret = await authSecret(vault, "пароль");
    await expect(unlockWithPassword(vault, secret)).rejects.toThrow(/Не подходит/);
  });
});

describe("смена пароля", () => {
  it("книгу не трогает — старые записи читаются новым паролем", async () => {
    const { vault, bookKey } = await createVault("старый", FAST);
    const sealed = await sealBook("записано при старом пароле", bookKey);

    const changed = await changePassword(vault, "старый", "новый");
    const key = await unlockWithPassword(changed, "новый");
    expect(await openBook(sealed, key)).toBe("записано при старом пароле");
  });

  it("переупаковывает только ключ: замок кода восстановления не шевельнулся", async () => {
    const { vault, recoveryCode } = await createVault("старый", FAST);
    const changed = await changePassword(vault, "старый", "новый");

    expect(changed.recovery).toEqual(vault.recovery);
    expect(changed.password.wrapped).not.toBe(vault.password.wrapped);
    // Выданные на бумаге слова обязаны работать и после смены пароля.
    await expect(unlockWithRecoveryCode(changed, recoveryCode)).resolves.toBeDefined();
  });

  it("старый пароль перестаёт подходить", async () => {
    const { vault } = await createVault("старый", FAST);
    const changed = await changePassword(vault, "старый", "новый");
    await expect(unlockWithPassword(changed, "старый")).rejects.toThrow(/Не подходит/);
  });

  it("без старого пароля сменить нельзя", async () => {
    const { vault } = await createVault("старый", FAST);
    await expect(changePassword(vault, "угадал?", "новый")).rejects.toThrow(/Не подходит/);
  });
});

describe("забыли пароль", () => {
  it("код восстановления задаёт новый пароль, книга остаётся читаемой", async () => {
    const { vault, recoveryCode, bookKey } = await createVault("забытый", FAST);
    const sealed = await sealBook("вся книга за три года", bookKey);

    const reset = await resetPasswordWithRecoveryCode(vault, recoveryCode, "новый");
    const key = await unlockWithPassword(reset, "новый");
    expect(await openBook(sealed, key)).toBe("вся книга за три года");
  });

  it("код, переписанный с бумаги как попало, всё равно подходит", async () => {
    const { vault, recoveryCode } = await createVault("забытый", FAST);
    const asWritten = recoveryCode.toUpperCase().split(" ").join("\n");
    await expect(resetPasswordWithRecoveryCode(vault, asWritten, "новый")).resolves.toBeDefined();
  });

  it("потеряны и пароль, и код — книга потеряна, и обходного пути нет", async () => {
    // Не недоделка, а прямое следствие того, что ключа у сервера нет. Проверка
    // стоит здесь, чтобы «лазейку на всякий случай» нельзя было добавить молча.
    const { vault } = await createVault("забытый", FAST);
    await expect(unlockWithPassword(vault, "не помню")).rejects.toThrow();
    await expect(unlockWithRecoveryCode(vault, generateRecoveryCode())).rejects.toThrow();
  });
});

describe("шифрование самой книги", () => {
  it("шифротекст не содержит исходного текста", async () => {
    const { bookKey } = await createVault("пароль", FAST);
    const sealed = await sealBook(
      JSON.stringify({ счёт: "накопительный", сумма: 123456 }),
      bookKey
    );
    expect(JSON.stringify(sealed)).not.toContain("накопительный");
    expect(JSON.stringify(sealed)).not.toContain("123456");
  });

  it("каждая запись со своим вектором — одна и та же книга шифруется по-разному", async () => {
    // Повторный вектор на одном ключе в AES-GCM ломает шифр целиком, а не
    // «немного»: по двум записям с общим вектором восстанавливается открытый текст.
    const { bookKey } = await createVault("пароль", FAST);
    const first = await sealBook("одно и то же", bookKey);
    const second = await sealBook("одно и то же", bookKey);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ct).not.toBe(second.ct);
  });

  it("подменённый байт книги не проходит", async () => {
    const { bookKey } = await createVault("пароль", FAST);
    const sealed = await sealBook("итог месяца: 10000", bookKey);

    // Бит переворачивается в самих байтах, а не в букве base64. Подмена буквы
    // иногда попадает в добивку в конце записи и не меняет ни одного байта —
    // тогда книга открывается как ни в чём не бывало, и проверка краснеет через
    // раз. Ошибка была в проверке, а не в шифровании.
    const bytes = fromBase64(sealed.ct);
    bytes[0] ^= 0x01;
    const flipped = { ...sealed, ct: toBase64(bytes) };

    await expect(openBook(flipped, bookKey)).rejects.toThrow(/не удалось прочитать/);
  });

  it("пришедшее не пойми в каком виде отвергается прямо", async () => {
    const { bookKey } = await createVault("пароль", FAST);
    await expect(openBook({ v: 1 } as never, bookKey)).rejects.toThrow(/в неизвестном виде/);
  });
});

describe("число прогонов", () => {
  it("берётся из шкатулки, а не из сегодняшней постоянной", async () => {
    // Иначе, подняв постоянную, мы заперли бы всех, кто зарегистрировался раньше.
    const { vault } = await createVault("пароль", { iterations: 3 });
    expect(vault.iterations).toBe(3);
    await expect(unlockWithPassword(vault, "пароль")).resolves.toBeDefined();
  });

  it("испорченное число не роняет открытие", async () => {
    const { vault } = await createVault("пароль", FAST);
    const broken = { ...vault, iterations: 0 } as Vault;
    // Подставится сегодняшняя постоянная — и не подойдёт, но ошибкой будет
    // «не подходит», а не падение на нуле прогонов.
    await expect(unlockWithPassword(broken, "пароль")).rejects.toThrow(/Не подходит/);
  });
});
