#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    // Opens the GitHub releases page in the system browser when auto-update
    // can't proceed (the webview CSP blocks navigating to external URLs, so
    // window.open does nothing on desktop).
    .plugin(tauri_plugin_opener::init())
    // Reads public company fundamentals from smart-lab.ru for the investment
    // alert flags. Runs in Rust so the site's missing CORS headers don't block
    // it; the allowed URLs are restricted in capabilities/default.json.
    .plugin(tauri_plugin_http::init());

  // Desktop-only plugins — neither has an Android/iOS implementation. A phone
  // has no window geometry to remember, and on Android a new version arrives as
  // an APK the user installs, not through the updater endpoint (plan D4: the
  // plugin only verifies/installs updates in builds carrying the updater
  // config, i.e. the signed CI release build; elsewhere check() errors and the
  // UI falls back to the releases page).
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build());

  builder
    .setup(|_app| {
      // Future secure tokens must use OS keychain / secure storage, never plain files.
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Financial Assistant");
}
