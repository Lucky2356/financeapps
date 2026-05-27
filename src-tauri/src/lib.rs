#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|_app| {
      // Future secure tokens must use OS keychain / secure storage, never plain files.
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Financial Assistant desktop app");
}
