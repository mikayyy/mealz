# Mealz architecture notes

## State ownership

Mealz intentionally separates state by lifetime:

- **Profile**: adults, children, diet tags, equipment, stores. Persistent and cloud-backed. Household size remains a property of the Profile.
- **Weekly draft**: cooking days, use-up ingredients, weekly notes. Session-only until a plan is built.
- **Saved week**: meals, recipes, groceries, checked grocery state. Cloud-backed and identified by `week_start`.
- **Prepared ideas**: disposable cache for a future week. Cloud-backed with `status=ideas` and invalidated when Profile settings change.
- **Local storage**: resilience/cache only. It should not be treated as the source of truth when cloud data is available.

## Profile model

The canonical Profile belongs to a household in `profiles`, uniquely keyed by `(household_id, profile_key)` with `profile_key='default'`. Saves use an atomic upsert. Members share the Profile and meal data through membership-based RLS. The historical SQL migrations preserve prototype data; runtime APIs no longer read or write legacy Profile rows.

## Week identity

A Mealz week always runs Monday through Sunday. New work should pass an explicit `week_start` (`YYYY-MM-DD`) whenever reading or writing a saved plan. Avoid adding new flows that mean “latest active plan.” The legacy boot hydration still supports that fallback for compatibility and should be removed once all boot state is week-explicit.

## Client structure

- `app.js`: primary screens and meal/grocery workflows.
- `auth-client.js`: password auth/recovery, persistent Supabase sessions, authenticated fetch, and account-change invalidation.
- `account-client.js`: resolves membership before boot, Create/Join onboarding, Account settings, and household-scoped browser cache keys. Startup waits for dashboard rendering before opening first-time Profile setup.
- `weeks.js`: week dashboard and explicit week navigation/cache.
- `shared-logic.js`: pure deterministic logic that can run in both browser and Node tests.
- `client-foundation.js`: small cross-screen behaviors only: weekly draft capture, dietary conflict warnings, Profile labels, and scroll reset.

Feature files should avoid redefining unrelated global functions. Shared deterministic behavior belongs in `shared-logic.js` so it can be tested.

## Server structure

Shared helpers live under `api/_lib/`:

- `supabase.js`: REST client, encoding, timeout/error handling.
- `openai.js`: Responses API request, Structured Outputs, token limits, usage timing.
- `profile.js`: common Profile prompt language.
- `profile-store.js`: canonical household Profile persistence with no legacy fallback.
- `rate-limit.js`: atomic Postgres rate limiting across serverless instances. Missing limiter infrastructure fails closed.
- `schemas.js`: strict AI response schemas.
- `telemetry.js`: structured Vercel logs for latency, errors, retries, and token usage.

New API endpoints should use these helpers rather than duplicating request code.

## Plan replacement

Plan replacement now follows a create-then-swap strategy. Mealz builds the new active plan and all child records first. Only after that succeeds does it delete the prior active plan and stale prepared ideas. If the new save fails, Mealz attempts to delete the incomplete replacement and leaves the prior plan intact.

## Quick-login privileged access

`api/quick-login.js` uses `SUPABASE_SECRET_KEY` (service role) only to issue an
admin-generated magic-link token hash during unlock. All subsequent requests use
the resulting Supabase user session. The Supabase client is configured with
`persistSession: true` and `autoRefreshToken: true`, so after a successful unlock
a normal session is persisted and auto-refreshed in browser storage.
Trusted-device records and the rate-limit table are service-only and cannot be
read by authenticated or anonymous browser roles.

## Known technical debt

- **Plan replacement is not transactional.** The create-then-swap strategy is safer
  than delete-then-create, but a partial failure can leave an incomplete replacement
  plan. A server-side SQL transaction or security-definer RPC is the correct fix
  (roadmap Phase 2). Do not approximate transactions with parallel REST calls.
- **Implicit week fallback.** The legacy boot hydration can still read the newest
  active plan without an explicit `week_start`. New code should always pass an
  explicit `week_start`; the fallback should be removed once all callers are
  week-explicit.
- **`owner_user_id` still populated.** `api/plan.js`, `api/_lib/profile-store.js`,
  and `api/prep-next-week.js` still write `owner_user_id` for compatibility.
  The field is no longer required and will be removed once migrations are confirmed
  on all production installations.
- **Self-service household leaving/ownership transfer** remains future work.
- **Grocery normalization** is intentionally conservative; unit conversion rules are
  additive and roadmap-tracked.
- **Typecheck.** Run `pnpm typecheck` to verify TypeScript contracts. Seven
  browser-global files use `@ts-nocheck` (see `docs/typescript-migration-baseline.md`).

## Migration state

All required migrations must be applied in Supabase before deploying the application.
The canonical order is:

1. `migrations/2026-09-14_profiles.sql`
2. `migrations/2026-09-15_user_ownership_rls.sql`
3. `migrations/2026-09-15_households.sql`
4. `migrations/2026-09-16_household_compatibility.sql`
5. `migrations/2026-09-17_account_security.sql`
6. `migrations/2026-09-21_trusted_device_login.sql`
7. `migrations/20260921194345_supabase_hardening_v0202.sql`
8. `migrations/20260921212102_editable_groceries_v0210.sql`

### Migration verification

Migration verification runs in two layers:

- **Offline** — `pnpm migration:validate` applies all migrations to an in-process
  PGlite database and checks the resulting schema (tables, columns, indexes,
  functions, RLS, grants, idempotency). No live credentials needed.
- **Live** — `pnpm migration:live` probes the live Supabase database for every
  required table and column from the manifest using read-only SELECT probes.
  It skips gracefully when credentials are absent (exit 0) and fails closed
  (exit 1) when required objects are missing.

**No auto-apply.** Migrations are applied manually in the Supabase SQL Editor.
`migration:apply` emits the ordered SQL for convenience but never writes to
the database. The live gate is a read-only check, not an automated writer.

See `docs/auth-setup.md` for the full deployment order and smoke-check procedure.
