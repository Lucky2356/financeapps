"use client";

// Замок и синхронизация в собранном виде: одно хранилище устройства, слой
// синхронизации над ним, шифрование над ним и одна служба учётной записи на всё
// приложение.
//
// Штуки ровно по одной, и это существенно. Ключ книги живёт в памяти ТОЙ САМОЙ
// обёртки, через которую читает LocalApiClient; заведись их две, экран замка
// отпирал бы одну, а приложение читало бы из другой — и человек, введя верный
// пароль, увидел бы запертую книгу. Поэтому всё создаётся здесь и берётся
// отсюда всеми.
//
// ПОРЯДОК СЛОЁВ — не вкусовщина:
//
//     LocalApiClient
//       └─ EncryptingStorageAdapter       данные шифруются здесь
//            └─ SyncingStorageAdapter     и только потом уезжают на сервер
//                 └─ NamespacedStorageAdapter   чьи это данные
//                      └─ DesktopStorageAdapter
//
// Синхронизация ниже шифрования, поэтому отправить открытые данные она не может
// физически: открытых данных в том слое нет.
//
// Разделение людей — ещё ниже синхронизации, и это тоже обязательное место:
// имена ячеек на службе берутся из имён ключей, и уйди приставка наверх, второе
// устройство ТОГО ЖЕ человека не нашло бы его ячеек никогда.

import { DesktopStorageAdapter } from "@/lib/storage/DesktopStorageAdapter";
import { EncryptingStorageAdapter } from "@/lib/storage/EncryptingStorageAdapter";
import { NamespacedStorageAdapter } from "@/lib/storage/NamespacedStorageAdapter";
import { SyncingStorageAdapter, type Merge } from "@/lib/storage/SyncingStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { mergeBooks } from "@/lib/sync/merge";
import type { SyncTransport } from "@/lib/sync/protocol";
import { AccountService } from "@/lib/vault/account";
import { ConflictStore } from "@/lib/vault/conflicts";
import { rememberWho } from "@/lib/storage/mine";
import {
  addPerson,
  choosePerson,
  hasVault,
  forgetServer,
  opensWithoutPassword,
  readRoster,
  rememberLastUsed,
  rememberServer,
  whoAlreadyUses,
  type Roster
} from "@/lib/vault/people";
import { ServerAccount } from "@/lib/vault/server-account";

/**
 * Настоящее хранилище устройства — пишет и читает как есть.
 *
 * Список людей читается ИМЕННО ОТСЮДА, мимо приставки: иначе выбор приставки
 * ждал бы сам себя.
 */
const device = new DesktopStorageAdapter();

/** Оно же, но открытое на одного человека. До выбора — ждёт, а не врёт. */
const people = new NamespacedStorageAdapter(device);

/** Оно же, но с отправкой на сервер. Пока не запущено — просто хранилище. */
export const syncStorage = new SyncingStorageAdapter(people);

/** Оно же, но сквозь шифрование. Через него ходит всё приложение. */
export const vaultStorage = new EncryptingStorageAdapter(syncStorage);

/**
 * Кого открываем — решается здесь, при загрузке, и ровно один раз.
 *
 * Загвоздка в том, что стопка выше собирается СИНХРОННО, а список людей лежит в
 * хранилище, то есть читается асинхронно. Решается это тем, что слой заводится
 * непривязанным и ждёт: асинхронным от этого никто не становится — хранилище и
 * так всё на обещаниях.
 *
 * Три исхода предусмотрены прямо, потому что каждый иначе обернулся бы пустым
 * экраном, неотличимым от медленного диска:
 *
 *   1. хранилища нет вовсе (сборка статики, где indexedDB не существует) —
 *      отказываем сразу, не дожидаясь сторожевого срока;
 *   2. список не прочитался — отказываем с внятной причиной, и она доходит до
 *      того, кто ждёт;
 *   3. привязка уже была — бросаем: смена человека идёт перезагрузкой страницы,
 *      и только ей, иначе читающий прямо сейчас получил бы чужое на полпути.
 *
 * Обещание это НЕ отклоняется никогда: его ждут ворота, а необработанный отказ
 * при загрузке модуля — шум, за которым не видно настоящей причины. Неудача
 * видна иначе: хранилище на любое обращение ответит отказом, называющим себя.
 */
