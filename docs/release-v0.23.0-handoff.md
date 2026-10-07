# v0.23.0 candidate handoff

Prepared 2026-10-07. Ready for source review as an unreleased candidate. Production publication is not ready: hosted authentication, AI acceptance and deployed timing remain open.

## Final review and correction

Reviewed transactional save/replay and revision handling, client recovery and cancellation, generation deadline/retry ownership, and release/CI declarations. Found and fixed duplicate normalized meal keys in the save API. Recipe feedback targets one meal key, so a duplicated key could make a later feedback mutation affect multiple rows and fail. Saves now reject collisions before any plan mutation, including keys made equal by whitespace or fallback generation. Four new test cases cover the passing parent test and three rejection scenarios.

This correction adds no migration or configuration change beyond the already-pending candidate migration. This review is scoped to the candidate changes; it does not assert a comprehensive security audit of the entire app.

## Evidence

- 196 unit/API/database tests passed after the correction.
- All 14 real PostgreSQL/API acceptance scenarios passed again after the correction.
- Type checking, API runtime smoke, six release declaration checks and whitespace validation passed.
- Existing browser acceptance: 21 passed in the preceding local run. No browser code changed during this final correction, so those tests were not repeated.
- Existing migration validation: 104 passed. No SQL changed during this final correction; the new real PostgreSQL run verified migration application, populated upgrade and reapplication.

See [local acceptance](release-v0.23.0-local-acceptance.md) for the harness and its limits. The final synthetic save/replay/rebuild observations were 87/15/39 ms; they exclude real Auth, PostgREST, external network and AI generation. The local PostgreSQL server shuts down after the run.

## Proposed draft pull request

Repository: `mikayyy/mealz`. Proposed branch: `release/v0.23.0-reliable-planning`. Target: `main`. State: draft. Source upload and draft PR creation require destination-specific authorization; do not merge or trigger a production rollout as part of that upload.

Title: **Prepare v0.23.0: transactional week saves and bounded generation**

Description:

Weekly saving now commits recipes and groceries together, detects stale household edits, and replays committed retries without duplicate writes. Pending drafts survive reloads, and on-demand generation uses one 50-second budget with a bounded transient retry and navigation cancellation. Duplicate recipe keys are rejected before saving so later meal feedback remains unambiguous.

Validated locally with 196 unit/API/database tests, 21 browser tests from the preceding local acceptance run, 104 migration checks, 14 real PostgreSQL/API scenarios, type checking, runtime smoke and release checks. Hosted Auth/AI journeys and deployed timing remain unverified. The pending transactional migration conflicts with the old create-before-delete save code; keep this PR draft until the coordinated migration/code switch and remaining acceptance have been reviewed.

## Publication contents

The adjacent `release-v0.23.0-files.json` records intended changed/new source files with SHA-256 hashes and the local base commit. It is a review inventory, not a deployable archive or authorization to publish. Recompute it if the source changes before uploading. Preserve the existing unrelated `.kilo` plans, roadmap backup and compiler baseline. Keep local branch-session state and ignored environment files out of the PR.

## Remaining release gates

1. Authorize uploading the reviewed candidate to a feature branch and draft PR; verify repository CI. Review the Vercel Git integration before pushing so an automatic preview cannot inherit production database configuration.
2. Obtain a complete isolated Supabase environment for real Auth/PostgREST acceptance. Windows lacks the checked container runtimes; cloud branches require a plan upgrade whose additional cost has not been approved. Local PostgreSQL 18.4 does not establish hosted PostgreSQL 17 behavior.
3. Verify authenticated two-household/member journeys, actual seven-day AI generation, retry/error handling and deployed function timing. Record results instead of treating mocked tests as live evidence.
4. Recheck the actual production schema and migration ledger, duplicates, grants and RLS. Arrange a write pause and coordinated migration/code switch, require existing tabs to reload, and authorize production changes separately.
5. Verify saving and recovery before resuming writes. If verification fails, retain the write pause and committed data and prefer a forward fix. The old save implementation is not an automatically safe rollback.

Nothing has been committed, pushed, deployed or migrated in production by this handoff step. The cloud cleanup automation remains paused because no preview branch exists.
