"use client";

// Главное ли это устройство — то, что держит у себя ежедневные копии.
//
// Спрашивается у службы и запоминается: без связи ответ берётся прошлый, и
// копия на главном не пропускает день только потому, что сервер недоступен —
// как раз тогда она нужнее всего.

import { readMine, writeMine } from "@/lib/storage/mine";

const MAIN_KEY = "local-copies-main";

export async function isMainDevice(): Promise<boolean> {
  const { serverAccount } = await import("@/lib/vault/runtime");
  // Без службы устройство одно — оно и главное.
  if (!(await serverAccount.link())) return true;
  try {
    const { primary, current } = await serverAccount.devices();
    // Служба старше 2.3.0 главного не знает — копии лучше лишние, чем никаких.
    const main = primary === undefined || (primary !== null && primary === current);
    writeMine(MAIN_KEY, main ? "1" : "0");
    return main;
  } catch {
    return readMine(MAIN_KEY) === "1";
  }
}

/** Сделать сегодняшнюю копию, если это главное устройство и её ещё нет. */
export async function keepDailyCopy(): Promise<void> {
  if (!(await isMainDevice())) return;
  const { apiClient } = await import("@/lib/api/client");
  await apiClient.post("/backup/local-copies", { action: "daily" });
}
