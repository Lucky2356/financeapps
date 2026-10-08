#[cfg(desktop)]
mod window_fit;

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
    // Окно восстанавливается не само, а в setup ниже: сначала размер с прошлого
    // раза, потом сверка с экраном, и только потом окно показывается. Видимость
    // плагин не трогает — иначе окно мелькнуло бы в старом размере.
    .plugin(
      tauri_plugin_window_state::Builder::new()
        .with_state_flags(window_state_flags())
        .skip_initial_state("main")
        .build(),
    )
    .plugin(tauri_plugin_updater::Builder::new().build());

  // Mobile-only — the camera, for reading the pairing QR. Mirrors the block
  // above: the scanner has no desktop implementation and would not compile
  // into the Windows build. A computer reading a QR off its own screen is not
  // a case that exists: the picture is SHOWN there, not read.
  #[cfg(mobile)]
  let builder = builder
    .plugin(tauri_plugin_barcode_scanner::init())
    .plugin(installer());

  builder
    .setup(|_app| {
      // Future secure tokens must use OS keychain / secure storage, never plain files.
      #[cfg(desktop)]
      open_main_window(_app);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Financial Assistant");
}

#[cfg(desktop)]
fn window_state_flags() -> tauri_plugin_window_state::StateFlags {
  tauri_plugin_window_state::StateFlags::all() - tauri_plugin_window_state::StateFlags::VISIBLE
}

/// Показать главное окно — по размеру экрана.
///
/// В tauri.conf.json окно создаётся скрытым: здесь ему возвращают размер с
/// прошлого раза, сверяют с монитором (window_fit.rs) и только потом
/// показывают. Показ — безусловный: что бы ни сломалось в сверке, окно должно
/// появиться, скрытое приложение хуже любого размера.
#[cfg(desktop)]
fn open_main_window<R: tauri::Runtime>(app: &tauri::App<R>) {
  use tauri::Manager;
  use tauri_plugin_window_state::WindowExt;

  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  let _ = window.restore_state(window_state_flags());
  if let Err(error) = fit_to_monitor(&window) {
    eprintln!("окно не подогнано под экран: {error}");
  }
  let _ = window.show();
  let _ = window.set_focus();
}

#[cfg(desktop)]
fn fit_to_monitor<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> tauri::Result<()> {
  use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalSize};
  use window_fit::{Placement, Rect};

  // Размеры из tauri.conf.json — одно место правды, здесь их не повторяем.
  let config = window.config().app.windows.iter().find(|w| w.label == "main");
  let preferred = config.map_or((1280.0, 820.0), |w| (w.width, w.height));
  let configured_min = config
    .and_then(|w| Some((w.min_width?, w.min_height?)))
    .unwrap_or((960.0, 640.0));

  let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
    return Ok(());
  };
  let scale = monitor.scale_factor();
  let area = monitor.work_area();
  // Рабочая область бывает нулевой там, где система её не сообщает
  // (часть оконных менеджеров Linux) — тогда берём весь монитор.
  let work = if area.size.width > 0 && area.size.height > 0 {
    Rect { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height }
  } else {
    Rect {
      x: monitor.position().x,
      y: monitor.position().y,
      width: monitor.size().width,
      height: monitor.size().height,
    }
  };

  let outer = window.outer_size()?;
  let inner = window.inner_size()?;
  let frame = (
    outer.width.saturating_sub(inner.width),
    outer.height.saturating_sub(inner.height),
  );

  let (min_w, min_h) = window_fit::min_size_logical(work, frame, scale, configured_min);
  window.set_min_size(Some(LogicalSize::new(min_w, min_h)))?;

  if window.is_maximized()? {
    return Ok(());
  }

  let position = window.outer_position()?;
  let current = Rect { x: position.x, y: position.y, width: outer.width, height: outer.height };
  match window_fit::place(work, current, frame, scale, preferred) {
    Placement::Move { x, y } => {
      if (x, y) != (position.x, position.y) {
        window.set_position(PhysicalPosition::new(x, y))?;
      }
    }
    Placement::Resize { x, y, inner_width, inner_height } => {
      window.set_size(PhysicalSize::new(inner_width, inner_height))?;
      window.set_position(PhysicalPosition::new(x, y))?;
    }
    Placement::Maximize { x, y, inner_width, inner_height } => {
      window.set_size(PhysicalSize::new(inner_width, inner_height))?;
      window.set_position(PhysicalPosition::new(x, y))?;
      window.maximize()?;
    }
  }
  Ok(())
}

/// Обновление на телефоне без браузера: скачать APK и открыть установку.
/// Вся работа — на стороне Android (InstallerPlugin.kt); здесь только
/// регистрация, чтобы вызов из страницы нашёл, куда идти.
#[cfg(mobile)]
fn installer<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri::plugin::Builder::new("installer")
    .setup(|_app, _api| {
      #[cfg(target_os = "android")]
      _api.register_android_plugin("ru.lucky2356.financeapps", "InstallerPlugin")?;
      Ok(())
    })
    .build()
}
