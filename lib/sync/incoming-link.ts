"use client";

// Ссылка связки, которой приложение открыли из QR-кода обычной камерой.
//
// Android отдаёт её нашему плагину (InstallerPlugin.kt), а он — сюда, один раз.
// На компьютере и в браузере ссылки нет: там не открывают приложения из
// картинки, и спрашивать некого.

import { isAndroidShell } from "@/lib/platform/device";

export async function takeIncomingLink(): Promise<string | null> {
  if (!isAndroidShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const answer = await invoke<{ url?: string }>("plugin:installer|take_link");
    return answer?.url ? answer.url : null;
  } catch {
    // Сборка без плагина (старее 2.1) — ссылки нет, и это не ошибка.
    return null;
  }
}
