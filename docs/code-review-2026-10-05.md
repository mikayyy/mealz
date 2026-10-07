# Mealz code review and SWOT — 2026-10-05

Reviewed local `main` at `fabdeb9ff5d3ffa14e6ae180e73c837af300a8a1`, package version 0.22.0. This is a repository and local execution review, not a production security audit. Production database state, deployment configuration, real AI performance, adoption, and costs were not measured.

Follow-up: [stage 1](release-v0.23.0-stage-1.md) fixes schema readiness, [stage 2](release-v0.23.0-stage-2.md) adds transactional saves and recovery, and [stage 3](release-v0.23.0-stage-3.md) bounds on-demand generation. Findings below describe the original reviewed baseline. Changes are local; remaining risks and preview/live verification are tracked in the release plan.

## Assessment

Mealz has a useful, coherent family workflow and a stronger backend foundation than a typical prototype: authenticated household access, database-enforced isolation, distributed rate limits, deterministic grocery reconciliation, and executable database/browser checks. The next release should strengthen reliable week planning rather than add another feature. Passing the current suite does not establish that plan replacement is safe under failure or concurrent use.

## Findings, ordered by urgency

### 1. P1 — A cleanup failure can delete both the old and new weekly plan

Evidence: `api/plan.ts:14-37`, especially lines 34-37.

The save handler creates a new active plan, writes its children, deletes the old active plans, then deletes prepared ideas. If that last cleanup request fails, the catch block deletes the new plan as well. The old plan has already been removed. A temporary database error can therefore erase a previously saved week rather than simply reject its replacement.

Verified by executing the real handler against an in-memory mocked REST boundary: successful replacement inserts and old-plan deletion, followed by an injected 503 on ideas cleanup, returned HTTP 500 and left zero active plans. No production requests or data mutations were made.

Related concurrency risk: two saves can read the same old plan and each create a new active replacement. The household/week index is not unique (`migrations/2026-09-15_households.sql:79`), and the save has no transaction, lock, idempotency key, or revision check. This related risk was identified by inspection, not reproduced against a concurrent database.

Recommendation: transact plan replacement and grocery reconciliation in Postgres, serialize writes to the same household/week, and reject stale writes. A committed replacement must never be deleted because later disposable-cache cleanup fails.

### 2. P1 — Runtime schema readiness rejects the schema shipped by the migrations

Evidence: `api/_lib/supabase.ts:55-57`; `migrations/2026-09-15_households.sql:15-20`; `migrations/manifest.js`; `api/prep-next-week.ts:53-61`.

`householdSchemaReady()` selects `id` from every required table. `household_members` has a composite primary key, with no `id`; `mealz_rate_limits` also uses `bucket_key`. A valid migrated database can therefore fail readiness. The scheduled job returns 503 before preparing any ideas. The separately implemented live migration script already uses `select=*` for table existence probes, so that script can pass while the runtime gate fails.

Verified by running the real helper with a mock that rejects the nonexistent membership `id`: readiness returned false after the third table probe. Actual production schema and job logs were not inspected.

Recommendation: share schema-probe construction between runtime and release checks; check table existence without assuming an ID column, then check manifest columns explicitly. Test readiness and the scheduled route against the current schema contract.

### 3. P1 — Recipe retry budget exceeds the configured function duration

Evidence: `api/expand-meals.ts:24,42-50`; `vercel.json:1`.

The first generation pass can wait 45 seconds and the retry pass another 45 seconds, before including authentication, membership, and limiter requests. The function is configured for 60 seconds. On a slow or timed-out first pass, the retry can be terminated before the application returns its friendly error. This is a configured-budget conflict; a production timeout was not measured.

