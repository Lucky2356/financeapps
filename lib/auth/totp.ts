import { generateSecret, generateURI, verifySync } from "otplib";

// Two-factor (TOTP, RFC 6238) helpers around otplib (v13 functional API).
// Server-only — used by the 2FA setup/enable/disable routes and the NextAuth
// credentials check. A fixed ASCII issuer keeps the otpauth URI compatible with
// all authenticator apps (some mishandle non-ASCII issuers).
const ISSUER = "Financial Assistant";

export function generateTotpSecret(): string {
  return generateSecret();
}

// otpauth://totp/... URI to encode in the setup QR code.
export function totpKeyUri(accountLabel: string, secret: string): string {
  return generateURI({ secret, label: accountLabel, issuer: ISSUER });
}

export function verifyTotp(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  try {
    // epochTolerance 30s (±1 time step) absorbs clock skew between server and phone.
    return verifySync({ token: token.replace(/\s+/g, ""), secret, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
}
