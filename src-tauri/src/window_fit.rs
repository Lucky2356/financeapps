//! Окно по экрану: какого размера и где открыть главное окно, чтобы оно
//! целиком помещалось на мониторе — от ноутбука 1366×768 до 4K.
//!
//! Зачем это нужно. Размер окна в tauri.conf.json — 1280×820 логических
//! пикселей, и Windows кладёт его как есть, не глядя на экран. А «логических»
//! на типичном ноутбуке меньше, чем кажется: 1920×1080 при масштабе 150 % — это
//! 1280×720, минус панель задач. Окно вылезало за низ экрана, и вместе с ним
//! уезжали кнопки внизу страниц. Плагин window-state добавлял своё: он помнит
//! размер в ФИЗИЧЕСКИХ пикселях и не сверяет его с экраном — окно, растянутое на
//! 4K-мониторе, на ноутбуке открывалось больше самого ноутбука.
//!
//! Здесь только арифметика, без Tauri: так её можно проверить тестами, не
//! поднимая окна (`rustc --test src/window_fit.rs`). Все величины — в
//! физических пикселях, кроме тех, где в имени сказано `logical`.

/// Прямоугольник в физических пикселях экрана.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
  pub x: i32,
  pub y: i32,
  pub width: u32,
  pub height: u32,
}

/// Что сделать с окном.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Placement {
  /// Размер годится — только сдвинуть, если окно залезло за край.
  Move { x: i32, y: i32 },
  /// Окно больше экрана — уменьшить до `inner_*` (без рамки) и поставить по центру.
  Resize { x: i32, y: i32, inner_width: u32, inner_height: u32 },
  /// Экран маленький: окно приличного размера на нём не помещается, честнее
  /// развернуть на весь экран, чем показывать урезанное. Координаты и размер —
  /// для окна, из которого разворачивать: без них «Свернуть в окно» вернуло бы
  /// прежнее, больше экрана.
  Maximize { x: i32, y: i32, inner_width: u32, inner_height: u32 },
}

/// Поля вокруг окна, когда его приходится уменьшать: вплотную к краям экрана
/// оно выглядит как развёрнутое, только хуже.
const MARGIN_LOGICAL: f64 = 16.0;

/// Меньше этого (логических пикселей, без рамки) окно уже тесное — на таком
/// экране разворачиваем. Высота важнее ширины: при 700 и ниже таблицы и формы
/// помещаются впритык, а развёрнутое окно отдаёт ещё свои поля.
const SMALL_WIDTH_LOGICAL: f64 = 1100.0;
const SMALL_HEIGHT_LOGICAL: f64 = 700.0;

/// Наименьший размер окна, логические пиксели. Тот, что в tauri.conf.json, —
/// пока экран позволяет; на экране меньше — по экрану. Иначе Windows держит
/// окно не меньше минимума, даже когда минимум больше экрана: 1366×768 при
/// 125 % — это 1093×614 логических, а минимум был 960×640.
pub fn min_size_logical(
  work: Rect,
  frame: (u32, u32),
  scale: f64,
  configured: (f64, f64),
) -> (f64, f64) {
  let (avail_w, avail_h) = available_inner(work, frame);
  (
    configured.0.min(avail_w as f64 / scale).floor(),
    configured.1.min(avail_h as f64 / scale).floor(),
  )
}

