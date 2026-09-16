"use client";

// Учётная запись на своём сервере: завести по приглашению, войти, выйти.
//
// ЧТО УХОДИТ НА СЕРВЕР. Секрет входа — отдельная ветвь от того же пароля, и
// обратно к ключу, которым завёрнута книга, из него хода нет (см.
// lib/sync/vault-crypto). Пароль не уходит никогда и никуда.
//
// ЗАЧЕМ НА СЕРВЕРЕ ЛЕЖИТ ШКАТУЛКА. Второму устройству её взять больше негде:
// на нём ещё ничего нет. Лежит она запертой — внутри ключ книги, завёрнутый
// паролем и кодом восстановления, — и сервер её не открывает, потому что нечем.
// Так человек, поставивший приложение на новый телефон, вводит имя и пароль и
// получает свою книгу целиком; без этого пришлось бы переносить файлы руками.
//
// ГДЕ ЛЕЖИТ БИЛЕТ. На устройстве, в том же хранилище, что и всё остальное, но
// среди тех ключей, которые не уезжают на сервер. Отправлять билет на сервер
// было бы забавно: он от этого же сервера и получен.

import { LOCAL_ONLY_KEYS } from "@/lib/storage/SyncingStorageAdapter";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { ServerRefused } from "@/lib/sync/HttpSyncTransport";
import { shellFetch } from "@/lib/sync/shell-fetch";
import { authSecret, type Vault } from "@/lib/sync/vault-crypto";

/** Где лежит запись о сервере. Это же имя стоит в LOCAL_ONLY_KEYS. */
export const SERVER_KEY = "financeServer";

export type ServerLink = {
  v: 1;
  /** Корень службы. */
  base: string;
  login: string;
  token: string;
  /** Как это устройство названо в списке устройств. */
  device: string;
};

/** Что служба рассказывает о пароле ДО входа: соль и число прогонов. */
type AuthParams = { kdf: string; iterations: number; salt: string };

function root(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

async function ask(
  base: string,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; data: Record<string, unknown> }> {
  // Через тот же выбор транспорта, что и синхронизация, и по той же причине:
  // адрес службы человек называет сам, а политика безопасности собранного
  // приложения знает только адреса, зашитые в сборку. Обычный fetch вкладки
  // сюда не доходит — а это вход и регистрация, то есть самый первый шаг.
  // Останься здесь fetch, чинить провод было бы незачем: до провода дело бы не
  // дошло вовсе.
  let response: Response;
  try {
    response = await shellFetch(`${root(base)}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch {
    // До службы не дошли вовсе: не то имя, не поднялась, нет сети. Текст, что
    // бросает сюда нижний слой, человеку не говорит ничего — он про разрешение
    // имён и сокеты. А это ПЕРВОЕ, что человек видит, настраивая свой сервер, и
    // по этой строке он решает, что чинить.
    throw new ServerRefused(0, `Не удалось связаться со службой по адресу ${root(base)}.`);
  }

  const text = await response.text();

  // Ответ не JSON — почти всегда это посредник, а не служба: страница 502 от
  // Caddy, заглушка хостинга, чужой сайт по опечатке в адресе. Разбери мы её
  // как JSON, человек увидел бы «Unexpected token '<'» и не понял бы, что
  // виноват адрес или проксирование.
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ServerRefused(
        response.status,
        `По адресу ${root(base)} отвечает не служба (код ${response.status}). ` +
          "Проверьте адрес и проксирование в Caddy."
      );
    }
  }

  return { status: response.status, data };
}

function refuse(status: number, data: Record<string, unknown>, fallback: string): never {
  throw new ServerRefused(status, String(data.error ?? fallback));
}

/**
 * Собирает шкатулку-заготовку с солью и числом прогонов, которые назвала
 * служба, — этого хватает, чтобы вывести секрет входа.
 *
 * Полная шкатулка приедет после успешного входа; до него сервер её не отдаёт, и
 * правильно делает.
 */
function stub(params: AuthParams): Vault {
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: params.iterations,
    password: { salt: params.salt, iv: "", wrapped: "" },
    recovery: { salt: "", iv: "", wrapped: "" }
  };
}

export class ServerAccount {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async link(): Promise<ServerLink | null> {
    const stored = await this.storage.getItem<ServerLink>(SERVER_KEY);
    return stored?.v === 1 ? stored : null;
  }

  /**
   * Завести запись по приглашению. Шкатулка отправляется как есть — та самая,
   * что уже лежит на этом устройстве.
   */
  async register(input: {
    base: string;
    code: string;
    login: string;
    password: string;
    vault: Vault;
    device: string;
  }): Promise<void> {
    const secret = await authSecret(input.vault, input.password);
    const { status, data } = await ask(input.base, "/auth/register", {
      method: "POST",
      body: { code: input.code, login: input.login, vault: input.vault, secret }
    });
    if (status !== 201) refuse(status, data, "Не удалось завести запись.");

    await this.signIn(input);
  }

  /**
   * Войти. Возвращает шкатулку, полученную от службы, — ту самую, которой на
   * новом устройстве взяться больше неоткуда.
   */
  async signIn(input: {
    base: string;
    login: string;
    password: string;
    device: string;
  }): Promise<{ vault: Vault }> {
    const params = await ask(input.base, `/auth/params?login=${encodeURIComponent(input.login)}`);
    if (params.status !== 200) refuse(params.status, params.data, "Не подходит имя или пароль.");

    const secret = await authSecret(stub(params.data as unknown as AuthParams), input.password);
    const entered = await ask(input.base, "/auth/login", {
      method: "POST",
      body: { login: input.login, secret, device: input.device }
    });
    if (entered.status !== 200) refuse(entered.status, entered.data, "Не подходит имя или пароль.");

    const token = String(entered.data.token ?? "");
    if (!token) refuse(entered.status, entered.data, "Служба не выдала билет.");

    await this.storage.setItem<ServerLink>(SERVER_KEY, {
      v: 1,
      base: root(input.base),
      login: input.login,
      token,
      device: input.device
    });

    return { vault: entered.data.vault as Vault };
  }

  /**
   * Выйти: погасить билет на службе и забыть его здесь.
   *
   * Книга при этом остаётся на устройстве целиком — выход из учётной записи не
   * имеет никакого отношения к тому, что человек записал. Спутай мы это, выход
   * ради «подключусь другим именем» стирал бы данные.
   */
  async signOut(): Promise<void> {
    const link = await this.link();
    if (link) {
      try {
        await ask(link.base, "/auth/logout", { method: "POST", token: link.token });
      } catch {
        // Не дозвонились — билет всё равно забываем здесь. Он протухнет сам.
      }
    }
    await this.storage.removeItem(SERVER_KEY);
  }
}

// Имя ключа записано в двух местах — здесь и в списке «не уезжает». Разойдись
// они, билет от сервера поехал бы на этот же сервер, и никто бы не заметил.
if (!LOCAL_ONLY_KEYS.includes(SERVER_KEY)) {
  throw new Error("Запись о сервере не отмечена как остающаяся на устройстве.");
}
