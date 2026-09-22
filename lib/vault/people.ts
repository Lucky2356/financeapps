import { PEOPLE_KEY, PERSON_MARK } from "@/lib/storage/NamespacedStorageAdapter";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

/**
 * Кто живёт на этом устройстве.
 *
 * Читается и пишется ГОЛЫМ хранилищем устройства, мимо приставки. Иначе выбор
 * приставки ждал бы сам себя: чтобы узнать, чьи данные открывать, надо сперва
 * прочитать список, а чтобы его прочитать — уже знать, чьи данные открывать.
 *
 * Не шифруется и не синхронизируется: список — про устройство, а не про чьи-то
 * данные. Имена в нём человек придумывает сам и видит их до того, как ввёл хоть
 * один пароль, — там и не должно лежать ничего, что стоило бы прятать.
 *
 * Запись о том, КТО СУЩЕСТВУЕТ, лежит не здесь, а на диске: приставки в именах
 * ключей и есть настоящий список. Этот файл помнит только имена и кто заходил
 * последним, и если он пропадёт — люди никуда не денутся, см. rebuildFromDisk.
 */

/** Первый человек. Пустая строка — его приставка, и это законное значение. */
export const FIRST_PERSON = "";

export type Person = {
  /** Он же приставка в ключах. У первого — пустая строка. */
  id: string;
  name: string;
  createdAt: string;
  /**
   * След записи на службе: отпечаток от «адрес|имя входа».
   *
   * Именно отпечаток, а не сам логин. Реестр не шифруется, и сосед по
   * устройству прочитал бы открытый логин чужой учётной записи просто открыв
   * хранилище. Отпечаток отвечает на единственный вопрос, который нам нужен:
   * не вошли ли двое под одним и тем же.
   */
  serverMark?: string;
};

export type Roster = {
  v: 1;
  people: Person[];
  lastUsedId: string;
};

const EMPTY: Roster = { v: 1, people: [], lastUsedId: FIRST_PERSON };

function looksLikeRoster(value: unknown): value is Roster {
  const roster = value as Roster | null;
  return (
    !!roster &&
    typeof roster === "object" &&
    roster.v === 1 &&
    Array.isArray(roster.people) &&
    roster.people.every((person) => typeof person?.id === "string")
  );
}

/**
 * Кто есть на диске — по самим ключам, а не по списку.
 *
 * Это и есть настоящая запись о существовании человека. Список имён может
 * потеряться, испортиться или отстать; ключи с приставкой — нет, пока живы
 * данные. Потому список людей и не единственная точка отказа: худшее, что
 * случится с его потерей, — люди станут безымянными, но не исчезнут.
 *
 * Первый человек виден иначе, чем остальные: у него приставки нет, и его
 * существование доказывает ЛЮБОЙ ключ без метки. Собственный ключ реестра при
 * этом не в счёт — он про устройство, а не про человека, и приняв его за
 * данные, мы заводили бы первого человека на пустом устройстве из ничего.
 */
export function peopleOnDisk(keys: string[]): string[] {
  const found = new Set<string>();
  for (const key of keys) {
    if (key === PEOPLE_KEY) continue;
    if (!key.startsWith(PERSON_MARK)) {
      found.add(FIRST_PERSON);
      continue;
    }
    const rest = key.slice(PERSON_MARK.length);
    const slash = rest.indexOf("/");
    // «p/что-то» без второй косой — не чьё-то пространство, а мусор: пропускаем,
    // иначе одна испорченная запись завела бы человека-призрака.
    if (slash > 0) found.add(rest.slice(0, slash));
  }
  return [...found];
}

/**
 * Прочитать список, починив его по диску, если он разошёлся с ним.
 *
 * Порядок именно такой: диск — источник правды, список — источник имён.
 * Человек, найденный на диске, но пропавший из списка, возвращается безымянным
 * («Человек 2»), а не теряется вместе со своими деньгами.
 */
export async function readRoster(device: StorageAdapter): Promise<Roster> {
  const stored = await device.getItem<unknown>(PEOPLE_KEY);
  const roster = looksLikeRoster(stored) ? stored : EMPTY;
  const onDisk = peopleOnDisk(await device.keys());

  const known = new Map(roster.people.map((person) => [person.id, person]));
  const repaired: Person[] = [];

  for (const id of onDisk) {
    repaired.push(known.get(id) ?? { id, name: nameFor(id, repaired.length), createdAt: "" });
  }
  // Человек, записанный в список, но ничего ещё не положивший на диск, — это
  // только что заведённый. Он настоящий, и терять его нельзя.
  for (const person of roster.people) {
    if (!repaired.some((known) => known.id === person.id)) repaired.push(person);
  }

  const lastUsedId = repaired.some((person) => person.id === roster.lastUsedId)
    ? roster.lastUsedId
    : (repaired[0]?.id ?? FIRST_PERSON);

  return { v: 1, people: repaired, lastUsedId };
}

function nameFor(id: string, index: number): string {
  return id === FIRST_PERSON ? "Человек 1" : `Человек ${index + 1}`;
}

export async function writeRoster(device: StorageAdapter, roster: Roster): Promise<void> {
  await device.setItem<Roster>(PEOPLE_KEY, roster);
}

/**
 * Завести человека.
 *
 * Первый заводится с ПУСТОЙ приставкой — его данные лягут туда же, где лежали
 * бы на устройстве без всякого разделения. Второму и следующим выдаётся имя
 * пространства, и никакого переноса чужих данных при этом не происходит.
 */
