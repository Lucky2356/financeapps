import { describe, expect, it } from "vitest";

import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import {
  NamespacedStorageAdapter,
  PEOPLE_KEY,
  PERSON_MARK
} from "@/lib/storage/NamespacedStorageAdapter";
import {
  addPerson,
  choosePerson,
  FIRST_PERSON,
  forgetPerson,
  forgetServer,
  peopleOnDisk,
  readRoster,
  rememberLastUsed,
  rememberServer,
  renamePerson,
  serverMark,
  whoAlreadyUses,
  writeRoster
} from "@/lib/vault/people";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

function forPerson(disk: MemoryStorageAdapter, id: string): NamespacedStorageAdapter {
  const storage = new NamespacedStorageAdapter(disk);
  storage.bind(id);
  return storage;
}

describe("список людей устройства", () => {
  describe("кто есть на диске", () => {
    it("ключ без метки — это первый человек", () => {
      expect(peopleOnDisk(["localFinanceState_profile-default", "financeVault"])).toEqual([
        FIRST_PERSON
      ]);
    });

    it("реестр сам по себе человека не заводит", () => {
      // Иначе на чистом устройстве, где успели записать только список, из
      // ничего появлялся бы первый человек с пустыми данными.
      expect(peopleOnDisk([PEOPLE_KEY])).toEqual([]);
    });

    it("видит и первого, и помеченных", () => {
      const found = peopleOnDisk([
        "profileList",
        `${PERSON_MARK}маша/profileList`,
        `${PERSON_MARK}маша/financeVault`,
        `${PERSON_MARK}петя/profileList`
      ]);
      expect(new Set(found)).toEqual(new Set([FIRST_PERSON, "маша", "петя"]));
    });

    it("огрызок метки не заводит человека-призрака", () => {
      expect(peopleOnDisk([`${PERSON_MARK}`, `${PERSON_MARK}/profileList`])).toEqual([]);
    });
  });

  describe("починка по диску", () => {
    it("потерянный список не теряет людей — только их имена", async () => {
      // Список имён — кэш, а не единственная запись о существовании. Потеряйся
      // он, и человек обязан вернуться: его деньги лежат на диске.
      const disk = new MemoryStorageAdapter();
      await forPerson(disk, "маша").setItem("localFinanceState_profile-default", { accounts: [] });
      await forPerson(disk, FIRST_PERSON).setItem("localFinanceState_profile-default", {
        accounts: []
      });

      const roster = await readRoster(disk);

      expect(roster.people.map((person) => person.id).sort()).toEqual(
        [FIRST_PERSON, "маша"].sort()
      );
      expect(roster.people.every((person) => person.name.length > 0)).toBe(true);
    });

    it("испорченный список не роняет чтение", async () => {
      const disk = new MemoryStorageAdapter();
      await disk.setItem(PEOPLE_KEY, "мусор");
      await forPerson(disk, "маша").setItem("profileList", []);

      expect((await readRoster(disk)).people.map((person) => person.id)).toEqual(["маша"]);
    });

    it("имена из списка переживают починку", async () => {
      const disk = new MemoryStorageAdapter();
      await forPerson(disk, "маша").setItem("profileList", []);
      await writeRoster(disk, {
        v: 1,
        people: [{ id: "маша", name: "Маша", createdAt: "2026-09-01" }],
        lastUsedId: "маша"
      });

      expect((await readRoster(disk)).people[0]?.name).toBe("Маша");
    });

    it("только что заведённый человек не пропадает из-за пустого диска", async () => {
      // Он есть в списке, но ещё ничего не записал. Чинись список строго по
      // диску — и человек исчез бы между «завели» и «первой записью».
      const disk = new MemoryStorageAdapter();
      const fresh = await addPerson(disk, "Маша");

      expect((await readRoster(disk)).people.map((person) => person.id)).toContain(fresh.id);
    });

    it("последний заходивший не указывает в пустоту", async () => {
      const disk = new MemoryStorageAdapter();
      await forPerson(disk, "маша").setItem("profileList", []);
      await writeRoster(disk, {
        v: 1,
        people: [{ id: "маша", name: "Маша", createdAt: "" }],
        lastUsedId: "кого-нет"
      });

      expect((await readRoster(disk)).lastUsedId).toBe("маша");
    });
  });

  describe("заведение", () => {
    it("первый человек получает пустую приставку", async () => {
      const disk = new MemoryStorageAdapter();
      const first = await addPerson(disk, "Я");

      expect(first.id).toBe(FIRST_PERSON);
    });

    it("второй получает своё пространство, а первый не трогается", async () => {
      const disk = new MemoryStorageAdapter();
      await forPerson(disk, FIRST_PERSON).setItem("localFinanceState_profile-default", {
        accounts: ["моё"]
      });
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");

      expect(second.id).not.toBe(FIRST_PERSON);
      expect(await disk.getItem("localFinanceState_profile-default")).toEqual({
        accounts: ["моё"]
      });
    });

    it("имя пространства не переиспользуется после удаления", async () => {
      // Переиспользуй мы порядковый номер — данные нового человека легли бы
      // поверх остатков удалённого.
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const gone = await addPerson(disk, "Маша");
      await forgetPerson(disk, gone.id);
      const next = await addPerson(disk, "Петя");

      expect(next.id).not.toBe(gone.id);
    });

    it("безымянного зовут по номеру, а не пустотой", async () => {
      const disk = new MemoryStorageAdapter();
      expect((await addPerson(disk, "   ")).name).toBe("Человек 1");
    });
  });

  describe("список как таковой", () => {
    it("переименование не трогает соседей", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await renamePerson(disk, second.id, "Мария");

      const roster = await readRoster(disk);
      expect(roster.people.find((person) => person.id === second.id)?.name).toBe("Мария");
      expect(roster.people.find((person) => person.id === FIRST_PERSON)?.name).toBe("Я");
    });

    it("забытый человек уходит из списка, но данные стирает не это", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await forPerson(disk, second.id).setItem("profileList", ["её"]);

      await forgetPerson(disk, second.id);

      // Ключи на месте — и это НЕ недосмотр: стирание чужих денег должно быть
      // отдельным явным шагом, а не следствием правки списка имён.
      expect(await disk.getItem(`${PERSON_MARK}${second.id}/profileList`)).toEqual(["её"]);
      // Поэтому же он вернётся в список при следующем чтении: деньги на диске.
      expect((await readRoster(disk)).people.map((person) => person.id)).toContain(second.id);
    });

    it("помнит, кто заходил последним", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await rememberLastUsed(disk, FIRST_PERSON);

      expect((await readRoster(disk)).lastUsedId).toBe(FIRST_PERSON);
      await rememberLastUsed(disk, second.id);
      expect((await readRoster(disk)).lastUsedId).toBe(second.id);
    });
  });

  describe("одна учётная запись на двоих", () => {
    it("второй вход под тем же именем узнаётся", async () => {
      // Без этого двое соседей слились бы в одни данные молча: ячейки на службе
      // адресуются парой «человек, ячейка», и служба не видит разницы между
      // двумя людьми за одним компьютером.
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await rememberServer(disk, FIRST_PERSON, "https://finance.example/", "vasya");

      const clash = await whoAlreadyUses(disk, "https://finance.example", "VASYA", second.id);
      expect(clash?.id).toBe(FIRST_PERSON);
    });

    it("сам себе не мешает", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      await rememberServer(disk, FIRST_PERSON, "https://finance.example", "vasya");

      expect(
        await whoAlreadyUses(disk, "https://finance.example", "vasya", FIRST_PERSON)
      ).toBeNull();
    });

    it("разные записи не путаются", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await rememberServer(disk, FIRST_PERSON, "https://finance.example", "vasya");

      expect(await whoAlreadyUses(disk, "https://finance.example", "masha", second.id)).toBeNull();
      expect(await whoAlreadyUses(disk, "https://other.example", "vasya", second.id)).toBeNull();
    });

    it("в списке лежит отпечаток, а не логин", async () => {
      // Реестр не шифруется. Открытый логин прочитал бы сосед по устройству,
      // просто открыв хранилище.
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      await rememberServer(disk, FIRST_PERSON, "https://finance.example", "vasya");

      const raw = JSON.stringify(await disk.getItem(PEOPLE_KEY));
      expect(raw).not.toContain("vasya");
      expect(raw).toContain(await serverMark("https://finance.example", "vasya"));
    });

    it("выход со службы снимает след", async () => {
      const disk = new MemoryStorageAdapter();
      await addPerson(disk, "Я");
      const second = await addPerson(disk, "Маша");
      await rememberServer(disk, FIRST_PERSON, "https://finance.example", "vasya");
      await forgetServer(disk, FIRST_PERSON);

      expect(await whoAlreadyUses(disk, "https://finance.example", "vasya", second.id)).toBeNull();
    });
  });
});

