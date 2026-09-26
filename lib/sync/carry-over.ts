// Записи этого устройства, которые надо ДОБАВИТЬ к данным другого после
// подключения («Объединить»). Живут в памяти вкладки от нажатия до подключения:
// на диск их класть незачем — если подключение сорвётся, есть копия перед
// очисткой («Вернуть» в настройках).

let carried: unknown = null;

export function carryOver(backup: unknown): void {
  carried = backup;
}

/** Забрать — один раз: второй вызов вернёт null. */
export function takeCarryOver(): unknown {
  const backup = carried;
  carried = null;
  return backup;
}
