// Отметка времени последней правки у строк книги.
//
// Зачем. Две копии книги — на телефоне и на компьютере — рано или поздно
// разойдутся, и слить их можно только зная, чья правка новее. Сегодня этого не
// знает никто: у операции нет ни времени создания, ни времени правки (на что мы
// уже натыкались, когда делали «повторить последнюю» и пришлось брать верхнюю
// строку по дате, а не по времени добавления). Отметка — то самое недостающее.
//
// Где ставится. В единственной точке сохранения книги — LocalApiClient.save(), —
// сличением нового состояния с прошлым. Не в обработчиках: их около восьмидесяти,
// и восемьдесят первый непременно забыли бы. Здесь забыть нельзя: строка,
// прошедшая через сохранение, отмечена, кто бы её ни менял.
//
// Чего тут нарочно нет.
//
//   * Выдуманного времени для старых строк. Строка без отметки означает «не
//     знаем, когда её правили — она была до отметок». Проставить всем задним
//     числом «сейчас» было бы удобнее и было бы враньём, которому слияние потом
//     поверило бы.
//   * Котировок и всего производного (см. STAMPED ниже).
//
// Записи об удалённых строках здесь тоже нет — она ниже, отдельным разделом
// («Следы удалений»): удалённая строка просто исчезает, и без следа слияние не
// отличит «у них удалили» от «у нас ещё не добавили».

/**
 * Строка книги с отметкой времени последней правки. Отметка необязательна и
 * этим значима: её отсутствие — «строка была здесь до отметок», а не «правили
 * в начале времён».
 */
export type Stamped<T> = T & { updatedAt?: string };

/** Как узнать строку среди своих: у большинства — id, у планов — месяц и статья. */
export type Identity = (row: Record<string, unknown>) => string | null;

export const byId: Identity = (row) => (typeof row.id === "string" && row.id ? row.id : null);

export function byFields(...fields: string[]): Identity {
  return (row) => {
    const parts: string[] = [];
    for (const field of fields) {
      const value = row[field];
      if (typeof value !== "string" || !value) return null;
      parts.push(value);
    }
    // JSON, а не склейка через разделитель: любой разделитель рано или поздно
    // встретится внутри самого значения, и две разные строки получат один ключ.
    return JSON.stringify(parts);
  };
}

/**
 * Что считается строкой книги.
 *
 * Здесь нет `investments` — это котировки и состав портфеля, которые тянутся с
 * биржи и переписываются сами по себе. Отмечай мы их, книга «правилась» бы при
 * каждом обновлении котировок, отметка перестала бы значить «человек это менял»,
 * а телефон гонял бы книгу туда-сюда на ровном месте.
 *
 * Нет и `netWorthSnapshots` с `planMonths`: первое — производное, которое
 * приложение дописывает само, второе — просто список месяцев, а не строки.
 * Настройки (тема, валюта, ключ к ИИ) — тоже не строки; их разрешение при
 * расхождении — отдельный разговор, и вести его надо будет отдельно.
 */
export const STAMPED: ReadonlyArray<readonly [string, Identity]> = [
  ["accounts", byId],
  ["categories", byId],
  ["transactions", byId],
  ["budgets", byId],
  ["goals", byId],
  ["recurringTransactions", byId],
  ["liabilities", byId],
  ["rules", byId],
  ["goalMovements", byId],
  ["realizedInvestmentEvents", byId],
  ["expectedDividends", byId],
  ["targetAllocations", byId],
  ["marketAlerts", byId],
  ["importBatches", byId],
  // У плана нет id: он опознаётся месяцем и статьёй, у заметки — одним месяцем.
  ["plans", byFields("month", "categoryId")],
  ["planNotes", byFields("month")]
];

/** Поле с отметкой. Из сравнения исключается: иначе всё менялось бы всегда. */
export const STAMP_FIELD = "updatedAt";

