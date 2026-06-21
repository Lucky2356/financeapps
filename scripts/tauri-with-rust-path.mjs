import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const cargoBin = process.env.USERPROFILE ? join(process.env.USERPROFILE, ".cargo", "bin") : "";
const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";

if (cargoBin && existsSync(cargoBin) && !env[pathKey]?.includes(cargoBin)) {
  env[pathKey] = `${cargoBin}${delimiter}${env[pathKey] ?? ""}`;
}
env.PATH = env[pathKey];

const command = ["build", "dev"].includes(process.argv[2]) ? process.argv[2] : "build";
// Forward any extra args (e.g. `-- --config src-tauri/tauri.updater.conf.json`)
// to the tauri CLI so the release build can opt into the updater config.
const extraArgs = process.argv.slice(3);
const runner = "npx";
const result = spawnSync(runner, ["tauri", command, ...extraArgs], {
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
