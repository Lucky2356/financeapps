# Windows Desktop Build

The project is prepared to build a Windows desktop app with Tauri. This is the first native packaging target because it can reuse the existing Next.js static shell and the already implemented Tauri file adapters.

## Install Once

1. Install Node.js 24 or newer.
2. Install Rust from https://rustup.rs.
3. Install Microsoft Visual Studio Build Tools.
4. In Visual Studio Installer, enable `Desktop development with C++`.
5. Restart the terminal so `rustc` and `cargo` are available.

## Check The Machine

```bash
npm run build:static
npm run desktop:preflight
```

If `rustc` or `cargo` is missing, install Rust and reopen PowerShell.

## Run Desktop In Development

```bash
npm run tauri:dev
```

This starts the Next.js dev server and opens the Tauri window.

## Build Windows EXE

```bash
npm run tauri:build
```

The current desktop bundle target is NSIS because it is simpler and more reliable for this MVP than MSI/WiX. Build artifacts are placed in:

```text
src-tauri/target/release/financial-assistant.exe
src-tauri/target/release/bundle/nsis/
```

## Where The Data Lives

There is one mode: the static bundle keeps everything in the WebView's IndexedDB
through `LocalApiClient`. `npm run build:static` sets `NEXT_OUTPUT=export` for the
Tauri shell and `NEXT_PUBLIC_MARKET_DATA=moex` for live quotes. Linking devices
goes through the sync service in `server/` (see `server/README.md`), not through a
separate build.

After installing, follow the smoke test in `docs/RELEASE_CHECKLIST.md` («Проверка
после установки»).
