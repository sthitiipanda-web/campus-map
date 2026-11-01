import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  COLLEGES,
  EDGE_TYPES,
  NODE_TYPES,
  POI_CATEGORIES,
  TERRAIN_KINDS,
} from "@/lib/config/campus";

/* PostGIS geometry columns. Values are written as EWKT strings (see
   src/lib/validation/geo.ts) and read back via explicit ST_AsGeoJSON in raw
   queries; the raw driver value (EWKB hex) is never consumed directly. */
const geometry = (type: "Point" | "LineString" | "Polygon") =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `geometry(${type},4326)`,
  });

export const collegeEnum = pgEnum("college", COLLEGES);
export const poiCategoryEnum = pgEnum("poi_category", POI_CATEGORIES);
export const edgeTypeEnum = pgEnum("edge_type", EDGE_TYPES);
export const nodeTypeEnum = pgEnum("node_type", NODE_TYPES);
export const contentStatusEnum = pgEnum("content_status", ["draft", "published"]);
export const terrainKindEnum = pgEnum("terrain_kind", TERRAIN_KINDS);
export const adminRoleEnum = pgEnum("admin_role", ["editor", "admin", "super-admin"]);

/* ── Campus knowledge layer (working copy; public reads use snapshots) ──── */

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  college: collegeEnum("college").notNull().default("shared"),
  category: poiCategoryEnum("category").notNull().default("building"),
  point: geometry("Point")("point").notNull(),
  polygon: geometry("Polygon")("polygon"),
  description: text("description"),
  openingHours: jsonb("opening_hours"),
  accessibility: jsonb("accessibility"), // step-free, lift, hearing loop, accessible WC nearby
  media: jsonb("media"),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete (§12)
});

export const pathNodes = pgTable("path_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  point: geometry("Point")("point").notNull(),
  type: nodeTypeEnum("type").notNull().default("junction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const entrances = pgTable("entrances", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id),
  name: text("name"), // "Main entrance", "North door"
  point: geometry("Point")("point").notNull(),
  stepFree: boolean("step_free").notNull().default(false),
  nodeId: uuid("node_id").references(() => pathNodes.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const pathEdges = pgTable("path_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromNode: uuid("from_node")
    .notNull()
    .references(() => pathNodes.id),
  toNode: uuid("to_node")
    .notNull()
    .references(() => pathNodes.id),
  line: geometry("LineString")("line").notNull(),
  lengthMeters: real("length_meters").notNull(),
  type: edgeTypeEnum("type").notNull().default("path"),
  accessible: boolean("accessible").notNull().default(true),
  weightMultiplier: real("weight_multiplier").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/* Decorative terrain (building footprints, lawns, woods, water, trees):
   visual context only — never routed or searched. Polygon features fill
   `polygon`; point features (trees) fill `point`; exactly one is set. */
export const terrainFeatures = pgTable("terrain_features", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: terrainKindEnum("kind").notNull(),
  name: text("name"),
  polygon: geometry("Polygon")("polygon"),
  point: geometry("Point")("point"),
  /** Real height from OSM tags (height, or building:levels × 3 m); null when untagged. */
  heightM: real("height_m"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/* ── Transport (Phase 3; schema reserved now so publishing stays stable) ── */

export const shuttleRoutes = pgTable("shuttle_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  line: geometry("LineString")("line"),
  termTimeOnly: boolean("term_time_only").notNull().default(true),
  timetable: jsonb("timetable"), // service times; normalised later if needed
});

export const shuttleStops = pgTable("shuttle_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => shuttleRoutes.id),
  locationId: uuid("location_id").references(() => locations.id),
  nodeId: uuid("node_id").references(() => pathNodes.id),
  stopOrder: integer("stop_order").notNull().default(0),
});

/* ── Publishing: atomic, versioned snapshots (§8) ─────────────────────────
   Publishing builds one GeoJSON snapshot of all published content; the public
   app only ever reads the latest snapshot, so edits never leak half-done. */

export const mapVersions = pgTable("map_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshot: jsonb("snapshot").notNull(),
  note: text("note"),
  publishedBy: uuid("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Admin & audit ───────────────────────────────────────────────────────── */

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRoleEnum("role").notNull().default("editor"),
  mfaSecret: text("mfa_secret"), // TOTP secret (base32); enrolment via scripts/create-admin
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(), // e.g. "location.update", "auth.login.failed"
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
