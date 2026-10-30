import { generateSecret, generateURI, verify } from "otplib";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return generateURI({ issuer: "Roehampton Campus Navigator", label: email, secret });
}

/** Standard 30s/6-digit TOTP; allow one step of clock drift either side. */
export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
