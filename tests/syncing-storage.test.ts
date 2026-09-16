import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import {
  BASE_SUFFIX,
  SYNC_STATE_KEY,
  SyncingStorageAdapter,
  type Merge
} from "@/lib/storage/SyncingStorageAdapter";
import type { SealedBook } from "@/lib/sync/vault-crypto";
import { FakeSyncServer } from "./helpers/fake-sync-server";

const SLOT = "localFinanceState_default";

/**
 * Шкатулка понарошку: этому слою всё равно, что внутри, — он видит только
 * форму. Настоящее шифрование проверяется в encrypting-storage.test.ts.
 */
function box(ct: string): SealedBook {
  return { v: 1, alg: "AES-GCM", iv: "iv", ct };
}

/** Слияние-склейка: складывает две метки в одну через плюс, по алфавиту. */
const glue: Merge = async (_slot, mine, theirs) => {
  const ours = mine ? mine.ct.split("+") : [];
  const bits = [...new Set([...ours, ...theirs.ct.split("+")])].sort();
  return { body: box(bits.join("+")), differs: bits.length > theirs.ct.split("+").length };
};

describe("синхронизирующее хранилище", () => {
  let device: MemoryStorageAdapter;
  let server: FakeSyncServer;
  let storage: SyncingStorageAdapter;
  let timers: Array<{ run: () => void; delayMs: number }>;

  beforeEach(() => {
    device = new MemoryStorageAdapter();
    server = new FakeSyncServer();
    timers = [];
    storage = new SyncingStorageAdapter(device, (run, delayMs) => {
      timers.push({ run, delayMs });
    });
  });

  describe("остаётся обычным хранилищем", () => {
    it("читает и пишет без всякого сервера", async () => {
      await storage.setItem("что-нибудь", { a: 1 });
      expect(await storage.getItem("что-нибудь")).toEqual({ a: 1 });
      expect(storage.status).toBe("off");
    });

    it("запись местная и мгновенная: сервер ещё не ответил, а на диске уже есть", async () => {
      // Сервер, который не отвечает вовсе, — так выглядит связь, которая
      // «есть», но висит. Запись обязана вернуться до него, а не после.
      const hanging = {
        list: () => new Promise<never>(() => {}),
        pull: () => new Promise<never>(() => {}),
        push: () => new Promise<never>(() => {}),
        watch: () => () => {}
      };
      await storage.start(hanging, glue);
      await storage.setItem(SLOT, box("а"));
      expect(await device.getItem(SLOT)).toEqual(box("а"));
    });
  });

  describe("что уезжает и что остаётся", () => {
    it("запечатанное уезжает", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      expect(server.peek(SLOT)?.body).toEqual(box("а"));
    });

    it("незапечатанное не уезжает никогда", async () => {
      await storage.start(server, glue);
      // Ровно та форма, в которой лежит ключ книги при «не спрашивать».
      await storage.setItem("financeDevice", { v: 1, bookKey: "секрет" });
      await storage.flush();
      expect(server.peek("financeDevice")).toBeNull();
      expect(server.calls.push).toBe(0);
    });

    it("собственная запись о версиях не уезжает, даже приняв вид шкатулки", async () => {
      await storage.start(server, glue);
      await storage.setItem(SYNC_STATE_KEY, box("подделка"));
      await storage.flush();
      expect(server.peek(SYNC_STATE_KEY)).toBeNull();
    });
  });

  describe("когда обогнали", () => {
    it("отказ при записи — не ошибка, а начало слияния", async () => {
      // События до устройства не дошли — соединение оборвалось. Тогда об
      // обгоне оно узнаёт единственным способом: получив отказ на собственную
      // запись. Это и есть путь, который держит договор без подписки.
      server.events = false;
      await storage.start(server, glue);
      server.seed(SLOT, box("б"));
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      expect(server.calls.rejected).toBeGreaterThan(0);
      expect(server.peek(SLOT)?.body).toEqual(box("а+б"));
      expect(await device.getItem(SLOT)).toEqual(box("а+б"));
    });

    it("слитое без своих правок обратно не отправляется", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      const afterFirst = server.peek(SLOT)?.version ?? 0;

      // Другое устройство дописало своё поверх нашего — нам добавить нечего.
      server.seed(SLOT, box("а+б"));
      await storage.flush();

      expect(await device.getItem(SLOT)).toEqual(box("а+б"));
      // Версия выросла только от чужой записи. Ещё один шаг означал бы, что мы
      // отправили обратно то же самое, а второе устройство ответило бы тем же.
      expect(server.peek(SLOT)?.version).toBe(afterFirst + 1);
    });
  });

  describe("когда связи нет", () => {
    it("копит и отправляет, когда связь вернулась", async () => {
      server.online = false;
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      expect(storage.status).toBe("offline");
      expect(server.peek(SLOT)).toBeNull();

      server.online = true;
      await storage.flush();
      expect(server.peek(SLOT)?.body).toEqual(box("а"));
      expect(storage.status).toBe("synced");
    });

    it("обрыв посреди очереди не уносит с собой остальные ячейки", async () => {
      const OTHER = "localFinanceState_второй";
      // Связи нет с самого начала, чтобы обе ячейки наверняка встали в очередь,
      // а не проскочили по дороге. Иначе сторож зависел бы от того, успела ли
      // первая отправка вклиниться, — то есть проверял бы погоду, а не код.
      server.online = false;
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.setItem(OTHER, box("б"));
      await storage.flush();
      expect(storage.status).toBe("offline");

      server.online = true;
      await storage.flush();

      // Обе на месте. Возьми очередь весь список разом и очисти его заранее —
      // вторая ячейка исчезла бы вместе с первой: в хранилище записана, а
      // отправить её уже некому.
      expect(server.peek(SLOT)?.body).toEqual(box("а"));
      expect(server.peek(OTHER)?.body).toEqual(box("б"));
    });

    it("повтор ставится с растущей задержкой, а не долбит сервер", async () => {
      server.online = false;
      await storage.start(server, glue);

      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      expect(timers.map((t) => t.delayMs)).toEqual([2000]);

      // Срабатывает повтор — и снова упирается в ту же стену.
      timers.shift()?.run();
      await storage.flush();
      expect(timers.map((t) => t.delayMs)).toEqual([4000]);
    });
  });

  describe("очистка на устройстве", () => {
    it("не сносит книгу на сервере", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      await storage.removeItem(SLOT);
      await storage.flush();

      expect(server.peek(SLOT)?.body).toEqual(box("а"));
    });

    it("пустая книга поверх очистки не затирает серверную", async () => {
      // Настоящая последовательность «очистить хранилище»: книга убирается, и
      // на её место тут же ложится пустая. Помни устройство прежний номер
      // версии — сервер принял бы эту пустоту как законное продолжение, и
      // книга исчезла бы у всех, а не только на этой машине.
      server.events = false;
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а+б"));
      await storage.flush();

      await storage.removeItem(SLOT);
      await storage.setItem(SLOT, box("пусто"));
      await storage.flush();

      expect(server.calls.rejected).toBeGreaterThan(0);
      expect(server.peek(SLOT)?.body?.ct).toContain("а");
      expect(server.peek(SLOT)?.body?.ct).toContain("б");
    });
  });

  describe("подписка", () => {
    it("чужая запись приезжает сама, без нашего вопроса", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      server.seed(SLOT, box("б"));
      await storage.flush();

      expect(await device.getItem(SLOT)).toEqual(box("а+б"));
    });

    it("после stop ничего больше не приезжает", async () => {
      await storage.start(server, glue);
      storage.stop();
      const before = server.calls.pull;
      server.seed(SLOT, box("б"));
      await storage.flush();
      expect(server.calls.pull).toBe(before);
      expect(storage.status).toBe("off");
    });
  });

  describe("основа для слияния", () => {
    it("хранится запечатанной и не уезжает обратно на сервер", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toEqual(box("а"));
      expect(server.peek(`${SLOT}${BASE_SUFFIX}`)).toBeNull();
    });

    it("равна тому, что лежит на сервере в запомненной версии", async () => {
      // Это и есть определение общего предка: последняя ОБЩАЯ точка. Разойдись
      // основа с серверной версией хоть раз — слияние начало бы считать чужие
      // правки своими или свои чужими, и делало бы это молча.
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toEqual(server.peek(SLOT)?.body);

      server.seed(SLOT, box("б"));
      await storage.flush();
      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toEqual(server.peek(SLOT)?.body);

      await storage.setItem(SLOT, box("а+б+своё"));
      await storage.flush();
      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toEqual(server.peek(SLOT)?.body);
    });

    it("после слияния основа — серверное, даже если отправить не удалось", async () => {
      // Между «уже слил» и «ещё не отправил» книга и основа живут порознь, и
      // обрыв связи оставляет их в этом виде надолго. Окажись основой слитое —
      // на следующем круге чужие правки прочитались бы как «никто не менял».
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      server.writable = false;
      server.seed(SLOT, box("б"));
      await storage.flush();

      expect(await device.getItem(SLOT)).toEqual(box("а+б"));
      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toEqual(box("б"));
    });

    it("не уезжает на сервер и после перезапуска", async () => {
      // Перезапуск обходит хранилище целиком и отправляет всё запечатанное.
      // Основа запечатана — и уехала бы вместе с книгой, заведя себе ячейку.
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      const again = new SyncingStorageAdapter(device);
      await again.start(server, glue);
      await again.flush();

      expect(server.peek(`${SLOT}${BASE_SUFFIX}`)).toBeNull();
    });

    it("убирается вместе с книгой", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      await storage.removeItem(SLOT);
      expect(await device.getItem(`${SLOT}${BASE_SUFFIX}`)).toBeNull();
    });

    it("передаётся слиянию как третья книга", async () => {
      const seen: Array<unknown> = [];
      const watching: Merge = async (slot, mine, theirs, base) => {
        seen.push(base);
        return glue(slot, mine, theirs, base);
      };
      await storage.start(server, watching);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      server.seed(SLOT, box("а+б"));
      await storage.flush();

      expect(seen).toEqual([box("а")]);
    });
  });

  describe("версии переживают перезапуск", () => {
    it("второй запуск не перемалывает книгу заново", async () => {
      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      // Перезапуск: новый слой поверх того же устройства.
      const merges = vi.fn(glue);
      const again = new SyncingStorageAdapter(device);
      await again.start(server, merges);
      await again.flush();

      // Версия на сервере та же, что запомнили, — сливать нечего и не с чем.
      // Помни устройство только «что-то когда-то отправляли», оно открывало бы
      // и перемалывало всю книгу при каждом запуске, на телефоне в том числе.
      expect(merges).not.toHaveBeenCalled();
      expect(server.peek(SLOT)?.version).toBe(1);
    });
  });

  describe("состояние показывается наружу", () => {
    it("подписчик слышит переходы", async () => {
      const seen: string[] = [];
      storage.onStatus((status) => seen.push(status));

      await storage.start(server, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();

      expect(seen).toContain("sending");
      expect(seen.at(-1)).toBe("synced");
    });

    it("ошибка сервера — это не «нет связи»", async () => {
      const broken = {
        ...server,
        list: vi.fn(async () => {
          throw new Error("сервер сломался");
        }),
        pull: vi.fn(async () => {
          throw new Error("сервер сломался");
        }),
        push: vi.fn(async () => {
          throw new Error("сервер сломался");
        }),
        watch: () => () => {}
      };
      await storage.start(broken, glue);
      await storage.setItem(SLOT, box("а"));
      await storage.flush();
      expect(storage.status).toBe("error");
      expect(timers).toHaveLength(0);
    });
  });
});
