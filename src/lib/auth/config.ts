import type { NextAuthConfig } from "next-auth";
import type { AdminRole } from "@/types/next-auth";

/**
 * Edge-safe Auth.js config (no DB imports) — used by middleware to verify the
 * session JWT. The Credentials provider is added in src/lib/auth/index.ts,
 * which only runs in the Node runtime.
 */
export const authConfig = {
  providers: [],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // short sessions (§9)
  },
  pages: {
    signIn: "/admin/login",
  },
  cookies: {
    sessionToken: {
      options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AdminRole | undefined) ?? "editor";
        session.user.id = typeof token.uid === "string" ? token.uid : "";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
