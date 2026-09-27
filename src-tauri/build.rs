fn main() {
  // «installer» — свой маленький плагин Android (gen/android/.../InstallerPlugin.kt):
  // скачать APK обновления и открыть экран установки, а ещё отдать ссылку
  // financeapps://pair…, которой приложение открыли из QR-кода, и вход по
  // отпечатку (ключ данных под ключом хранилища Android). Права на его
  // команды выводятся здесь, как у настоящих плагинов.
  tauri_build::try_build(tauri_build::Attributes::new().plugin(
    "installer",
    tauri_build::InlinedPlugin::new()
      .commands(&[
        "install",
        "take_link",
        "biometric_status",
        "biometric_seal",
        "biometric_open",
        "biometric_forget",
      ])
      .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
  ))
  .expect("failed to run tauri-build");
}
