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

## Near-term technical debt

- Apply `migrations/2026-09-17_account_security.sql` before v0.17.0; follow `docs/auth-setup.md` for the ordered rollout and live checks.
- Self-service household leaving/ownership transfer remains future work.
- Plan replacement is safer but still not a true database transaction.
- The legacy boot hydration can still read the newest active plan without explicit `week_start`.
- Grocery normalization is still intentionally conservative until unit conversion rules are added.
