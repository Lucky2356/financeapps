// Server-side error reporting (plan: safe-launch). Always logs a structured
// error line (visible via `docker compose logs web`); additionally forwards to
// Sentry when SENTRY_DSN is configured. @sentry/nextjs is imported lazily so it
// is never pulled into the desktop static export bundle.
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("[error]", message, context ?? "");

  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error, context ? { extra: context } : undefined))
    .catch(() => {});
}
