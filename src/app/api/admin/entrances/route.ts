import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/rbac";
import { db, schema } from "@/lib/db";
import { ewktPoint, pointGeometry } from "@/lib/validation/geo";

/**
 * Admin CRUD for building entrances ("pin the door, not the centroid").
 * Editors place a door on the map; the route engine then walks people to the
 * actual entrance. Changes only reach the public app on the next snapshot
 * publish (§8). Every write is bbox-validated (§15) and audit-logged (§9);
 * deletes are soft (§12).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** An entrance only links to the path network when a node is this close. */
const MAX_NODE_LINK_METERS = 60;

const createBody = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  stepFree: z.boolean(),
  point: pointGeometry,
});

function forbidden() {
  return NextResponse.json({ error: "Not authorised" }, { status: 403, headers: NO_STORE });
}

async function requireEditor() {
  const session = await auth();
  if (!session?.user || !hasRole(session.user.role, "editor")) return null;
  return session.user;
}

/** Published locations plus their current (non-deleted) entrances. */
export async function GET() {
  const user = await requireEditor();
  if (!user) return forbidden();

  const [locations, entrances] = await Promise.all([
    db.execute(sql`
      SELECT id, name, college, category,
             ST_X(point) AS lon, ST_Y(point) AS lat
      FROM locations
      WHERE status = 'published' AND deleted_at IS NULL
      ORDER BY name
    `),
    db.execute(sql`
      SELECT e.id, e.location_id AS "locationId", e.name, e.step_free AS "stepFree",
             e.node_id AS "nodeId", ST_X(e.point) AS lon, ST_Y(e.point) AS lat
      FROM entrances e
      JOIN locations l ON l.id = e.location_id
      WHERE e.deleted_at IS NULL AND l.deleted_at IS NULL
    `),
  ]);

  return NextResponse.json({ locations, entrances }, { headers: NO_STORE });
}

/** Place a new entrance pin; links it to the nearest path node when close enough. */
export async function POST(request: Request) {
  const user = await requireEditor();
  if (!user) return forbidden();

  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid entrance" },
      { status: 400, headers: NO_STORE },
    );
  }
  const { locationId, name, stepFree, point } = parsed.data;

  const [location] = await db
    .select({ id: schema.locations.id, name: schema.locations.name })
    .from(schema.locations)
    .where(and(eq(schema.locations.id, locationId), isNull(schema.locations.deletedAt)))
    .limit(1);
  if (!location) {
    return NextResponse.json({ error: "Unknown location" }, { status: 404, headers: NO_STORE });
  }

  // Snap to the walking network: nearest live path node, if within reach.
  const ewkt = ewktPoint(point);
  const nearest = (await db.execute(sql`
    SELECT id, ST_DistanceSphere(point, ST_GeomFromEWKT(${ewkt})) AS meters
    FROM path_nodes
    WHERE deleted_at IS NULL
    ORDER BY point <-> ST_GeomFromEWKT(${ewkt})
    LIMIT 1
  `)) as unknown as Array<{ id: string; meters: number }>;
  const node = nearest[0] && nearest[0].meters <= MAX_NODE_LINK_METERS ? nearest[0] : null;

  const [created] = await db
    .insert(schema.entrances)
    .values({
      locationId,
      name: name ?? null,
      stepFree,
      point: ewkt,
      nodeId: node?.id ?? null,
    })
    .returning({ id: schema.entrances.id });

  await db.insert(schema.auditLog).values({
    actorId: user.id,
    actorEmail: user.email,
    action: "entrance.create",
    entityType: "entrance",
    entityId: created!.id,
    after: {
      locationId,
      locationName: location.name,
      name: name ?? null,
      stepFree,
      point: point.coordinates,
      nodeId: node?.id ?? null,
    },
  });

  return NextResponse.json(
    {
      entrance: {
        id: created!.id,
        locationId,
        name: name ?? null,
        stepFree,
        lon: point.coordinates[0],
        lat: point.coordinates[1],
        nodeId: node?.id ?? null,
      },
      // No node in reach → routes still end "on the nearest path" for now.
      linkedToPath: node !== null,
      nodeDistanceMeters: node ? Math.round(node.meters) : null,
    },
    { status: 201, headers: NO_STORE },
  );
}

/** Soft-delete one entrance (?id=…). History stays for the audit trail (§12). */
export async function DELETE(request: Request) {
  const user = await requireEditor();
  if (!user) return forbidden();

  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) {
    return NextResponse.json({ error: "Invalid entrance id" }, { status: 400, headers: NO_STORE });
  }

  const [gone] = await db
    .update(schema.entrances)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(schema.entrances.id, id.data), isNull(schema.entrances.deletedAt)))
    .returning({
      id: schema.entrances.id,
      locationId: schema.entrances.locationId,
      name: schema.entrances.name,
    });
  if (!gone) {
    return NextResponse.json({ error: "Entrance not found" }, { status: 404, headers: NO_STORE });
  }

  await db.insert(schema.auditLog).values({
    actorId: user.id,
    actorEmail: user.email,
    action: "entrance.delete",
    entityType: "entrance",
    entityId: gone.id,
    before: { locationId: gone.locationId, name: gone.name },
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