export const peopleReady: Promise<Roster | null> = choosePerson(
  device,
  people,
  typeof indexedDB !== "undefined"
).then((roster) => {
  // Мелочи из localStorage делятся той же приставкой, и узнаёт её тот же выбор.
  //
  // Второго способа сказать «это моё» здесь заводить нельзя: разойдись он с
  // первым — и человек видел бы свои данные, но чужие сохранённые фильтры, то
  // есть чужие названия категорий и суммы.
  rememberWho(roster?.lastUsedId ?? "");
  return roster;
});

/**
 * Открыть данные другого человека.
 *
 * Перезагрузкой страницы, а не переключением слоя на ходу. Слой на вторую
 * привязку бросает нарочно: живую стопку уже держат ворота, шифрование и
 * очередь отправки, и молчаливый перевод означал бы, что читающий прямо сейчас
 * получит чужие данные на полпути. Тем же приёмом в приложении меняют профиль
 * и грузят пример — он единственный, про который точно известно, что ничего не
 * осталось висеть в памяти.
 */
export async function switchPerson(id: string): Promise<void> {
  await rememberLastUsed(device, id);
  markPersonChosen();
  window.location.reload();
}

/**
 * Выбор человека спрашивается ОДИН РАЗ за запуск приложения.
 *
 * Пометка живёт в sessionStorage, и это ровно та память, которая здесь нужна:
 * она переживает перезагрузку страницы — а смена человека идёт именно ею — и
 * умирает вместе со вкладкой, то есть со следующим запуском приложения
 * спросят снова.
 *
 * Без неё выходит круг, и он не умозрительный: нажатие на человека
 * перезагружает страницу, ворота видят двоих и показывают тот же экран опять.
 * Человек нажимает, попадает туда же и не понимает, что сделал не так.
 * Поймано живым прогоном в браузере — ни одна проверка слоёв такого не видит,
 * потому что перезагрузки в них нет.
 */
const CHOSEN_KEY = "person-chosen";

function markPersonChosen(): void {
  try {
    sessionStorage.setItem(CHOSEN_KEY, "1");
  } catch {
    /* хранилище недоступно — тогда спросим ещё раз, и это не страшно */
  }
}

