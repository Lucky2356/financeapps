import { describe, expect, it } from "vitest";

import { mergeBooks } from "@/lib/sync/merge";
import { stampRows, trackDeletions } from "@/lib/sync/row-stamps";

// Два устройства и сервер между ними. Проверяется не отдельный случай, а то
// единственное, ради чего слияние существует: что после обмена обе книги
// становятся одинаковыми, а работа не пропадает.
//
// Единичными случаями это не поймать. Расхождение и вечный пинг-понг — свойства
// последовательности шагов, а не одного шага: каждый в отдельности выглядит
// разумно, и ломается только их цепочка. Поэтому здесь прогон из сотен ходов, и
// броски — по своему счётчику, а не по Math.random: проверка, которая иногда
// краснеет и никогда не повторяется, хуже отсутствующей.

/** Простой воспроизводимый счётчик (xorshift32) — тот же посев, тот же прогон. */
function dice(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };
}

type Book = Record<string, unknown>;
type Row = Record<string, unknown>;

class Device {
  book: Book = { transactions: [], accounts: [], theme: "system" };
  /** Последняя версия сервера, которую это устройство видело. */
  base: Book | null = null;
  version = 0;
  conflicts = 0;

  constructor(readonly name: string) {}

  /** Правка на устройстве — проходит через ту же точку сохранения, что и в приложении. */
  save(next: Book, now: string): void {
    const previous = this.book;
    this.book = trackDeletions(stampRows(next, previous, now), previous, now);
  }
}

class Server {
  book: Book = { transactions: [], accounts: [], theme: "system" };
  version = 0;

  /** Договор: пишем только поверх известной версии. */
  push(body: Book, baseVersion: number): { ok: boolean; version: number; body: Book } {
    if (baseVersion !== this.version) return { ok: false, version: this.version, body: this.book };
    this.version += 1;
    this.book = body;
    return { ok: true, version: this.version, body: this.book };
  }
}

/** Один обмен: забрать, слить, при необходимости отправить обратно. */
function sync(device: Device, server: Server): void {
  for (let race = 0; race < 5; race++) {
    if (server.version === device.version) {
      // Нечего забирать. Отправляем своё, если оно отличается.
      if (JSON.stringify(device.book) === JSON.stringify(server.book)) return;
      const put = server.push(device.book, device.version);
      if (put.ok) {
        device.version = put.version;
        device.base = structuredClone(put.body);
        return;
      }
      continue;
    }

    const report = mergeBooks(device.base, device.book, server.book);
    device.conflicts += report.conflicts.length;
    device.book = report.state;
    device.version = server.version;
    device.base = structuredClone(server.book);

    if (!report.differs) return;

    const put = server.push(device.book, device.version);
    if (put.ok) {
      device.version = put.version;
      device.base = structuredClone(put.body);
      return;
    }
  }
  throw new Error(`${device.name}: слияние не сошлось за пять кругов`);
}

function transactions(book: Book): Row[] {
  return [...((book.transactions as Row[]) ?? [])].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
}

