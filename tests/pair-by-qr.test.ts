import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { AccountsPageData } from "@/lib/data";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import {
  importTransferKey,
  newTransferKey,
  openPackage,
  sealPackage
} from "@/lib/sync/pair-package";
import { makePairingLink, makeRequestLink, readPairing } from "@/lib/sync/pairing-link";
import { AccountService } from "@/lib/vault/account";
import { ServerAccount } from "@/lib/vault/server-account";
import { createApp, type App } from "../server/src/main.ts";

// Связка по картинке — целиком, через настоящую службу: первое устройство
// включает синхронизацию одним нажатием, показывает картинку, второе её
// предъявляет и получает те же данные. Ни имени, ни пароля, ни слов.

let app: App;
let base: string;

class Phone {
  readonly disk = new MemoryStorageAdapter();
  readonly sync = new SyncingStorageAdapter(this.disk);
  readonly vault = new EncryptingStorageAdapter(this.sync);
  readonly account = new AccountService(this.sync, this.vault);
  readonly server = new ServerAccount(this.sync);

  get app(): LocalApiClient {
    return new LocalApiClient(this.vault);
  }

  merge: Merge = async (_slot, mine, theirs, ancestor) => {
    const ours = mine ? await this.vault.open<Record<string, unknown>>(mine) : {};
    const incoming = await this.vault.open<Record<string, unknown>>(theirs);
    const parent = ancestor ? await this.vault.open<Record<string, unknown>>(ancestor) : null;
    const report = mergeBooks(parent, ours, incoming);
    return { body: await this.vault.seal(report.state), differs: report.differs };
  };

  async resume(): Promise<void> {
    const link = await this.server.link();
    if (!link) throw new Error("не подключено");
    await this.sync.start(
      new HttpSyncTransport({ base: link.base, token: link.token }),
      this.merge
    );
    await this.sync.flush();
  }

  /** То, что делает offerPairing: запечатать, получить код, собрать ссылку. */
  async offer(password?: string): Promise<{ code: string; key: string }> {
    const pack = await this.account.pairingPackage(password);
    const transfer = await newTransferKey();
    const issued = await this.server.issuePairing(await sealPackage(transfer.key, pack));
    return { code: issued.code, key: transfer.text };
  }

  /** То, что делает joinWithLink. */
  async join(offer: { code: string; key: string }): Promise<void> {
    await this.account.assertCanAdopt();
    const answer = await this.server.joinByCode({ base, code: offer.code, device: "Телефон" });
    await this.account.adoptPackage(await openPackage(offer.key, answer.sealed));
    await this.resume();
  }
}

/** Обратная связка — то, что делают requestPairing / answerPairingRequest / checkPairingRequest. */
async function showOwnCode(device: Phone): Promise<{ link: string; ticket: string; key: string }> {
  await device.account.assertCanAdopt();
  const transfer = await newTransferKey();
  const opened = await device.server.openRequest(base);
  return {
    // Адрес в картинке — https: http читатель ссылок не принимает.
    link: makeRequestLink("https://finance.example.org", opened.ticket, transfer.text),
    ticket: opened.ticket,
    key: transfer.text
  };
}

async function answerCode(device: Phone, link: string): Promise<void> {
  const parsed = readPairing(link);
  if (!parsed?.ticket || !parsed.key) throw new Error("не код нового устройства");
  const pack = await device.account.pairingPackage();
  const sealed = await sealPackage(await importTransferKey(parsed.key), pack);
  await device.server.issuePairing(sealed, parsed.ticket);
}

async function checkAnswered(
  device: Phone,
  own: { ticket: string; key: string }
): Promise<boolean> {
  const answer = await device.server.pollRequest({ base, ticket: own.ticket, device: "ПК" });
  if (!answer) return false;
  await device.account.adoptPackage(await openPackage(own.key, answer.sealed));
  await device.resume();
  return true;
}

async function names(device: Phone): Promise<string[]> {
  const page = await device.app.get<AccountsPageData>("/accounts");
  return page.accounts.map((account) => account.name).sort();
}

