fn main() {
  // «installer» — свой маленький плагин Android (gen/android/.../InstallerPlugin.kt):
  // скачать APK обновления и открыть экран установки, а ещё отдать ссылку
  // financeapps://pair…, которой приложение открыли из QR-кода, и вход по
  // отпечатку (ключ данных под ключом хранилища Android), напоминания,
  // виджет на рабочем столе, траты из уведомлений банка и связь с Лоли. Права на его
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
        "notify_permission",
        "notify_schedule",
        "notify_cancel_all",
        "widget_update",
        "bank_status",
        "bank_open_settings",
        "bank_take",
        "loli_status",
        "loli_config",
        "loli_take",
        "loli_ack",
        "loli_summary",
      ])
      .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
  ))
  .expect("failed to run tauri-build");
}
