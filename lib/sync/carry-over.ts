// Записи этого устройства, которые надо ДОБАВИТЬ к данным другого после
// подключения («Объединить»): все профили разом (ProfilesBackup из
// `/backup/profiles`). Живут в памяти вкладки от нажатия до подключения.
//
// Память — ЕДИНСТВЕННОЕ место, где они переживают подключение. Копия перед
// очисткой («Вернуть» в настройках) спасает, только пока подключение не
// состоялось: принимая чужой ключ, устройство сносит всё, что запечатано
// прежним (EncryptingStorageAdapter.clear), — и её тоже, а прочитать её было бы
// и нечем. Раньше здесь было написано обратное, и потерю никто не искал.
//
// На диск их не кладём: книга здесь хранится запечатанной, а эта копия лежала
// бы открытой. Вместо этого вкладка, пока держит записи, переспрашивает перед
// закрытием и перезагрузкой, — а если добавить их не вышло, экран подключения
// предлагает повторить или сохранить их в файл (pair-join.tsx).

let carried: unknown = null;

/** Закрыть вкладку сейчас — значит потерять записи: браузер переспросит. */
function holdPage(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Старые браузеры переспрашивают только так.
  event.returnValue = "";
}

export function carryOver(backup: unknown): void {
  carried = backup;
  if (typeof window !== "undefined") window.addEventListener("beforeunload", holdPage);
}

/** Посмотреть, не забирая: чтобы сохранить в файл и всё ещё иметь, что повторить. */
export function peekCarryOver(): unknown {
  return carried;
}

/** Забрать — один раз: второй вызов вернёт null. */
export function takeCarryOver(): unknown {
  const backup = carried;
  carried = null;
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", holdPage);
  return backup;
}
