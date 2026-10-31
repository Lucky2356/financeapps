//! Файлы приложения в папке, которую выбрал человек: ежедневные копии и файл
//! синхронизации через облачную папку.
//!
//! Зачем это в Rust, а не через плагин fs из страницы. Папку человек выбирает
//! один раз, а копия пишется каждый день, и после перезапуска её путь в права
//! плагина не попадает. Поэтому странице прежде давали писать, читать и
//! УДАЛЯТЬ файлы во всей домашней папке — и любой скрипт в странице мог бы
//! стереть или переписать документы человека. Здесь права уже: только файлы с
//! именами самого приложения, только прямо в указанной папке. Чужой файл с
//! этими командами не прочитать, не перезаписать и не удалить, как бы ни
//! звали папку.
//!
//! Проверка имён и сами действия проверяются тестами внизу (`cargo test`).

use std::fs;
use std::path::{Path, PathBuf};

/// Начало и конец имени ежедневной копии (lib/backup/auto-backup.ts).
const BACKUP_PREFIX: &str = "financeapps-backup-";
const BACKUP_SUFFIX: &str = ".json";

/// Имя файла синхронизации через папку (lib/sync/FolderSyncService.ts).
const SYNC_FILENAME: &str = "financeapps-sync.enc";

/// Копия больше этого — не наша (полная книга с запасом — десятки МБ).
const MAX_FILE_BYTES: usize = 200 * 1024 * 1024;

/// Имя ежедневной копии: `financeapps-backup-2026-10-31-143000.json`, без
/// путей и подкаталогов — только буквы, цифры и дефис между началом и концом.
pub fn is_backup_name(name: &str) -> bool {
  let Some(middle) = name
    .strip_prefix(BACKUP_PREFIX)
    .and_then(|rest| rest.strip_suffix(BACKUP_SUFFIX))
  else {
    return false;
  };
  !middle.is_empty()
    && middle.len() <= 64
    && middle.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Папка — настоящая и полная: абсолютный путь к существующему каталогу. Пустая
/// строка или относительный путь писали бы рядом с программой.
fn folder_of(folder: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(folder);
  if folder.trim().is_empty() || !path.is_absolute() {
    return Err("Папка указана неверно.".into());
  }
  if !path.is_dir() {
    return Err("Папки нет — выберите её заново.".into());
  }
  Ok(path)
}

/// Файл в папке, имя которого уже проверено. Ссылку (symlink) не трогаем:
/// через неё имя приложения указывало бы на чужой файл.
fn file_in(folder: &Path, name: &str) -> Result<PathBuf, String> {
  let path = folder.join(name);
  if let Ok(meta) = fs::symlink_metadata(&path) {
    if meta.file_type().is_symlink() {
      return Err("Файл приложения в папке подменён ссылкой — его не трогаем.".into());
    }
  }
  Ok(path)
}

fn too_big(content: &str) -> Result<(), String> {
  if content.len() > MAX_FILE_BYTES {
    return Err("Слишком большой файл.".into());
  }
  Ok(())
}

/// Записать ежедневную копию.
#[tauri::command]
pub fn backup_write(folder: String, name: String, content: String) -> Result<(), String> {
  if !is_backup_name(&name) {
    return Err("Имя копии не похоже на копию приложения.".into());
  }
  too_big(&content)?;
  let path = file_in(&folder_of(&folder)?, &name)?;
  fs::write(path, content).map_err(|error| error.to_string())
}

/// Имена ежедневных копий в папке — только они, чужие файлы не перечисляются.
#[tauri::command]
pub fn backup_list(folder: String) -> Result<Vec<String>, String> {
  let entries = fs::read_dir(folder_of(&folder)?).map_err(|error| error.to_string())?;
  Ok(
    entries
      .filter_map(|entry| entry.ok())
      .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
      .filter_map(|entry| entry.file_name().into_string().ok())
      .filter(|name| is_backup_name(name))
      .collect(),
  )
}

/// Удалить старую ежедневную копию. Только файл с именем копии: удалить этой
/// командой что-то другое нельзя.
#[tauri::command]
pub fn backup_remove(folder: String, name: String) -> Result<(), String> {
  if !is_backup_name(&name) {
    return Err("Удалять можно только копии приложения.".into());
  }
  let path = file_in(&folder_of(&folder)?, &name)?;
  fs::remove_file(path).map_err(|error| error.to_string())
}

/// Записать файл синхронизации через папку (он уже зашифрован в странице).
#[tauri::command]
pub fn sync_file_write(folder: String, content: String) -> Result<(), String> {
  too_big(&content)?;
  let path = file_in(&folder_of(&folder)?, SYNC_FILENAME)?;
  fs::write(path, content).map_err(|error| error.to_string())
}

/// Прочитать файл синхронизации через папку.
#[tauri::command]
pub fn sync_file_read(folder: String) -> Result<String, String> {
  let path = file_in(&folder_of(&folder)?, SYNC_FILENAME)?;
  fs::read_to_string(path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn backup_names() {
    assert!(is_backup_name("financeapps-backup-2026-10-31-143000.json"));
    assert!(!is_backup_name("financeapps-backup-.json"));
    assert!(!is_backup_name("financeapps-backup-../../secret.json"));
    assert!(!is_backup_name("financeapps-backup-2026/../x.json"));
    assert!(!is_backup_name("financeapps-backup-2026\\x.json"));
    assert!(!is_backup_name("report.docx"));
    assert!(!is_backup_name("financeapps-backup-2026.json.exe"));
    assert!(!is_backup_name("financeapps-sync.enc"));
  }

  #[test]
  fn folder_must_be_absolute_and_real() {
    assert!(folder_of("").is_err());
    assert!(folder_of("relative/dir").is_err());
    let missing = std::env::temp_dir().join("financeapps-no-such-folder-xyz");
    assert!(folder_of(missing.to_str().unwrap()).is_err());
    assert!(folder_of(std::env::temp_dir().to_str().unwrap()).is_ok());
  }

  #[test]
  fn write_list_remove_round_trip() {
    let dir = std::env::temp_dir().join(format!("financeapps-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let folder = dir.to_str().unwrap().to_string();
    fs::write(dir.join("чужой.txt"), "не трогать").unwrap();

    backup_write(folder.clone(), "financeapps-backup-1.json".into(), "{}".into()).unwrap();
    assert_eq!(backup_list(folder.clone()).unwrap(), vec!["financeapps-backup-1.json"]);
    assert!(backup_remove(folder.clone(), "чужой.txt".into()).is_err());
    backup_remove(folder.clone(), "financeapps-backup-1.json".into()).unwrap();
    assert!(backup_list(folder.clone()).unwrap().is_empty());
    assert!(dir.join("чужой.txt").exists());

    sync_file_write(folder.clone(), "зашифровано".into()).unwrap();
    assert_eq!(sync_file_read(folder).unwrap(), "зашифровано");
    fs::remove_dir_all(&dir).unwrap();
  }
}
