import type { RuntimeConfig } from "@/types/platform";

// The app has exactly one mode: a static bundle whose data lives on the device
// (IndexedDB), wrapped in Tauri on Windows and on Android. There is no server,
// no account and no cloud API any more, so nothing here is switchable by env
// vars — `npm run dev` in a browser exercises the very same code path as the
// shipped builds.
export const runtimeConfig: RuntimeConfig = {
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  isStaticExport: process.env.NEXT_OUTPUT === "export"
};

/**
 * True when the webview is hosted by Tauri — the Windows or the Android build.
 * Plain `npm run dev` in a browser is false: there the native plugins are
 * unavailable and the browser fallbacks (download / file input) take over.
 */
export function isTauriShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