/// Куда поставить окно.
///
/// `work` — рабочая область монитора (без панели задач), `window` — внешний
/// прямоугольник окна с рамкой, `frame` — сколько рамка добавляет к содержимому
/// по ширине и высоте, `scale` — масштаб монитора (1.0, 1.25, 1.5, 2.0…),
/// `preferred_logical` — размер содержимого из tauri.conf.json.
pub fn place(
  work: Rect,
  window: Rect,
  frame: (u32, u32),
  scale: f64,
  preferred_logical: (f64, f64),
) -> Placement {
  if window.width <= work.width && window.height <= work.height {
    return Placement::Move {
      x: clamp_axis(window.x, window.width, work.x, work.width),
      y: clamp_axis(window.y, window.height, work.y, work.height),
    };
  }

  let (avail_w, avail_h) = available_inner(work, frame);
  let margin = (MARGIN_LOGICAL * scale * 2.0).round() as u32;
  let inner_w = ((preferred_logical.0 * scale).round() as u32).min(avail_w.saturating_sub(margin));
  let inner_h = ((preferred_logical.1 * scale).round() as u32).min(avail_h.saturating_sub(margin));

  let outer_w = inner_w + frame.0;
  let outer_h = inner_h + frame.1;
  let x = work.x + (work.width.saturating_sub(outer_w) / 2) as i32;
  let y = work.y + (work.height.saturating_sub(outer_h) / 2) as i32;

  if (inner_w as f64) < SMALL_WIDTH_LOGICAL * scale
    || (inner_h as f64) < SMALL_HEIGHT_LOGICAL * scale
  {
    return Placement::Maximize { x, y, inner_width: inner_w, inner_height: inner_h };
  }
  Placement::Resize { x, y, inner_width: inner_w, inner_height: inner_h }
}

/// Сколько места остаётся под содержимое, если окно с рамкой занимает всю
/// рабочую область.
fn available_inner(work: Rect, frame: (u32, u32)) -> (u32, u32) {
  (
    work.width.saturating_sub(frame.0),
    work.height.saturating_sub(frame.1),
  )
}

