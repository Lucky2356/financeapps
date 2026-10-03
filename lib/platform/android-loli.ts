"use client";

// Связь с Лоли — обёртки команд InstallerPlugin.kt (окно — LoliBridge.kt).
// Вне Android и в сборках без этих команд (старее 2.7) — молча ничего.

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

export type LoliStatus = {
  /** Лоли стоит на телефоне. */
  installed: boolean;
  /** И подписана своим ключом — значит, это она, а не приложение с её именем. */
  trusted: boolean;
  enabled: boolean;
  /** Записывать траты сразу, а не в «Подсказки». */
  auto: boolean;
  /** Отдавать Лоли сводку для ответов. */
  share: boolean;
};

export async function loliStatus(): Promise<LoliStatus | null> {
  return call<LoliStatus>("loli_status");
}

export async function configureLoli(config: {
  enabled: boolean;
  auto: boolean;
  share: boolean;
}): Promise<void> {
  await call("loli_config", config);
}

/** Присланное Лоли. Телефон помнит его, пока не подтвердят (ackLoliQueue). */
export async function takeLoliQueue(): Promise<string | null> {
  const answer = await call<{ items?: string }>("loli_take");
  return answer?.items ?? null;
}

/** Разобрано — телефон может забыть именно эти траты (номер и время). */
export async function ackLoliQueue(done: Array<{ id: string; at: number }>): Promise<void> {
  await call("loli_ack", { json: JSON.stringify(done) });
}

export async function publishLoliSummary(json: string): Promise<void> {
  await call("loli_summary", { json });
}
