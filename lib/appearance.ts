// Appearance preferences (accent colour + interface density) that live entirely
// on the client — persisted in localStorage and reflected as data-attributes on
// <html>. This works identically in the web (SSR) and desktop (static export)
// builds because it never touches the server; the theme (light/dark) stays with
// next-themes, this only layers accent/density on top.

export const ACCENTS = ["emerald", "blue", "violet", "amber"] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = "emerald";

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];
export const DEFAULT_DENSITY: Density = "comfortable";

export const ACCENT_STORAGE_KEY = "ui-accent";
export const DENSITY_STORAGE_KEY = "ui-density";

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value);
}

/** Reflect the chosen accent on <html> (emerald = default, so no attribute). */
export function applyAccent(accent: Accent): void {
  const root = document.documentElement;
  if (accent === DEFAULT_ACCENT) root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", accent);
}

/** Reflect the chosen density on <html> (comfortable = default, no attribute). */
export function applyDensity(density: Density): void {
  const root = document.documentElement;
  if (density === DEFAULT_DENSITY) root.removeAttribute("data-density");
  else root.setAttribute("data-density", density);
}

export function readStoredAccent(): Accent {
  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(value) ? value : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function readStoredDensity(): Density {
  try {
    const value = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return isDensity(value) ? value : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

// Inline script injected into <head> so accent/density are stamped on <html>
// before first paint — mirrors how next-themes avoids a flash of the default
// theme. Kept dependency-free and self-contained (it runs before any bundle).
export const APPEARANCE_FOUC_SCRIPT = `(function(){try{var d=document.documentElement;var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");if(a&&a!=="${DEFAULT_ACCENT}"&&${JSON.stringify(
  ACCENTS as readonly string[]
)}.indexOf(a)>-1)d.setAttribute("data-accent",a);var n=localStorage.getItem("${DENSITY_STORAGE_KEY}");if(n&&n!=="${DEFAULT_DENSITY}"&&${JSON.stringify(
  DENSITIES as readonly string[]
)}.indexOf(n)>-1)d.setAttribute("data-density",n);}catch(e){}})();`;