export async function addPerson(device: StorageAdapter, name: string): Promise<Person> {
  const roster = await readRoster(device);
  const id = roster.people.length === 0 ? FIRST_PERSON : newId(roster);
  const person: Person = {
    id,
    name: name.trim() || nameFor(id, roster.people.length),
    createdAt: new Date().toISOString()
  };
  await writeRoster(device, {
    v: 1,
    people: [...roster.people, person],
    lastUsedId: id
  });
  return person;
}

/**
 * Имя пространства — случайное, а не «человек 2».
 *
 * По порядковому номеру пространство пришлось бы переиспользовать после
 * удаления, и данные нового человека легли бы поверх остатков старого.
 */
function newId(roster: Roster): string {
  const taken = new Set(roster.people.map((person) => person.id));
  for (;;) {
    const id = [...crypto.getRandomValues(new Uint8Array(8))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (!taken.has(id)) return id;
  }
}

export async function rememberLastUsed(device: StorageAdapter, id: string): Promise<void> {
  const roster = await readRoster(device);
  if (roster.lastUsedId === id) return;
  await writeRoster(device, { ...roster, lastUsedId: id });
}

export async function renamePerson(
  device: StorageAdapter,
  id: string,
  name: string
): Promise<void> {
  const roster = await readRoster(device);
  await writeRoster(device, {
    ...roster,
    people: roster.people.map((person) =>
      person.id === id ? { ...person, name: name.trim() || person.name } : person
    )
  });
}

/**
 * Забыть человека в списке.
 *
 * Данные стирает не это, а `clear()` его собственного слоя хранилища: снести
 * запись в списке и оставить ключи на диске значило бы спрятать чужие деньги,
 * а не удалить их.
 */
export async function forgetPerson(device: StorageAdapter, id: string): Promise<void> {
  const roster = await readRoster(device);
  const people = roster.people.filter((person) => person.id !== id);
  await writeRoster(device, {
    v: 1,
    people,
    lastUsedId: roster.lastUsedId === id ? (people[0]?.id ?? FIRST_PERSON) : roster.lastUsedId
  });
}

/**
 * Отпечаток учётной записи на службе.
 *
 * Считается от адреса и имени входа. Адрес приводится к общему виду, иначе
 * «example.com/» и «example.com» выглядели бы разными записями, а на службе
 * это одна и та же.
 */
export async function serverMark(base: string, login: string): Promise<string> {
  const source = `${base.trim().replace(/\/+$/, "").toLowerCase()}|${login.trim().toLowerCase()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Кто на этом устройстве уже вошёл под этой же записью на службе.
 *
 * Без этой проверки двое соседей, войдя под одним именем, тихо слились бы в
 * одни данные: ячейки на службе адресуются парой «человек, ячейка», и служба
 * не видит разницы между двумя людьми за одним компьютером. Каждый увидел бы
 * чужие операции в своих — и, что хуже, решил бы, что так и надо.
 */
export async function whoAlreadyUses(
  device: StorageAdapter,
  base: string,
  login: string,
  exceptId?: string
): Promise<Person | null> {
  const mark = await serverMark(base, login);
  const roster = await readRoster(device);
  return (
    roster.people.find((person) => person.serverMark === mark && person.id !== exceptId) ?? null
  );
}

export async function rememberServer(
  device: StorageAdapter,
  id: string,
  base: string,
  login: string
): Promise<void> {
  const mark = await serverMark(base, login);
  const roster = await readRoster(device);
  await writeRoster(device, {
    ...roster,
    people: roster.people.map((person) =>
      person.id === id ? { ...person, serverMark: mark } : person
    )
  });
}

/**
 * Слой разделения глазами выбора: ровно две ручки, и больше ничего не нужно.
 *
 * Описан здесь, а не взят целым классом, чтобы выбор можно было проверить без
 * настоящего хранилища: это самое опасное место этапа, и оставлять его
 * непроверяемым нельзя.
 */
export type PersonSlot = {
  bind(id: string): void;
  fail(reason: string): void;
};

/**
 * Решить, чьи данные открываем, и сказать об этом слою.
 *
 * Не бросает никогда. Отказ доходит до ждущего иначе — через сам слой, который
 * на любое обращение ответит внятной причиной. Брось это обещание, и
 * необработанный отказ при загрузке модуля стал бы шумом, за которым настоящей
 * причины не видно.
 *
 * @param hasStorage есть ли хранилище в этом окружении вовсе. При сборке
 *   статики `indexedDB` не существует, и ждать там нечего: отказываем сразу, не
 *   выдерживая сторожевой срок впустую.
 */
export async function choosePerson(
  device: StorageAdapter,
  slot: PersonSlot,
  hasStorage: boolean
): Promise<Roster | null> {
  if (!hasStorage) {
    slot.fail("Хранилище этому окружению недоступно — выбирать человека не из чего.");
    return null;
  }
  try {
    const roster = await readRoster(device);
    slot.bind(roster.lastUsedId);
    return roster;
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    slot.fail(`Не удалось прочитать список людей этого устройства: ${why}`);
    return null;
  }
}

export async function forgetServer(device: StorageAdapter, id: string): Promise<void> {
  const roster = await readRoster(device);
  await writeRoster(device, {
    ...roster,
    people: roster.people.map((person) => {
      if (person.id !== id) return person;
      const without = { ...person };
      delete without.serverMark;
      return without;
    })
  });
}
