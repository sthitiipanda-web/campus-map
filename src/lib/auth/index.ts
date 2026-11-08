import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./config";
import { isMfaRequired } from "./mfa";

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  totp: z
    .string()
    .regex(/^(\d{6})?$/)
    .optional()
    .default(""),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Node-runtime Auth.js instance. DB and crypto are imported dynamically inside
 * authorize() so this module stays importable from edge-adjacent code paths.
 * Lockout/backoff and auth-event audit logging per §9.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;

        const [{ db, schema }, { verifyPassword }, { verifyTotp }, { eq }] = await Promise.all([
          import("@/lib/db"),
          import("./passwords"),
          import("./totp"),
          import("drizzle-orm"),
        ]);

        const audit = async (action: string, actorId?: string) => {
          await db.insert(schema.auditLog).values({ action, actorEmail: email, actorId });
        };

        const user = await db.query.adminUsers.findFirst({
          where: eq(schema.adminUsers.email, email.toLowerCase()),
        });
        if (!user) {
          await audit("auth.login.failed.unknown-user");
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await audit("auth.login.blocked.locked", user.id);
          return null;
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        const totpOk = !isMfaRequired()
          ? true
          : user.mfaEnabled && user.mfaSecret
            ? await verifyTotp(totp, user.mfaSecret)
            : false;

        if (!passwordOk || !totpOk) {
          const attempts = user.failedAttempts + 1;
          await db
            .update(schema.adminUsers)
            .set({
              failedAttempts: attempts,
              lockedUntil:
                attempts >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                  : null,
            })
            .where(eq(schema.adminUsers.id, user.id));
          await audit(
            attempts >= MAX_FAILED_ATTEMPTS ? "auth.login.failed.now-locked" : "auth.login.failed",
            user.id,
          );
          return null;
        }

        await db
          .update(schema.adminUsers)
          .set({ failedAttempts: 0, lockedUntil: null, lastLogin: new Date() })
          .where(eq(schema.adminUsers.id, user.id));
        await audit("auth.login.success", user.id);

        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
});
