/**
 * Development seed — PLACEHOLDER DATA ONLY (§15 of the brief).
 *
 * Every record is prefixed "SEED –" and uses obviously-fake names. Coordinates
 * are arbitrary points INSIDE the campus bounding box, approved as temporary
 * placeholders until survey/admin data exists. Swap out by truncating and
 * re-running, or simply delete anything named "SEED –".
 *
 * Usage: npm run db:seed   (also bootstraps the admin from ADMIN_EMAIL/PASSWORD)
 */
import { config } from "dotenv";
config();

async function main() {
  const { db, schema } = await import("../src/lib/db");
  const { ewktPoint, ewktLineString, pointGeometry, lineStringGeometry } =
    await import("../src/lib/validation/geo");
  const { sql } = await import("drizzle-orm");

  const existing = await db.execute(sql`SELECT count(*)::int AS n FROM locations`);
  if ((existing as unknown as Array<{ n: number }>)[0]!.n > 0) {
    console.log("Locations table is not empty — refusing to reseed. Done.");
  } else {
    // Arbitrary placeholder coordinates inside the campus bbox envelope.
    const pois = [
      {
        name: "SEED – Building A",
        college: "digby-stuart",
        category: "building",
        lon: -0.246,
        lat: 51.458,
      },
      {
        name: "SEED – Building B",
        college: "froebel",
        category: "building",
        lon: -0.243,
        lat: 51.459,
      },
      {
        name: "SEED – Library",
        college: "shared",
        category: "library",
        lon: -0.2445,
        lat: 51.4575,
      },
      { name: "SEED – Cafe", college: "southlands", category: "cafe", lon: -0.242, lat: 51.4565 },
      {
        name: "SEED – Whitelands Hall",
        college: "whitelands",
        category: "building",
        lon: -0.2475,
        lat: 51.4505,
      },
    ] as const;

    const nodeIds: string[] = [];
    for (const p of pois) {
      const point = pointGeometry.parse({ type: "Point", coordinates: [p.lon, p.lat] });
      const [loc] = await db
        .insert(schema.locations)
        .values({
          name: p.name,
          aliases: [p.name.replace("SEED – ", "SEED alias ")],
          college: p.college,
          category: p.category,
          point: ewktPoint(point),
          status: "published",
          description: "Placeholder seed record — not real campus data.",
        })
        .returning({ id: schema.locations.id });

      const [node] = await db
        .insert(schema.pathNodes)
        .values({ point: ewktPoint(point), type: "entrance" })
        .returning({ id: schema.pathNodes.id });
      nodeIds.push(node!.id);

      await db.insert(schema.entrances).values({
        locationId: loc!.id,
        name: "SEED – Main entrance",
        point: ewktPoint(point),
        stepFree: true,
        nodeId: node!.id,
      });
    }

    // A tiny connected chain of edges so Phase 1 routing has something to walk.
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const a = pois[i]!;
      const b = pois[i + 1]!;
      const line = lineStringGeometry.parse({
        type: "LineString",
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      });
      await db.insert(schema.pathEdges).values({
        fromNode: nodeIds[i]!,
        toNode: nodeIds[i + 1]!,
        line: ewktLineString(line),
        // Rough placeholder length; real edges get ST_Length(geography) later.
        lengthMeters: 200,
        type: "path",
        accessible: true,
      });
    }
    console.log(`Seeded ${pois.length} placeholder locations with entrances, nodes and edges.`);

    const { publishSnapshot } = await import("../src/lib/map-data/snapshot");
    const version = await publishSnapshot(null, "Initial placeholder seed");
    console.log(`Published snapshot v${version}.`);
  }

  // Bootstrap admin user if requested and absent.
  await import("./create-admin").then((m) => m.createAdminFromEnv());
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