export function personAlreadyChosen(): boolean {
  try {
    return sessionStorage.getItem(CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Завести, отпереть, сменить пароль, восстановиться. */
export const accountService = new AccountService(syncStorage, vaultStorage);

/** Спорные строки, которые ждут решения человека. */
export const conflictStore = new ConflictStore(vaultStorage);

/**
 * Слияние для слоя синхронизации.
 *
 * Живёт здесь, а не внутри слоя, по одной причине: слить две книги можно только
 * открыв их, а ключа в том слое нет и быть не должно. Здесь ключ есть — точнее,
 * есть обёртка, которая умеет открыть и запечатать, не отдавая ключ наружу.
 */
const merge: Merge = async (slot, mine, theirs, base) => {
  const ours = mine ? await vaultStorage.open<Record<string, unknown>>(mine) : {};
  const incoming = await vaultStorage.open<Record<string, unknown>>(theirs);
  const ancestor = base ? await vaultStorage.open<Record<string, unknown>>(base) : null;

  const report = mergeBooks(ancestor, ours, incoming);
  await conflictStore.add(slot, report.conflicts, new Date().toISOString());

  return { body: await vaultStorage.seal(report.state), differs: report.differs };
};

/** Завести запись на своём сервере, войти, выйти. */
export const serverAccount = new ServerAccount(syncStorage);

/**
 * Включает синхронизацию.
 *
 * Отдельным вызовом, а не само собой: без входа синхронизировать не с кем, и
 * приложение обязано работать ровно так же, как работало, — местно и без сети.
 * Пока этот вызов никто не делает, слой синхронизации остаётся обычным
 * хранилищем.
 */
export async function startSync(transport: SyncTransport): Promise<void> {
  await syncStorage.start(transport, merge);
}

/**
 * Поднять синхронизацию, если устройство уже привязано к службе.
 *
 * Возвращает `false`, когда привязки нет, — и это НЕ ошибка, а обычное
 * положение дел у человека, который сервером не пользуется. Приложение местное:
 * отсутствие сервера не должно ни мешать открытию, ни попадать в журнал как
 * сбой.
 */
export async function resumeSync(): Promise<boolean> {
  const link = await serverAccount.link();
  if (!link) return false;
  await startSync(new HttpSyncTransport({ base: link.base, token: link.token }));
  return true;
}

/**
 * Дождаться, пока очередь разберётся один раз.
 *
 * Нужно ровно в одном месте — сразу после подключения к службе. start() толкает
 * очередь и НЕ ждёт её: запуск приложения не имеет права ждать сеть. А вот
 * человек, только что нажавший «Подключить устройство», ждёт именно книгу, и
 * показать ему пустой экран, пока она едет, — значит показать то же самое, что
 * при неудаче.
 */
export async function flushSync(): Promise<void> {
  await syncStorage.flush();
}

export function stopSync(): void {
  syncStorage.stop();
}

/** Человек глазами экрана выбора. */
export type PersonCard = {
  id: string;
  name: string;
  /** Данные откроются соседу без пароля — и экран обязан сказать это вслух. */
  unprotected: boolean;
};

/**
 * Кто есть на этом устройстве и чьи данные заперты.
 *
 * Читается голым хранилищем устройства: спрашивать надо про ВСЕХ, а стопка
 * открыта на одного.
 */
export async function listPeople(): Promise<PersonCard[]> {
  const roster = await readRoster(device);
  return Promise.all(
    roster.people.map(async (person) => ({
      id: person.id,
      name: person.name,
      unprotected: (await hasVault(device, person.id))
        ? await opensWithoutPassword(device, person.id)
        : // Замка ещё нет вовсе — человека только что завели, и первый запуск
          // он пройдёт сам. Пугать его «сосед откроет» раньше времени незачем.
          false
    }))
  );
}

/**
 * Завести человека и сразу открыть его.
 *
 * Перезагрузкой, как и смена: заводит его тот, кто сейчас за компьютером, а
 * дальше стопку надо собрать заново — уже на нового.
 */
export async function addPersonAndSwitch(name: string): Promise<void> {
  const person = await addPerson(device, name);
  await switchPerson(person.id);
}

/**
 * Не даёт двоим на одном устройстве войти под одной учётной записью службы.
 *
 * Без этого они слились бы в одни данные МОЛЧА: ячейки на службе адресуются
 * парой «человек, ячейка», и служба не видит разницы между двумя людьми за
 * одним компьютером. Каждый увидел бы чужие операции в своих и, что хуже,
 * решил бы, что так и надо — приложение ведь ничего не сказало.
 *
 * Отказ здесь, а не в службе, потому что знание об этом есть только на
 * устройстве: служба честно видит один вход и один вход.
 */
export async function refuseSharedServerAccount(base: string, login: string): Promise<void> {
  const roster = await peopleReady;
  const me = roster?.lastUsedId ?? "";
  const busy = await whoAlreadyUses(device, base, login, me);
  if (busy) {
    throw new Error(
      `На этом компьютере под этой же учётной записью уже работает «${busy.name}». ` +
        "Двое под одним именем получат общие данные: служба не различает людей за одним " +
        "компьютером. Заведите на службе отдельную запись."
    );
  }
}

/** Запомнить, под какой записью службы работает нынешний человек. */
export async function rememberMyServer(base: string, login: string): Promise<void> {
  const roster = await peopleReady;
  await rememberServer(device, roster?.lastUsedId ?? "", base, login);
}

/** Забыть её — при отключении от службы. */
export async function forgetMyServer(): Promise<void> {
  const roster = await peopleReady;
  await forgetServer(device, roster?.lastUsedId ?? "");
}
