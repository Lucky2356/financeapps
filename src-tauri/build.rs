fn main() {
  // «installer» — свой маленький плагин: скачать APK обновления и открыть
  // экран установки на Android (gen/android/.../InstallerPlugin.kt). Права на
  // его единственную команду выводятся здесь, как у настоящих плагинов.
  tauri_build::try_build(tauri_build::Attributes::new().plugin(
    "installer",
    tauri_build::InlinedPlugin::new()
      .commands(&["install"])
      .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
  ))
  .expect("failed to run tauri-build");
}
