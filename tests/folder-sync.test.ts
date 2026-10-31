import { describe, expect, it, vi } from "vitest";

// Синхронизация через облачную папку: выгрузить в папку — и загрузить обратно.
//
// «Загрузить» не работало НИКОГДА: файл в папке лежит в обёртке
// `{ exportedAt, backup }`, а восстановлению уходил голый документ из неё —
// тогда как /backup читает поле `backup` тела запроса. Каждая загрузка
// кончалась «Файл не похож на резервную копию…», хотя файл записало само же
// приложение. Проверка гоняет обе половины по-настоящему: настоящее приложение
// поверх памяти, настоящее шифрование, папка — в памяти.

const folder = vi.hoisted(() => new Map<string, string>());

// Файл в папке пишут и читают команды Rust (lib/files/app-folder.ts).
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args: { folder: string; content?: string }) => {
    // Rust берёт файл в папке через Path::join: «/облако» и «/облако/» — одна папка.
    const key = args.folder.replace(/[\\/]+$/, "");
    if (command === "sync_file_write") {
      folder.set(key, args.content ?? "");
      return undefined;
    }
    if (command === "sync_file_read") {
      const text = folder.get(key);
      if (text === undefined) throw new Error("нет файла");
      return text;
    }
    throw new Error(`неизвестная команда ${command}`);
  }
}));

vi.mock("@/lib/api/client", async () => {
  const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
  const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
  return { apiClient: new LocalApiClient(new MemoryStorageAdapter()) };
});

import { apiClient } from "@/lib/api/client";
import { pullFromFolder, pushToFolder } from "@/lib/sync/FolderSyncService";

describe("синхронизация через папку", () => {
  it("выгруженное в папку загружается обратно", async () => {
    await apiClient.post("/accounts", {
      name: "Карта из папки",
      type: "DEBIT_CARD",
      balance: 1000
    });
    await pushToFolder("/облако/", "фраза");
    expect(folder.size).toBe(1);

    // После выгрузки здесь появилось лишнее — загрузка обязана вернуть как в файле.
    await apiClient.post("/accounts", { name: "Лишняя", type: "CASH", balance: 5 });

    const pulled = await pullFromFolder("/облако", "фраза");

    expect(pulled.exportedAt).not.toBeNull();
    const { accounts } = await apiClient.get("/accounts");
    const names = accounts.map((account) => account.name);
    expect(names).toContain("Карта из папки");
    expect(names).not.toContain("Лишняя");
  });
});
