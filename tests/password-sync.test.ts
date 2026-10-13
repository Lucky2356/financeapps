import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { unlockWithPassword } from "@/lib/sync/vault-crypto";
import { AccountService } from "@/lib/vault/account";
import { PasswordSync } from "@/lib/vault/password-sync";
import {
  ServerAccount,
  SERVER_KEY,
  type ServerLink,
  type VaultPush
} from "@/lib/vault/server-account";
import { createApp, type App } from "../server/src/main.ts";

// Смена пароля доезжает до службы — и тогда, когда в момент смены связи нет.
//
// Служба помнит шкатулку и секрет входа со дня регистрации. Пока смена пароля
// не доехала, ПРЕЖНИЙ пароль пускает со свежего устройства и открывает книгу.
// Поэтому смена без связи обязана не потеряться, а уйти при следующей попытке.
// Служба здесь настоящая, а «нет связи» — отказ самого fetch, как в жизни.

const FAST = { iterations: 1 };
const ADMIN = "proverochnyy-propusk";
const OLD = "старый-пароль";
const NEW = "новый-пароль";

let app: App;
let base: string;

beforeEach(async () => {
  app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.stop();
});

async function invite(): Promise<string> {
  const response = await fetch(`${base}/admin/invite`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN}` }
  });
  return ((await response.json()) as { code: string }).code;
}

/** Устройство с паролем, заведшее запись на службе. */
async function owner(login = "петя") {
  const disk = new MemoryStorageAdapter();
  const sealed = new EncryptingStorageAdapter(disk);
  const account = new AccountService(disk, sealed);
  const server = new ServerAccount(disk);
  const reports: VaultPush[] = [];
  const sync = new PasswordSync(account, server, (outcome) => reports.push(outcome));
  const { recoveryCode } = await account.create(OLD, FAST);
  await server.register({
    base,
    code: await invite(),
    login,
    password: OLD,
    vault: (await account.vault())!,
    device: "телефон"
  });
  return { disk, account, server, sync, reports, recoveryCode };
}

/** Войти этим паролем со СВЕЖЕГО устройства — и открыть полученную шкатулку. */
async function freshDeviceOpens(password: string, login = "петя"): Promise<boolean> {
  const stranger = new ServerAccount(new MemoryStorageAdapter());
  try {
    const { vault } = await stranger.signIn({ base, login, password, device: "чужой" });
    await unlockWithPassword(vault, password);
    return true;
  } catch {
    return false;
  }
}

/** Связи нет: fetch не доходит никуда — ровно так он ведёт себя без сети. */
function goOffline() {
  return vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
}

describe("смена пароля доезжает до службы", () => {
  it("со связью — сразу: прежний пароль больше не открывает книгу со свежего устройства", async () => {
    const me = await owner();
    expect(await freshDeviceOpens(OLD)).toBe(true);

    expect(await me.sync.changePassword(OLD, NEW)).toEqual({ kind: "sent" });

    expect(await freshDeviceOpens(OLD)).toBe(false);
    expect(await freshDeviceOpens(NEW)).toBe(true);
    expect(await me.server.hasPendingVault()).toBe(false);
  });

  it("без связи — запоминается и уходит при следующей попытке", async () => {
    const me = await owner();

    const offline = goOffline();
    expect(await me.sync.changePassword(OLD, NEW)).toEqual({ kind: "offline" });
    // Ещё одна попытка без связи (запуск в метро) — отправка не теряется.
    expect(await me.sync.push()).toEqual({ kind: "offline" });
    offline.mockRestore();

    // У себя пароль уже новый; на службе — пока прежний, и это надо помнить.
    expect(await me.account.checkPassword(NEW)).toBe(true);
    expect(await me.server.hasPendingVault()).toBe(true);
    expect(await freshDeviceOpens(OLD)).toBe(true);

    // Связь вернулась: запуск или сверка зовут push().
    expect(await me.sync.push()).toEqual({ kind: "sent" });
    expect(await me.server.hasPendingVault()).toBe(false);
    expect(await freshDeviceOpens(OLD)).toBe(false);
    expect(await freshDeviceOpens(NEW)).toBe(true);
    // Повторно отправлять нечего.
    expect(await me.sync.push()).toEqual({ kind: "idle" });
  });

  it("запомненное переживает перезапуск: лежит на устройстве, а не в памяти", async () => {
    const me = await owner();
    const offline = goOffline();
    await me.sync.changePassword(OLD, NEW);
    offline.mockRestore();

    // «Перезапуск»: новые службы поверх того же диска.
    const sealed = new EncryptingStorageAdapter(me.disk);
    const again = new PasswordSync(new AccountService(me.disk, sealed), new ServerAccount(me.disk));
    expect(await again.push()).toEqual({ kind: "sent" });
    expect(await freshDeviceOpens(NEW)).toBe(true);
  });

  it("сброс кодом восстановления без связи — тоже уходит потом", async () => {
    const me = await owner();
    const offline = goOffline();
    await me.sync.resetPassword(me.recoveryCode, NEW);
    offline.mockRestore();

    // Прежнего пароля при сбросе никто не знает — доказательство другое.
    const link = await me.disk.getItem<ServerLink>(SERVER_KEY);
    expect(link?.pendingVault?.currentSecret).toBeUndefined();

    expect(await me.sync.push()).toEqual({ kind: "sent" });
    expect(await freshDeviceOpens(OLD)).toBe(false);
    expect(await freshDeviceOpens(NEW)).toBe(true);
  });

  it("две смены без связи — уходит последняя, прежние не пускают", async () => {
    const me = await owner();
    const offline = goOffline();
    await me.sync.changePassword(OLD, "промежуточный");
    await me.sync.changePassword("промежуточный", NEW);
    offline.mockRestore();

    expect(await me.sync.push()).toEqual({ kind: "sent" });
    expect(await freshDeviceOpens(OLD)).toBe(false);
    expect(await freshDeviceOpens("промежуточный")).toBe(false);
    expect(await freshDeviceOpens(NEW)).toBe(true);
  });

  it("старая служба без ручки — отправка ждёт её обновления, а не пропадает", async () => {
    const me = await owner();
    const real = globalThis.fetch;
    const old = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) =>
        String(input).endsWith("/auth/vault")
          ? Promise.resolve(
              new Response(JSON.stringify({ error: "Нет такой ручки." }), { status: 404 })
            )
          : real(input, init)
      );
    expect(await me.sync.changePassword(OLD, NEW)).toEqual({ kind: "outdated" });
    expect(await me.server.hasPendingVault()).toBe(true);
    old.mockRestore();

    expect(await me.sync.push()).toEqual({ kind: "sent" });
    expect(await freshDeviceOpens(NEW)).toBe(true);
  });

  it("исход фоновой отправки доходит до того, кто скажет о нём человеку", async () => {
    const me = await owner();
    const offline = goOffline();
    await me.sync.changePassword(OLD, NEW);
    offline.mockRestore();
    // Исход самой смены отдаётся вызвавшему (экран настроек), повторять его
    // сообщением незачем; о фоновой отправке говорит только сообщение.
    me.reports.length = 0;
    await me.sync.push();
    expect(me.reports).toEqual([{ kind: "sent" }]);
  });

  it("пароль сменили и с другого устройства — прежний не пускает ни в каком порядке", async () => {
    const phone = await owner();
    // Второе устройство того же человека: вошло прежним паролем.
    const disk = new MemoryStorageAdapter();
    const desktopAccount = new AccountService(disk, new EncryptingStorageAdapter(disk));
    const desktopServer = new ServerAccount(disk);
    const joined = await desktopServer.signIn({ base, login: "петя", password: OLD, device: "пк" });
    await desktopAccount.adopt(joined.vault, OLD);
    const desktop = new PasswordSync(desktopAccount, desktopServer);

    const offline = goOffline();
    await phone.sync.changePassword(OLD, NEW);
    offline.mockRestore();
    expect(await desktop.changePassword(OLD, "пароль-пк")).toEqual({ kind: "sent" });

    // Телефон отправляет позже: прежний секрет на службе уже не тот, но замок
    // кода восстановления тот же — отправка проходит, и прежний не пускает.
    expect(await phone.sync.push()).toEqual({ kind: "sent" });
    expect(await freshDeviceOpens(OLD)).toBe(false);
    expect(await freshDeviceOpens(NEW)).toBe(true);
  });

  it("запись без связи со службой — службе сообщать нечего", async () => {
    const disk = new MemoryStorageAdapter();
    const account = new AccountService(disk, new EncryptingStorageAdapter(disk));
    await account.create(OLD, FAST);
    const sync = new PasswordSync(account, new ServerAccount(disk));
    expect(await sync.changePassword(OLD, NEW)).toEqual({ kind: "idle" });
    expect(await account.checkPassword(NEW)).toBe(true);
  });
});
