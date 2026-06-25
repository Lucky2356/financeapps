import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// GUARD: the updater public key is baked into every installed desktop build and
// is used to verify the signature of future updates. If this key changes, EVERY
// already-installed client can no longer verify (and therefore cannot install)
// new releases — they would all have to reinstall manually. This exact break
// happened once between v1.0.2 and v1.0.3.
//
// Do NOT change this value unless you are deliberately rotating the signing key
// AND accept that all existing installs must be reinstalled by hand. If you
// change it, update the pinned value below in the same commit — the failing test
// is the forcing function to make that decision conscious.
const PINNED_UPDATER_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEY3NUFDOTcyMzIyRUI1OTYKUldTV3RTNHljc2xhOTJhWm5QNlhUNUVDbWMwSHY5TnJ5WUh2cHU1NXRUeXorKytWMXdLdE05YU4K";

function readTauriConf() {
  const url = new URL("../src-tauri/tauri.conf.json", import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as {
    plugins?: { updater?: { pubkey?: string; endpoints?: string[] } };
  };
}

describe("desktop updater config", () => {
  it("keeps the signing public key stable (changing it breaks all installed clients)", () => {
    const conf = readTauriConf();
    expect(conf.plugins?.updater?.pubkey).toBe(PINNED_UPDATER_PUBKEY);
  });

  it("points the updater at the GitHub latest.json endpoint", () => {
    const conf = readTauriConf();
    expect(conf.plugins?.updater?.endpoints ?? []).toContain(
      "https://github.com/Lucky2356/financeapps/releases/latest/download/latest.json"
    );
  });
});
