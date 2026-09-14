# Mealz architecture notes

## State ownership

Mealz intentionally separates state by lifetime:

- **Profile**: adults, children, diet tags, equipment, stores. Persistent and cloud-backed. Household size remains a property of the Profile.
- **Weekly draft**: cooking days, use-up ingredients, weekly notes. Session-only until a plan is built.
- **Saved week**: meals, recipes, groceries, checked grocery state. Cloud-backed and identified by `week_start`.
- **Prepared ideas**: disposable cache for a future week. Cloud-backed with `status=ideas` and invalidated when Profile settings change.
- **Local storage**: resilience/cache only. It should not be treated as the source of truth when cloud data is available.

## Profile model

The canonical persistent Profile belongs in the `profiles` table, keyed by `profile_key='default'` during the single-user prototype phase. The profile API is migration-safe: until the `profiles` table exists, it can still read/write the legacy `weekly_plans` profile row. Once the table exists, the API uses it and removes the old legacy row after a successful write/migration.

The legacy row (`status='profile'`, `week_start='1970-01-01'`) exists only as a compatibility bridge and should not be used by new code.

## Week identity

A Mealz week always runs Monday through Sunday. New work should pass an explicit `week_start` (`YYYY-MM-DD`) whenever reading or writing a saved plan. Avoid adding new flows that mean “latest active plan.” The legacy boot hydration still supports that fallback for compatibility and should be removed once all boot state is week-explicit.

## Client structure

- `app.js`: primary screens and meal/grocery workflows.
- `weeks.js`: week dashboard and explicit week navigation/cache.
- `shared-logic.js`: pure deterministic logic that can run in both browser and Node tests.
- `client-foundation.js`: small cross-screen behaviors only: weekly draft capture, dietary conflict warnings, Profile labels, and scroll reset.

Feature files should avoid redefining unrelated global functions. Shared deterministic behavior belongs in `shared-logic.js` so it can be tested.

## Server structure

Shared helpers live under `api/_lib/`:

- `supabase.js`: REST client, encoding, timeout/error handling.
- `openai.js`: Responses API request, Structured Outputs, token limits, usage timing.
- `profile.js`: common Profile prompt language.
- `profile-store.js`: canonical Profile persistence with legacy fallback during migration.
- `schemas.js`: strict AI response schemas.
- `telemetry.js`: structured Vercel logs for latency, errors, retries, and token usage.

New API endpoints should use these helpers rather than duplicating request code.

## Plan replacement

Plan replacement now follows a create-then-swap strategy. Mealz builds the new active plan and all child records first. Only after that succeeds does it delete the prior active plan and stale prepared ideas. If the new save fails, Mealz attempts to delete the incomplete replacement and leaves the prior plan intact.

## Near-term technical debt

- Run `migrations/2026-09-14_profiles.sql` in Supabase to complete the Profile migration and retire the compatibility fallback in practice.
- The app has no authentication or profile isolation yet.
- Plan replacement is safer but still not a true database transaction.
- The legacy boot hydration can still read the newest active plan without explicit `week_start`.
- Grocery normalization is still intentionally conservative until unit conversion rules are added.
