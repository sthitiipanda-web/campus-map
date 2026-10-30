CREATE TYPE "public"."admin_role" AS ENUM('editor', 'admin', 'super-admin');--> statement-breakpoint
CREATE TYPE "public"."college" AS ENUM('digby-stuart', 'froebel', 'southlands', 'whitelands', 'shared');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('path', 'paved', 'indoor', 'stairs', 'ramp', 'lift', 'road-crossing');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('junction', 'entrance', 'stop');--> statement-breakpoint
CREATE TYPE "public"."poi_category" AS ENUM('building', 'lecture-theatre', 'cafe', 'toilet', 'accessible-toilet', 'prayer-room', 'printer', 'shuttle-stop', 'cycle-park', 'reception', 'library', 'other');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'editor' NOT NULL,
	"mfa_secret" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entrances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text,
	"point" geometry(Point,4326) NOT NULL,
	"step_free" boolean DEFAULT false NOT NULL,
	"node_id" uuid
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"college" "college" DEFAULT 'shared' NOT NULL,
	"category" "poi_category" DEFAULT 'building' NOT NULL,
	"point" geometry(Point,4326) NOT NULL,
	"polygon" geometry(Polygon,4326),
	"description" text,
	"opening_hours" jsonb,
	"accessibility" jsonb,
	"media" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "map_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot" jsonb NOT NULL,
	"note" text,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "path_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_node" uuid NOT NULL,
	"to_node" uuid NOT NULL,
	"line" geometry(LineString,4326) NOT NULL,
	"length_meters" real NOT NULL,
	"type" "edge_type" DEFAULT 'path' NOT NULL,
	"accessible" boolean DEFAULT true NOT NULL,
	"weight_multiplier" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "path_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point" geometry(Point,4326) NOT NULL,
	"type" "node_type" DEFAULT 'junction' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shuttle_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"line" geometry(LineString,4326),
	"term_time_only" boolean DEFAULT true NOT NULL,
	"timetable" jsonb
);
--> statement-breakpoint
CREATE TABLE "shuttle_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"location_id" uuid,
	"node_id" uuid,
	"stop_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entrances" ADD CONSTRAINT "entrances_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrances" ADD CONSTRAINT "entrances_node_id_path_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."path_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_from_node_path_nodes_id_fk" FOREIGN KEY ("from_node") REFERENCES "public"."path_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path_edges" ADD CONSTRAINT "path_edges_to_node_path_nodes_id_fk" FOREIGN KEY ("to_node") REFERENCES "public"."path_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shuttle_stops" ADD CONSTRAINT "shuttle_stops_route_id_shuttle_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."shuttle_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shuttle_stops" ADD CONSTRAINT "shuttle_stops_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shuttle_stops" ADD CONSTRAINT "shuttle_stops_node_id_path_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."path_nodes"("id") ON DELETE no action ON UPDATE no action;