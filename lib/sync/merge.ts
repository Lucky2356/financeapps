// Слияние двух книг.
//
// Добавленное на телефоне и добавленное на компьютере должно объединиться само
// и без вопросов — это девять случаев расхождения из десяти. Спор остаётся
// только там, где одну и ту же строку правили в двух местах; там решать за
// человека нельзя, и здесь этого не делается.
//
// ОСНОВА. Слияние трёхстороннее: своя книга, чужая и ОСНОВА — та версия,
// которую это устройство последней видело на сервере. Без основы отличить «я
// добавил» от «они удалили» невозможно в принципе, и любая догадка однажды
// выбросит чужую работу.
//
// Что основа действительно является общим предком, следует из договора, а не из
// надежды: сервер принимает запись только поверх известной версии (см.
// lib/sync/protocol), поэтому цепочка версий на нём — прямая. Значит, что бы
// сейчас на сервере ни лежало, оно происходит от той версии, которую мы видели
// последней. Это и есть определение общего предка.
//
// ОСНОВЫ МОЖЕТ НЕ БЫТЬ — первая встреча с сервером, или книгу на устройстве
// чистили. Тогда работают следы удалений: чужой след говорит «эту строку у нас
// убрали», а не «у вас ещё не завелась». Основа и следы прикрывают друг друга,
// и держать стоит оба.
//
// ЧЕГО ЗДЕСЬ НЕТ. Автоматического разрешения спора «правка против удаления» в
// пользу удаления. Когда на одном устройстве строку правили, а на другом
// удалили, слияние оставляет строку и заносит случай в спорные. Лишняя строка
// видна, и её удалят второй раз за секунду; пропавшая правка не видна никак.

import {
  DELETIONS_FIELD,
  indexRows,
  isTombstone,
  sameRow,
  sameValue,
  STAMP_FIELD,
  STAMPED,
  type Identity,
  type Tombstone
} from "@/lib/sync/row-stamps";

type Book = Record<string, unknown>;
type Row = Record<string, unknown>;

/** Спорная строка: правили в двух местах, и выбрать должен человек. */
export type RowConflict = {
  collection: string;
  key: string;
  /** Что здесь. null — здесь её удалили. */
  mine: Row | null;
  /** Что на другом устройстве. null — там её удалили. */
  theirs: Row | null;
  /** Что легло в книгу сейчас, до решения человека. */
  chosen: "mine" | "theirs";
};

export type MergeReport = {
  state: Book;
  conflicts: RowConflict[];
  /**
   * Отличается ли слитое от чужого. Нет — отправлять обратно нечего, и это
   * единственное, что отделяет синхронизацию от вечного пинг-понга, в котором
   * два устройства перекидывают одну книгу друг другу без остановки.
   */
  differs: boolean;
};

/** Состояние строки на одной стороне относительно основы. */
type Side =
  | { kind: "present"; row: Row }
  | { kind: "deleted" }
  | { kind: "absent" };

/**
 * Списки, которые сливаются объединением по своему опознанию, но строками книги
 * не считаются и отметок времени не носят.
 *
 * `investments.portfolio` и `investments.watchlist` — настоящие данные человека
 * (бумаги, количество, цена покупки), и терять их при расхождении нельзя.
 * Остальное внутри `investments` — котировки и посчитанное по ним, оно
 * переписывается само и берётся с сервера как есть.
 */
const NESTED_ROWS: ReadonlyArray<readonly [string, string, Identity]> = [
  ["investments", "portfolio", (row) => (typeof row.ticker === "string" ? row.ticker : null)],
  ["investments", "watchlist", (row) => (typeof row.ticker === "string" ? row.ticker : null)]
];

/** Списки значений, которые просто объединяются. */
const UNIONS: readonly string[] = ["planMonths"];

/**
 * Поля, которые операции НАКАПЛИВАЮТ, а не задают.
 *
 * Это самое важное место во всём слиянии, и понято оно было не сразу. Остаток
 * на счёте — не свойство счёта, а итог всего, что по нему прошло. Купи человек
 * хлеб с телефона и бензин с компьютера, обе траты настоящие и обе обязаны
 * вычесться. Слияние «по строкам» выбрало бы одну из двух версий счёта — и
 * остаток оказался бы неверным на одну покупку. Не спорным, не подозрительным:
 * просто неверным, тихо, и человек увидел бы это месяцем позже при сверке.
 *
 * Поэтому такие поля складываются приращениями от общей основы:
 *
 *     было + (стало у меня − было) + (стало у них − было)
 *
 * Деньги при этом не теряются и не удваиваются, а спора не возникает вовсе —
 * потому что спора и нет: два человека не «правили одно и то же», они потратили
 * каждый своё.
 *
 * Без основы сложить приращения не из чего; тогда берётся версия посвежее, и
 * это записано как известное ограничение первой встречи с сервером.
 */
const SUMMED: Readonly<Record<string, readonly string[]>> = {
  accounts: ["balance"],
  goals: ["currentAmount"],
  liabilities: ["balance"]
};

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graveId(collection: string, key: string): string {
  return JSON.stringify([collection, key]);
}

