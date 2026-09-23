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

  try {
    const scanner = await import("@tauri-apps/plugin-barcode-scanner");

    // Спрашиваем разрешение ДО того, как открыть видоискатель. Иначе человек
    // видит чёрный прямоугольник и не понимает, что от него хотят.
    // Плагин отвечает «granted» или «denied»; всё, что не первое, — повод
    // спросить, и только потом сдаваться.
    let granted = await scanner.checkPermissions();
    if (granted !== "granted") granted = await scanner.requestPermissions();
    if (granted !== "granted") return { ok: false, why: "denied" };

    const found = await scanner.scan({
      // Только QR: сканер, хватающий штрихкод с пачки молока, будет хватать
      // его и здесь — а понять такое всё равно нечем.
      formats: [scanner.Format.QRCode],
      // Видоискатель поверх страницы, а не вместо неё: человек видит, куда
      // вернётся, и кнопка «отмена» остаётся на виду.
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