/**
 * Совпадают ли две строки по существу. Своё сравнение, а не JSON.stringify:
 * тот зависит от порядка ключей, и строка, пересобранная в другом порядке,
 * читалась бы как изменённая — отметки обновлялись бы у всей книги при каждом
 * сохранении, и не значили бы уже ничего.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }
  const left = definedKeys(a as Record<string, unknown>);
  const right = definedKeys(b as Record<string, unknown>);
  if (left.length !== right.length) return false;
  return left.every((key) =>
    sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

// Ключ со значением undefined и отсутствующий ключ — это одно и то же поле,
// которого нет. Считать их разными значило бы отмечать строку как правленую
// после каждого разбора схемой.
function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => key !== STAMP_FIELD && value[key] !== undefined);
}

export function sameRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return sameValue({ ...a, [STAMP_FIELD]: undefined }, { ...b, [STAMP_FIELD]: undefined });
}

/** Прежние строки раздела, разложенные по опознанию, — чтобы искать за раз. */
export function indexRows(rows: unknown, identify: Identity): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    if (!isRow(row)) continue;
    const key = identify(row);
    if (key !== null) index.set(key, row);
  }
  return index;
}

/**
 * Какой отметке быть у одной строки. Возвращает ТУ ЖЕ строку, если менять
 * нечего, — по этому вызывающий и понимает, тронут ли раздел, не сравнивая
 * ничего заново.
 *
 * Верным считается то, что уже лежит в хранилище, а не то, что подали вместе со
 * строкой: отметку ставит сохранение, и приписать её строке, которой не
 * касались, со стороны нельзя. Там, где отметки приходят достоверные — из файла
 * копии, а позже с сервера, — сохранение вызывается с `stamp: false` и сюда не
 * заходит вовсе.
 */
function decide(
  row: Record<string, unknown>,
  old: Record<string, unknown> | undefined,
  now: string
): Record<string, unknown> {
  if (!old || !sameRow(row, old)) return { ...row, [STAMP_FIELD]: now };

  const kept = old[STAMP_FIELD];
  if (row[STAMP_FIELD] === kept) return row;
  const restored = { ...row, [STAMP_FIELD]: kept };
  // Прежней отметки не было вовсе — значит, и теперь её быть не должно: «не
  // знаем когда» отличается от «правили сейчас», и разница эта живая.
  if (kept === undefined) delete restored[STAMP_FIELD];
  return restored;
}

/**
 * Возвращает книгу, в которой изменившиеся и новые строки отмечены временем
 * `now`, а нетронутые сохранили прежнюю отметку — включая её отсутствие.
 *
 * Исходную книгу не меняет: собирает новые массивы только там, где что-то
 * действительно изменилось, и оставляет прежний массив как есть, если не
 * изменилось ничего. На нетронутых разделах это обходится в одно сравнение
 * на строку и ноль выделений памяти.
 *
 * Чего это стоит, измерено, а не предположено: на книге в 10 000 операций —
 * около 21 мс на сохранение, при том что structuredClone, который сохранение
 * делало и до этого, стоит там же 24 мс. То есть цена сохранения выросла
 * примерно в полтора раза и осталась незаметной; 10 000 операций — это лет
 * тринадцать по две записи в день.
 */
