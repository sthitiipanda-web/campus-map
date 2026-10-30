# Roehampton Campus Navigator

Internal pedestrian wayfinding for the University of Roehampton: building-name search,
a custom footpath routing graph with step-free mode, and an admin console for the
campus knowledge layer. Built per the master brief (see `docs/BRIEF-NOTES.md` for
decisions and deviations).

## Stack

Next.js (App Router, TypeScript strict) · Mapbox GL JS via react-map-gl ·
PostgreSQL 16 + PostGIS · Drizzle ORM · Upstash Redis (in-memory fallback locally) ·
Auth.js (credentials + TOTP MFA, RBAC) · Tailwind v4 with bespoke design tokens ·
Vitest + Playwright.

## Getting started

1. **Prereqs:** Node ≥ 20.9, Docker (for local Postgres+PostGIS).
2. **Env:** copy `.env.example` → `.env`; set `NEXT_PUBLIC_MAPBOX_TOKEN`
   (URL-restricted public token) and `AUTH_SECRET` (`openssl rand -base64 32`).
3. **Database:** `docker compose up -d` then `npm run db:migrate`.
4. **Seed (optional, placeholder data):** set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in
   `.env`, run `npm run db:seed`. Scan the printed QR into an authenticator app —
   admin login requires the 6-digit TOTP code.
5. **Run:** `npm run dev` → http://localhost:3000 (public map) and `/admin`.

## Scripts

| Script                                        | What it does                                        |
| --------------------------------------------- | --------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js dev / production build / serve              |
| `npm run lint` / `typecheck` / `format:check` | Static checks (CI gates)                            |
| `npm test`                                    | Vitest unit tests (validation, auth, rate limiting) |
| `npm run test:e2e`                            | Playwright smoke tests (mobile-first + desktop)     |
| `npm run db:generate`                         | Generate SQL migrations from the Drizzle schema     |
| `npm run db:migrate`                          | Apply migrations (ensures PostGIS extension)        |
| `npm run db:seed`                             | Placeholder seed + bootstrap super-admin with TOTP  |

## Security model (summary — full requirements in the brief §9)

- No provider secret reaches the browser; only a URL-restricted Mapbox **public**
  token is client-side. Any secret-token provider call goes through server route
  handlers.
- `/admin` is gated by middleware **and** server-side session checks; credentials +
  mandatory TOTP; lockout after 5 failures; every auth event and admin write is
  audit-logged.
- All input crosses a Zod boundary; geometry is validated against the campus
  bounding box (`src/lib/config/campus.ts` — **TO CONFIRM with survey data**).
- Nonce-based CSP + security headers in `src/proxy.ts` (Next 16 proxy, formerly
  middleware) / `next.config.ts`; per-IP rate limits on all API routes.
- Geometry is written as EWKT via parameterised queries only; public reads are
  served from versioned published snapshots (`map_versions`), never live tables.

## Deployment (staging)

The app is stateless. Intended wiring: **Vercel** (app) + **Neon** (Postgres with
PostGIS enabled) + **Upstash** (Redis REST) + **Cloudflare** in front at launch.
Set the `.env` variables in the platform's secret store — never commit them.
Remember to set Mapbox **budget alarms** and URL-restrict the public token to the
deployed domains.

## Phase status

Phase 0 (foundations) — this repo. Phase 1 builds search + routing on the graph
schema already present. See `docs/BRIEF-NOTES.md`.
