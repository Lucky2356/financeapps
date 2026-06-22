import bcrypt from "bcryptjs";

// Password hashing for email+password auth (plan P0). bcryptjs is pure-JS, so it
// works across Node/serverless runtimes without native build steps.
const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
