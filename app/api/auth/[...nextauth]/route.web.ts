import { handlers } from "@/auth";

// NextAuth catch-all (web-only). Excluded from the desktop static export via the
// .web.ts extension. Handles sign-in / sign-out / session.
export const { GET, POST } = handlers;
