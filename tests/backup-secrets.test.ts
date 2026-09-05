import { describe, expect, it } from "vitest";

import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MemoryStorageAdapter } from "@/lib/storage/MemoryStorageAdapter";
import type { SettingsPageData } from "@/lib/data";

// GUARD: the AI provider key is a secret, and a backup is a file people move
// around — a cloud folder on a schedule, a cable, a messenger. Anything secret
// inside it ends up wherever the file ends up. It is also the one thing in the
// document nobody needs restored: the key belongs to the machine.
const KEY = "sk-ant-НЕ-ДОЛЖЕН-УЕХАТЬ";

const client = () => new LocalApiClient(new MemoryStorageAdapter());

/** A ledger with one account in it, and the file it exports. */
async function exported(accountName: string, type = "DEBIT_CARD") {
  const source = client();
  await source.post("/accounts", { name: accountName, type, balance: "1000" });
  return source.get<unknown>("/backup");
}

describe("резервная копия и секреты", () => {
  it("не выносит ключ AI-провайдера в файл", async () => {
    const api = client();
    await api.post("/settings", { aiApiKey: KEY, aiEnabled: "true" });

    const backup = await api.get<Record<string, unknown>>("/backup");
    expect(backup.aiApiKey).toBe("");
    expect(JSON.stringify(backup)).not.toContain(KEY);
  });

  it("оставляет остальные настройки в файле", async () => {
    const api = client();
    await api.post("/settings", { aiApiKey: KEY, aiProvider: "openai", currency: "USD" });

    const backup = await api.get<Record<string, unknown>>("/backup");
    expect(backup.aiProvider).toBe("openai");
    expect(backup.currency).toBe("USD");
  });

  // Restoring must not switch the AI off: the file has no key by design, and
  // writing that emptiness over the machine's own key would send the owner
  // looking for the fault in the wrong place.
  it("при восстановлении сохраняет ключ этой машины", async () => {
    const target = client();
    await target.post("/settings", { aiApiKey: KEY });
    await target.post("/backup", { backup: await exported("Карта") });

    const settings = await target.get<SettingsPageData>("/settings");
    expect(settings.aiApiKey).toBe(KEY);
  });

  it("не мешает восстановлению самих данных", async () => {
    const target = client();
    await target.post("/backup", { backup: await exported("Вклад-проверка", "SAVINGS") });

    const accounts = await target.get<{ accounts: Array<{ name: string }> }>("/accounts");
    expect(accounts.accounts.map((a) => a.name)).toContain("Вклад-проверка");
  });
});
