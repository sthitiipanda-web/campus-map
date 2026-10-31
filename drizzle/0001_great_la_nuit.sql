CREATE TYPE "public"."terrain_kind" AS ENUM('building', 'grass', 'garden', 'wood', 'scrub', 'water', 'pitch', 'tree');--> statement-breakpoint
CREATE TABLE "terrain_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "terrain_kind" NOT NULL,
	"name" text,
	"polygon" geometry(Polygon,4326),
	"point" geometry(Point,4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
