// Отступ под строкой состояния телефона.
//
// ПОЧЕМУ ЗАПОМИНАТЬ. `env(safe-area-inset-top)` в WebView на Android иногда на
// время сбрасывается в 0 — например, после закрытия камеры со сканером QR:
// система возвращает панели, а страница об этом не узнаёт. Шапка «Настройки»
// тогда уезжает под часы и значки. Само значение известно из прошлого замера,
// так что при внезапном нуле берём его, а не гадаем.

export const SAFE_TOP_KEY = "fa-safe-top";

/** Что взять за отступ: свежий замер, а при нуле в портрете — запомненный. */
export function pickSafeTop(measured: number, remembered: number, portrait: boolean): number {
  const fresh = Number.isFinite(measured) && measured > 0 ? measured : 0;
  if (fresh > 0) return fresh;
  const kept = Number.isFinite(remembered) && remembered > 0 ? remembered : 0;
  // Боком строка состояния другая (или её нет): чужой портретный отступ там
  // отнял бы место зря.
  return portrait ? kept : 0;
}

/** Запомнить портретный замер — он же и станет запасным. */
export function rememberSafeTop(measured: number, remembered: number, portrait: boolean): number {
  if (!portrait || !Number.isFinite(measured) || measured <= 0) return remembered;
  return measured;
}
