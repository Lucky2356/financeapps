"use client";

// Камера: прочитать картинку связки на телефоне.
//
// ПОЧЕМУ ЧЕРЕЗ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ПРЯМО В ЭКРАНЕ. Плагин камеры есть только
// в мобильной сборке: на Windows его нет в принципе, а в обычном браузере
// (`npm run dev`, проверки) нет и самого Tauri. Ввези его экран напрямую —
// и экран перестал бы собираться везде, кроме телефона. Поэтому ввоз здесь и
// ленивый: модуль подтягивается в тот момент, когда человек нажал «навести
// камеру», и только там, где он есть.
//
// ПОЧЕМУ ОТКАЗ — ЭТО СТРОКА, А НЕ ИСКЛЮЧЕНИЕ. У камеры четыре обычных исхода,
// и три из них не поломки: человек запретил доступ, человек передумал и закрыл
// видоискатель, камеры нет вовсе. Разбирать их по тексту чужого исключения
// значило бы гадать; поэтому каждый назван своим словом, и экран говорит
// человеку то, что случилось, а не «ошибка».

import { isAndroidShell } from "@/lib/platform/device";

// ПОЧЕМУ СВОЙ СЛОЙ ПОВЕРХ СТРАНИЦЫ. Плагин в режиме `windowed` кладёт картинку с
// камеры ПОД страницу и делает прозрачной только подложку WebView. Сама
// страница закрашена фоном темы — и в 2.0.0 камера работала, а человек видел
// всё то же окно без камеры и без кнопки «Отмена». Поэтому на время съёмки
// страница становится прозрачной и невидимой, а поверх камеры рисуется рамка,
// подсказка и «Отмена». Всё это — голый DOM, а не React: сканер зовут три
// разных экрана, и каждому пришлось бы рисовать одно и то же самому.

const SCANNING = "qr-scanning";
const LAYER = "qr-scan-layer";

const STYLE = `
html.${SCANNING}, html.${SCANNING} body { background: transparent !important; }
html.${SCANNING} { color-scheme: normal !important; }
html.${SCANNING} body > *:not(.${LAYER}) { visibility: hidden !important; }
.${LAYER} { position: fixed; inset: 0; z-index: 2147483647; display: flex;
  flex-direction: column; align-items: center; justify-content: space-between;
  padding: max(24px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
  font: 500 16px/1.4 system-ui, sans-serif; color: #fff; pointer-events: none; }
.${LAYER} p { margin: 0; padding: 10px 14px; border-radius: 10px; text-align: center;
  background: rgba(0, 0, 0, 0.55); max-width: 320px; }
.${LAYER} .qr-frame { width: min(70vw, 300px); aspect-ratio: 1; border-radius: 20px;
  border: 3px solid #fff; box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45); }
.${LAYER} button { pointer-events: auto; min-width: 180px; min-height: 48px;
  border: 0; border-radius: 12px; background: #fff; color: #111;
  font: 600 16px/1 system-ui, sans-serif; }
`;

function words(): { hint: string; cancel: string } {
  const english = typeof document !== "undefined" && document.documentElement.lang.startsWith("en");
  return english
    ? { hint: "Point the camera at the QR code on the other device", cancel: "Cancel" }
    : { hint: "Наведите камеру на QR-код на другом устройстве", cancel: "Отмена" };
}

/** Показать рамку поверх камеры. Возвращает, чем её снять. */
export function showViewfinder(onCancel: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const { hint, cancel } = words();
  const layer = document.createElement("div");
  layer.className = LAYER;
  layer.setAttribute("data-testid", "qr-viewfinder");
  const top = document.createElement("p");
  top.textContent = hint;
  const frame = document.createElement("div");
  frame.className = "qr-frame";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = cancel;
  button.addEventListener("click", onCancel);
  layer.append(top, frame, button);
  document.body.appendChild(layer);
  document.documentElement.classList.add(SCANNING);

  return () => {
    document.documentElement.classList.remove(SCANNING);
    layer.remove();
    style.remove();
  };
}

/** Чем кончилось наведение камеры. */
export type ScanOutcome =
  | { ok: true; text: string }
  /** Человек закрыл видоискатель, ничего не сняв. Это не ошибка. */
  | { ok: false; why: "cancelled" }
  /** Доступ к камере запрещён. Чинится в настройках телефона, не здесь. */
  | { ok: false; why: "denied" }
  /** Камеры нет: настольная сборка, браузер, телефон без камеры. */
  | { ok: false; why: "absent" }
  /** Всё остальное — и текст для журнала, а не для экрана. */
  | { ok: false; why: "broken"; detail: string };

/** Есть ли вообще смысл предлагать камеру. */
export function cameraPossible(): boolean {
  return isAndroidShell();
}

export async function scanQr(): Promise<ScanOutcome> {
  if (!cameraPossible()) return { ok: false, why: "absent" };

  let hide = () => {};
  try {
    const scanner = await import("@tauri-apps/plugin-barcode-scanner");

    // Спрашиваем разрешение ДО того, как открыть видоискатель. Иначе человек
    // видит чёрный прямоугольник и не понимает, что от него хотят.
    // Плагин отвечает «granted» или «denied»; всё, что не первое, — повод
    // спросить, и только потом сдаваться.
    let granted = await scanner.checkPermissions();
    if (granted !== "granted") granted = await scanner.requestPermissions();
    if (granted !== "granted") return { ok: false, why: "denied" };

    // «Отмена» гасит видоискатель, и плагин отвечает на ждущий `scan` отказом
    // «cancelled» — его разбирает catch ниже, как и прежде.
    hide = showViewfinder(() => void scanner.cancel().catch(() => {}));
    const found = await scanner.scan({
      // Только QR: сканер, хватающий штрихкод с пачки молока, будет хватать
      // его и здесь — а понять такое всё равно нечем.
      formats: [scanner.Format.QRCode],
      // Камера — под страницей, а рамка и «Отмена» — наши, поверх неё
      // (см. showViewfinder). Без `windowed` плагин закрыл бы экран камерой
      // целиком, и выйти, не сняв ничего, было бы нечем.
      windowed: true
    });

    const text = found?.content?.trim() ?? "";
    // Пустое — это закрытый видоискатель: плагин отвечает так же, как на
    // удачное чтение, только без содержимого.
    return text ? { ok: true, text } : { ok: false, why: "cancelled" };
  } catch (cause) {
    const said = cause instanceof Error ? cause.message : String(cause);
    if (/cancel/i.test(said)) return { ok: false, why: "cancelled" };
    if (/denied|permission/i.test(said)) return { ok: false, why: "denied" };
    return { ok: false, why: "broken", detail: said };
  } finally {
    hide();
    // Видоискатель делает страницу прозрачной; не сняв его, мы оставили бы
    // человека смотреть сквозь приложение на камеру.
    try {
      const scanner = await import("@tauri-apps/plugin-barcode-scanner");
      await scanner.cancel();
    } catch {
      /* нечего отменять — значит, и не открывали */
    }
  }
}
