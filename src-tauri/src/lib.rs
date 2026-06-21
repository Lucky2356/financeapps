#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Auto-update plugins (plan D4). The plugin only verifies/installs updates
    // in builds that carry the updater config (the signed CI release build);
    // in plain local builds check() simply errors and the UI falls back to the
    // releases page.
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|_app| {
      // Future secure tokens must use OS keychain / secure storage, never plain files.
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Financial Assistant desktop app");
}