function tombstones(book: Book): Map<string, Tombstone> {
  const marks = new Map<string, Tombstone>();
  const list = book[DELETIONS_FIELD];
  if (!Array.isArray(list)) return marks;
  for (const mark of list) {
    if (isTombstone(mark)) marks.set(graveId(mark.collection, mark.key), mark);
  }
  return marks;
}

function sideOf(row: Row | undefined, deleted: boolean): Side {
  if (row) return { kind: "present", row };
  return deleted ? { kind: "deleted" } : { kind: "absent" };
}

/**
 * Тронула ли сторона эту строку по сравнению с основой.
 *
 * Отсутствие строки без следа считается удалением, а не «ничего не было»:
 * книга, дожившая с версий без следов, теряла строки молча, и вернуть их
 * обратно значило бы воскресить то, что человек убрал своими руками.
 */
function touched(side: Side, base: Row | undefined): boolean {
  if (!base) {
    // Основы нет. След удаления — это всё равно явное действие человека, и
    // считать его «ничем» нельзя: иначе удалённое на одном устройстве вернётся
    // туда с другого при первой же встрече.
    if (side.kind === "deleted") return true;
    return side.kind === "present";
  }
  if (side.kind === "present") return !sameRow(side.row, base);
  return true;
}

function stampOf(row: Row | null): number {
  const value = row?.[STAMP_FIELD];
  if (typeof value !== "string") return 0;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : 0;
}

function rowOf(side: Side): Row | null {
  return side.kind === "present" ? side.row : null;
}

function numberAt(row: Row, field: string): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Складывает приращения накопительных полей.
 *
 * Возвращает строку, только если после сложения стороны РАЗОШЛИСЬ ТОЛЬКО В НИХ.
 * Правку названия счёта на одном устройстве и переименование его же на другом
 * складывать нечем — это настоящий спор, и вернуть тут надо null.
 */
function sumDeltas(collection: string, was: Row, here: Row, there: Row): Row | null {
  const fields = SUMMED[collection];
  if (!fields) return null;

  const result: Row = { ...(stampOf(here) >= stampOf(there) ? here : there) };
  let summedAny = false;

  for (const field of fields) {
    const before = numberAt(was, field);
    const mine = numberAt(here, field);
    const theirs = numberAt(there, field);
    if (before === null || mine === null || theirs === null) continue;
    if (mine === theirs) continue;
    result[field] = mine + theirs - before;
    summedAny = true;
  }

  if (!summedAny) return null;

  // Всё, кроме сложенного, обязано совпадать — иначе это спор, а не арифметика.
  const bare = (row: Row): Row => {
    const copy = { ...row };
    for (const field of fields) delete copy[field];
    return copy;
  };
  return sameRow(bare(here), bare(there)) ? result : null;
}

/** Слияние одного раздела. Дописывает спорные строки в `conflicts`. */
function mergeCollection(
  collection: string,
  identify: Identity,
  base: Book | null,
  mine: Book,
  theirs: Book,
  mineMarks: Map<string, Tombstone>,
  theirsMarks: Map<string, Tombstone>,
  conflicts: RowConflict[]
): Row[] {
  const baseRows = indexRows(base?.[collection], identify);
  const mineRows = indexRows(mine[collection], identify);
  const theirsRows = indexRows(theirs[collection], identify);

  const merged: Row[] = [];
  const keys = new Set([...baseRows.keys(), ...mineRows.keys(), ...theirsRows.keys()]);

  for (const key of keys) {
    const id = graveId(collection, key);
    const here = sideOf(mineRows.get(key), mineMarks.has(id));
    const there = sideOf(theirsRows.get(key), theirsMarks.has(id));
    const was = baseRows.get(key);

    const changedHere = touched(here, was);
    const changedThere = touched(there, was);

    // Тронуто с одной стороны — берём тронутое. Спрашивать не о чем.
    if (!changedHere) {
      if (there.kind === "present") merged.push(there.row);
      continue;
    }
    if (!changedThere) {
      if (here.kind === "present") merged.push(here.row);
      continue;
    }

    const rowHere = rowOf(here);
    const rowThere = rowOf(there);

    // Тронуто с обеих — но одинаково. Это не спор.
    if (rowHere && rowThere && sameRow(rowHere, rowThere)) {
      merged.push(stampOf(rowHere) >= stampOf(rowThere) ? rowHere : rowThere);
      continue;
    }

    // Тронуто с обеих, и вся разница — в накопленном. Складываем приращения:
    // это не спор, а две настоящие траты, каждая из которых обязана вычесться.
    if (rowHere && rowThere && was) {
      const summed = sumDeltas(collection, was, rowHere, rowThere);

      if (summed) {
        merged.push(summed);
        continue;
      }
    }
    if (!rowHere && !rowThere) continue; // удалили обе стороны

    // Одна сторона удалила, вторая держит строку. Спор ли это, решает время:
    // след удаления новее последней правки строки — значит, её после удаления
    // никто не трогал, и спрашивать не о чем. Иначе правка и удаление
    // разошлись по-настоящему, и выбирать должен человек.
    const survivor = rowHere ?? rowThere;
    if (!rowHere || !rowThere) {
      const mark = (rowHere ? theirsMarks : mineMarks).get(graveId(collection, key));
      const buried = mark ? Date.parse(mark.deletedAt) : NaN;
      if (Number.isFinite(buried) && stampOf(survivor) < buried) continue; // похоронено позже
    }

    // Настоящий спор. Предварительно кладём то, что не теряет данных: при
    // «правка против удаления» — строку, иначе — правку посвежее. Чужая берёт
    // верх при равенстве: её уже видят остальные устройства, и разойтись
    // решениям нельзя, иначе книга не сойдётся никогда.
    let chosen: "mine" | "theirs";
    if (!rowThere) chosen = "mine";
    else if (!rowHere) chosen = "theirs";
    else chosen = stampOf(rowHere) > stampOf(rowThere) ? "mine" : "theirs";

    conflicts.push({ collection, key, mine: rowHere, theirs: rowThere, chosen });
    const winner = chosen === "mine" ? rowHere : rowThere;
    if (winner) merged.push(winner);
  }

  return merged;
}

