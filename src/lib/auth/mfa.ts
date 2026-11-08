/**
 * TOTP is mandatory in production. For local testing only, set
 * ADMIN_MFA_DISABLED=true in .env to sign in with email + password alone.
 * The flag is ignored when NODE_ENV=production.
 */
export function isMfaRequired(): boolean {
  return !(process.env.ADMIN_MFA_DISABLED === "true" && process.env.NODE_ENV !== "production");
}
