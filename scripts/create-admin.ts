/**
 * Bootstraps the first super-admin from ADMIN_EMAIL / ADMIN_PASSWORD in .env,
 * generates a TOTP secret and prints the otpauth URI + QR to the terminal for
 * enrolment in an authenticator app. Safe to re-run: skips existing users.
 *
 * Usage: npx tsx scripts/create-admin.ts   (or via npm run db:seed)
 */
import { config } from "dotenv";
config();

export async function createAdminFromEnv(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.");
    return;
  }

  const [{ db, schema }, { hashPassword }, { generateTotpSecret, totpUri }, { eq }, qrcode] =
    await Promise.all([
      import("../src/lib/db"),
      import("../src/lib/auth/passwords"),
      import("../src/lib/auth/totp"),
      import("drizzle-orm"),
      import("qrcode"),
    ]);

  const existing = await db.query.adminUsers.findFirst({
    where: eq(schema.adminUsers.email, email),
  });
  if (existing) {
    console.log(`Admin ${email} already exists — skipping.`);
    return;
  }

  const secret = generateTotpSecret();
  await db.insert(schema.adminUsers).values({
    email,
    passwordHash: await hashPassword(password),
    role: "super-admin",
    mfaSecret: secret,
    mfaEnabled: true,
  });
  await db.insert(schema.auditLog).values({ action: "admin.user.bootstrap", actorEmail: email });

  const uri = totpUri(email, secret);
  console.log(`\nSuper-admin created: ${email}`);
  console.log("Scan this QR with an authenticator app (or enter the secret manually):\n");
  console.log(await qrcode.toString(uri, { type: "terminal", small: true }));
  console.log(`otpauth URI: ${uri}\n`);
}

// Allow direct execution
if (process.argv[1]?.includes("create-admin")) {
  createAdminFromEnv()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
