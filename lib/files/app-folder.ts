// Файлы приложения в выбранной человеком папке — через команды Rust
// (src-tauri/src/folder_files.rs), а не через плагин fs.
//
// Плагину fs для этого нужны были права на всю домашнюю папку: путь к папке,
// выбранной в прошлый раз, после перезапуска в его права не попадает. Команды
// Rust трогают только файлы с именами самого приложения и только в указанной
// папке — чужой документ ими не прочитать, не переписать и не удалить.

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** Записать ежедневную копию с именем из backupFileName(). */
export function writeBackupFile(folder: string, name: string, content: string): Promise<void> {
  return call("backup_write", { folder, name, content });
}

/** Имена ежедневных копий в папке (чужие файлы не перечисляются). */
export function listBackupFiles(folder: string): Promise<string[]> {
  return call("backup_list", { folder });
}

/** Удалить старую ежедневную копию. */
export function removeBackupFile(folder: string, name: string): Promise<void> {
  return call("backup_remove", { folder, name });
}

/** Записать (уже зашифрованный) файл синхронизации через папку. */
export function writeSyncFile(folder: string, content: string): Promise<void> {
  return call("sync_file_write", { folder, content });
}

/** Прочитать файл синхронизации через папку. */
export function readSyncFile(folder: string): Promise<string> {
  return call("sync_file_read", { folder });
}