Recommendation: use an end-to-end deadline, reserve time for a response, and start a retry only when it fits the remaining budget. Abort outstanding AI requests when the deadline expires. Increasing duration alone does not bound costs or improve retry correctness. [Vercel function limits](https://vercel.com/docs/functions/limitations).

### 4. P2 — Scheduled preparation does not scale within one invocation

Evidence: `api/prep-next-week.ts:54-56`; `api/prep-next-week.ts:31-43`.

Households are prepared sequentially inside one 60-second invocation. Multiple slow generations can exceed that limit; one exception stops later households. Prepared-cache replacement also deletes existing ideas before the replacement and its meals are fully written.

Recommendation: after restoring the schema gate, explicitly bound and checkpoint scheduled work, record per-household outcomes, and use safe cache replacement. Consider resumable batches or a durable worker when household volume justifies it. No throughput ceiling can be inferred without timing and usage data.

### 5. P2 — Release documentation contradicts itself, and the gate misses it

Evidence: `README.md` Current release and Future roadmap notes; `docs/roadmap.md` Current baseline; `CHANGELOG.md`; `docs/architecture.md`; `scripts/release-check.js:58-64`.

The roadmap/changelog record v0.22.0 as deployed, but the README still says release candidate and production v0.21.2. Architecture documentation lists eight migrations while the manifest contains nine, and refers to backend `.js` sources now stored as `.ts`. The release check passes because it searches for a version string anywhere in the README rather than validating the current-release section and release state.

Recommendation: reconcile documentation from verified deployment evidence and strengthen checks around the canonical current release. Keep the manifest authoritative for migration order; avoid independently maintained lists.

### 6. P2 — Critical behavior has uneven test and validation coverage

Evidence: `tests/grocery-api.test.js`, `tests/ownership.test.js`, `tests/browser/*.test.js`, `api/plan.ts:12`, `api/_lib/validation.ts`, `tsconfig.json`, the seven browser files beginning with `@ts-nocheck`.

Database and browser tests provide real value. However, several API checks assert source-text patterns; browser tests mock auth and API responses. They cannot catch the two reproduced server defects. The save path validates presence of a week and meals, but does not enforce a valid Monday date, bounded meal/ingredient/step arrays, or complete payload shape before writes. AI endpoints bound cooking days but do not consistently bound all free text and recipe input. Type checking also excludes seven core browser scripts, with `strict: false` in the project configuration.

Recommendation: add executable handler/failure/concurrency tests and shared request validation for the affected release paths. Move the browser to checked modules in a dedicated later release, preserving current behavior and script ordering until then.

## SWOT

| Area | Evidence-backed assessment | Implication |
| --- | --- | --- |
| Strengths | Clear constraints → ideas → recipes → groceries workflow; explicit week navigation; grocery edits and sundry intent survive reconciliation; household RLS and authenticated requests; atomic database rate limiting; migration and browser coverage. | Preserve the current UX, deterministic shopping logic, and access boundaries. |
| Weaknesses | Nontransactional save lifecycle; broken runtime schema probe; incompatible retry/duration budgets; sequential scheduled work; global client state and suppressed type checking; documentation drift. | Reliability and maintainability should take precedence over wider scope. |
| Opportunities | Make saved weeks dependable; then evaluate household-customizable staples with real usage; use existing structured logs for focused diagnostics before designing an admin dashboard. | Improve the core family task first and collect evidence before choosing subsequent features. |
| Threats | Concurrent household edits can overwrite choices; AI/network failure and token cost variability; dietary compliance is prompt-driven rather than a verified guarantee; new privileged admin features could expand exposure; growing household count can overwhelm the scheduled job. | Add conflict handling, bounded generation, targeted monitoring, and strict authorization for any future admin tooling. |

Dietary tags are inserted into prompts and outputs use structural schemas. This does not establish allergen safety or consistent dietary correctness; no such guarantee is inferred here. Household permissions must remain database-enforced, including any new RPC or table. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Validation performed

| Check | Result |
| --- | --- |
| Node runtime | 22.23.2 |
| `npm run typecheck` | Passed; seven browser scripts intentionally excluded through `@ts-nocheck`. |
| `npm run release:check` | 4/4 passed; documentation-status blind spot remains. |
| `npm run runtime:smoke` | Passed after allowing local child-process execution. |
| `npm run migration:validate` | 89/89 passed using local PGlite. |
| `npm test` | 110 passed; zero failed or skipped. |
| `npm run test:browser` | 14 passed; zero failed or skipped; external boundaries mocked. |
| Targeted plan-cleanup reproduction | Confirmed loss of both plans under injected cleanup failure. |
| Targeted runtime-readiness reproduction | Confirmed rejection of a table without an `id` column. |

Initial test-runner/runtime attempts were blocked by sandbox `spawn EPERM`; their successful reruns are the results above. No live database probe, AI call, deployment, source publishing, or application fix was performed. Existing local notes and backups were retained. The roadmap backup was consulted only as historical context; the current roadmap governs sequencing.

See [the proposed v0.23.0 plan](release-v0.23.0-plan.md) for implementation order and acceptance gates.
