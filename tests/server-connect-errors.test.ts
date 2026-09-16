// @vitest-environment jsdom
//
// Окружение с window нужно потому, что выбор транспорта смотрит в него.

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { forgetShellFetchChoice } from "@/lib/sync/shell-fetch";
import { ServerAccount } from "@/lib/vault/server-account";

// Что человек видит, когда подключение к своей службе не удалось.
//
// Это не украшение. Настраивая свой сервер, человек проходит через домен, TLS,
// юнит systemd и проксирование в Caddy — и на первой попытке что-нибудь из
// этого обязательно окажется не так. Сообщение в этот момент — единственное,
// по чему он решает, что чинить.
//
// Два случая, которые встречаются чаще всего, и оба до этой правки выглядели
// одинаково бессмысленно.

const ADDRESS = "https://finance.пример.ru";

afterEach(() => {
  forgetShellFetchChoice();
  vi.unstubAllGlobals();
});

function account() {
  return new ServerAccount(new MemoryStorageAdapter());
}

describe("подключение к своей службе не удалось", () => {
  it("до службы не дошли — сказано про адрес, а не про сокеты", async () => {
    // Так выглядит неверное имя, не поднятая служба или отсутствие сети: нижний
    // слой бросает что-то своё, про разрешение имён и соединения.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("error sending request for url: dns error");
      })
    );

    await expect(
      account().signIn({ base: ADDRESS, login: "петя", password: "пароль", device: "ПК" })
    ).rejects.toThrow(/Не удалось связаться со службой/);

    await expect(
      account().signIn({ base: ADDRESS, login: "петя", password: "пароль", device: "ПК" })
    ).rejects.toThrow(/finance\.пример\.ru/);
  });

  it("ответила не служба — сказано про адрес и проксирование, а не «Unexpected token»", async () => {
    // Самый частый случай первой настройки: Caddy отвечает своей страницей 502,
    // потому что до службы он не дотянулся. Раньше её пытались разобрать как
    // JSON, и человек получал «Unexpected token '<'» — сообщение, по которому
    // невозможно догадаться, что виновато проксирование.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html><body>502 Bad Gateway</body></html>", {
            status: 502,
            headers: { "content-type": "text/html" }
          })
      )
    );

    const failure = account().signIn({
      base: ADDRESS,
      login: "петя",
      password: "пароль",
      device: "ПК"
    });

    await expect(failure).rejects.toThrow(/отвечает не служба/);
    await expect(failure).rejects.not.toThrow(/Unexpected token/);
  });

  it("служба ответила отказом — её собственные слова, а не наши", async () => {
    // Когда отвечает настоящая служба, объяснение у неё уже есть, и подменять
    // его своим было бы хуже: она знает про свой отказ больше.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Приглашение уже использовано." }), {
            status: 400,
            headers: { "content-type": "application/json" }
          })
      )
    );

    await expect(
      account().signIn({ base: ADDRESS, login: "петя", password: "пароль", device: "ПК" })
    ).rejects.toThrow(/Приглашение уже использовано/);
  });
});
