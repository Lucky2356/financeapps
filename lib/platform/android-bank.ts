"use client";

// Траты из уведомлений банка — обёртки команд InstallerPlugin.kt.
// Вне Android и в сборках без этих команд (старее 2.5) — молча ничего.

import type { BankNotification } from "@/lib/bank/notification-parse";
import { isAndroidShell } from "@/lib/platform/device";

async function call<T>(command: string): Promise<T | null> {
  if (!isAndroidShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(`plugin:installer|${command}`);
  } catch {
    return null;
  }
}

/** Дан ли доступ к уведомлениям; null — не Android или старая сборка. */
export async function bankAccess(): Promise<boolean | null> {
  const answer = await call<{ granted?: boolean }>("bank_status");
  return answer ? Boolean(answer.granted) : null;
}

/** Открыть экран «Доступ к уведомлениям» в настройках телефона. */
export async function openBankAccess(): Promise<void> {
  await call("bank_open_settings");
}

/** Забрать накопленные уведомления — после этого телефон их забывает. */
export async function takeBankNotifications(): Promise<BankNotification[]> {
  const answer = await call<{ items?: string }>("bank_take");
  if (!answer?.items) return [];
  try {
    const list: unknown = JSON.parse(answer.items);
    return Array.isArray(list) ? (list as BankNotification[]) : [];
  } catch {
    return [];
  }
}
