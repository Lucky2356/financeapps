// Accent colour preference — an app-wide colour theme layered on top of the
// light/dark theme (next-themes) and interface density (persisted in settings,
// see app-settings-sync). The accent lives entirely on the client: persisted in
// localStorage and reflected as data-accent on <html>. Works identically in the
// web (SSR) and desktop (static export) builds because it never touches the
// server.

export const ACCENTS = ["emerald", "blue", "violet", "amber"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = "emerald";

export const ACCENT_STORAGE_KEY = "ui-accent";

function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

/** Reflect the chosen accent on <html> (emerald = default, so no attribute). */
export function applyAccent(accent: Accent): void {
  const root = document.documentElement;
  if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", accent);
}

export function readStoredAccent(): Accent {
  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(value) ? value : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

// Inline script injected into <head> so the accent is stamped on <html> before
// first paint — mirrors how next-themes avoids a flash of the default theme.
// Kept dependency-free and self-contained (it runs before any bundle).
export const APPEARANCE_FOUC_SCRIPT = `(function(){try{var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");if(a&&a!=="${DEFAULT_ACCENT}"&&${JSON.stringify(
  ACCENTS as readonly string[]
)}.indexOf(a)>-1)document.documentElement.setAttribute("data-accent",a);}catch(e){}})();`;
