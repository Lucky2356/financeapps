// @vitest-environment jsdom
//
// Окружение здесь не деталь: выбор транспорта смотрит в window, и в Node
// его нет вовсе — проверка молча считала бы, что Tauri не запущен, и
// проходила бы, ничего не проверяя.

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { forgetShellFetchChoice, shellFetch } from "@/lib/sync/shell-fetch";

// Чем приложение ходит до ЧУЖОГО сервера.
//
// Проверка сторожит ошибку, которой в проверках не видно вовсе: собранное
// приложение живёт под политикой безопасности, где перечислено, куда вкладке
// можно ходить, а адрес своей службы человек называет во время работы — то есть
// в перечне его нет и быть не может. Обычный fetch вкладки до такой службы не
// доходит: WebView гасит запрос молча, и снаружи это выглядит как «нет связи».
//
// Ни vitest, ни Playwright политику собранного приложения не применяют, поэтому
// поймать это можно только здесь — сторожа за тем, ЧЕМ делается запрос.

const tauriFetch = vi.fn(async () => new Response("через Rust"));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetch }));

function pretendTauri(on: boolean) {
  const shell = window as unknown as Record<string, unknown>;
  if (on) shell.__TAURI_INTERNALS__ = {};
  else delete shell.__TAURI_INTERNALS__;
}

afterEach(() => {
  forgetShellFetchChoice();
  pretendTauri(false);
  tauriFetch.mockClear();
  vi.unstubAllGlobals();
});

describe("чем ходит синхронизация", () => {
  it("в собранном приложении — мимо вкладки, через Rust", async () => {
    // Вот ради чего всё: запрос вкладки до чужого домена не дошёл бы вовсе.
    const pageFetch = vi.fn(async () => new Response("через вкладку"));
    vi.stubGlobal("fetch", pageFetch);
    pretendTauri(true);

    const answer = await shellFetch("https://finance.чей-то-домен.ru/health");

    expect(await answer.text()).toBe("через Rust");
    expect(tauriFetch).toHaveBeenCalledOnce();
    expect(pageFetch, "запрос ушёл через вкладку — политика его погасит").not.toHaveBeenCalled();
  });

  it("в браузере — обычным fetch, без всякого Tauri", async () => {
    // Тот же код гоняется в проверках и в `npm run dev`, где плагина нет.
    const pageFetch = vi.fn(async () => new Response("через вкладку"));
    vi.stubGlobal("fetch", pageFetch);

    const answer = await shellFetch("https://finance.чей-то-домен.ru/health");

    expect(await answer.text()).toBe("через вкладку");
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it("выбор делается один раз, а не на каждый запрос", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("через вкладку"))
    );
    pretendTauri(true);

    await shellFetch("https://finance.чей-то-домен.ru/health");
    await shellFetch("https://finance.чей-то-домен.ru/vault");
    await shellFetch("https://finance.чей-то-домен.ru/events");

    expect(tauriFetch).toHaveBeenCalledTimes(3);
  });

  it("заголовки и тело доезжают до плагина как есть", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(""))
    );
    pretendTauri(true);

    await shellFetch("https://finance.чей-то-домен.ru/vault/книга", {
      method: "PUT",
      headers: { authorization: "Bearer билет" },
      body: '{"baseVersion":3}'
    });

    expect(tauriFetch).toHaveBeenCalledWith(
      "https://finance.чей-то-домен.ru/vault/книга",
      expect.objectContaining({
        method: "PUT",
        headers: { authorization: "Bearer билет" },
        body: '{"baseVersion":3}'
      })
    );
  });
});

// Сторож на уровне исходников. Поломка, ради которой всё это заведено, не видна
// ни одной обычной проверке: обычный fetch в проверках работает прекрасно и
// краснеть ему не с чего. Увидеть её можно только так — посмотрев, ЧЕМ написан
// запрос в тех файлах, которые ходят к чужому серверу.
//
// Проверено на себе: провод я починил, а вход и регистрацию — забыл. Обе части
// нужны, и забытая половина выглядела бы как полностью сделанная работа.
describe("сторож: к чужому серверу ходят только через выбор транспорта", () => {
  const talkToServer = ["lib/sync/HttpSyncTransport.ts", "lib/vault/server-account.ts"];

  for (const file of talkToServer) {
    it(`${file} не зовёт fetch напрямую`, () => {
      const source = readFileSync(file, "utf8")
        // Комментарии не в счёт: в них про fetch как раз и объясняется.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      const bare = [...source.matchAll(/(?<![.\w])fetch\s*\(/g)];

      expect(
        bare.length,
        `${file}: запрос вкладки до чужого домена не дойдёт — политика безопасности ` +
          "собранного приложения его погасит. Через shellFetch из lib/sync/shell-fetch.ts."
      ).toBe(0);
    });
  }
});
