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
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      // This app handles financial data (152-ФЗ). Never ship PII/request bodies
      // to the Sentry SaaS: strip request payloads, sensitive headers, cookies,
      // and the user email before the event leaves the server.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.cookie;
            delete event.request.headers.authorization;
          }
        }
        if (event.user?.email) event.user.email = "[redacted]";
        return event;
      }
    });
  }
}
