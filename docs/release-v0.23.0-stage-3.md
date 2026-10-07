# v0.23.0 stage 3 — bounded generation and retries

Implemented locally on 2026-10-05. No source push, live database change, paid AI request, or deployment was performed. Package/HTML remain v0.22.0. This completes the generation-deadline stage of [the release plan](release-v0.23.0-plan.md), alongside the essential generation cancellation work.

## Behavior and rationale

Previously, recipes ran in parallel with a 45-second timeout per call. Any failures were retried in another full pass, regardless of cause or time already spent. That could exceed the repository's configured 60-second Vercel function duration and leave the user waiting for a response the platform could not complete.

`RequestBudget` now starts a 50-second clock at route entry. Authentication, household membership, rate limiting, preference reads, AI calls, retry waits, output validation and response assembly share that same clock. Every transport receives its cancellation signal. Promise racing also bounds the handler if a transport ignores abort. A single response wrapper sends results only after the work completes within the budget, and prevents a late success after timeout or disconnection.

The repository still specifies 60 seconds in `vercel.json`. Fifty seconds is a provisional application budget that leaves ten seconds for platform/network variance; actual deployed limits and performance still need preview verification. Synchronous work and network delivery cannot be guaranteed to the millisecond by JavaScript timers. Responses return earlier when an individual prerequisite/attempt times out.

Each logical AI call permits at most two attempts. An attempt uses at most 35 seconds and no more than the shared time remaining minus a one-second response reserve. A retry requires its delay, at least eight seconds for useful generation, and that reserve. `Retry-After` seconds/date values are honored when they fit; otherwise the retry is skipped. Seven selected recipes may run concurrently, each under the same request budget; successful recipes are not regenerated when another transient call retries.

Retryable failures are connection errors, attempt timeouts, HTTP 408/500/502/503/504, and recognized rate-limit responses. Quota/billing limits, invalid requests, output-token exhaustion, malformed structured output and incomplete recipes are not automatically retried. This follows the distinction between transient rate limits and quota errors in [OpenAI's error guidance](https://developers.openai.com/api/docs/guides/error-codes). The application uses fetch directly, so no SDK retries add hidden attempts.

All three on-demand routes use the policy: dinner ideas, complete selected recipes, and swap alternatives. Generation performs no saved-plan writes. The batch must contain every requested recipe with bounded steps/ingredients and the requested servings before it is returned. The existing transactional save remains a separate API request after successful generation.

## Browser recovery

The browser keeps its last saved plan, groceries and weekly metadata until a complete recipe batch arrives. Failed generation retains selected ideas and offers retry/back controls. Repeated build clicks do not start duplicate requests. Refreshing ideas passes bounded previous titles separately from the household notes.

Generation has a 55-second browser wait limit, allowing the server's 50-second result time plus delivery allowance. Leaving via dashboard, week/profile/meals/groceries navigation, or the build/swap Back controls aborts generation. Account and selected-week guards discard late success/error responses before state changes, saving or repainting. The generated recipes then use the stage 2 save/retry/conflict contract.

Cancellation stops the browser request and asks supported server/upstream fetches to abort; it does not prove that a provider stopped all computation or billing already begun. Client generation timeout is cleared before the separate save request. A save with an ambiguous response still keeps its idempotent pending draft for explicit recovery.

## Implementation

- `api/_lib/deadline.ts`: shared budget, abortable waits, and per-transport timeouts.
- `api/_lib/generation-handler.ts`: response ownership, request ID, disconnect handling and stable errors.
- `api/_lib/generation-routes.ts`: authenticated generation pipelines and prompts; the three API entry files delegate here.
- `api/_lib/generation-validation.ts`: bounded input and complete-recipe validation.
- `api/_lib/openai.ts`: classified provider failures, cancellation and bounded retries.
- Auth/database/limiter helpers accept an optional parent signal; other endpoints retain their existing local timeout behavior.
- `app.js` and `weeks.js`: generation tokens, abort controls, preservation and stale-response guards.

Logs contain request ID, fixed stage/error codes, duration, remaining budget, retry outcome and existing model/token usage. They omit household IDs, account emails, household notes, recipes, prompts, credentials and provider error messages. Generation responses expose `X-Request-Id` for support correlation. Deadline errors return HTTP 504/`GENERATION_TIMEOUT`; other incomplete generation returns HTTP 502/`GENERATION_FAILED`, with a retryability flag. Input errors return 400 before limiter/AI work; authentication and rate-limit responses preserve their existing statuses.

## Validation evidence

| Check | Result |
| --- | --- |
| Unit/API/database suite | 182 tests passed, including 29 deadline/retry checks with simulated clocks |
| Browser suite | 21 tests passed; generation failure/retry, saved-week preservation, duplicate build prevention, incomplete batches, late account/week results, and canceled ideas/swaps |
| Typecheck | Passed |
| Vercel runtime smoke | API modules loaded and protected-route JSON checks passed |
| Existing release check | All four v0.22.0 checks passed; the version was not bumped |
| Git whitespace check | Passed |

Executable generation tests cover seven-day completion, retrying only one transient recipe, honoring retry delay, total-budget consumption by prerequisites, suppressed late retries, deadlines when transports ignore abort, disconnected clients, quota/output/invalid errors, and cancellation during retry waits. External services are mocked; clocks advance without paid requests or real 50-second waits. Browser checks execute the shipped scripts against a controlled API. These establish local behavior, not live model quality or platform timing.

## Remaining preview/release gates

1. Prepare the release candidate and strengthen release metadata checks. Keep versions unchanged until that preparation is complete.
2. In the intended preview, verify the deployed function limit, actual seven-day generation time and retry telemetry with request IDs. Exercise slow/error scenarios and confirm completion/error responses fit the budget.
3. Verify two members, two isolated households, generation failure followed by save recovery, account/week navigation during requests, mobile keyboard controls, and expired sessions.
4. Follow the stage 2 duplicate-week preflight and coordinated migration/code deployment window. This stage adds no migration.

The Friday multi-household preparation cron still needs a separate bounded/resumable scheduling design. Background week hydration/prefetch races and broad browser TypeScript/module conversion also remain separate work; this change focuses on the generation/save journey. No release date is promised.
