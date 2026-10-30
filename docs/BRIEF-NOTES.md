# Decisions & notes against the master brief

Running log of approved decisions, deviations and open items. Dates absolute.

## Approved 2026-10-30

- **Routing:** in-process A\* over an in-memory graph loaded from Postgres
  (schema in `src/lib/db/schema.ts`), not pgRouting — managed Postgres
  (Neon/Vercel) lacks the extension; graph is small enough that A\* in Node is
  faster and unit-testable. PostGIS remains for storage/snapping.
- **ORM:** Drizzle. **Hosting:** Vercel + Neon + Upstash (staging).
- **Auth:** Auth.js credentials + TOTP (otplib), JWT sessions (8 h), RBAC
  editor < admin < super-admin. University SSO can replace credentials later.
- **Visual direction (sign-off given):** parkland greens / water blues / warm
  heritage stone; college accents — Digby Stuart terracotta `#B5502E`, Froebel
  ochre `#C9961A`, Southlands slate `#4A6B8A`, Whitelands moss `#5A7D4F`.
  Placeholder typeface: Instrument Sans via next/font until a licensed face is
  chosen. Tokens live in `src/app/globals.css` + `src/lib/config/campus.ts`.
- **Seed data:** obviously-fake placeholders ("SEED – …") inside the bbox,
  approved until survey data exists (`scripts/seed.ts`).

## Open items / TO CONFIRM

- **Campus bounding box** (`src/lib/config/campus.ts`): generous envelope from
  public sources (main campus SW15 5PU, Whitelands SW15 4JD, shuttle corridor).
  Needs confirmation against survey data.
- **Mapbox custom style:** `.env` points at `outdoors-v12` until the bespoke
  parkland style is built in Mapbox Studio under the university account; then
  set `NEXT_PUBLIC_MAPBOX_STYLE`.
- **mfaSecret at rest:** stored plaintext in Postgres for Phase 0; encrypt with
  a KMS-held key before production launch (tracked for Phase 2 hardening).
- **Provisioning:** Neon / Upstash / Vercel / Cloudflare accounts are owned by
  the team; this repo assumes their connection strings via env.

## Snapshot/publishing model

Publishing builds one GeoJSON snapshot of all published content into
`map_versions`; the public API (`/api/campus-data`) serves only the latest
snapshot with CDN cache headers. Draft edits never leak; rollback = re-point to
an earlier version (Phase 2 UI).
