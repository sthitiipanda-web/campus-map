import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/rbac";
import { db, schema } from "@/lib/db";
import { publishSnapshot } from "@/lib/map-data/snapshot";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const body = z.object({ note: z.string().trim().max(200).optional() });

/**
 * Publish a new immutable map snapshot (admin and up, §9). The public app
 * atomically switches to the new version on its next data fetch (§8).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !hasRole(session.user.role, "admin")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403, headers: NO_STORE });
  }

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note" }, { status: 400, headers: NO_STORE });
  }

  const version = await publishSnapshot(session.user.id, parsed.data.note);

  await db.insert(schema.auditLog).values({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "snapshot.publish",
    entityType: "map_version",
    entityId: String(version),
    after: { note: parsed.data.note ?? null },
  });

  return NextResponse.json({ version }, { headers: NO_STORE });
}