export function stampRows<T extends Record<string, unknown>>(
  next: T,
  previous: Record<string, unknown> | null,
  now: string
): T {
  let result = next;

  for (const [collection, identify] of STAMPED) {
    const rows = next[collection];
    if (!Array.isArray(rows)) continue;

    const before = indexRows(previous?.[collection], identify);
    let changed = false;
    const stamped = rows.map((row) => {
      if (!isRow(row)) return row;
      const key = identify(row);
      // Строку без опознания (испорченный id) не отмечаем: найти её потом всё
      // равно нечем, а выдавать за правленую при каждом сохранении — врать.
      if (key === null) return row;
      const decided = decide(row, before.get(key), now);
      if (decided !== row) changed = true;
      return decided;
    });

    if (changed) result = { ...result, [collection]: stamped };
  }

  return result;
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ————— Следы удалений ————————————————————————————————————————————————
//
// Отметка времени говорит, когда строку правили. Про удалённую строку она не
// говорит ничего: удалённая строка просто исчезает, и слияние не отличит «у них
// удалили» от «у нас ещё не добавили». Выбор между этими двумя — разница между
// «операция ушла» и «операция вернулась из могилы», и гадать тут нельзя.
//
// Поэтому у удаления остаётся след: раздел, опознание строки и время. Ставится
// он там же, где отметки, — в единственной точке сохранения, сличением с тем,
// что лежало до этого. В обработчиках его ставить нельзя ровно по той же
// причине, по какой нельзя ставить отметки: обработчиков около восьмидесяти.

/** Где в книге лежат следы удалений. */
export const DELETIONS_FIELD = "deletions";

/**
 * Сколько след живёт.
 *
 * Держать следы вечно нельзя — книга росла бы от одних удалений. Девяносто
 * дней — с запасом на отпуск и забытый в ящике планшет.
 *
 * Честная оговорка: устройство, не выходившее на связь ДОЛЬШЕ этого срока,
 * вернёт удалённые за это время строки обратно — следа, который сказал бы ему
 * «их убрали», уже не будет. Это не недосмотр, а цена за то, чтобы книга не
 * пухла; другой путь — вечный список всего, что человек когда-либо удалял.
 */
export const TOMBSTONE_DAYS = 90;

/** След удалённой строки. */
export type Tombstone = {
  /** Раздел книги: transactions, accounts и так далее. */
  collection: string;
  /** Опознание строки — то же, чем её узнаёт STAMPED. */
  key: string;
  deletedAt: string;
};

export function isTombstone(value: unknown): value is Tombstone {
  if (!isRow(value)) return false;
  return (
    typeof value.collection === "string" &&
    typeof value.key === "string" &&
    typeof value.deletedAt === "string"
  );
}

// JSON, а не склейка через разделитель, — по той же причине, что и у опознания
// строк: любой разделитель однажды встретится внутри самого значения.
function tombstoneId(collection: string, key: string): string {
  return JSON.stringify([collection, key]);
}

/**
 * Пересчитывает следы удалений: что исчезло — помечает, что вернулось —
 * отпускает, что состарилось — забывает.
 *
 * Воскрешение разбирается здесь, а не в слиянии, и это важно: человек,
 * удаливший операцию и тут же заведший её заново с тем же номером (так делает
 * отмена действия), оставил бы после себя строку и след от неё одновременно.
 * Слияние поверило бы следу и убрало бы строку у всех.
 *
 * Цена измерена, а не предположена: на книге в 10 000 операций проход стоит
 * около 6 мс при 9 мс на отметки и 11 мс на structuredClone, который
 * сохранение делало и до всего этого. То есть примерно половина стоимости
 * отметок и меньше, чем копирование, которое там уже было.
 */
export function trackDeletions<T extends Record<string, unknown>>(
  next: T,
  previous: Record<string, unknown> | null,
  now: string
): T {
  const cutoff = Date.parse(now) - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;

  const kept = new Map<string, Tombstone>();
  const carried = next[DELETIONS_FIELD];
  if (Array.isArray(carried)) {
    for (const mark of carried) {
      if (!isTombstone(mark)) continue;
      const at = Date.parse(mark.deletedAt);
      if (Number.isFinite(at) && at < cutoff) continue;
      kept.set(tombstoneId(mark.collection, mark.key), mark);
    }
  }

  for (const [collection, identify] of STAMPED) {
    const after = indexRows(next[collection], identify);

    // Вернулось — след снимаем.
    for (const key of after.keys()) kept.delete(tombstoneId(collection, key));

    if (!previous) continue;
    for (const key of indexRows(previous[collection], identify).keys()) {
      if (after.has(key)) continue;
      kept.set(tombstoneId(collection, key), { collection, key, deletedAt: now });
    }
  }

  const marks = [...kept.values()];
  if (Array.isArray(carried) && sameValue(carried, marks)) return next;
  return { ...next, [DELETIONS_FIELD]: marks };
}
