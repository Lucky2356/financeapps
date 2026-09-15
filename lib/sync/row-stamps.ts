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
//   * Записи об удалённых строках. Удалённая строка просто исчезает, и слияние
//     не отличит «у них удалили» от «у нас ещё не добавили». Это работа 06.5;
//     до неё синхронизации нет вовсе, и терять пока нечего — первая отправка
//     кладёт книгу на сервер целиком.
//   * Котировок и всего производного (см. STAMPED ниже).

/**
 * Строка книги с отметкой времени последней правки. Отметка необязательна и
 * этим значима: её отсутствие — «строка была здесь до отметок», а не «правили
 * в начале времён».
 */
export type Stamped<T> = T & { updatedAt?: string };

/** Как узнать строку среди своих: у большинства — id, у планов — месяц и статья. */
type Identity = (row: Record<string, unknown>) => string | null;

const byId: Identity = (row) => (typeof row.id === "string" && row.id ? row.id : null);

function byFields(...fields: string[]): Identity {
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
function sameValue(a: unknown, b: unknown): boolean {
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

function sameRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return sameValue({ ...a, [STAMP_FIELD]: undefined }, { ...b, [STAMP_FIELD]: undefined });
}

/** Прежние строки раздела, разложенные по опознанию, — чтобы искать за раз. */
function indexRows(rows: unknown, identify: Identity): Map<string, Record<string, unknown>> {
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
