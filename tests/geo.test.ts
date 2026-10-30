import { describe, expect, it } from "vitest";
import {
  ewktLineString,
  ewktPoint,
  lineStringGeometry,
  pointGeometry,
  polygonGeometry,
} from "@/lib/validation/geo";

describe("campus geometry validation", () => {
  it("accepts a point inside the campus bounding box", () => {
    const p = pointGeometry.safeParse({ type: "Point", coordinates: [-0.244, 51.457] });
    expect(p.success).toBe(true);
  });

  it("rejects a point outside the campus bounding box", () => {
    // Central London — valid WGS84, but not campus
    const p = pointGeometry.safeParse({ type: "Point", coordinates: [-0.1276, 51.5072] });
    expect(p.success).toBe(false);
  });

  it("rejects nonsense coordinates", () => {
    const p = pointGeometry.safeParse({ type: "Point", coordinates: [500, 91] });
    expect(p.success).toBe(false);
  });

  it("rejects a linestring with any vertex off campus", () => {
    const l = lineStringGeometry.safeParse({
      type: "LineString",
      coordinates: [
        [-0.244, 51.457],
        [0.0, 51.5],
      ],
    });
    expect(l.success).toBe(false);
  });

  it("requires polygon rings to be closed", () => {
    const open = polygonGeometry.safeParse({
      type: "Polygon",
      coordinates: [
        [
          [-0.245, 51.456],
          [-0.244, 51.456],
          [-0.244, 51.457],
          [-0.2455, 51.4575], // not equal to first vertex
        ],
      ],
    });
    expect(open.success).toBe(false);

    const closed = polygonGeometry.safeParse({
      type: "Polygon",
      coordinates: [
        [
          [-0.245, 51.456],
          [-0.244, 51.456],
          [-0.244, 51.457],
          [-0.245, 51.456],
        ],
      ],
    });
    expect(closed.success).toBe(true);
  });

  it("serialises EWKT with lon lat order", () => {
    const p = pointGeometry.parse({ type: "Point", coordinates: [-0.244, 51.457] });
    expect(ewktPoint(p)).toBe("SRID=4326;POINT(-0.244 51.457)");

    const l = lineStringGeometry.parse({
      type: "LineString",
      coordinates: [
        [-0.244, 51.457],
        [-0.243, 51.458],
      ],
    });
    expect(ewktLineString(l)).toBe("SRID=4326;LINESTRING(-0.244 51.457,-0.243 51.458)");
  });
});
