# Mealz architecture notes

## State ownership

Mealz intentionally separates state by lifetime:

- **Household profile**: adults, children, diet tags, equipment, stores. Persistent and cloud-backed.
- **Weekly draft**: cooking days, use-up ingredients, weekly notes. Session-only until a plan is built.
- **Saved week**: meals, recipes, groceries, checked grocery state. Cloud-backed and identified by `week_start`.
- **Prepared ideas**: disposable cache for a future week. Cloud-backed with `status=ideas` and invalidated when household settings change.
- **Local storage**: resilience/cache only. It should not be treated as the source of truth when cloud data is available.

## Week identity

A Mealz week always runs Monday through Sunday. New work should pass an explicit `week_start` (`YYYY-MM-DD`) whenever reading or writing a saved plan. Avoid adding new flows that mean “latest active plan.” The legacy boot hydration still supports that fallback for compatibility and should be removed once all boot state is week-explicit.

## Client structure

- `app.js`: primary screens and meal/grocery workflows.
- `weeks.js`: week dashboard and explicit week navigation/cache.
- `shared-logic.js`: pure deterministic logic that can run in both browser and Node tests.
- `client-foundation.js`: small cross-screen behaviors only: weekly draft capture, dietary conflict warnings, and scroll reset.

Feature files should avoid redefining unrelated global functions. Shared deterministic behavior belongs in `shared-logic.js` so it can be tested.

## Server structure

Shared helpers live under `api/_lib/`:

- `supabase.js`: REST client, encoding, timeout/error handling.
- `openai.js`: Responses API request, text extraction, JSON parsing, usage timing.
- `profile.js`: common household prompt language.
- `telemetry.js`: structured Vercel logs for latency, errors, retries, and token usage.

New API endpoints should use these helpers rather than duplicating request code.

## Near-term technical debt

- Profile data is still stored as a special `weekly_plans` row dated `1970-01-01`.
- The app has no authentication or household isolation yet.
- Full-plan replacement is not transactional.
- Some older API endpoints still contain duplicated OpenAI/Supabase helpers and should migrate incrementally during v0.12.
- Grocery normalization is still intentionally conservative until unit conversion rules are added.
