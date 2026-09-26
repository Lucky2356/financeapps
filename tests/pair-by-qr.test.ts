import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { AccountsPageData } from "@/lib/data";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import { newTransferKey, openPackage, sealPackage } from "@/lib/sync/pair-package";
import { makePairingLink, readPairing } from "@/lib/sync/pairing-link";
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
    const answer = await this.server.joinByCode({ base, code: offer.code, device: "Телефон" });
    await this.account.adoptPackage(await openPackage(offer.key, answer.sealed));
    await this.resume();
  }
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
      key: transfer.text
    });
    // Восемь знаков руками — прежний путь, без ключа.
    expect(readPairing("abcd-2345")).toEqual({ base: null, code: "ABCD2345", key: null });
  });
});