describe("кого открывать при запуске", () => {
  /** Слой разделения, который только запоминает, что ему сказали. */
  function slot() {
    const said: { bound: string | null; failed: string | null } = { bound: null, failed: null };
    return {
      said,
      bind: (id: string) => {
        said.bound = id;
      },
      fail: (reason: string) => {
        said.failed = reason;
      }
    };
  }

  it("на чистом устройстве открывает первого человека", async () => {
    const disk = new MemoryStorageAdapter();
    const layer = slot();

    await choosePerson(disk, layer, true);

    expect(layer.said.bound).toBe(FIRST_PERSON);
    expect(layer.said.failed).toBeNull();
  });

  it("на устройстве с данными открывает того, кто заходил последним", async () => {
    const disk = new MemoryStorageAdapter();
    await forPerson(disk, FIRST_PERSON).setItem("profileList", []);
    const second = await addPerson(disk, "Маша");
    await forPerson(disk, second.id).setItem("profileList", []);
    await rememberLastUsed(disk, second.id);

    const layer = slot();
    await choosePerson(disk, layer, true);

    expect(layer.said.bound).toBe(second.id);
  });

  it("без хранилища отказывает сразу, а не ждёт срок впустую", async () => {
    // Сборка статики: indexedDB там не существует вовсе, и выдерживать
    // сторожевые десять секунд не за чем — ждать нечего.
    const layer = slot();

    await choosePerson(new MemoryStorageAdapter(), layer, false);

    expect(layer.said.bound).toBeNull();
    expect(layer.said.failed).toMatch(/недоступно/);
  });

  it("непрочитавшийся список отказывает с причиной, а не вешает хранилище", async () => {
    // Вечное ожидание выглядит пустым экраном навсегда и неотличимо от
    // медленного диска. Отказ хотя бы называет себя.
    const broken: StorageAdapter = {
      getItem: async () => {
        throw new Error("диск не читается");
      },
      setItem: async () => {},
      removeItem: async () => {},
      clear: async () => {},
      keys: async () => []
    };
    const layer = slot();

    await choosePerson(broken, layer, true);

    expect(layer.said.bound).toBeNull();
    expect(layer.said.failed).toMatch(/диск не читается/);
  });

  it("не бросает сам — иначе отказ всплыл бы при загрузке модуля", async () => {
    const broken: StorageAdapter = {
      getItem: async () => {
        throw new Error("диск не читается");
      },
      setItem: async () => {},
      removeItem: async () => {},
      clear: async () => {},
      keys: async () => []
    };

    await expect(choosePerson(broken, slot(), true)).resolves.toBeNull();
  });

  it("выбранный человек и правда открывает свои данные", async () => {
    // Проверка стыка: выбор говорит имя, слой по нему открывает, и данные
    // приходят те же, что клал этот человек, а не сосед.
    const disk = new MemoryStorageAdapter();
    await forPerson(disk, FIRST_PERSON).setItem("profileList", ["моё"]);
    const second = await addPerson(disk, "Маша");
    await forPerson(disk, second.id).setItem("profileList", ["её"]);
    await rememberLastUsed(disk, second.id);

    const layer = new NamespacedStorageAdapter(disk);
    await choosePerson(disk, layer, true);

    expect(await layer.getItem("profileList")).toEqual(["её"]);
  });
});
