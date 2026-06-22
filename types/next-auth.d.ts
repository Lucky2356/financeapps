import type { DefaultSession } from "next-auth";

// Expose the user id on the session/JWT (plan P0). The credentials authorize()
// returns the Prisma user id; these augmentations make it type-safe everywhere.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
