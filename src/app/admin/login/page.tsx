import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { isMfaRequired } from "@/lib/auth/mfa";

export const metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-(--radius-sheet) border border-stone-300 bg-surface-raised p-8 shadow-xl">
        <h1 className="text-title font-semibold">Campus Navigator admin</h1>
        <p className="mt-1 text-small text-ink-muted">Staff access only. All activity is logged.</p>
        <Suspense>
          <LoginForm mfaRequired={isMfaRequired()} />
        </Suspense>
      </div>
    </main>
  );
}
