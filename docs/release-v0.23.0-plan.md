# Proposed v0.23.0 — reliable week planning

Created 2026-10-05; updated 2026-10-07. Status: local implementation, release preparation and local acceptance are complete. Hosted Auth/AI acceptance and deployed timing remain outstanding. Nothing has been published or deployed.

See [stage 1](release-v0.23.0-stage-1.md), [transactional saving and recovery](release-v0.23.0-stage-2.md), and [generation deadlines](release-v0.23.0-stage-3.md). The transaction replaces the interim REST save fix. Local deadline evidence does not establish deployed performance.

## User outcome

Final source review, duplicate-key correction, validation and the proposed draft PR are recorded in [candidate handoff](release-v0.23.0-handoff.md).

A household can build or rebuild a week without losing its previously saved plan, silently overwriting another member's changes, or getting trapped in generation retries that cannot finish.

This selects the current roadmap's **Operational hardening** opportunity. [The code review](code-review-2026-10-05.md) found concrete defects in that core journey, making it a stronger next-release candidate than customizable sundries or an admin dashboard. Preserve visual styling, Monday–Sunday weeks, recipe wording, grocery edits/deletions/checks, sundry intent, and household isolation.

## Scope and sequence

### 1. Establish failure tests and restore valid schema checks — completed locally

- Add executable tests calling the real plan handler with injected failures at every save stage, including ideas cleanup after old-plan deletion. Make the current data-loss sequence fail an invariant asserting that at least the prior complete plan survives an unsuccessful save.
- Add runtime-readiness tests that include tables with composite/non-ID primary keys, valid current schema, missing required column, database failure, and cache expiry.
- Share probe construction between `householdSchemaReady()` and the live schema script, using table-existence probes that do not assume `id` and explicit column probes from the manifest. Keep these read-only and fail closed on actual missing schema.
- Add a scheduled-route test confirming that readiness permits preparation with the valid contract. Do not represent mocked success as production verification.

Implemented: shared manifest probes, executable readiness/cache/scheduled-route tests, save-stage failure regressions, and a rollback boundary that excludes cleanup of complete replacements. Outstanding or ambiguously acknowledged writes still require the transaction/idempotency design in stage 2.

### 2. Make saved-week replacement atomic — implemented locally

A database transaction is one operation that either commits every required change or rolls all of them back. It replaces the current collection of independently committed REST writes.

- Add a user-scoped Postgres RPC for saving one household/week: validate membership, acquire a household/week lock, validate the reconciliation snapshot revision, write the complete plan and children, and commit together. The API derives groceries with the shared shopping logic; the transaction rejects a snapshot that changed before the lock was acquired.
- Prefer `SECURITY INVOKER` so existing RLS still applies. Derive the caller from `auth.uid()` and verify membership. If a narrowly privileged function is unavoidable, explicitly enforce membership, fix its search path, revoke public/anonymous execution, and test denial paths. Never retry user data access with a service key.
- Preserve an existing plan ID where practical. Preserve retained grocery row IDs, manual additions, household edits, deletion markers, checked state, and weekly sundry purchase intent; do not rebuild solely from browser-provided grocery state.
- Serialize both saves and grocery mutations on the same household/week boundary. Grocery changes must participate in revision checks so a rebuild cannot silently discard a simultaneous shopping edit.
- Add an expected revision and a household/user-scoped idempotency key. A stale request returns HTTP 409 without mutation. A repeated committed request returns the current complete graph for the same stable plan without replaying writes. This preserves newer household changes. Same key with a different logical payload is rejected.
- Use database-enforced uniqueness for the active household/week after inspecting existing duplicates. Never silently delete conflicting historical rows: identify and resolve them before enabling the constraint.
- Define first-save behavior separately: there is no old plan to preserve, so a failure must leave no partial saved plan.
- Treat prepared ideas as disposable cache. Clean them within the transaction or afterward with logged, retryable cleanup; cleanup failure after commit must not undo or report failure for the saved plan.
- Retain deterministic shopping normalization as the shared contract. Verify RPC reconciliation parity against existing grocery fixtures rather than introducing a second divergent normalization implementation.

Implemented: `20261006015243_transactional_week_saves.sql`, user-scoped RPCs, shared grocery reconciliation with retained IDs, revision-checked grocery/feedback writes, executable failure coverage, and actual multi-session PostgreSQL concurrency checks. The migration refuses duplicate active weeks. Its unique constraint is incompatible with the old create-before-delete behavior; deployment requires a coordinated write pause.

### 3. Make client save/recovery behavior explicit — essential recovery implemented locally

- Pass explicit `weekStart`, expected revision, and idempotency key. Keep one key for retries of an unchanged payload; issue a new key when the user changes the draft.
- Retain a pending draft separately from the last cloud-confirmed week. Show “saved” only after commit confirmation; show a clear pending/error state otherwise.
- Provide a save retry that reuses already generated recipes rather than charging for generation again. After a lost response, replay the idempotent save to discover the committed result.
- On HTTP 409, offer reload/review of the newer saved week; preserve the unsaved draft and do not overwrite automatically.
- Ignore stale asynchronous responses after account, household, or selected-week changes. Disable duplicate submits and keep keyboard/focus behavior usable during saving.
- Leave general browser-module/TypeScript conversion for a separate release; make only state changes needed for this journey.

