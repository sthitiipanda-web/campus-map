import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EntranceEditor } from "@/components/admin/EntranceEditor";

export const metadata = { title: "Entrances · Admin" };

export default async function EntrancesAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  return (
    <main className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold">Entrances</h1>
          <p className="mt-1 text-small text-ink-muted">
            Pin each building’s real doors so routes finish at the entrance, not the centre.
          </p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 rounded-(--radius-control) border border-stone-300 px-4 py-2 text-small font-medium text-ink"
        >
          ← Admin console
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <EntranceEditor role={session.user.role} />
      </div>
    </main>
  );
}
