// Public (unauthenticated) route prefixes for the web app. Shared by the session
// gate and the automation runner so both agree on which pages have no session.
export const PUBLIC_PREFIXES = ["/login", "/register", "/legal"];

export function isPublicPath(pathname: string | null): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname?.startsWith(p));
}
