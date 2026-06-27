import { NextResponse } from "next/server";

// Same-origin guard for state-changing API requests (defense-in-depth CSRF).
//
// The primary CSRF control is already in place: NextAuth's session cookie is
// SameSite=Lax, so a cross-site form/POST does not carry it and the request lands
// unauthenticated (→ 401). This helper adds an explicit Origin/Host check on the
// bulk-mutation endpoints as a second layer.
//
// A browser always sends `Origin` on mutating fetches/forms; a missing Origin
// means a non-browser client (curl/SDK) with no ambient cookies, which is not a
// CSRF vector, so we allow it. Returns a 403 response when the origin host does
// not match the request host, or `null` when the request is allowed.
export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }

  if (originHost !== host) {
    return NextResponse.json({ error: "Межсайтовый запрос отклонён." }, { status: 403 });
  }
  return null;
}