function mergeNested(base: Book | null, mine: Book, theirs: Book): Book {
  const groups = new Map<string, Array<readonly [string, Identity]>>();
  for (const [parent, field, identify] of NESTED_ROWS) {
    const list = groups.get(parent) ?? [];
    list.push([field, identify]);
    groups.set(parent, list);
  }

  const result: Book = {};
  for (const [parent, fields] of groups) {
    const theirsParent = theirs[parent];
    if (!isRow(theirsParent)) continue;
    const mineParent = isRow(mine[parent]) ? (mine[parent] as Row) : {};
    const baseParent = isRow(base?.[parent]) ? (base?.[parent] as Row) : null;

    // Производное берём с сервера целиком, а свои списки сливаем.
    const next: Row = { ...theirsParent };
    for (const [field, identify] of fields) {
      next[field] = mergeCollection(
        field,
        identify,
        baseParent,
        mineParent,
        theirsParent,
        new Map(),
        new Map(),
        []
      );
    }
    result[parent] = next;
  }
  return result;
}

/**
 * Сливает свою книгу с чужой, опираясь на основу.
 *
 * Поля, не разложенные на строки, — тема, валюта, ключ к ИИ, настройки — идут
 * по правилу «кто тронул, тот и прав», а при обоюдной правке берётся чужое.
 * Именно чужое, а не своё: два устройства обязаны прийти к одному ответу, иначе
 * они будут вечно переубеждать друг друга. Цена ошибки здесь — переключатель, а
 * не деньги; строки, где лежат деньги, разбираются выше и по-другому.
 */
export function mergeBooks(base: Book | null, mine: Book, theirs: Book): MergeReport {
  const conflicts: RowConflict[] = [];
  const mineMarks = tombstones(mine);
  const theirsMarks = tombstones(theirs);

  const state: Book = { ...theirs };

  for (const [collection, identify] of STAMPED) {
    // Раздела нет ни в одной из трёх книг — значит, его и не должно появиться.
    // Заведи мы пустой список на ровном месте, слитое перестало бы совпадать с
    // чужим, `differs` сказал бы «есть что отправить», и два устройства начали
    // бы гонять пустоту друг другу.
    if (!(collection in mine) && !(collection in theirs) && !(base && collection in base)) continue;
    state[collection] = mergeCollection(
      collection,
      identify,
      base,
      mine,
      theirs,
      mineMarks,
      theirsMarks,
      conflicts
    );
  }

  Object.assign(state, mergeNested(base, mine, theirs));

  for (const field of UNIONS) {
    if (!(field in mine) && !(field in theirs)) continue;
    const here = Array.isArray(mine[field]) ? (mine[field] as unknown[]) : [];
    const there = Array.isArray(theirs[field]) ? (theirs[field] as unknown[]) : [];
    state[field] = [...new Set([...there, ...here])].sort();
  }

  // Следы удалений объединяются: след, до которого одно устройство ещё не
  // дошло, обязан до него доехать, иначе удалённое воскреснет на следующем круге.
  const marks = new Map(theirsMarks);
  for (const [key, mark] of mineMarks) if (!marks.has(key)) marks.set(key, mark);
  if (marks.size > 0 || DELETIONS_FIELD in theirs) state[DELETIONS_FIELD] = [...marks.values()];

  // Остальные поля: тронувший прав, при обоюдной правке — чужое (оно уже
  // сверху). Поэтому здесь достаточно перенести своё там, где чужое совпало с
  // основой.
  if (base) {
    const handled = new Set<string>([
      ...STAMPED.map(([collection]) => collection),
      ...NESTED_ROWS.map(([parent]) => parent),
      ...UNIONS,
      DELETIONS_FIELD
    ]);
    for (const field of Object.keys(mine)) {
      if (handled.has(field)) continue;
      if (!sameValue(theirs[field], base[field])) continue;
      if (sameValue(mine[field], base[field])) continue;
      state[field] = mine[field];
    }
  }

  return { state, conflicts, differs: !sameValue(state, theirs) };
}
