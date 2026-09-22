import { describe, expect, it } from "vitest";

import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import {
  NamespacedStorageAdapter,
  PEOPLE_KEY,
  PERSON_MARK
} from "@/lib/storage/NamespacedStorageAdapter";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

/**
 * Хранилище, которое СЧИТАЕТ обращения к `clear()`.
 *
 * Нужно ровно для первой проверки: убедиться, что стирание одного человека
 * никогда не доходит до низа. Отличить «стёр своё перебором» от «снёс всё»
 * по одному только итогу нельзя, когда человек на устройстве один, — а
 * появится второй, и разница будет стоить ему всех его денег.
 */
class CountingStorageAdapter extends MemoryStorageAdapter {
  wipes = 0;

  override async clear(): Promise<void> {
    this.wipes += 1;
    await super.clear();
  }
}

/** Привязанный слой — как его собирают в приложении, только сразу. */
function forPerson(inner: StorageAdapter, person: string): NamespacedStorageAdapter {
  const storage = new NamespacedStorageAdapter(inner);
  storage.bind(person);
  return storage;
}

describe("разделение людей на одном устройстве", () => {
  describe("стирание", () => {
    it("clear() не доходит до нижнего хранилища", async () => {
      const disk = new CountingStorageAdapter();
      const first = forPerson(disk, "");
      const second = forPerson(disk, "маша");

      await first.setItem("localFinanceState_profile-default", { accounts: ["моё"] });
      await second.setItem("localFinanceState_profile-default", { accounts: ["её"] });
      await disk.setItem(PEOPLE_KEY, { v: 1, people: ["", "маша"] });

      await first.clear();

      expect(disk.wipes, "clear() одного человека снёс хранилище целиком").toBe(0);
      expect(await second.getItem("localFinanceState_profile-default")).toEqual({
        accounts: ["её"]
      });
      expect(await disk.getItem(PEOPLE_KEY)).not.toBeNull();
    });

    it("стирает своё до конца", async () => {
      const disk = new CountingStorageAdapter();
      const mine = forPerson(disk, "маша");

      await mine.setItem("financeVault", { wrapped: "…" });
      await mine.setItem("localFinanceState_profile-default", { accounts: [] });
      await mine.clear();

      expect(await mine.keys()).toEqual([]);
    });
  });

  describe("кто что видит", () => {
    it("keys() показывает только своё", async () => {
      const disk = new MemoryStorageAdapter();
      const first = forPerson(disk, "");
      const second = forPerson(disk, "маша");

      await first.setItem("profileList", ["моё"]);
      await second.setItem("profileList", ["её"]);
      await disk.setItem(PEOPLE_KEY, { v: 1 });

      expect(await first.keys()).toEqual(["profileList"]);
      expect(await second.keys()).toEqual(["profileList"]);
      expect(await disk.keys()).toHaveLength(3);
    });

    it("первый человек не захватывает чужие ключи", async () => {
      // Западня пустой приставки. Проверь мы «начинается ли ключ с моей
      // приставки», у первого человека это было бы «начинается ли с пустоты»,
      // то есть ДА для всего на устройстве, включая чужое.
      const disk = new MemoryStorageAdapter();
      const first = forPerson(disk, "");

      await disk.setItem(`${PERSON_MARK}маша/localFinanceState_profile-default`, { accounts: [] });

      expect(await first.keys()).toEqual([]);
      expect(await first.getItem("localFinanceState_profile-default")).toBeNull();
    });

    it("реестр людей не виден никому из них", async () => {
      const disk = new MemoryStorageAdapter();
      await disk.setItem(PEOPLE_KEY, { v: 1, people: ["", "маша"] });

      expect(await forPerson(disk, "").keys()).toEqual([]);
      expect(await forPerson(disk, "маша").keys()).toEqual([]);
    });

    it("сосед не читается даже по прямому ключу", async () => {
      // Перечисление чужого не покажет — но запрос по полному имени ключа у
      // первого человека прошёл бы: приставка у него пустая, и перевод ключа
      // для него тождество. Защита, которая держится на вежливости зовущего,
      // защитой не является.
      const disk = new MemoryStorageAdapter();
      const first = forPerson(disk, "");
      const second = forPerson(disk, "маша");

      await second.setItem("financeVault", { wrapped: "её замок" });

      expect(await first.getItem("financeVault")).toBeNull();
      await expect(first.getItem(`${PERSON_MARK}маша/financeVault`)).rejects.toThrow(
        /принадлежит не этому человеку/
      );
      await expect(first.setItem(`${PERSON_MARK}маша/financeVault`, "подмена")).rejects.toThrow(
        /принадлежит не этому человеку/
      );
      expect(await disk.getItem(`${PERSON_MARK}маша/financeVault`)).toEqual({
        wrapped: "её замок"
      });
    });

    it("реестр людей не пишется и не читается из-под человека", async () => {
      const disk = new MemoryStorageAdapter();
      await disk.setItem(PEOPLE_KEY, { v: 1, people: ["", "маша"] });
      const first = forPerson(disk, "");

      await expect(first.getItem(PEOPLE_KEY)).rejects.toThrow(/принадлежит не этому человеку/);
      await expect(first.removeItem(PEOPLE_KEY)).rejects.toThrow(/принадлежит не этому человеку/);
      expect(await disk.getItem(PEOPLE_KEY)).not.toBeNull();
    });
  });

  describe("пустая приставка", () => {
    it("кладёт ключи туда же, где они лежали всегда", async () => {
      // Это и есть обещание «переноса данных нет»: первый человек читает и
      // пишет ровно те ключи, что лежат на дисках живых людей прямо сейчас.
      const disk = new MemoryStorageAdapter();
      const first = forPerson(disk, "");

      await first.setItem("localFinanceState_profile-default", { accounts: ["карта"] });

      expect(await disk.getItem("localFinanceState_profile-default")).toEqual({
        accounts: ["карта"]
      });
    });

    it("читает то, что лежало до появления этого слоя", async () => {
      const disk = new MemoryStorageAdapter();
      await disk.setItem("localFinanceState_profile-default", { accounts: ["старое"] });

      expect(await forPerson(disk, "").getItem("localFinanceState_profile-default")).toEqual({
        accounts: ["старое"]
      });
    });

    it("второй человек кладёт ключи под своим именем", async () => {
      const disk = new MemoryStorageAdapter();
      await forPerson(disk, "маша").setItem("profileList", ["её"]);

      expect(await disk.keys()).toEqual([`${PERSON_MARK}маша/profileList`]);
    });
  });

  describe("привязка", () => {
    it("вторая привязка бросает, а не переводит живую стопку", async () => {
      // Молчаливый перевод означал бы, что читающий прямо сейчас получит чужие
      // данные на полпути. Смена человека идёт перезагрузкой страницы.
      const storage = new NamespacedStorageAdapter(new MemoryStorageAdapter());
      storage.bind("маша");

      expect(() => storage.bind("петя")).toThrow(/уже открыто/);
    });

    it("непривязанный отказывает, а не висит вечно", async () => {
      const storage = new NamespacedStorageAdapter(new MemoryStorageAdapter(), 20);

      await expect(storage.getItem("profileList")).rejects.toThrow(/чьи данные открывать/);
    });

    it("отказ выбора доходит до того, кто ждёт", async () => {
      const storage = new NamespacedStorageAdapter(new MemoryStorageAdapter());
      const waiting = storage.getItem("profileList");
      storage.fail("Список людей устройства не прочитался.");

      await expect(waiting).rejects.toThrow(/не прочитался/);
    });

    it("ждёт привязки, а не отвечает пустотой до неё", async () => {
      // Ответь он `null`, пока человек не выбран, — приложение решило бы, что
      // устройство чистое, и повело бы хозяина через первый запуск поверх его
      // же данных.
      const disk = new MemoryStorageAdapter();
      await disk.setItem("profileList", ["моё"]);

      const storage = new NamespacedStorageAdapter(disk);
      const asked = storage.getItem("profileList");
      storage.bind("");

      expect(await asked).toEqual(["моё"]);
    });
  });
});
