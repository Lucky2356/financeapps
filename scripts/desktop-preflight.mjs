import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function check(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: true });
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
