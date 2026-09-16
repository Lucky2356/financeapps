import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// Сторож за юнитом systemd.
//
// Юнит — единственная часть службы, которую не исполняет ни одна проверка:
// проверки запускают службу напрямую, а на машине её запускает systemd, и
// между этими двумя способами помещается целый класс поломок. Проверено на
// себе, дорогой ценой: в юните стояло MemoryDenyWriteExecute=yes, служба под
// ним не поднималась НИ РАЗУ и ни у кого, а все проверки были зелёными.
//
// Поэтому здесь читается сам файл. Это грубо, но ловит ровно то, что иначе
// обнаруживается только на живой машине, посреди установки.

const here = dirname(fileURLToPath(import.meta.url));
const unitPath = resolve(here, "..", "financeapps.service");
const unit = readFileSync(unitPath, "utf8");

/** Строки юнита без комментариев: в них про запрет как раз и объясняется. */
const directives = unit
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

describe("юнит systemd", () => {
  it("не запрещает исполняемую память — иначе Node не запустится вовсе", () => {
    // V8 компилирует горячий код на ходу и обязан пометить свежие страницы
    // исполняемыми. Под запретом он падает по SIGTRAP, не дойдя до открытия
    // порта, и systemd перезапускает его по кругу. В журнале при этом трасса
    // V8 на сорок строк, по которой не догадаешься, что виноват юнит.
    const denies = directives.filter((line) =>
      /^MemoryDenyWriteExecute\s*=\s*(yes|true|1|on)$/i.test(line)
    );

    assert.deepEqual(
      denies,
      [],
      "MemoryDenyWriteExecute включён — служба не поднимется ни на одной машине"
    );
  });

  it("запускает то, что в складе действительно есть", () => {
    // Переименуй кто-нибудь точку входа — юнит указывал бы в пустоту, и узнать
    // об этом можно было бы только на машине.
    const exec = directives.find((line) => line.startsWith("ExecStart="));
    assert.ok(exec, "в юните нет ExecStart");

    const entry = exec.split(/\s+/).at(-1) ?? "";
    assert.ok(entry.endsWith(".ts"), `ExecStart оканчивается не на файл: ${exec}`);

    const workdir = directives.find((line) => line.startsWith("WorkingDirectory="));
    assert.ok(workdir, "в юните нет WorkingDirectory");

    // WorkingDirectory указывает на папку службы НА МАШИНЕ; здесь сверяем, что
    // относительный путь из ExecStart существует в складе.
    assert.ok(
      existsSync(join(here, "..", entry)),
      `ExecStart указывает на ${entry}, которого в server/ нет`
    );
  });
});