/// Сдвинуть отрезок [start, start+len) внутрь [area, area+area_len).
/// Отрезок, который длиннее области, прижимается к её началу — заголовок окна
/// тогда остаётся на экране, за него можно взяться.
fn clamp_axis(start: i32, len: u32, area: i32, area_len: u32) -> i32 {
  let max_start = area + area_len.saturating_sub(len) as i32;
  start.clamp(area, max_start.max(area))
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Рамка Windows 11 при 100 %: по 8 пикселей сбоку и снизу, заголовок 31.
  /// При другом масштабе растёт вместе с ним.
  fn frame(scale: f64) -> (u32, u32) {
    ((16.0 * scale) as u32, (39.0 * scale) as u32)
  }

  /// Рабочая область монитора `w×h` с панелью задач высотой 48 логических
  /// пикселей снизу.
  fn work(w: u32, h: u32, scale: f64) -> Rect {
    Rect { x: 0, y: 0, width: w, height: h - (48.0 * scale) as u32 }
  }

  /// Окно размера по умолчанию (1280×820 логических) по центру монитора — так
  /// его ставит Windows при первом запуске.
  fn default_window(work: Rect, scale: f64) -> Rect {
    let (fw, fh) = frame(scale);
    let width = (1280.0 * scale) as u32 + fw;
    let height = (820.0 * scale) as u32 + fh;
    Rect {
      x: (work.width as i32 - width as i32) / 2,
      y: (work.height as i32 - height as i32) / 2,
      width,
      height,
    }
  }

  fn first_run(w: u32, h: u32, scale: f64) -> Placement {
    let work = work(w, h, scale);
    place(work, default_window(work, scale), frame(scale), scale, (1280.0, 820.0))
  }

  #[test]
  fn full_hd_at_100_keeps_the_default_size() {
    let work = work(1920, 1080, 1.0);
    let window = default_window(work, 1.0);
    assert_eq!(
      first_run(1920, 1080, 1.0),
      Placement::Move { x: window.x, y: window.y }
    );
  }

  #[test]
  fn four_k_at_150_and_200_keep_the_default_size() {
    assert!(matches!(first_run(3840, 2160, 1.5), Placement::Move { .. }));
    assert!(matches!(first_run(3840, 2160, 2.0), Placement::Move { .. }));
  }

  #[test]
  fn hd_laptops_maximize() {
    // 1366×768 при 100 % и 125 %, 1920×1080 при 150 %: по высоте окно
    // приличного размера не помещается.
    for (w, h, scale) in [(1366, 768, 1.0), (1366, 768, 1.25), (1920, 1080, 1.5), (1280, 800, 1.0)] {
      let placement = first_run(w, h, scale);
      let Placement::Maximize { x, y, inner_width, inner_height } = placement else {
        panic!("{w}×{h} при {scale}: ожидался разворот, а не {placement:?}");
      };
      // Окно, в которое оно свернётся, — на экране целиком.
      let work = work(w, h, scale);
      let (fw, fh) = frame(scale);
      assert!(x >= 0 && y >= 0, "{w}×{h} при {scale}");
      assert!(x as u32 + inner_width + fw <= work.width, "{w}×{h} при {scale}");
      assert!(y as u32 + inner_height + fh <= work.height, "{w}×{h} при {scale}");
    }
  }

  #[test]
  fn full_hd_at_125_shrinks_to_fit_and_centers() {
    // Самый частый ноутбук: 1536×792 логических под окна, а окно с рамкой —
    // 1296×859. Помещается по ширине, не помещается по высоте.
    let scale = 1.25;
    let w = work(1920, 1080, scale);
    let Placement::Resize { x, y, inner_width, inner_height } = first_run(1920, 1080, scale) else {
      panic!("ожидалось уменьшение");
    };
    let (fw, fh) = frame(scale);
    assert_eq!(inner_width, 1600, "ширина остаётся той, что задана");
    assert!(inner_height + fh <= w.height, "по высоте помещается целиком");
    assert!(inner_height as f64 >= SMALL_HEIGHT_LOGICAL * scale);
    assert_eq!(x as u32 * 2 + inner_width + fw, w.width, "по центру по горизонтали");
    assert!(y >= 0);
  }

  #[test]
  fn window_saved_on_4k_is_brought_onto_a_laptop() {
    // Растянули на 4K при 100 % — 2400×1500 физических. Потом открыли на
    // ноутбуке 1920×1080 при 125 %.
    let scale = 1.25;
    let w = work(1920, 1080, scale);
    let saved = Rect { x: 300, y: 200, width: 2400, height: 1500 };
    let placement = place(w, saved, frame(scale), scale, (1280.0, 820.0));
    let Placement::Resize { x, y, inner_width, inner_height } = placement else {
      panic!("ожидалось уменьшение, а не {placement:?}");
    };
    let (fw, fh) = frame(scale);
    assert!(x >= 0 && y >= 0);
    assert!(x as u32 + inner_width + fw <= w.width);
    assert!(y as u32 + inner_height + fh <= w.height);
  }

  #[test]
  fn window_hanging_off_the_edge_is_moved_back() {
    // Монитор, на котором окно стояло, отключили — или оно уехало за низ.
    let w = work(1920, 1080, 1.0);
    let window = Rect { x: 1500, y: 700, width: 1000, height: 700 };
    assert_eq!(
      place(w, window, frame(1.0), 1.0, (1280.0, 820.0)),
      Placement::Move { x: 920, y: w.height as i32 - 700 }
    );
    let above = Rect { x: -50, y: -400, width: 1000, height: 700 };
    assert_eq!(
      place(w, above, frame(1.0), 1.0, (1280.0, 820.0)),
      Placement::Move { x: 0, y: 0 }
    );
  }

  #[test]
  fn second_monitor_to_the_left_has_negative_coordinates() {
    // Второй монитор слева от основного: его координаты отрицательные, и
    // окно на нём — не «за краем», трогать его не надо.
    let w = Rect { x: -2560, y: 0, width: 2560, height: 1392 };
    let window = Rect { x: -2000, y: 100, width: 1296, height: 859 };
    assert_eq!(
      place(w, window, frame(1.0), 1.0, (1280.0, 820.0)),
      Placement::Move { x: -2000, y: 100 }
    );
  }

  #[test]
  fn min_size_follows_a_small_screen() {
    // 1366×768 при 125 %: под содержимое остаётся меньше минимума по высоте.
    let scale = 1.25;
    let (min_w, min_h) = min_size_logical(work(1366, 768, scale), frame(scale), scale, (960.0, 640.0));
    assert_eq!(min_w, 960.0);
    assert!(min_h < 640.0);
    assert!(min_h * scale + frame(scale).1 as f64 <= work(1366, 768, scale).height as f64);
  }

  #[test]
  fn min_size_stays_as_configured_on_a_big_screen() {
    assert_eq!(
      min_size_logical(work(1920, 1080, 1.0), frame(1.0), 1.0, (960.0, 640.0)),
      (960.0, 640.0)
    );
  }
}
