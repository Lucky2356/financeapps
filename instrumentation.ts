// Next.js server instrumentation (plan: safe-launch). Initializes Sentry on the
// server when SENTRY_DSN is set. No-op without a DSN and in the desktop static
// export (no server). @sentry/nextjs is imported lazily to keep it out of the
// export bundle.
export async function register() {
  if (process.env.NEXT_OUTPUT === "export") return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  }
}