describe("два устройства сходятся", () => {
  it("после сотни правок вразнобой книги совпадают", () => {
    const roll = dice(20260916);
    const server = new Server();
    const phone = new Device("телефон");
    const desktop = new Device("компьютер");
    let clock = Date.parse("2026-01-01T00:00:00.000Z");

    const now = () => new Date((clock += 60_000)).toISOString();

    for (let step = 0; step < 200; step++) {
      const device = roll() < 0.5 ? phone : desktop;
      const rows = [...((device.book.transactions as Row[]) ?? [])];
      const chance = roll();

      if (chance < 0.55 || rows.length === 0) {
        rows.push({ id: `${device.name}-${step}`, amount: Math.round(roll() * 1000) });
      } else if (chance < 0.8) {
        const index = Math.floor(roll() * rows.length) % rows.length;
        rows[index] = { ...rows[index], amount: Math.round(roll() * 1000) };
      } else {
        const index = Math.floor(roll() * rows.length) % rows.length;
        rows.splice(index, 1);
      }

      device.save({ ...device.book, transactions: rows }, now());

      // Связь появляется не после каждой правки — как в жизни.
      if (roll() < 0.4) sync(device, server);
    }

    // Все вышли на связь и договорили до конца.
    sync(phone, server);
    sync(desktop, server);
    sync(phone, server);
    sync(desktop, server);

    expect(transactions(phone.book)).toEqual(transactions(desktop.book));
    expect(transactions(phone.book)).toEqual(transactions(server.book));
  });

  it("прогон заканчивается, а не ходит по кругу", () => {
    // Если слитое отправляется обратно всегда, два устройства перекидывают одну
    // книгу друг другу без остановки. Здесь это видно по счётчику версий:
    // спокойный обмен не должен наращивать их без причины.
    const server = new Server();
    const phone = new Device("телефон");
    const desktop = new Device("компьютер");

    phone.save(
      { ...phone.book, transactions: [{ id: "t1", amount: 100 }] },
      "2026-02-01T00:00:00.000Z"
    );
    sync(phone, server);
    sync(desktop, server);

    const settled = server.version;
    for (let i = 0; i < 10; i++) {
      sync(phone, server);
      sync(desktop, server);
    }

    expect(server.version).toBe(settled);
  });

  it("удаление доезжает до второго устройства и обратно не возвращается", () => {
    const server = new Server();
    const phone = new Device("телефон");
    const desktop = new Device("компьютер");

    phone.save(
      { ...phone.book, transactions: [{ id: "t1", amount: 1 }] },
      "2026-02-01T00:00:00.000Z"
    );
    sync(phone, server);
    sync(desktop, server);
    expect(transactions(desktop.book)).toHaveLength(1);

    phone.save({ ...phone.book, transactions: [] }, "2026-02-02T00:00:00.000Z");
    sync(phone, server);
    sync(desktop, server);
    expect(transactions(desktop.book)).toEqual([]);

    // Ещё круг — самое опасное место: устройство, ещё помнящее строку, могло бы
    // «вернуть потерянное» и положить её всем обратно.
    sync(phone, server);
    sync(desktop, server);
    expect(transactions(phone.book)).toEqual([]);
    expect(transactions(server.book)).toEqual([]);
  });

  it("удаление против правки не проходит молча", () => {
    // Здесь удаление и правка расходятся по-настоящему: один убрал строку,
    // второй в это же время её поправил. Тихо выбрать нельзя ни то, ни другое.
    const server = new Server();
    const phone = new Device("телефон");
    const desktop = new Device("компьютер");

    phone.save(
      { ...phone.book, transactions: [{ id: "t1", amount: 1 }] },
      "2026-02-01T00:00:00.000Z"
    );
    sync(phone, server);
    sync(desktop, server);

    phone.save({ ...phone.book, transactions: [] }, "2026-02-02T00:00:00.000Z");
    desktop.save(
      { ...desktop.book, transactions: [{ id: "t1", amount: 999 }] },
      "2026-02-03T00:00:00.000Z"
    );

    sync(phone, server);
    sync(desktop, server);
    sync(phone, server);

    expect(desktop.conflicts + phone.conflicts).toBeGreaterThan(0);
    expect(transactions(phone.book)).toEqual(transactions(desktop.book));
  });

  it("работа не пропадает: всё добавленное и не удалённое на месте", () => {
    const server = new Server();
    const phone = new Device("телефон");
    const desktop = new Device("компьютер");

    phone.save(
      { ...phone.book, transactions: [{ id: "с телефона", amount: 1 }] },
      "2026-02-01T00:00:00.000Z"
    );
    desktop.save(
      { ...desktop.book, transactions: [{ id: "с компьютера", amount: 2 }] },
      "2026-02-01T00:01:00.000Z"
    );

    sync(phone, server);
    sync(desktop, server);
    sync(phone, server);

    const ids = transactions(phone.book).map((row) => row.id);
    expect(ids).toEqual(["с компьютера", "с телефона"]);
    expect(transactions(desktop.book).map((row) => row.id)).toEqual(ids);
    expect(phone.conflicts + desktop.conflicts).toBe(0);
  });
});