Implemented: durable pending payload/key, save retry without generation, conflict reload/review, revision tracking, serialized grocery requests, and guards on late save/mutation responses. Stage 3 adds generation cancellation on navigation and account/week guards. Preview acceptance remains outstanding; unrelated background hydration/prefetch behavior is outside this change.

### 4. Bound recipe generation and retries — implemented locally

- Give the whole request a deadline shorter than the verified deployed function duration. Provisional budget: return by 50 seconds within the repository's 60-second configuration, reserving 10 seconds for runtime/network variance. Validate this budget in preview before release.
- Include authentication, membership, limiter calls, generation, retry, and response handling in the deadline. Each stage receives the remaining budget; cancel outstanding requests when it expires.
- Retry only classified transient failures and only when sufficient time remains. Honor upstream retry timing where it fits; avoid blind retry of invalid requests. Do not start another 45-second pass after the first exhausts its budget.
- Bound selected ideas, text lengths, servings, days, and recipe payload sizes before expensive work or writes. Validate semantic dates and require Monday `weekStart`; return helpful 400 responses for invalid input.
- Preserve the last saved plan on generation failure. Return a useful retry state rather than pretending a partial recipe batch is a complete week.
- Add request correlation, stage timing, save outcome, conflict, and retry events through existing telemetry. Do not log tokens, PINs, emails, recipe payloads, or free-text household notes.

Implemented: a shared 50-second request budget across authentication, membership, rate limiting, preferences, AI calls, retries, validation and response assembly. Each AI attempt uses up to 35 seconds within that budget; one transient retry is permitted only with its delay plus eight seconds of useful work and one second of response reserve remaining. All three on-demand generation routes use this policy. The client keeps the old saved week until a complete batch arrives, cancels when leaving generation, and prevents late results from auto-saving. Simulated-clock and browser regressions pass. The multi-household Friday cron remains a separate resumability/scaling task.

### 5. Reconcile release documentation and verify in preview

- Correct README release status using deployment evidence, update current architecture source paths/migration references, and link the next-release plan from the roadmap.
- Strengthen `release:check` around the actual Current release section. Match the intended version and declared release state instead of finding a string anywhere in the file.
- Update package version, HTML title, changelog, README, and roadmap together at release time; do not bump versions during planning.
- Keep credential-free CI checks explicit about live validation being skipped. Require a separate authenticated live preflight for the deployment gate; do not expose service credentials to untrusted PR runs.

## Acceptance criteria

1. Every injected pre-commit failure preserves the prior complete week and its groceries, or leaves no partial plan for a first save.
2. Failed disposable-cache cleanup after commit never deletes a committed plan or turns successful saving into a user-visible failure.
3. Two concurrent household saves produce one authoritative complete week; a stale writer receives 409. A concurrent grocery edit is preserved or explicitly conflicts.
4. Duplicate submission and replay after a lost response produce no duplicate plan or grocery rows.
5. Grocery edits, manual additions, deletions, checks, recipe wording, and sundry intent survive same-week rebuilding; another week/household remains unchanged.
6. Anonymous and nonmember RPC calls are denied, including direct calls outside the UI. Caller-supplied household identifiers cannot bypass membership.
7. A schema containing `household_members` and rate-limit tables without `id` passes readiness; missing required columns fail readiness.
8. Simulated slow generation and retry scenarios terminate within the configured end-to-end deadline with no partial saved week and no late UI update to another account/week.
9. Existing unit/database/browser, migration, typecheck, release, and runtime checks pass; new failure, concurrency, recovery, and authorization tests pass.
10. Preview verification covers two household members, two isolated households, seven cooking days, failed save, retry, reload, mobile keyboard navigation, and an expired session. Mocked tests do not substitute for preview/live schema checks.

## Deployment and rollback

1. Verify the current deployment and live migration baseline read-only. Inspect duplicate active weeks before adding constraints.
2. Test clean install, upgrade from v0.22.0, and reapplication locally. The active-week uniqueness rule prevents the old save implementation from creating replacements: arrange a write pause and coordinated code/migration switch.
3. Apply the reviewed migration during that window and deploy the code that requires it. Verify live schema, grants/RLS, and RPC behavior before resuming writes. Existing browser tabs must reload to use the new request contract.
4. Deploy a preview, run the acceptance journey, then review evidence before production publication. This planning request does not authorize production database changes or deployment.
5. Prefer disabling writes or a forward fix if the new save path fails. Rolling back to v0.22.0 restores known unsafe saving and is not automatically a safe fallback. Keep additive schema and committed user data; do not use destructive down-migrations.

## Deferred work and subsequent sequencing

- **Resumable Friday preparation:** the schema-gate fix restores eligibility, but the sequential multi-household job still needs its own bounded/resumable scheduling work before making scale claims. Record per-household job outcomes now; schedule this work before expanding usage.
- **Household-customizable sundries:** next product candidate after observing the existing fixed catalog. Validate whether classification or purchase defaults cause real friction before choosing UI/data rules.
- **Admin dashboard:** first define operator identity and authorization distinct from ordinary household ownership. Existing logs can support diagnostics in the meantime.
- **Client module/type migration, dietary output enforcement, broader input validation, ownership transfer, and removal of compatibility columns:** dedicated follow-up work, not incidental additions to this release.

Local release preparation is complete: the candidate is v0.23.0, release declarations are checked precisely, and authenticated preview schema preflight is separate from credential-free CI. See [release preparation and live evidence](release-v0.23.0-stage-4.md). No delivery date is promised. Preview deployment, authenticated cloud acceptance, and measured generation timing remain release gates.
