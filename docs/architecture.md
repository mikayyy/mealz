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

Local v0.23.0 work replaces independent REST writes with `mealz_save_week`, a user-scoped `SECURITY INVOKER` transaction. `api/_lib/plan-save.ts` validates the draft and reconciles authoritative groceries with `shopping-logic.js`. The RPC locks the household/week, checks the caller and reconciliation snapshot revisions, updates the stable plan and child graph, and records a household/user request receipt atomically. Failed writes, including prepared-ideas cleanup, roll back together. A receipt replay returns the current complete graph for that plan without repeating writes.

Grocery and meal-feedback RPCs use the same lock/revision boundary. Child-write triggers advance revisions for direct REST changes too. A partial unique index enforces one active plan per household/week. Stale writers get HTTP 409. `mealz_week_result` returns the graph and revision from one SQL snapshot. Missing infrastructure fails closed; there is no legacy save fallback or service-key retry.

Browser pending drafts use the authenticated household/account cache key. Reload does not auto-upload cached plans. Explicit retry reuses the request key; conflict recovery loads the current week, retains the draft, and requires review before issuing a new key. Late save/mutation responses are ignored after account/week changes.

The migration is local and unapplied live. Its unique rule is incompatible with the old save implementation. See [stage 2](release-v0.23.0-stage-2.md) for the deployment window and verification evidence.

## On-demand generation

The local v0.23.0 generation routes delegate to `api/_lib/generation-routes.ts`. A response wrapper owns one 50-second budget covering authentication, membership, rate limiting, preferences, model calls/retries, validation and response assembly. Signals propagate through auth/database/AI helpers; promise races prevent a late response if a transport ignores abort. Only complete batches are returned, and generation never writes saved-plan data.

AI attempts receive at most 35 seconds within the remaining request time. One transient retry is allowed only when its delay, eight seconds of generation and a one-second response reserve fit. Provider quota/invalid/output errors are not retried. Browser generation uses a 55-second delivery allowance, preserves saved state on failure, cancels on navigation, and ignores stale account/week responses before saving. Request IDs and fixed timing/outcome fields support diagnostics without household text or provider error messages. See [stage 3](release-v0.23.0-stage-3.md) for tests, limitations and preview gates.

## Quick-login privileged access

`api/quick-login.js` uses `SUPABASE_SECRET_KEY` (service role) only to issue an
admin-generated magic-link token hash during unlock. All subsequent requests use
the resulting Supabase user session. The Supabase client is configured with
`persistSession: true` and `autoRefreshToken: true`, so after a successful unlock
a normal session is persisted and auto-refreshed in browser storage.
Trusted-device records and the rate-limit table are service-only and cannot be
read by authenticated or anonymous browser roles.

## Known technical debt

- **Live generation timing and Friday preparation.** On-demand generation is bounded locally; preview performance and the separate multi-household cron's resumability/scaling remain unverified.
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
9. `migrations/20260924161500_sundry_intent_v0220.sql`
10. `migrations/20261006015243_transactional_week_saves.sql` — pending locally; coordinated deployment required

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
