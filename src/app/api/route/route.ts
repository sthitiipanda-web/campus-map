import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { latestSnapshot } from "@/lib/map-data/snapshot";
import { computeRoute, RouteError, type RouteEndpointInput } from "@/lib/routing/route-service";
import { lonLat } from "@/lib/validation/geo";

export const dynamic = "force-dynamic";

/**
 * Pedestrian routing endpoint. `from` / `to` are each either "lon,lat" or a
 * published POI id. Responses carry user location, so they are never cached
 * or logged — the coordinate exists only for the lifetime of the request
 * (UK GDPR / §12).
 */
const COORD_RE = /^-?\d{1,3}(?:\.\d{1,10})?,-?\d{1,2}(?:\.\d{1,10})?$/;

const endpointParam = z
  .string()
  .max(60)
  .transform((raw, ctx): RouteEndpointInput => {
    if (COORD_RE.test(raw)) {
      const [lonStr, latStr] = raw.split(",");
      const parsed = lonLat.safeParse([Number(lonStr), Number(latStr)]);
      if (!parsed.success) {
        // Campus-bbox rejection at the API boundary (§15 of the brief).
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Coordinate is outside campus" });
        return z.NEVER;
      }
      return { kind: "coord", lonLat: parsed.data };
    }
    const id = z.string().uuid().safeParse(raw);
    if (!id.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected 'lon,lat' or a POI id" });
      return z.NEVER;
    }
    return { kind: "poi", id: id.data };
  });

const querySchema = z.object({
  from: endpointParam,
  to: endpointParam,
  stepFree: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const ERROR_STATUS: Record<string, number> = {
  UNKNOWN_POI: 404,
  NO_NEARBY_PATH: 422,
  NO_ROUTE: 422,
  NO_STEP_FREE_ROUTE: 422,
};

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid route request", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const snapshot = await latestSnapshot();
    if (!snapshot) {
      return NextResponse.json(
        { error: "No published campus data yet" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const route = computeRoute(snapshot, parsed.data);
    return NextResponse.json(route, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof RouteError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: ERROR_STATUS[err.code] ?? 422, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Routing unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
