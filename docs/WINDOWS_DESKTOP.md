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

Build artifacts are placed in:

```text
src-tauri/target/release/bundle/
```

## Data Modes

- `cloud`: desktop app connects to the deployed API and PostgreSQL.
- `local`: prepared shell for local storage adapters; full SQLite or IndexedDB sync remains a planned follow-up.

Recommended production desktop environment:

```env
NEXT_PUBLIC_APP_PLATFORM=desktop
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_API_MODE=cloud
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com/api
NEXT_PUBLIC_DESKTOP_DATA_MODE=cloud
NEXT_OUTPUT=export
```
