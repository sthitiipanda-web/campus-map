import { describe, expect, it } from "vitest";
import { generate } from "otplib";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { hasRole } from "@/lib/auth/rbac";

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password-entirely", hash)).toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("totp", () => {
  it("verifies a freshly generated code and rejects garbage", async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    expect(await verifyTotp(code, secret)).toBe(true);
    expect(await verifyTotp("not-a-code", secret)).toBe(false);
    // A wrong (but well-formed) code: flip one digit of the real one
    const wrong = (code[0] === "9" ? "0" : "9") + code.slice(1);
    expect(await verifyTotp(wrong, secret)).toBe(false);
  });
});

describe("rbac", () => {
  it("enforces the role hierarchy", () => {
    expect(hasRole("editor", "admin")).toBe(false);
    expect(hasRole("admin", "editor")).toBe(true);
    expect(hasRole("super-admin", "admin")).toBe(true);
    expect(hasRole(undefined, "editor")).toBe(false);
  });
});
