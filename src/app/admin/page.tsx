import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-display font-semibold">Admin console</h1>
          <p className="mt-1 text-small text-ink-muted">
            Signed in as {session.user.email} · role: {session.user.role}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
        >
          <button
            type="submit"
            className="h-10 rounded-(--radius-control) border border-stone-300 px-4 text-small font-medium"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/entrances"
          className="rounded-(--radius-sheet) border border-stone-300 bg-surface-raised p-6 transition-colors hover:border-parkland-900"
        >
          <h2 className="font-semibold">Entrances</h2>
          <p className="mt-1 text-small text-ink-muted">
            Pin each building’s real doors — routes finish there, not at the centre
          </p>
        </Link>
        {[
          ["Locations & pins", "Phase 2 — map-based editor"],
          ["Path network", "Phase 2 — draw the walkable graph"],
          ["Transport", "Phase 3 — shuttle routes & timetable"],
          ["Publish", "Phase 2 — draft → review → publish"],
        ].map(([title, hint]) => (
          <div
            key={title}
            className="rounded-(--radius-sheet) border border-stone-300 bg-surface-raised p-6"
          >
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-small text-ink-muted">{hint}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
