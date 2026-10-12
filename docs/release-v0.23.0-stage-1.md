# v0.23.0 stage 1 — failure coverage and schema readiness

Historical checkpoint: [stage 2](release-v0.23.0-stage-2.md) now replaces the interim REST save mitigation below with a database transaction. The schema-readiness fixes remain in place.

Completed locally on 2026-10-05, based on `main` commit `fabdeb9`. Unreleased; application version remains 0.22.0. This implements the first stage of [the release plan](release-v0.23.0-plan.md) and an interim mitigation for the confirmed plan-cleanup data loss.

## Changes and their purpose

### Runtime and live preflight now use one schema contract

`migrations/manifest.js` exports schema probes used by both `api/_lib/supabase.ts` and `scripts/migrate-live.js`. Table probes use `select=*&limit=0`; required-column probes remain explicit. No household rows are returned, and tables with composite keys or `bucket_key` no longer fail because they lack `id`.

Readiness still fails closed for missing tables/columns, rejected credentials, and network errors. Its 30-second success/failure cache is retained and tested, including expiry and recovery.

The new regression suite derives table and column metadata by applying all real migrations to local PGlite, then uses that metadata to simulate PostgREST validation. It also invokes the real scheduled-preparation handler for one household using mocked AI/database boundaries. Production scheduled-job recovery has not been verified.

### Complete saved plans survive cleanup failure

`api/plan.ts` now distinguishes construction from cleanup:

1. Read the prior plan and its groceries.
2. Create the replacement and write its children.
3. Wait for all child writes to settle. If a write fails, attempt to remove the known incomplete replacement and return an error; keep the prior plan.
4. Once every required write succeeds, retain the complete replacement. Attempt old-plan and prepared-ideas cleanup separately.
5. If cleanup fails or its response is ambiguous, emit `plan_cleanup_failed` with the stage and return the completed save result. Do not delete the replacement.

The use of `Promise.allSettled` in step 3 matters: `Promise.all` can reject while another child write is still in flight, allowing rollback to race it. The regression test deliberately holds one child write open while another fails and asserts rollback waits.

Cleanup events contain a stage label, without raw provider errors, household notes, tokens, or recipe payloads. All user-data requests continue to use the verified user token and existing household RLS; no service-key fallback was introduced.

## Evidence

Before changes, the new tests reproduced failure of runtime readiness on non-ID tables, rejection of valid scheduled preparation, and deletion/failed-save behavior following cleanup errors. After changes:

| Check | Result |
| --- | --- |
| Full unit/database suite (`npm test`) | 131 passed, 0 failed/skipped. Includes 21 added tests/subtests. |
| Existing browser suite (`npm run test:browser`) | 14 passed, 0 failed/skipped; external services mocked. |
| Migration validation (`npm run migration:validate`) | 89/89 passed. |
| Type checking (`npm run typecheck`) | Passed; existing browser `@ts-nocheck` exclusions remain. |
| Runtime compatibility (`npm run runtime:smoke`) | Passed with emitted API modules. |
| Release consistency (`npm run release:check`) | 4/4 passed for the still-current 0.22.0 version; known documentation-state limitation remains. |

Tests cover each modeled pre-cleanup save stage, first-save child failure, deferred child-write ordering, successful grocery-intent preservation, cleanup failure, an ambiguously acknowledged old-plan deletion, valid migrated schema, missing schema, credentials/network errors, cache expiry/recovery, and a scheduled household preparation.

## Remaining limits

- Saves are not transactional. A function termination, rollback failure, or insert that commits while its response is lost can still leave partial rows. Concurrent saves and grocery edits are not yet serialized or revision-checked.
- Failed old-plan cleanup may retain duplicate active rows. Current reads choose newest first; this is a temporary mitigation pending transactional replacement and database uniqueness.
- The scheduler remains sequential, and generation retry deadlines remain unchanged. Restoring readiness does not prove multi-household throughput.
- No database migration was added or applied, no package version was bumped, and no commit, push, or deployment was performed. Existing local planning notes and backups were retained.

## Reproduce the local checks

From `F:\mealz code\mealz`, with the existing Node 22/dependencies:

```powershell
node --import tsx --test tests/plan-save.test.js tests/schema-readiness.test.js
npm run typecheck
npm test
npm run migration:validate
npm run runtime:smoke
npm run test:browser
npm run release:check
```

These regression tests use local mocks/PGlite and do not need production credentials. No dependency installation is required in this checkout.

For a later preview verification, rebuild a saved week, confirm groceries and recipe wording survive reload, and use controlled preview fault injection to check save/cleanup recovery. Verify the live schema and scheduled-job logs in the intended environment before claiming production recovery. Do not inject failures into the production household data.

Next implementation stage: the transactional save/RPC design, grocery reconciliation parity, idempotent retry receipts, and revision/conflict handling in the release plan.
