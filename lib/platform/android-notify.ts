"use client";

// Напоминания и виджет на Android — обёртки команд InstallerPlugin.kt.
// Вне Android и в сборках без этих команд (старее 2.3) — молча ничего.

import type { ReminderItem } from "@/lib/reminders/plan";
import { isAndroidShell } from "@/lib/platform/device";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isAndroidShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(`plugin:installer|${command}`, args);
  } catch {
    return null;
  }
}

/** Разрешены ли уведомления; на Android 13+ заодно спросить. */
export async function askNotifications(): Promise<boolean> {
  const answer = await call<{ granted?: boolean }>("notify_permission");
  return Boolean(answer?.granted);
}

export async function scheduleReminders(items: readonly ReminderItem[]): Promise<void> {
  await call("notify_schedule", {
    items: JSON.stringify(
      items.map(({ id, at, title, body, link }) => ({ id, at, title, body, link }))
    )
  });
}

export async function cancelReminders(): Promise<void> {
  await call("notify_cancel_all");
}

export async function updateWidget(amount: string, note: string): Promise<void> {
  await call("widget_update", { amount, note });
}
