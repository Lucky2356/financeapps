import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const cargoBin = process.env.USERPROFILE ? join(process.env.USERPROFILE, ".cargo", "bin") : "";
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
if (cargoBin && existsSync(cargoBin) && !process.env[pathKey]?.includes(cargoBin)) {
  process.env[pathKey] = `${cargoBin}${delimiter}${process.env[pathKey] ?? ""}`;
}
process.env.PATH = process.env[pathKey];

function check(command, args = ["--version"]) {
  const executable = command === "npm" && process.env.npm_execpath ? process.execPath : command;
  const executableArgs = command === "npm" && process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, executableArgs, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout || result.stderr || ""}`.trim()
  };
}

const checks = [
  ["Node.js", "node"],
  ["npm", "npm"],
  ["Rust compiler", "rustc"],
  ["Cargo", "cargo"]
];

let failed = false;
for (const [label, command] of checks) {
  const result = check(command);
  const status = result.ok ? "OK" : "MISSING";
  console.log(`${status.padEnd(8)} ${label}${result.output ? ` - ${result.output.split("\n")[0]}` : ""}`);
  failed ||= !result.ok;
}

const staticOut = existsSync(join(process.cwd(), "out", "index.html"));
console.log(`${(staticOut ? "OK" : "MISSING").padEnd(8)} Static export${staticOut ? " - out/index.html" : " - run npm run build:static"}`);
failed ||= !staticOut;

if (failed) {
  console.log("\nInstall Rust with https://rustup.rs and Visual Studio Build Tools with Desktop development with C++.");
  process.exit(1);
}

console.log("\nDesktop preflight passed. You can run npm run tauri:build.");
