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
import { authSecret, unlockWithPassword, type Vault } from "@/lib/sync/vault-crypto";

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

/** Одно устройство в списке «мои устройства». */
export type LinkedDevice = {
  id: string;
  name: string;
  /** Когда служба видела его последний раз, ISO. */
  last_seen_at: string;
};

/** Код связки, выданный первым устройством. */
export type PairingCode = { code: string; expiresAt: string };

/** Что код связки рассказывает второму устройству. Пароля здесь нет. */
export type PairingAnswer = { base: string; login: string };

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

/**
 * Что служба рассказывает о себе до всякого входа.
 *
 * Ровно одно поле — открыта ли запись. Нужно оно затем, чтобы не спрашивать у
 * человека приглашение там, где оно не нужно, и не молчать о нём там, где оно
 * обязательно. Спросить это можно только ДО входа, ничего не предъявив, — то
 * есть только так.
 *
 * Не ответила или ответила не службой — считаем запись закрытой. Умолчание
 * здесь то же, что и на самой службе, и по той же причине: лишнее поле,
 * которое человек оставит пустым, стоит ему одной попытки; спрятанное поле,
 * без которого не пускают, стоит ему всего подключения.
 */
export async function probeServer(base: string): Promise<{ open: boolean; reachable: boolean }> {
  try {
    const { status, data } = await ask(base, "/health");
    if (status !== 200) return { open: false, reachable: false };
    return { open: data.open === true, reachable: true };
  } catch {
    return { open: false, reachable: false };
  }
}

/**
 * Предъявить код связки. Зовётся на ВТОРОМ устройстве, где ещё ничего нет.
 *
 * Возвращает адрес, который назвала сама служба, а если она его не называла —
 * тот, по которому её и спросили. Разница появляется у службы, доступной под
 * несколькими именами: правым тогда будет то, которым она зовёт себя сама.
 */
export async function redeemPairing(base: string, code: string): Promise<PairingAnswer> {
  const { status, data } = await ask(base, `/pairing/${encodeURIComponent(code.trim())}`);
  if (status !== 200) refuse(status, data, "Код не подошёл.");

  const login = String(data.login ?? "");
  if (!login) refuse(status, data, "Служба не назвала имени входа по этому коду.");

  const named = typeof data.address === "string" ? data.address.trim() : "";
  return { base: root(named || base), login };
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
    // Шкатулка обязана открываться этим паролем — иначе вход по нему пройдёт, а
    // данные на втором устройстве не откроются никогда. Так и было у того, кто
    // начинал «без пароля»: его шкатулка завёрнута случайным паролем, и
    // отправлялась она на службу вместе с секретом от пароля совсем другого.
    try {
      await unlockWithPassword(input.vault, input.password);
    } catch {
      throw new Error(
        "Пароль не подходит к данным на этом устройстве. Введите тот, которым они открываются."
      );
    }
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
    if (!token)
      refuse(entered.status, entered.data, "Служба не пустила внутрь: не ответила на вход.");

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
   * Попросить код связки для второго устройства.
   *
   * Живёт пять минут и срабатывает один раз — служба следит за этим сама;
   * здесь только просят и показывают.
   */
  async issuePairing(): Promise<PairingCode> {
    const link = await this.need();
    const { status, data } = await ask(link.base, "/pairing", {
      method: "POST",
      token: link.token
    });
    if (status !== 201) refuse(status, data, "Служба не выдала кода связки.");
    return { code: String(data.code ?? ""), expiresAt: String(data.expiresAt ?? "") };
  }

  /** Мои устройства и то, которое спрашивает. */
  async devices(): Promise<{ devices: LinkedDevice[]; current: string | null }> {
    const link = await this.need();
    const { status, data } = await ask(link.base, "/devices", { token: link.token });
    if (status !== 200) refuse(status, data, "Служба не отдала список устройств.");
    return {
      devices: (data.devices ?? []) as LinkedDevice[],
      current: (data.current as string | null) ?? null
    };
  }

  /** Переименовать своё устройство: два «Компьютер (Windows)» неотличимы. */
  async renameDevice(id: string, name: string): Promise<void> {
    const link = await this.need();
    const { status, data } = await ask(link.base, `/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      token: link.token,
      body: { name }
    });
    if (status !== 204) refuse(status, data, "Не удалось переименовать устройство.");
  }

  /**
   * Выкинуть устройство — вместе с его билетом.
   *
   * ЭТО НЕ СТИРАЕТ ДАННЫХ. Ни на службе, ни на выкинутом устройстве: там книга
   * остаётся целиком, просто перестаёт ездить. Ради потерянного телефона это
   * то, что нужно, — а тому, кто рассчитывал стереть данные с потерянного, об
   * этом надо сказать вслух, и экран это делает.
   */
  async forgetDevice(id: string): Promise<void> {
    const link = await this.need();
    const { status, data } = await ask(link.base, `/devices/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: link.token
    });
    if (status !== 204) refuse(status, data, "Не удалось выкинуть устройство.");
  }

  /** Запись о службе — или внятный отказ вместо «cannot read property of null». */
  private async need(): Promise<ServerLink> {
    const link = await this.link();
    if (!link) throw new ServerRefused(0, "Это устройство не подключено к службе.");
    return link;
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
