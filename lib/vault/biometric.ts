"use client";

// Вход по отпечатку — страница со стороны телефона.
//
// Всё, что касается отпечатка, делает Android (InstallerPlugin.kt): держит ключ
// в своём хранилище, показывает системное окно, запечатывает и распечатывает.
// Здесь — только вызовы и перевод ответов в понятные исходы, как у камеры
// (lib/sync/scan-qr.ts): отмена — не ошибка, «отпечатки поменялись» — не
// поломка, а повод войти паролем.

import { isAndroidShell } from "@/lib/platform/device";
import { currentWho } from "@/lib/storage/mine";

/**
 * Свой ключ в хранилище Android у каждого человека на устройстве: один общий
 * второй человек, включив отпечаток, перезаписал бы — и у первого вход бы
 * сломался.
 */
function slot(): string {
  return currentWho().replace(/[^A-Za-z0-9_-]/g, "") || "main";
}

export type Sealed = { iv: string; data: string };

export type BiometricOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; why: "cancelled" | "invalidated" | "absent" | "broken"; detail?: string };

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(`plugin:installer|${command}`, args);
}

function outcome(cause: unknown): BiometricOutcome<never> {
  const said = cause instanceof Error ? cause.message : String(cause);
  if (said.startsWith("[cancelled]")) return { ok: false, why: "cancelled" };
  if (said.startsWith("[invalidated]")) {
    return { ok: false, why: "invalidated", detail: said.replace("[invalidated] ", "") };
  }
  return { ok: false, why: "broken", detail: said.replace("[broken] ", "") };
}

/** Есть ли в телефоне отпечаток, которым можно входить. */
export async function biometricAvailable(): Promise<boolean> {
  if (!isAndroidShell()) return false;
  try {
    return (await call<{ available?: boolean }>("biometric_status")).available === true;
  } catch {
    // Сборка старее 2.2 — плагина с отпечатком нет.
    return false;
  }
}

export async function sealWithBiometric(
  secret: string,
  words: { title: string; cancel: string }
): Promise<BiometricOutcome<Sealed>> {
  if (!isAndroidShell()) return { ok: false, why: "absent" };
  try {
    return {
      ok: true,
      value: await call<Sealed>("biometric_seal", { secret, slot: slot(), ...words })
    };
  } catch (cause) {
    return outcome(cause);
  }
}

export async function openWithBiometric(
  sealed: Sealed,
  words: { title: string; cancel: string }
): Promise<BiometricOutcome<string>> {
  if (!isAndroidShell()) return { ok: false, why: "absent" };
  try {
    const answer = await call<{ secret: string }>("biometric_open", {
      ...sealed,
      slot: slot(),
      ...words
    });
    return { ok: true, value: answer.secret };
  } catch (cause) {
    return outcome(cause);
  }
}

export async function forgetBiometric(): Promise<void> {
  if (!isAndroidShell()) return;
  await call("biometric_forget", { slot: slot() }).catch(() => undefined);
}
