import { NextResponse } from "next/server";
import { latestSnapshot } from "@/lib/map-data/snapshot";

export const dynamic = "force-dynamic";

/**
 * Public campus data: the latest published snapshot as GeoJSON. Aggressively
 * CDN-cached so 5,000 concurrent users hit the edge, not Postgres (§10).
 * Clients send ?v=<version> for immutable caching once they know the version.
 */
export async function GET() {
  try {
    const snapshot = await latestSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { error: "No published campus data yet" },
        { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } },
      );
    }
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "X-Map-Version": String(snapshot.version),
      },
    });
  } catch {
    return NextResponse.json({ error: "Campus data unavailable" }, { status: 503 });
  }
}
