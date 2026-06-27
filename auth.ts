import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";

// NextAuth v5 config for email+password auth (plan P0). JWT session strategy —
// no adapter/session tables needed; the user id rides in the token. The catch-all
// route (app/api/auth/[...nextauth]) re-exports `handlers`; server code uses
// `auth()` to read the session.
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted / reverse-proxy deployments: trust the Host header (Auth.js v5
  // otherwise rejects it in production with UntrustedHost). Override per-env with
  // AUTH_TRUST_HOST if needed.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        // Throttle login attempts on two axes to blunt brute-force / credential
        // stuffing: per IP (one host hammering many accounts) and per email (a
        // distributed botnet targeting one account from many IPs). Over either
        // limit fails like a wrong password — no info leak / enumeration.
        const ip = request ? clientIp(request) : "unknown";
        if (!rateLimit(`login:ip:${ip}`, 10, 60_000).ok) return null;
        if (!rateLimit(`login:email:${email}`, 10, 60_000).ok) return null;
        const user = await requirePrisma().user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    }
  }
});
