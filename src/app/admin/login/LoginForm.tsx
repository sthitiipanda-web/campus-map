"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      totp: String(form.get("totp") ?? ""),
      redirect: false,
    });
    if (res?.error) {
      // Deliberately vague: no hints about which factor failed (§9).
      setError("Sign in failed. Check your email, password and authenticator code.");
      return;
    }
    const callbackUrl = params.get("callbackUrl");
    const target = callbackUrl && callbackUrl.startsWith("/admin") ? callbackUrl : "/admin";
    startTransition(() => {
      router.push(target);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-small font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-(--radius-control) border border-stone-300 bg-surface px-3 text-body"
        />
      </label>
      <label className="flex flex-col gap-1 text-small font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-(--radius-control) border border-stone-300 bg-surface px-3 text-body"
        />
      </label>
      <label className="flex flex-col gap-1 text-small font-medium">
        Authenticator code
        <input
          name="totp"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          className="h-11 rounded-(--radius-control) border border-stone-300 bg-surface px-3 text-body tracking-widest"
        />
      </label>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-(--radius-control) bg-accent font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
