// Runs `tauri android <subcommand>` with the toolchain paths the Android build
// needs, so building the phone app is a plain `npm run android:build` instead of
// four exported variables. Everything already set in the environment wins; the
// fallbacks are the default Android Studio / SDK locations on Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";

const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";

function prependPath(dir) {
  if (dir && existsSync(dir) && !env[pathKey]?.includes(dir)) {
    env[pathKey] = `${dir}${delimiter}${env[pathKey] ?? ""}`;
  }
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

// Rust toolchain (same reason as scripts/tauri-with-rust-path.mjs: cargo is not
// always on PATH in a fresh shell).
prependPath(process.env.USERPROFILE ? join(process.env.USERPROFILE, ".cargo", "bin") : "");

// JDK 17+ — the one bundled with Android Studio is the safest default.
const javaHome = firstExisting([
  env.JAVA_HOME,
  "C:\\Program Files\\Android\\Android Studio\\jbr",
  env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs", "Android Studio", "jbr") : ""
]);

// Android SDK.
const androidHome = firstExisting([
  env.ANDROID_HOME,
  env.ANDROID_SDK_ROOT,
  env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Android", "Sdk") : ""
]);

// NDK — pick the highest installed version when it is not pinned explicitly.
let ndkHome = firstExisting([env.NDK_HOME, env.ANDROID_NDK_HOME]);
if (!ndkHome && androidHome) {
  const ndkRoot = join(androidHome, "ndk");
  if (existsSync(ndkRoot)) {
    const versions = readdirSync(ndkRoot).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    if (versions.length > 0) ndkHome = join(ndkRoot, versions[versions.length - 1]);
  }
}

const missing = [
  !javaHome && "JDK 17+ (JAVA_HOME)",
  !androidHome && "Android SDK (ANDROID_HOME)",
  !ndkHome && "Android NDK (NDK_HOME)"
].filter(Boolean);

if (missing.length > 0) {
  console.error(
    `Не найдено: ${missing.join(", ")}.\nСм. docs/ANDROID.md — раздел «Что нужно на машине для сборки».`
  );
  process.exit(1);
}

env.JAVA_HOME = javaHome;
env.ANDROID_HOME = androidHome;
env.NDK_HOME = ndkHome;
prependPath(join(javaHome, "bin"));
env.PATH = env[pathKey];

const result = spawnSync("npx", ["tauri", "android", ...process.argv.slice(2)], {
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
