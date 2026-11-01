ALTER TYPE "public"."terrain_kind" ADD VALUE 'boundary';--> statement-breakpoint
ALTER TABLE "entrances" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terrain_features" ADD COLUMN "height_m" real;