describe("связка по картинке", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: "propusk", openRegistration: true });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  it("второе устройство получает данные первого без имени и пароля", async () => {
    const computer = new Phone();
    await computer.account.createWithoutPassword();
    await computer.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "5000" });
    await computer.server.registerQuick({ base, device: "Компьютер" });
    await computer.resume();

    const phone = new Phone();
    await phone.join(await computer.offer());

    expect(await names(phone)).toEqual(["Карта"]);
    // И обратно: записанное на телефоне доезжает до компьютера.
    await phone.app.post("/accounts", { name: "Наличные", type: "CASH", balance: "100" });
    await phone.sync.flush();
    // Чужую запись приложение забирает по потоку событий или при запуске;
    // здесь — перезапуском.
    computer.sync.stop();
    await computer.resume();
    expect(await names(computer)).toEqual(["Карта", "Наличные"]);
  });

  it("у данных с паролем ключ достаётся паролем, и пароль остаётся тем же", async () => {
    const computer = new Phone();
    await computer.account.create("пароль-пароль", { iterations: 1 });
    await computer.server.registerQuick({ base, device: "Компьютер" });
    await computer.resume();

    expect(await computer.account.pairingNeedsPassword()).toBe(true);
    await expect(computer.account.pairingPackage()).rejects.toThrow(/пароль/);

    const phone = new Phone();
    await phone.join(await computer.offer("пароль-пароль"));
    // Телефон открыт и помнит ключ; запереть его можно тем же паролем.
    expect(await phone.account.hasPassword()).toBe(true);
    await phone.account.lock();
    await phone.account.unlock("пароль-пароль");
  });

  it("код срабатывает один раз, и служба пакета не хранит", async () => {
    const computer = new Phone();
    await computer.account.createWithoutPassword();
    await computer.server.registerQuick({ base, device: "Компьютер" });
    const offer = await computer.offer();

    await new Phone().join(offer);
    await expect(new Phone().join(offer)).rejects.toThrow(/использован/);
    const kept = app.db
      .prepare("select count(*) as n from pairings where sealed is not null")
      .get<{ n: number }>();
    expect(kept?.n).toBe(0);
  });

  it("устройство со своими записями получает отказ, и код при этом не сгорает", async () => {
    // Код одноразовый. Сгори он на отказе — человеку пришлось бы идти к
    // первому устройству за новым, хотя дело было не в коде.
    const computer = new Phone();
    await computer.account.createWithoutPassword();
    await computer.server.registerQuick({ base, device: "Компьютер" });
    const offer = await computer.offer();

    const busy = new Phone();
    await busy.account.createWithoutPassword();
    await busy.app.post("/accounts", { name: "Своё", type: "CASH", balance: "1" });
    await expect(busy.join(offer)).rejects.toThrow(/уже есть свои записи/);

    const fresh = new Phone();
    await fresh.join(offer);
    expect(await fresh.server.link()).not.toBeNull();
  });

  it("компьютер без камеры показывает свой код, телефон с данными его снимает", async () => {
    // Человек начал на телефоне, потом поставил приложение на ПК. Снимать
    // компьютеру нечем — поэтому код показывает он.
    const phone = new Phone();
    await phone.account.createWithoutPassword();
    await phone.app.post("/accounts", { name: "Карта", type: "DEBIT_CARD", balance: "700" });
    await phone.server.registerQuick({ base, device: "Телефон" });
    await phone.resume();

    const computer = new Phone();
    const own = await showOwnCode(computer);
    expect(await checkAnswered(computer, own)).toBe(false);

    await answerCode(phone, own.link);
    expect(await checkAnswered(computer, own)).toBe(true);
    expect(await names(computer)).toEqual(["Карта"]);

    // И дальше это обычная синхронизация в обе стороны.
    await computer.app.post("/accounts", { name: "Наличные", type: "CASH", balance: "5" });
    await computer.sync.flush();
    phone.sync.stop();
    await phone.resume();
    expect(await names(phone)).toEqual(["Карта", "Наличные"]);
  });

  it("код нового устройства читается только как код нового устройства", async () => {
    const transfer = await newTransferKey();
    const ticket = (await newTransferKey()).text;
    const link = makeRequestLink("https://finance.example.org", ticket, transfer.text);
    expect(readPairing(link)).toEqual({
      base: "https://finance.example.org",
      code: "",
      key: transfer.text,
      ticket
    });
    // Без ключа ответить нечем — такая картинка не принимается вовсе.
    expect(readPairing(link.replace(/&k=[^&]+/, ""))).toBeNull();
  });

  it("чужой ключ пакета не открывает", async () => {
    const computer = new Phone();
    await computer.account.createWithoutPassword();
    await computer.server.registerQuick({ base, device: "Компьютер" });
    const offer = await computer.offer();
    const wrong = await newTransferKey();

    const phone = new Phone();
    await expect(phone.join({ code: offer.code, key: wrong.text })).rejects.toThrow(/не подошёл/);
  });

  it("ссылка из картинки несёт адрес, код и ключ — и читается обратно", async () => {
    const transfer = await newTransferKey();
    const link = makePairingLink("https://finance.example.org", "ABCD2345", transfer.text);
    expect(readPairing(link)).toEqual({
      base: "https://finance.example.org",
      code: "ABCD2345",
      key: transfer.text,
      ticket: null
    });
    // Восемь знаков руками — прежний путь, без ключа.
    expect(readPairing("abcd-2345")).toEqual({
      base: null,
      code: "ABCD2345",
      key: null,
      ticket: null
    });
  });
});
